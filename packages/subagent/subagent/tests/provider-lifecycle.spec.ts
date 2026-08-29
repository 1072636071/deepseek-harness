import { describe, expect, it, vi } from 'vitest'
import type { SubprocessHandle, SubprocessOutcome } from '@deepseek-ai/dsh-subprocess'
import {
  childExitsWithin,
  disposeProviderChild,
  ProviderRunFailure,
  providerFailureDiagnostic,
  providerTextTask,
} from '../src/provider-lifecycle.ts'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

/** Minimal scripted handle: every observable the disposal ladder touches. */
function fakeChild(options: {
  pid: number
  done: Promise<SubprocessOutcome>
  exitsWithinGrace?: boolean
  waitForExitError?: Error
}): SubprocessHandle & { stdin: { end: ReturnType<typeof vi.fn> } } {
  return {
    pid: options.pid,
    stdin: { end: vi.fn() },
    stdout: undefined,
    stderr: undefined,
    done: options.done,
    terminate: vi.fn(),
    waitForExit: vi.fn((signal?: AbortSignal) => {
      if (signal !== undefined && options.waitForExitError === undefined) {
        return Promise.resolve(options.exitsWithinGrace === true)
      }
      if (options.waitForExitError !== undefined) return Promise.reject(options.waitForExitError)
      return Promise.resolve(true)
    }),
  } as unknown as SubprocessHandle & { stdin: { end: ReturnType<typeof vi.fn> } }
}

const exited = (exitCode = 0): Promise<SubprocessOutcome> =>
  Promise.resolve({ exitCode, signal: null, durationMs: 1 } as SubprocessOutcome)

describe('disposeProviderChild ladder', () => {
  it('observes a spawn-failed handle without touching stdin or termination', async () => {
    const failure = new Error('spawn failed')
    const child = fakeChild({ pid: -1, done: Promise.reject(failure) })
    await expect(disposeProviderChild(child, { endStdin: true, eofGraceMs: 5 }))
      .resolves.toBeUndefined()
    expect(child.terminate).not.toHaveBeenCalled()
    expect(child.stdin.end).not.toHaveBeenCalled()
  })

  it('ends stdin and returns at whole-tree exit inside the EOF grace, skipping termination', async () => {
    const child = fakeChild({ pid: 4242, done: exited(7), exitsWithinGrace: true })
    await expect(disposeProviderChild(child, { endStdin: true, eofGraceMs: 50 }))
      .resolves.toMatchObject({ exitCode: 7 })
    expect(child.stdin.end).toHaveBeenCalledOnce()
    expect(child.terminate).not.toHaveBeenCalled()
  })

  it('escalates to terminate and joins the tree when the grace elapses', async () => {
    const child = fakeChild({ pid: 4242, done: exited() })
    await expect(disposeProviderChild(child, { endStdin: true, eofGraceMs: 50 }))
      .resolves.toMatchObject({ exitCode: 0 })
    expect(child.stdin.end).toHaveBeenCalledOnce()
    expect(child.terminate).toHaveBeenCalledOnce()
    // Two waits: the bounded grace observation, then the unbounded exit proof.
    expect(child.waitForExit).toHaveBeenCalledTimes(2)
  })

  it('propagates exit-proof failures raw for the provider to wrap with its facts', async () => {
    const waitForExitError = new Error('exit proof failed')
    const child = fakeChild({ pid: 4242, done: exited(), waitForExitError })
    await expect(disposeProviderChild(child, { endStdin: true })).rejects.toBe(waitForExitError)
    expect(child.terminate).toHaveBeenCalledOnce()
  })

  it('leaves stdin alone when endStdin is omitted (an SDK-owned stdin)', async () => {
    const child = fakeChild({ pid: 4242, done: exited() })
    await expect(disposeProviderChild(child)).resolves.toMatchObject({ exitCode: 0 })
    expect(child.stdin.end).not.toHaveBeenCalled()
    expect(child.terminate).toHaveBeenCalledOnce()
  })

  it('childExitsWithin resolves false when the abort fires first', async () => {
    const child = fakeChild({ pid: 1, done: exited() })
    // waitForExit honors the aborting signal; the fake resolves false for it.
    expect(await childExitsWithin(child, 1)).toBe(false)
  })
})

describe('providerTextTask', () => {
  const text = (value: string): ContentBlock => ({ type: 'text', text: value })

  it('validates text-only, non-empty tasks with the caller’s package prefix', () => {
    expect(providerTextTask([text('a'), text('b')], 'subagent-x')).toEqual(['a', 'b'])
    expect(() => providerTextTask([], 'subagent-x'))
      .toThrow('subagent-x: the one-shot task must contain only text blocks')
    expect(() => providerTextTask([{ type: 'image' } as unknown as ContentBlock], 'subagent-x'))
      .toThrow('subagent-x: the one-shot task must contain only text blocks')
    expect(() => providerTextTask([text('  ')], 'subagent-x'))
      .toThrow('subagent-x: the one-shot task must not be empty')
  })
})

describe('providerFailureDiagnostic exact-string contract', () => {
  it('renders the three providers’ historical diagnostic lines verbatim', () => {
    const outcome = { exitCode: 1, signal: 'SIGTERM' } as unknown as SubprocessOutcome
    // ACP: Subagent failure over provider facts, stop reason before process facts.
    expect(providerFailureDiagnostic({
      label: 'Subagent failure',
      subject: 'provider: ACP',
      fields: [
        ['stage', 'prompt'],
        ['category', 'transport'],
        ['stop reason', undefined],
        ['exit code', outcome.exitCode],
        ['signal', outcome.signal],
      ],
    })).toBe('Subagent failure (provider: ACP; stage: prompt; category: transport; exit code: 1; signal: SIGTERM)')
    // Claude Code: Product subagent failure, no stop-reason or HTTP field.
    expect(providerFailureDiagnostic({
      label: 'Product subagent failure',
      subject: 'product: Claude Code',
      fields: [
        ['stage', 'teardown'],
        ['category', 'unknown'],
        ['exit code', null],
        ['signal', undefined],
      ],
    })).toBe('Product subagent failure (product: Claude Code; stage: teardown; category: unknown)')
    // Codex: HTTP status ranks between category and process facts.
    expect(providerFailureDiagnostic({
      label: 'Product subagent failure',
      subject: 'product: Codex',
      fields: [
        ['stage', 'initialize'],
        ['category', 'unknown'],
        ['HTTP status', 429],
        ['exit code', 0],
        ['signal', null],
      ],
    })).toBe('Product subagent failure (product: Codex; stage: initialize; category: unknown; HTTP status: 429; exit code: 0)')
  })
})

describe('ProviderRunFailure base', () => {
  class SpecRunFailure extends ProviderRunFailure<{ stage: string }> {
    constructor(facts: { stage: string }, cause?: unknown) {
      super('subagent-spec', facts, `Spec failure (stage: ${facts.stage})`, cause)
    }
  }

  it('carries the package prefix, diagnostic, facts, and subclass name', () => {
    const cause = new Error('root cause')
    const failure = new SpecRunFailure({ stage: 'initialize' }, cause)
    expect(failure.name).toBe('SpecRunFailure')
    expect(failure.message).toBe('subagent-spec: Spec failure (stage: initialize)')
    expect(failure.facts).toEqual({ stage: 'initialize' })
    expect(failure.cause).toBe(cause)
  })

  it('omits the cause slot when the provider passed none', () => {
    const failure = new SpecRunFailure({ stage: 'process' })
    expect(failure.cause).toBeUndefined()
  })
})
