/**
 * Workspace-folders host registry: durable folder grouping beside the
 * Workspace registry. The suite opens the real domain over the in-memory
 * storage backend, so record validation, folder order, and membership pruning
 * are the shipped code paths rather than stubs.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import WorkspaceFolders from '../src/index.ts'

const roots: Context[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** Minimal Workspace registry stand-in: the folder registry reads only `list`. */
function workspaceStub(ids: readonly string[]): { list: () => Workspace[] } {
  return { list: () => ids.map(id => ({ id: id as WorkspaceId }) as Workspace) }
}

/**
 * Open one folder registry over a private in-memory medium.
 * @param workspaceIds - Workspaces the stub registry reports.
 * @param backend - existing medium to reopen; a fresh one when omitted.
 * @returns the started registry and its context.
 */
async function harness(
  workspaceIds: readonly string[] = ['w1', 'w2', 'w3'],
  backend: MemoryStorageBackend = new MemoryStorageBackend(),
) {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.provide('workspaceRegistry', workspaceStub(workspaceIds) as never)
  await ctx.plugin(WorkspaceFolders)
  return { ctx, registry: ctx.workspaceFolders }
}

describe('WorkspaceFolders', () => {
  it('starts with no folders and creates one with a trimmed title', async () => {
    const { registry } = await harness()
    expect(registry.list()).toEqual({ folders: [] })
    const created = await registry.create({ title: '  Work  ' })
    expect(created.folders).toHaveLength(1)
    expect(created.folders[0]?.title).toBe('Work')
    expect(created.folders[0]?.expanded).toBe(true)
    expect(created.folders[0]?.workspaceIds).toEqual([])
  })

  it('rejects blank, over-long, and duplicate titles without writing', async () => {
    const { registry } = await harness()
    await registry.create({ title: 'Work' })
    await expect(registry.create({ title: '   ' })).rejects.toMatchObject({ code: 'workspace-folders/invalid-title' })
    await expect(registry.create({ title: 'x'.repeat(121) }))
      .rejects.toMatchObject({ code: 'workspace-folders/invalid-title' })
    await expect(registry.create({ title: 'Work' })).rejects.toMatchObject({ code: 'workspace-folders/name-conflict' })
    expect(registry.list().folders).toHaveLength(1)
  })

  it('keeps folders in creation order and renames one in place', async () => {
    const { registry } = await harness()
    const first = (await registry.create({ title: 'A' })).folders[0]?.folderId as string
    await registry.create({ title: 'B' })
    expect(registry.list().folders.map(folder => folder.title)).toEqual(['A', 'B'])
    const renamed = await registry.rename({ folderId: first as never, title: 'A2' })
    expect(renamed.folders.map(folder => folder.title)).toEqual(['A2', 'B'])
    await expect(registry.rename({ folderId: 'missing' as never, title: 'C' }))
      .rejects.toMatchObject({ code: 'workspace-folders/not-found' })
  })

  it('renaming a folder to its own title is a no-op', async () => {
    const { registry } = await harness()
    const id = (await registry.create({ title: 'A' })).folders[0]?.folderId as string
    expect((await registry.rename({ folderId: id as never, title: 'A' })).folders[0]?.title).toBe('A')
  })

  it('persists expansion and reports unknown folders', async () => {
    const { registry } = await harness()
    const id = (await registry.create({ title: 'A' })).folders[0]?.folderId as string
    expect((await registry.setExpanded({ folderId: id as never, expanded: false })).folders[0]?.expanded).toBe(false)
    await expect(registry.setExpanded({ folderId: 'missing' as never, expanded: true }))
      .rejects.toMatchObject({ code: 'workspace-folders/not-found' })
  })

  it('moves a Workspace into one folder at a time and detaches it', async () => {
    const { registry } = await harness()
    // `create` answers with the whole list, so take each id by title.
    await registry.create({ title: 'A' })
    await registry.create({ title: 'B' })
    const idOf = (title: string): string =>
      registry.list().folders.find(folder => folder.title === title)?.folderId as string
    const a = idOf('A')
    const b = idOf('B')
    expect(a).not.toBe(b)
    await registry.setMembership({ workspaceId: 'w1' as WorkspaceId, folderId: a as never })
    expect(registry.list().folders.find(folder => folder.folderId === a)?.workspaceIds).toEqual(['w1'])
    // Moving to B removes it from A in the same operation.
    const moved = await registry.setMembership({ workspaceId: 'w1' as WorkspaceId, folderId: b as never })
    expect(moved.folders.find(folder => folder.folderId === a)?.workspaceIds).toEqual([])
    expect(moved.folders.find(folder => folder.folderId === b)?.workspaceIds).toEqual(['w1'])
    // Omitting the folder detaches from every folder.
    const detached = await registry.setMembership({ workspaceId: 'w1' as WorkspaceId })
    expect(detached.folders.every(folder => folder.workspaceIds.length === 0)).toBe(true)
  })

  it('rejects membership for a Workspace or folder the registry does not hold', async () => {
    const { registry } = await harness()
    const a = (await registry.create({ title: 'A' })).folders[0]?.folderId as string
    await expect(registry.setMembership({ workspaceId: 'ghost' as WorkspaceId, folderId: a as never }))
      .rejects.toMatchObject({ code: 'workspace-folders/unknown-workspace' })
    await expect(registry.setMembership({ workspaceId: 'w1' as WorkspaceId, folderId: 'ghost' as never }))
      .rejects.toMatchObject({ code: 'workspace-folders/not-found' })
  })

  it('drops members the Workspace registry no longer holds on the next open', async () => {
    const backend = new MemoryStorageBackend()
    const first = await harness(['w1', 'w2'], backend)
    const id = (await first.registry.create({ title: 'A' })).folders[0]?.folderId as string
    await first.registry.setMembership({ workspaceId: 'w1' as WorkspaceId, folderId: id as never })
    expect(first.registry.list().folders[0]?.workspaceIds).toEqual(['w1'])
    await first.ctx.fiber.dispose()

    // Reopen over the same medium with w1 gone.
    const second = await harness(['w2'], backend)
    expect(second.registry.list().folders[0]?.workspaceIds).toEqual([])
  })

  it('deletes a folder and resolves an unknown delete without writing', async () => {
    const { registry } = await harness()
    const id = (await registry.create({ title: 'A' })).folders[0]?.folderId as string
    expect((await registry.delete({ folderId: id as never })).folders).toEqual([])
    expect((await registry.delete({ folderId: id as never })).folders).toEqual([])
  })
})
