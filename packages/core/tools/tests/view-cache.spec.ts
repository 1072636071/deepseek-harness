import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Scope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'

const testToolSignal = new AbortController().signal

/** Mount the registry (with its systemPrompt dependency) on a fresh context. */
async function mount(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  return ctx
}

/** Mint a scope whose key doubles as a minimal Agent-like object. */
async function mintAgentScope(ctx: Context, name: string): Promise<{ scope: Scope; key: Agent }> {
  const key = { id: name as SessionId } as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, key) },
    { inject: ['tools', 'systemPrompt'] }))
  return { scope, key }
}

function tool(name: string): ToolDefinition {
  return {
    name,
    description: `tool ${name}`,
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: (): Promise<string> => Promise.resolve(`ran:${name}`),
  }
}

describe('per-scope view cache', () => {
  it('serves repeated reads of an unchanged registry from one derived view', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('a'))
    ctx.tools.register(tool('b'))

    // Identity (not just deep equality): the same cached definition instance
    // proves the derived view is reused instead of rebuilt per call.
    expect(ctx.tools.get('a')).toBe(ctx.tools.get('a'))
    expect(ctx.tools.schemas().map(t => t.name).sort()).toEqual(['a', 'b'])
    expect(ctx.tools.get('missing')).toBeUndefined()
  })

  it('serves per-scope views independently', async () => {
    const ctx = await mount()
    const { scope, key } = await mintAgentScope(ctx, 'a')
    ctx.tools.register(tool('shared'))
    scope.ctx.tools.register(tool('mine'))

    const global = ctx.tools.schemas()
    const scoped = ctx.tools.schemas(key)
    expect(ctx.tools.get('shared')).toBe(ctx.tools.get('shared'))
    expect(ctx.tools.get('mine', key)).toBe(ctx.tools.get('mine', key))
    expect(scoped.map(t => t.name).sort()).toEqual(['mine', 'shared'])
    expect(global.map(t => t.name)).toEqual(['shared'])
  })

  it('reflects a registration on the next read', async () => {
    const ctx = await mount()
    expect(ctx.tools.get('late')).toBeUndefined()
    ctx.tools.register(tool('late'))
    expect(ctx.tools.get('late')).toBeDefined()
  })

  it('reflects an unregistration on the next read', async () => {
    const ctx = await mount()
    const dispose = ctx.tools.register(tool('gone'))
    expect(ctx.tools.get('gone')).toBeDefined()
    dispose()
    expect(ctx.tools.get('gone')).toBeUndefined()
  })

  it('reflects a scoped registration and its layer reclamation', async () => {
    const ctx = await mount()
    const { scope, key } = await mintAgentScope(ctx, 'a')
    const dispose = scope.ctx.tools.register(tool('scoped'))
    expect(ctx.tools.get('scoped', key)).toBeDefined()
    dispose()
    // The scope's layer is reclaimed once empty; the cached view must not
    // resurrect the unregistered tool.
    expect(ctx.tools.get('scoped', key)).toBeUndefined()
  })

  it('reflects a restriction and its disposal', async () => {
    const ctx = await mount()
    const { scope, key } = await mintAgentScope(ctx, 'a')
    ctx.tools.register(tool('keep'))
    ctx.tools.register(tool('drop'))

    const lift = scope.ctx.tools.restrict({ deny: ['drop'] })
    expect(ctx.tools.get('drop', key)).toBeUndefined()
    expect(ctx.tools.get('keep', key)).toBeDefined()
    lift()
    expect(ctx.tools.get('drop', key)).toBeDefined()
  })

  it('reflects a presentation-mode change and its disposal', async () => {
    const ctx = await mount()
    const { scope, key } = await mintAgentScope(ctx, 'a')
    expect(ctx.tools.get('run_code', key)).toBeUndefined()

    const restore = scope.ctx.tools.presentAs('ptc')
    expect(ctx.tools.get('run_code', key)).toBeDefined()
    restore()
    expect(ctx.tools.get('run_code', key)).toBeUndefined()
  })

  it('keeps guard registrations (notify: false) from poisoning the cache', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('guarded'))
    expect(ctx.tools.get('guarded')).toBeDefined()

    // Guards do not change visibility, so this registration skips the cache
    // invalidation — but the guard must still deny at dispatch time.
    ctx.tools.guard(() => 'blocked by guard')
    expect(ctx.tools.get('guarded')).toBeDefined()
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: 'c1' as never,
      name: 'guarded',
      arguments: {},
    })
    expect(result.isError).toBe(true)
    expect(result.error?.message).toBe('blocked by guard')
  })

  it('derives the view once for a full dispatch: every stage reuses the same definitions', async () => {
    const ctx = await mount()
    const { key } = await mintAgentScope(ctx, 'a')
    let seenDuringDispatch: ToolDefinition | undefined
    const tool: ToolDefinition = {
      name: 'observed',
      description: 'tool observed',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value as string }],
        // Top-level call: presentationMeta runs, so the dispatch traverses
        // lookup, resolve, mode classification, post-execute, and presentation.
        presentationMeta: () => 'meta',
      },
      execute: () => {
        // Read mid-dispatch from inside the body: identity with the
        // pre-dispatch lookup proves the whole pipeline reused one derived
        // view (the counting proxy for view derivations <= 1).
        seenDuringDispatch = ctx.tools.get('observed', key)
        return Promise.resolve('ran:observed')
      },
    }
    ctx.tools.register(tool)
    ctx.on('tools/post-execute', async () => ({ kind: 'accept' }))

    const before = ctx.tools.get('observed', key)
    expect(before).toBeDefined()
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: 'c1' as never,
      name: 'observed',
      arguments: {},
      agent: key,
    })
    expect(result.isError).toBe(false)
    expect(seenDuringDispatch).toBe(before)
  })
})

describe('toolNames', () => {
  it('matches the visible schema names exactly, including the PTC transport', async () => {
    const ctx = await mount()
    const { scope, key } = await mintAgentScope(ctx, 'a')
    ctx.tools.register(tool('alpha'))
    scope.ctx.tools.register(tool('beta'))

    expect(ctx.tools.toolNames(key).sort()).toEqual(['alpha', 'beta'])
    expect(ctx.tools.toolNames(key)).toEqual(ctx.tools.schemas(key).map(t => t.name))
    expect(ctx.tools.toolNames().sort()).toEqual(['alpha'])

    const restore = scope.ctx.tools.presentAs('ptc')
    expect(ctx.tools.toolNames(key).sort()).toEqual(['alpha', 'beta', 'run_code'])
    expect(ctx.tools.toolNames(key)).toEqual(ctx.tools.schemas(key).map(t => t.name))
    restore()
    expect(ctx.tools.toolNames(key).sort()).toEqual(['alpha', 'beta'])
  })
})
