import { describe, expect, it, vi } from 'vitest'
import { Context, FiberState } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import * as ToolWorkspace from '../src/index.ts'

const testToolSignal = new AbortController().signal

/** Knobs for one fake registry member driven by the tests. */
interface FakeWorkspaceOptions {
  readonly id: string
  readonly title: string
  readonly path: string
  readonly sessionIds?: readonly string[]
  readonly missingDir?: boolean
}

/** Build one registry-compatible workspace plus its live directory-status spy. */
function fakeWorkspace(options: FakeWorkspaceOptions) {
  const status = vi.fn(async (): Promise<'ok' | 'missing-dir'> =>
    options.missingDir === true ? 'missing-dir' : 'ok')
  const workspace: Workspace = {
    id: WorkspaceId(options.id),
    title: options.title,
    path: options.path,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    sessionIds: (options.sessionIds ?? []).map(id => SessionId(id)),
    setTitle: vi.fn(async () => {}),
    attachSession: vi.fn(async () => {}),
    insertSessionBefore: vi.fn(async () => {}),
    detachSession: vi.fn(async () => {}),
    status,
  }
  return { workspace, status }
}

/** Boot the tool over a controllable fake registry (or none, for the inject case). */
async function harness(workspaces: readonly Workspace[] = [], options: { registry?: boolean } = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const list = vi.fn(() => [...workspaces])
  if (options.registry !== false) ctx.provide('workspaceRegistry', { list } as never)
  const fiber = await ctx.plugin(ToolWorkspace)
  return { ctx, fiber, list }
}

let callCounter = 0

/** Execute workspace_list with one argument object. */
async function call(ctx: Context, args: unknown): Promise<ToolExecutionResult> {
  return await ctx.tools.execute({
    signal: testToolSignal, callId: ToolCallId(`call-${++callCounter}`), name: 'workspace_list', arguments: args,
  })
}

/** The single text block every result carries. */
function text(result: ToolExecutionResult): string {
  const block = result.content[0]
  if (block?.type !== 'text') throw new Error('expected one text block')
  return block.text
}

/** Lossless JSON vocabulary of a tool result value. */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** Read the canonical value of a successful call. */
function value(result: ToolExecutionResult): { workspaces: { [key: string]: Json }[] } {
  expect(result.isError).toBe(false)
  if (result.isError) throw new Error('expected workspace_list to succeed')
  return result.value as { workspaces: { [key: string]: Json }[] }
}

describe('workspace_list registration', () => {
  it('registers one read-only listing tool over the workspace registry', async () => {
    const { ctx } = await harness()
    const definition = ctx.tools.get('workspace_list')
    expect(definition?.name).toBe('workspace_list')
    expect(definition?.description).toContain('workspace registry')
    expect(ToolWorkspace.name).toBe('tool-workspace')
    expect(ToolWorkspace.inject).toEqual(['tools', 'workspaceRegistry'])
  })

  it('unregisters the tool when the contributing fiber is disposed', async () => {
    const { ctx } = await harness()
    const tools = ctx.tools
    expect(tools.get('workspace_list')?.name).toBe('workspace_list')

    await ctx.fiber.dispose()

    expect(tools.get('workspace_list')).toBeUndefined()
    expect(ctx.get('tools')).toBeUndefined()
  })

  it('stays pending and registers nothing while ctx.workspaceRegistry is absent', async () => {
    const { ctx, fiber } = await harness([], { registry: false })
    expect(fiber.state).toBe(FiberState.PENDING)
    expect(ctx.tools.get('workspace_list')).toBeUndefined()
  })
})

describe('workspace_list result', () => {
  it('returns an empty list and an explanatory line for an empty registry', async () => {
    const { ctx } = await harness()
    const result = await call(ctx, {})
    expect(value(result)).toEqual({ workspaces: [] })
    expect(text(result)).toBe('no workspaces registered')
  })

  it('preserves registry order and counts each workspace sessions', async () => {
    const second = fakeWorkspace({ id: 'ws-second', title: 'Second', path: 'C:\\work\\second', sessionIds: ['s-1'] })
    const first = fakeWorkspace({
      id: 'ws-first', title: 'First', path: 'C:\\work\\first', sessionIds: ['s-2', 's-3'],
    })
    const { ctx, list } = await harness([second.workspace, first.workspace])
    const result = await call(ctx, {})
    expect(list).toHaveBeenCalledTimes(1)
    const entries = value(result).workspaces
    expect(entries.map(entry => [entry['id'], entry['title'], entry['path'], entry['sessionCount']])).toEqual([
      ['ws-second', 'Second', 'C:\\work\\second', 1],
      ['ws-first', 'First', 'C:\\work\\first', 2],
    ])
    expect(entries[0]).toMatchObject({ createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })
    expect(text(result)).toBe(
      'Second  C:\\work\\second  (1 session)' + '\n' + 'First  C:\\work\\first  (2 sessions)',
    )
  })
})

describe('workspace_list options', () => {
  it('includes session ids only on request', async () => {
    const alpha = fakeWorkspace({ id: 'ws-alpha', title: 'Alpha', path: 'C:\\work\\alpha', sessionIds: ['s-1', 's-2'] })
    const { ctx } = await harness([alpha.workspace])

    const plain = value(await call(ctx, {})).workspaces[0]
    expect(plain).not.toHaveProperty('sessionIds')

    const requested = value(await call(ctx, { includeSessions: true })).workspaces[0]
    expect(requested?.['sessionIds']).toEqual(['s-1', 's-2'])
  })

  it('checks every workspace directory only on request', async () => {
    const ok = fakeWorkspace({ id: 'ws-ok', title: 'Ok', path: 'C:\\work\\ok' })
    const gone = fakeWorkspace({ id: 'ws-gone', title: 'Gone', path: 'C:\\work\\gone', missingDir: true })
    const { ctx } = await harness([ok.workspace, gone.workspace])

    const unchecked = value(await call(ctx, {})).workspaces
    expect(unchecked[0]).not.toHaveProperty('status')
    expect(ok.status).not.toHaveBeenCalled()
    expect(gone.status).not.toHaveBeenCalled()

    const checked = await call(ctx, { checkMissing: true })
    expect(value(checked).workspaces.map(entry => entry['status'])).toEqual(['ok', 'missing-dir'])
    expect(ok.status).toHaveBeenCalledTimes(1)
    expect(gone.status).toHaveBeenCalledTimes(1)
    expect(text(checked)).toBe(
      'Ok  C:\\work\\ok  (0 sessions) [ok]' + '\n' + 'Gone  C:\\work\\gone  (0 sessions) [missing-dir]',
    )
  })

  it('composes both options without cross-talk from either alone', async () => {
    const alpha = fakeWorkspace({ id: 'ws-alpha', title: 'Alpha', path: 'C:\\work\\alpha', sessionIds: ['s-1'] })
    const gone = fakeWorkspace({ id: 'ws-gone', title: 'Gone', path: 'C:\\work\\gone', missingDir: true })
    const { ctx } = await harness([alpha.workspace, gone.workspace])

    const both = value(await call(ctx, { includeSessions: true, checkMissing: true })).workspaces
    expect(both.map(entry => [entry['sessionIds'], entry['status']])).toEqual([
      [['s-1'], 'ok'],
      [[], 'missing-dir'],
    ])

    const sessionsOnly = value(await call(ctx, { includeSessions: true })).workspaces
    expect(sessionsOnly[0]?.['sessionIds']).toEqual(['s-1'])
    expect(sessionsOnly[0]).not.toHaveProperty('status')
    expect(sessionsOnly[1]).not.toHaveProperty('status')

    const statusOnly = value(await call(ctx, { checkMissing: true })).workspaces
    expect(statusOnly.map(entry => entry['status'])).toEqual(['ok', 'missing-dir'])
    expect(statusOnly[0]).not.toHaveProperty('sessionIds')
    expect(statusOnly[1]).not.toHaveProperty('sessionIds')
  })
})
