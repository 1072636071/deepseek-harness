// Proves the shipped plugin composes through a real Loader tree: a test-only
// cordis.yml mounts the real WorkspaceRegistry and tools registry, and the
// model-facing tool follows that composition end to end.
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import * as ToolWorkspace from '../src/index.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Test-only storage world: the real hub and domain facility over the shared
 * in-memory backend, plus an empty durable session history. Only the medium and
 * the session listing are fixtures; the registry that serves the tool is real.
 */
const TestStorageWorld = {
  name: 'test-storage-world',
  apply(ctx: Context): void {
    new Storage(ctx)
    ctx.storage.backend.register('memory', new MemoryStorageBackend())
    const domain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', domain)
    ctx.provide('storageDomain', domain)
    ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  },
}

/** The single text block of a tool result. */
function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

/** Boot a cordis.yml naming the test storage world, the real registries, and the subject plugin. */
async function boot(): Promise<{ ctx: Context; root: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-tool-workspace-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- name: test-storage-world',
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-workspace'",
    "- name: '@deepseek-ai/dsh-tool-workspace'",
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['test-storage-world', TestStorageWorld],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-workspace', WorkspaceRegistry],
    ['@deepseek-ai/dsh-tool-workspace', ToolWorkspace],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return { ctx, root }
}

describe('tool-workspace real Loader composition through cordis.yml', () => {
  it('registers workspace_list over the real registry and lists a created workspace', async () => {
    const booted = await boot()
    const schema = booted.ctx.tools.schemas().find(entry => entry.name === 'workspace_list')
    expect(schema?.description).toContain('workspace registry')
    expect(schema?.description).not.toContain('GUI')

    const directory = join(booted.root, 'project')
    await mkdir(directory)
    await booted.ctx.workspaceRegistry.create(directory, 'Project')

    const result = await booted.ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('loader-composition'),
      name: 'workspace_list',
      arguments: {},
    })
    expect(result.isError).toBe(false)
    expect(text(result)).toBe(`Project  ${await realpath(directory)}  (0 sessions)`)
  }, 30_000)
})
