// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, createEvent, fireEvent, render } from '@testing-library/react'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot, WorkspaceView, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceFoldersSnapshot } from '@deepseek-ai/dsh-api-workspace-folders/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type { WorkspaceBrowserProps } from '../src/client/contract/slots.ts'
import { createWorkspaceShortcutControls } from '../src/client/shortcuts.ts'
import { createWorkspaceViewStore } from '../src/client/stores.ts'
import { WorkspaceBrowser } from '../src/client/rows/WorkspaceBrowser.tsx'
import { en } from '../src/client/locales.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const t = makeTranslate(en, commonEn)
const wid = (id: string): WorkspaceId => id as WorkspaceId
const emptySessions: SessionListState = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }
const noPendingInteraction: SessionStatusSnapshot = new Map()
const workspace = (id: string): WorkspaceView => ({
  workspaceId: wid(id), path: `/projects/${id}`, title: id, sessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const workspaceState = (items: readonly WorkspaceView[]): WorkspaceSnapshot => ({
  items, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}
const ROW_HEIGHT = 34
const ROW_TOP = 200

function placeRow(id: string, index: number): HTMLElement {
  const row = document.querySelector(`[data-row-key="workspace:${id}"]`) as HTMLElement
  const top = ROW_TOP + index * ROW_HEIGHT
  const rect = () => ({
    top, bottom: top + ROW_HEIGHT, left: 0, right: 240, width: 240, height: ROW_HEIGHT, x: 0, y: top,
    toJSON: () => ({}),
  })
  row.getBoundingClientRect = rect
  // The section wrapper also resolves the pointer side across a Workspace's rows;
  // with no descendants it spans exactly this header.
  const section = row.closest('[class*="groupSection"]') as HTMLElement | null
  if (section !== null) section.getBoundingClientRect = rect
  return row
}
function sectionOf(id: string): Element | null {
  return document.querySelector(`[data-row-key="workspace:${id}"]`)?.closest('[class*="groupSection"]') ?? null
}
function fireDrag(row: HTMLElement, type: 'dragOver' | 'drop', clientY: number): void {
  const event = type === 'dragOver' ? createEvent.dragOver(row) : createEvent.drop(row)
  Object.defineProperty(event, 'clientY', { value: clientY })
  Object.defineProperty(event, 'dataTransfer', { value: { effectAllowed: '', dropEffect: '' } })
  fireEvent(row, event)
}
const dragData = () => ({ effectAllowed: 'uninitialized', dropEffect: 'none', setData: vi.fn() })

/** Mount the browser with four Workspaces, optionally folding two of them. */
function mountBrowser(options: { folderMode?: boolean } = {}) {
  const store = createWorkspaceViewStore().create()
  if (options.folderMode === true) store.actions.setGroupBy('folder')
  const controls = createWorkspaceShortcutControls()
  const insertWorkspaceBefore = vi.fn(async () => {})
  const members: readonly WorkspaceView[] = [workspace('a'), workspace('b'), workspace('c'), workspace('d')]
  const props: WorkspaceBrowserProps = {
    useShortcuts: select => select([]),
    useWorkspaceShortcuts: bindSnapshotSelector(controls.state),
    requestSearch: controls.search,
    requestAddWorkspace: controls.add,
    closeAddWorkspace: controls.closeAdd,
    setDirectoryBusy: controls.directoryBusy,
    requestSessionRename: controls.rename,
    wide: true,
    expandSidebar: vi.fn(),
    useSessions: hook(emptySessions),
    useSessionStatus: hook(noPendingInteraction),
    useSessionRetainInfo: () => undefined,
    usePanelInfo, useResource,
    useWorkspaces: hook(workspaceState(members)),
    ...allowAllAccess,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    startSession: vi.fn(),
    open: vi.fn(),
    searchSessions: vi.fn(async () => ({ items: [], hasMore: false })),
    searchResultLimit: 20,
    notifyArchivedNotOpenable: vi.fn(),
    renameWorkspace: vi.fn(async () => {}),
    deleteWorkspace: vi.fn(async () => {}),
    unarchiveSession: vi.fn(async () => {}),
    insertWorkspaceBefore,
    createWorkspace: vi.fn(async () => workspace('created')),
    useDirectoryFlow: bindSnapshotSelector({ getSnapshot: () => false, subscribe: () => () => {} }),
    useHostInfo: selector => selector({ home: undefined, isLoopback: true }),
    useFolders: hook({
      folders: options.folderMode === true
        ? [{ folderId: 'f1' as never, title: 'Work', workspaceIds: [wid('a'), wid('b')], expanded: true, createdAt: '2026-01-01T00:00:00.000Z' }]
        : [],
      state: 'idle', error: null,
    } as WorkspaceFoldersSnapshot),
    folderSupport: true,
    createFolder: vi.fn(async () => undefined),
    renameFolder: vi.fn(async () => undefined),
    deleteFolder: vi.fn(async () => undefined),
    setFolderExpanded: vi.fn(async () => undefined),
    setFolderMembership: vi.fn(async () => undefined),
    renderSlot: () => null,
    t,
  }
  render(<WorkspaceBrowser {...props} />)
  return { insertWorkspaceBefore }
}

const workspaceOrder = (): (string | null)[] => [...document.querySelectorAll('[data-row-key^="workspace:"]')]
  .map(row => row.getAttribute('data-row-key')?.slice('workspace:'.length) ?? null)

beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

describe('Workspace row drag near-half drops', () => {
  it('moves a row down when released inside the next row upper half', () => {
    const { insertWorkspaceBefore } = mountBrowser()
    expect(workspaceOrder()).toEqual(['a', 'b', 'c', 'd'])
    const b = placeRow('b', 1)
    const c = placeRow('c', 2)
    placeRow('a', 0)
    placeRow('d', 3)
    fireEvent.dragStart(b, { dataTransfer: dragData() })
    fireDrag(c, 'dragOver', ROW_TOP + ROW_HEIGHT + 4)
    // The marker follows the resolved side, not the pointer's own half.
    expect(sectionOf('c')?.className).toMatch(/workspaceDropAfter/)
    fireDrag(c, 'drop', ROW_TOP + ROW_HEIGHT + 4)
    expect(insertWorkspaceBefore).toHaveBeenCalledWith('b', 'd')
  })

  it('moves a row up when released inside the previous row lower half', () => {
    const { insertWorkspaceBefore } = mountBrowser()
    placeRow('a', 0)
    const b = placeRow('b', 1)
    const c = placeRow('c', 2)
    placeRow('d', 3)
    fireEvent.dragStart(c, { dataTransfer: dragData() })
    fireDrag(b, 'dragOver', ROW_TOP + ROW_HEIGHT + ROW_HEIGHT - 4)
    expect(sectionOf('b')?.className).toMatch(/workspaceDropBefore/)
    fireDrag(b, 'drop', ROW_TOP + ROW_HEIGHT + ROW_HEIGHT - 4)
    expect(insertWorkspaceBefore).toHaveBeenCalledWith('c', 'b')
  })

  it('drops before a far target when the pointer half already resolves', () => {
    const { insertWorkspaceBefore } = mountBrowser()
    placeRow('a', 0)
    placeRow('b', 1)
    placeRow('c', 2)
    const d = placeRow('d', 3)
    const a = placeRow('a', 0)
    fireEvent.dragStart(a, { dataTransfer: dragData() })
    fireDrag(d, 'dragOver', ROW_TOP + 3 * ROW_HEIGHT + 4)
    expect(sectionOf('d')?.className).toMatch(/workspaceDropBefore/)
    fireDrag(d, 'drop', ROW_TOP + 3 * ROW_HEIGHT + 4)
    expect(insertWorkspaceBefore).toHaveBeenCalledWith('a', 'd')
  })

  it('drags adjacent Workspace rows inside a folder section', () => {
    const { insertWorkspaceBefore } = mountBrowser({ folderMode: true })
    expect(workspaceOrder()).toEqual(['a', 'b', 'c', 'd'])
    const a = placeRow('a', 0)
    const b = placeRow('b', 1)
    placeRow('c', 2)
    placeRow('d', 3)
    fireEvent.dragStart(a, { dataTransfer: dragData() })
    fireDrag(b, 'dragOver', ROW_TOP + ROW_HEIGHT + 4)
    expect(sectionOf('b')?.className).toMatch(/workspaceDropAfter/)
    fireDrag(b, 'drop', ROW_TOP + ROW_HEIGHT + 4)
    expect(insertWorkspaceBefore).toHaveBeenCalledWith('a', 'c')
  })

  it('writes nothing when the row is dropped on itself', () => {
    const { insertWorkspaceBefore } = mountBrowser()
    const b = placeRow('b', 1)
    placeRow('c', 2)
    fireEvent.dragStart(b, { dataTransfer: dragData() })
    fireDrag(b, 'dragOver', ROW_TOP + ROW_HEIGHT + 4)
    expect(sectionOf('b')?.className).not.toMatch(/workspaceDrop/)
    fireDrag(b, 'drop', ROW_TOP + ROW_HEIGHT + 4)
    expect(insertWorkspaceBefore).not.toHaveBeenCalled()
  })
})
