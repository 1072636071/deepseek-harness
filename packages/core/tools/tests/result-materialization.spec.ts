import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolExecutionResult } from '@deepseek-ai/dsh-tools'

const testToolSignal = new AbortController().signal

async function mount(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  return ctx
}

function tool(name: string, extra: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name,
    description: `tool ${name}`,
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: (): Promise<string> => Promise.resolve(`ran:${name}`),
    ...extra,
  }
}

function run(ctx: Context, name: string): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: 'c1' as never,
    name,
    arguments: {},
  })
}

describe('final result materialization', () => {
  it('hands observers the exact object execute() resolves with, deep-frozen', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('ok'))
    let observed: ToolExecutionResult | undefined
    ctx.on('tools/result', (_exec, result) => { observed = result })

    const result = await run(ctx, 'ok')
    expect(observed).toBe(result)
    expect(result.isError).toBe(false)
    if (!result.isError) expect(result.value).toBe('ran:ok')
    // The whole content projection is frozen — the assembly freezes in place
    // instead of re-snapshotting already-detached projections.
    expect(Object.isFrozen(result.content)).toBe(true)
    expect(Object.isFrozen(result.content[0])).toBe(true)
  })

  it('materializes a fresh object when finalizeContent replaces the content', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('wrap', {
      finalizeContent: (_exec, result) => [{ type: 'text', text: `wrapped:${result.isError}` }],
    }))
    let observed: ToolExecutionResult | undefined
    ctx.on('tools/result', (_exec, result) => { observed = result })

    const result = await run(ctx, 'wrap')
    expect(observed).toBe(result)
    const first = result.content[0]
    expect(first?.type === 'text' && first.text).toBe('wrapped:false')
    expect(Object.isFrozen(result.content)).toBe(true)
  })

  it('keeps post-execute content replacement materialized and canonical', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('edited'))
    ctx.on('tools/post-execute', async () =>
      ({ kind: 'accept', content: [{ type: 'text', text: 'replaced' }] }))

    const result = await run(ctx, 'edited')
    const first = result.content[0]
    expect(first?.type === 'text' && first.text).toBe('replaced')
    expect(Object.isFrozen(result.content)).toBe(true)
  })
})
