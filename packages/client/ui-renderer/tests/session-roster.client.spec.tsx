// @vitest-environment jsdom
/**
 * Session-scope roster churn: a Session standard-source provider unloads for
 * one HMR rebuild, its consumers crash, and the scope adapter's roster
 * revision retries them. No root roster publish happens on this axis, so the
 * shared roster epoch must move from the scope adapter alone.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  FactoryComponentPropsOf, HostObservable, PropsRenderFactories, PropsRenderSlots,
  PropsRuntime, SnapshotSelectorHook,
} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sroster.panel': { kind: 'single'; scope: 'session' }
    'sroster.factory-panel': { kind: 'single'; scope: 'session' }
  }

  interface SlotFactoryMap {
    'sroster.factory': { scope: 'session' }
  }

  // Optional on purpose: module augmentation is program-global in the client
  // aggregate, and a required member would force every unrelated hand-built
  // Session props fixture to declare this test-only seat. The consumers below
  // still fail exactly like production when the seat is missing.
  interface SessionStandardProps {
    useFeature?: SnapshotSelectorHook<number>
  }
}

/** Fixed-value Session store: the reclaiming provider only has to publish a source. */
function observable(value: number): HostObservable<number> {
  return { getSnapshot: () => value, subscribe: () => () => {} }
}

/** Consumes one Session standard seat the way a shipped component does. */
function Panel({ useFeature }: PropsRuntime<'sroster.panel'>) {
  if (useFeature === undefined) throw new TypeError('useFeature is not a function')
  return <b data-feature>{useFeature(value => value)}</b>
}

function FactoryPanel({ useFeature }: FactoryComponentPropsOf<'sroster.factory'>) {
  if (useFeature === undefined) throw new TypeError('useFeature is not a function')
  return <b data-factory-feature>{useFeature(value => value)}</b>
}

/** One plugin that provides a single Session standard seat, for mount/dispose. */
function providerOf(feature: HostObservable<number>) {
  return {
    name: 'session-roster-provider',
    inject: ['uiSession'],
    apply(ctx: Context): void {
      ctx.uiSession.provide({ hooks: ['feature'], resolve: () => ({ hooks: { feature } }) })
    },
  }
}

const sid = (value: string): SessionId => value as SessionId

function consoleText(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map(call => call.map(value => String(value)).join(' ')).join('\n')
}

async function bootSession(runtime: SlotTestRuntime): Promise<SessionReference> {
  await runtime.sessions.add({ id: sid('sroster') })
  return runtime.sessions.retainFor(runtime.ctx, sid('sroster'))
}

describe('Session scope roster churn', () => {
  it('retries a crashed Session entry after its provider returns, without a root publish', async () => {
    const runtime = await SlotTestRuntime.create()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handle = await runtime.mount(providerOf(observable(1)))
    const reference = await bootSession(runtime)
    await runtime.root.declare({ 'sroster.panel': { kind: 'single', scope: 'session' } },
      ({ renderSlot, SessionProvider }: PropsRenderSlots<'sroster.panel'>) => (
        <SessionProvider session={reference}>{renderSlot('sroster.panel', {})}</SessionProvider>
      ))
    runtime.slots.register({ name: 'sroster.panel' }, Panel)
    const view = runtime.renderRoot()
    expect(view.container.querySelector('[data-feature]')?.textContent).toBe('1')

    // Only the Session roster moves from here on; a root publish would mean the
    // wrong axis healed the crash.
    const rootPublish = vi.spyOn(runtime.slots, 'provideRoot')
    await handle.dispose()
    await runtime.flush()
    expect(view.container.querySelector('[data-slot-error="sroster.panel"]')).not.toBeNull()
    expect(consoleText(error)).toContain("slot entry crashed in 'sroster.panel'")
    expect(consoleText(warn)).toContain('Session standard source withdrew hook')
    expect(consoleText(warn)).toContain('useFeature')
    expect(rootPublish).not.toHaveBeenCalled()

    await runtime.mount(providerOf(observable(2)))
    await runtime.flush()
    expect(view.container.querySelector('[data-slot-error="sroster.panel"]')).toBeNull()
    expect(view.container.querySelector('[data-feature]')?.textContent).toBe('2')
    expect(rootPublish).not.toHaveBeenCalled()

    rootPublish.mockRestore()
    error.mockRestore()
    warn.mockRestore()
    await runtime.dispose()
  })

  it('retries a crashed Session Factory occurrence after its provider returns', async () => {
    const runtime = await SlotTestRuntime.create()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handle = await runtime.mount(providerOf(observable(3)))
    const reference = await bootSession(runtime)
    await runtime.root.declare({ 'sroster.factory-panel': { kind: 'single', scope: 'session' } },
      ({ renderFactorySlot, SessionProvider }: PropsRenderSlots<'sroster.factory-panel'> & PropsRenderFactories) => (
        <SessionProvider session={reference}>{renderFactorySlot('sroster.factory', {})}</SessionProvider>
      ))
    runtime.slots.registerFactory({ name: 'sroster.factory', scope: 'session' }, FactoryPanel)
    const view = runtime.renderRoot()
    expect(view.container.querySelector('[data-factory-feature]')?.textContent).toBe('3')

    await handle.dispose()
    await runtime.flush()
    expect(view.container.querySelector('[data-factory-error="sroster.factory"]')).not.toBeNull()
    expect(consoleText(error)).toContain("slot factory occurrence crashed in 'sroster.factory'")

    await runtime.mount(providerOf(observable(4)))
    await runtime.flush()
    expect(view.container.querySelector('[data-factory-error="sroster.factory"]')).toBeNull()
    expect(view.container.querySelector('[data-factory-feature]')?.textContent).toBe('4')

    error.mockRestore()
    warn.mockRestore()
    await runtime.dispose()
  })
})
