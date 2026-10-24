// @vitest-environment jsdom
/**
 * Render-scope evidence for the panel disclosure: a panel switch must reach
 * the row that owns it and nothing else. The Workspace browser is the
 * expensive neighbour inside this column, so it is the meter.
 */
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SidebarPanelMetadata, SidebarRootComponentProps } from '../src/client/contract/slots.ts'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { createPanelListStore } from '../src/client/stores.ts'
import { en } from '../src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const t: SidebarRootComponentProps['t'] = makeTranslate({ ...commonEn, ...en })
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never
const useSessionStatus: SidebarRootComponentProps['useSessionStatus'] = selector => selector(new Map())

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function panelList(ids: readonly string[]): readonly SidebarPanelMetadata[] {
  return ids.map((id, index) => ({ id, order: index * 10, label: id }))
}

describe('panel disclosure render cost', () => {
  it('re-renders the row that owns a selection change, not the column', () => {
    const ids = ['plugins', 'schedules', 'mcp', 'agents', 'skills', 'webhooks']
    const listeners = new Set<() => void>()
    // A source that notifies on selection, exactly like the layout store: the
    // snapshot reference stays stable until the fact moves.
    let state: { activePanelId: string | null } = { activePanelId: null }
    const snapshot = (): { activePanelId: string | null } => state
    const subscribe = (fn: () => void): (() => void) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    }
    const usePanelInfo: SidebarRootComponentProps['usePanelInfo'] = selector =>
      selector(useSyncExternalStore(subscribe, snapshot))
    let regionRenders = 0
    const select = (id: string): void => {
      state = { activePanelId: id }
      for (const listener of listeners) listener()
    }
    const store = createPanelListStore().create()
    render(
      <SidebarRoot
        collapsed={false} width={300}
        useSessions={neverHook} useSessionStatus={useSessionStatus} useSessionRetainInfo={neverHook}
        usePanelInfo={usePanelInfo}
        selectPanel={select} usePanels={selector => selector(panelList(ids))}
        useShortcuts={selector => selector([])}
        useResource={useResource} useWorkspaces={neverHook}
        {...allowAllAccess}
        useStore={bindSnapshotSelector(store)} actions={store.actions}
        startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
        renderSlot={((key: string) => {
          if (key === 'sidebar.workspaces') {
            regionRenders += 1
            return <div data-testid="region" />
          }
          return null
        }) as SidebarRootComponentProps['renderSlot']}
      />,
    )
    const baseline = regionRenders
    // Selecting a pinned panel flips its row; the column and the Workspace
    // browser nested in it must not re-render.
    select('mcp')
    expect(screen.getByRole('button', { name: 'mcp' })).toBeTruthy()
    expect(regionRenders).toBe(baseline)
    // A selection inside the fold reaches the group header the same way.
    select('skills')
    expect(regionRenders).toBe(baseline)
    // The folded group is still one click away afterwards.
    fireEvent.click(screen.getByRole('button', { name: 'More panels (2)' }))
    expect(screen.getByRole('button', { name: 'skills' })).toBeTruthy()
  })
})
