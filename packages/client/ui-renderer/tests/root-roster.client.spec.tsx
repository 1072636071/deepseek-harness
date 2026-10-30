// @vitest-environment jsdom
/**
 * Root standard-source roster churn: a provider that unloads for one rebuild
 * withdraws its seats, consumers crash, and the republished roster retries
 * them. Healthy subtrees keep their mount identity across the roster epoch.
 */
import { useEffect, useState } from 'react'
import { act, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  GlobalStandardProps, PropsRenderFactories, PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'roster.panel': { kind: 'single'; scope: 'root' }
    'roster.healthy': { kind: 'single'; scope: 'root' }
    'roster.chain': { kind: 'chain'; scope: 'root'; owner: { enabled: boolean } }
  }

  interface SlotFactoryMap {
    'roster.factory': { scope: 'root' }
  }
}

/** The derived standard seat these consumers render; the framework types it, never this spec. */
type WorkspaceSeat = Pick<GlobalStandardProps, 'useWorkspaces'>

/**
 * Mount/unmount observations for the healthy sibling. AC3 is "the roster
 * change does not remount a healthy subtree", which no DOM assertion can show:
 * the text and the anchor survive a remount too. Instance identity is the one
 * observable that proves it, so this is the only place the spec counts.
 */
let healthyMounts = 0
let healthyUnmounts = 0

/** Consumes the useWorkspaces standard seat the way a shipped component does. */
function WorkspacePanel({ useWorkspaces }: WorkspaceSeat) {
  return <b data-workspaces>{useWorkspaces(state => state.items.length)}</b>
}

/** The same consumption from a chain entry, whose crash does not abdicate. */
function ChainPanel({ useWorkspaces }: WorkspaceSeat) {
  return <b data-chain-workspaces>{useWorkspaces(state => state.items.length)}</b>
}

/** The same consumption from a Factory occurrence. */
function FactoryPanel({ useWorkspaces }: WorkspaceSeat) {
  return <b data-factory-workspaces>{useWorkspaces(state => state.items.length)}</b>
}

function HealthyPanel() {
  useEffect(() => {
    healthyMounts += 1
    return () => { healthyUnmounts += 1 }
  }, [])
  return <i data-healthy>healthy</i>
}

const PANEL_AND_HEALTHY = {
  'roster.panel': { kind: 'single', scope: 'root' },
  'roster.healthy': { kind: 'single', scope: 'root' },
} as const

const CHAIN = { 'roster.chain': { kind: 'chain', scope: 'root' } } as const

/** Withdraw the shipped Workspaces root source; restoring is the caller's step. */
async function withdrawWorkspaces(runtime: SlotTestRuntime) {
  await act(async () => { runtime.releaseWorkspaceSource() })
  await runtime.flush()
}

async function restoreWorkspaces(runtime: SlotTestRuntime) {
  await act(async () => {
    runtime.slots.provideRoot({ hooks: { workspaces: runtime.workspaces.list } })
  })
  await runtime.flush()
}

function consoleText(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map(call => call.map(value => String(value)).join(' ')).join('\n')
}

describe('root standard-source roster churn', () => {
  it('retries an entry crash caused by a withdrawn seat once the seat returns', async () => {
    healthyMounts = 0
    healthyUnmounts = 0
    const runtime = await SlotTestRuntime.create()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await runtime.root.declare(PANEL_AND_HEALTHY, ({ renderSlot }: PropsRenderSlots<'roster.panel' | 'roster.healthy'>) => {
      const [, setTick] = useState(0)
      return (
        <>
          <button type="button" onClick={() => { setTick(value => value + 1) }}>rerender</button>
          {renderSlot('roster.panel', {})}
          {renderSlot('roster.healthy', {})}
        </>
      )
    })
    runtime.slots.register({ name: 'roster.panel' }, WorkspacePanel)
    runtime.slots.register({ name: 'roster.healthy' }, HealthyPanel)
    const view = runtime.renderRoot()
    const expected = String(runtime.workspaces.list.getSnapshot().items.length)
    expect(view.container.querySelector('[data-workspaces]')?.textContent).toBe(expected)
    expect(healthyMounts).toBe(1)

    await withdrawWorkspaces(runtime)
    expect(view.container.querySelector('[data-slot-error="roster.panel"]')).not.toBeNull()
    expect(consoleText(error)).toContain("slot entry crashed in 'roster.panel'")
    expect(consoleText(warn)).toContain('useWorkspaces')
    expect(consoleText(warn)).toContain('crash until it returns')
    // AC3: the healthy sibling keeps its instance through the roster churn.
    expect(view.container.querySelector('[data-healthy]')).not.toBeNull()
    expect(healthyMounts).toBe(1)
    expect(healthyUnmounts).toBe(0)

    // AC2: while the seat stays gone, an owner re-render neither retries the
    // crash nor loops the boundary.
    fireEvent.click(view.getByRole('button', { name: 'rerender' }))
    await runtime.flush()
    expect(view.container.querySelector('[data-slot-error="roster.panel"]')).not.toBeNull()
    expect(view.container.querySelector('[data-workspaces]')).toBeNull()

    await restoreWorkspaces(runtime)
    expect(view.container.querySelector('[data-slot-error="roster.panel"]')).toBeNull()
    expect(view.container.querySelector('[data-workspaces]')?.textContent).toBe(expected)
    expect(healthyMounts).toBe(1)
    expect(healthyUnmounts).toBe(0)

    error.mockRestore()
    warn.mockRestore()
    await runtime.dispose()
  })

  it('retries a crashed chain entry on the next epoch without abdicating it', async () => {
    const runtime = await SlotTestRuntime.create()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await runtime.root.declare(CHAIN, ({ renderSlotChain }: PropsRenderSlots<'roster.chain'>) => (
      <>{renderSlotChain('roster.chain', { enabled: true })}</>
    ))
    runtime.slots.register({ name: 'roster.chain', select: () => ({}) }, ChainPanel)
    const view = runtime.renderRoot()
    const expected = String(runtime.workspaces.list.getSnapshot().items.length)
    expect(view.container.querySelector('[data-chain-workspaces]')?.textContent).toBe(expected)

    await withdrawWorkspaces(runtime)
    expect(view.container.querySelector('[data-slot-error="roster.chain"]')).not.toBeNull()

    await restoreWorkspaces(runtime)
    expect(view.container.querySelector('[data-slot-error="roster.chain"]')).toBeNull()
    expect(view.container.querySelector('[data-chain-workspaces]')?.textContent).toBe(expected)

    error.mockRestore()
    warn.mockRestore()
    await runtime.dispose()
  })

  it('retries a crashed Factory occurrence once the withdrawn seat returns', async () => {
    const runtime = await SlotTestRuntime.create()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await runtime.root.declare({}, ({ renderFactorySlot }: PropsRuntime<'root'> & PropsRenderFactories) => (
      <>{renderFactorySlot('roster.factory', {})}</>
    ))
    runtime.slots.registerFactory({ name: 'roster.factory', scope: 'root' }, FactoryPanel)
    const view = runtime.renderRoot()
    const expected = String(runtime.workspaces.list.getSnapshot().items.length)
    expect(view.container.querySelector('[data-factory-workspaces]')?.textContent).toBe(expected)

    await withdrawWorkspaces(runtime)
    expect(view.container.querySelector('[data-factory-error="roster.factory"]')).not.toBeNull()
    expect(consoleText(error)).toContain("slot factory occurrence crashed in 'roster.factory'")

    await restoreWorkspaces(runtime)
    expect(view.container.querySelector('[data-factory-error="roster.factory"]')).toBeNull()
    expect(view.container.querySelector('[data-factory-workspaces]')?.textContent).toBe(expected)

    error.mockRestore()
    warn.mockRestore()
    await runtime.dispose()
  })
})
