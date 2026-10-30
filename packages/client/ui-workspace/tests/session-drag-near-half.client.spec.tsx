// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot, WorkspaceView, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceFoldersSnapshot } from '@deepseek-ai/dsh-api-workspace-folders/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type { WorkspaceBrowserProps } from '../src/client/contract/slots.ts'
import { createWorkspaceShortcutControls } from '../src/client/shortcuts.ts'
import { createWorkspaceViewStore, FLAT_SESSION_ORDER_KEY } from '../src/client/stores.ts'
import { WorkspaceBrowser } from '../src/client/rows/WorkspaceBrowser.tsx'
import { en } from '../src/client/locales.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const t = makeTranslate(en, commonEn)
const wid = (id: string): WorkspaceId => id as WorkspaceId
const sid = (id: string): SessionId => id as SessionId
const summary = (id: string, updatedAt: number): SessionSummary => ({
  id: sid(id), title: id, displayTitle: id, running: false, blank: false, updatedAt, retainedBy: {},
})
const sessionState = (items: readonly SessionSummary[]): SessionListState => ({
  ids: items.map(item => item.id),
  byId: Object.fromEntries(items.map(item => [item.id, item])),
  phase: 'ready',
  projectionsBySession: {},
})
const workspace = (id: string, sessionIds: string[], title = id): WorkspaceView => ({
  workspaceId: wid(id), path: `/projects/${id}`, title,
  sessionIds: sessionIds.map(sid), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const workspaceState = (items: readonly WorkspaceView[]): WorkspaceSnapshot => ({
  items, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})
const noPendingInteraction: SessionStatusSnapshot = new Map()
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}
const ROW_HEIGHT = 34
const ROW_TOP = 200

/** Pin a row's geometry so rowHalf can resolve a side from clientY. */
function placeRow(id: string, index: number): HTMLElement {
  const row = document.querySelector(`[data-row-key="session:${id}"]`) as HTMLElement
  const top = ROW_TOP + index * ROW_HEIGHT
  row.getBoundingClientRect = () => ({
    top, bottom: top + ROW_HEIGHT, left: 0, right: 200, width: 200, height: ROW_HEIGHT, x: 0, y: top,
    toJSON: () => ({}),
  })
  return row
}
function fireDrag(row: HTMLElement, kind: 'dragOver' | 'drop', clientY: number): void {
  const event = kind === 'dragOver' ? createEvent.dragOver(row) : createEvent.drop(row)
  Object.defineProperty(event, 'clientY', { value: clientY })
  Object.defineProperty(event, 'dataTransfer', { value: { effectAllowed: '', dropEffect: '' } })
  fireEvent(row, event)
}

const dragData = () => ({ effectAllowed: 'uninitialized', dropEffect: 'none', setData: vi.fn() })

/** Render one grouping mode with one Workspace of three sessions (folder mode nests it in an expanded folder). */
function renderFolderBrowser(groupBy: 'folder' | 'flat' = 'folder') {
  const sessions = sessionState([summary('one', 3), summary('two', 2), summary('three', 1)])
  const store = createWorkspaceViewStore().create()
  store.actions.setGroupBy(groupBy)
  const controls = createWorkspaceShortcutControls()
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
    useSessions: hook(sessions),
    useSessionStatus: hook(noPendingInteraction),
    useSessionRetainInfo: () => undefined,
    usePanelInfo, useResource,
    useWorkspaces: hook(workspaceState([workspace('alpha', ['one', 'two', 'three'])])),
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
    insertWorkspaceBefore: vi.fn(async () => {}),
    createWorkspace: vi.fn(async () => workspace('created', [])),
    useDirectoryFlow: bindSnapshotSelector({ getSnapshot: () => false, subscribe: () => () => {} }),
    useHostInfo: selector => selector({ home: undefined, isLoopback: true }),
    useFolders: hook({ folders: [
      { folderId: 'f1' as never, title: 'Work', workspaceIds: [wid('alpha')], expanded: true, createdAt: '2026-01-01T00:00:00.000Z' },
    ], state: 'idle', error: null } as WorkspaceFoldersSnapshot),
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
  if (groupBy === 'folder') fireEvent.click(screen.getByText('alpha'))
  return store
}

const rowOrder = (): (string | null)[] => [...document.querySelectorAll('[data-row-key]')]
  .map(row => row.getAttribute('data-row-key'))

beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

describe('session drag near-half drops', () => {
  it('moves a row down when released inside the next row upper half', () => {
    const store = renderFolderBrowser()
    expect(rowOrder()).toEqual(['folder:f1', 'workspace:alpha', 'session:one', 'session:two', 'session:three'])
    const one = placeRow('one', 0)
    const two = placeRow('two', 1)
    fireEvent.dragStart(one, { dataTransfer: dragData() })
    // Upper half of the next row: the pointer's side alone would be a no-op slot.
    fireDrag(two, 'dragOver', ROW_TOP + ROW_HEIGHT + 4)
    fireDrag(two, 'drop', ROW_TOP + ROW_HEIGHT + 4)
    expect(store.getSnapshot().sessionOrderByAccount.alpha).toEqual(['two', 'one', 'three'])
    expect(rowOrder()).toEqual(['folder:f1', 'workspace:alpha', 'session:two', 'session:one', 'session:three'])
  })

  it('moves a row up when released inside the previous row lower half', () => {
    const store = renderFolderBrowser()
    const one = placeRow('one', 0)
    const two = placeRow('two', 1)
    const three = placeRow('three', 2)
    void one
    fireEvent.dragStart(three, { dataTransfer: dragData() })
    fireDrag(two, 'dragOver', ROW_TOP + ROW_HEIGHT + ROW_HEIGHT - 4)
    fireDrag(two, 'drop', ROW_TOP + ROW_HEIGHT + ROW_HEIGHT - 4)
    expect(store.getSnapshot().sessionOrderByAccount.alpha).toEqual(['one', 'three', 'two'])
    expect(rowOrder()).toEqual(['folder:f1', 'workspace:alpha', 'session:one', 'session:three', 'session:two'])
  })
})
describe('flat session drag near-half drops', () => {
  it('moves a row down when released inside the next row upper half', () => {
    const store = renderFolderBrowser('flat')
    expect(rowOrder()).toEqual(['session:one', 'session:two', 'session:three'])
    const one = placeRow('one', 0)
    const two = placeRow('two', 1)
    placeRow('three', 2)
    fireEvent.dragStart(one, { dataTransfer: dragData() })
    fireDrag(two, 'dragOver', ROW_TOP + ROW_HEIGHT + 4)
    // The marker follows the resolved side, not the pointer's own half.
    expect(two.className).toMatch(/dropAfter/)
    fireDrag(two, 'drop', ROW_TOP + ROW_HEIGHT + 4)
    expect(store.getSnapshot().sessionOrderByAccount[FLAT_SESSION_ORDER_KEY]).toEqual(['two', 'one', 'three'])
    expect(rowOrder()).toEqual(['session:two', 'session:one', 'session:three'])
  })

  it('moves a row up when released inside the previous row lower half', () => {
    const store = renderFolderBrowser('flat')
    placeRow('one', 0)
    const two = placeRow('two', 1)
    const three = placeRow('three', 2)
    fireEvent.dragStart(three, { dataTransfer: dragData() })
    fireDrag(two, 'dragOver', ROW_TOP + ROW_HEIGHT + ROW_HEIGHT - 4)
    expect(two.className).toMatch(/dropBefore/)
    fireDrag(two, 'drop', ROW_TOP + ROW_HEIGHT + ROW_HEIGHT - 4)
    expect(store.getSnapshot().sessionOrderByAccount[FLAT_SESSION_ORDER_KEY]).toEqual(['one', 'three', 'two'])
    expect(rowOrder()).toEqual(['session:one', 'session:three', 'session:two'])
  })

  it('marks nothing while a row hovers itself, and the drop commits no move', () => {
    const store = renderFolderBrowser('flat')
    const one = placeRow('one', 0)
    placeRow('two', 1)
    placeRow('three', 2)
    fireEvent.dragStart(one, { dataTransfer: dragData() })
    fireDrag(one, 'dragOver', ROW_TOP + 4)
    expect(one.className).not.toMatch(/drop(Before|After)/)
    fireDrag(one, 'drop', ROW_TOP + 4)
    expect(store.getSnapshot().sessionOrderByAccount[FLAT_SESSION_ORDER_KEY]).toBeUndefined()
    expect(rowOrder()).toEqual(['session:one', 'session:two', 'session:three'])
  })
})
describe('flat session drag end fallback', () => {
  it('commits the hovered side on drag end when no drop reaches the row', () => {
    const store = renderFolderBrowser('flat')
    const one = placeRow('one', 0)
    const two = placeRow('two', 1)
    placeRow('three', 2)
    fireEvent.dragStart(one, { dataTransfer: dragData() })
    fireDrag(two, 'dragOver', ROW_TOP + ROW_HEIGHT + 4)
    fireEvent.dragEnd(one)
    expect(store.getSnapshot().sessionOrderByAccount[FLAT_SESSION_ORDER_KEY]).toEqual(['two', 'one', 'three'])
    expect(rowOrder()).toEqual(['session:two', 'session:one', 'session:three'])
  })

  it('commits nothing on drag end when the pointer never hovered a row', () => {
    const store = renderFolderBrowser('flat')
    const one = placeRow('one', 0)
    placeRow('two', 1)
    fireEvent.dragStart(one, { dataTransfer: dragData() })
    fireEvent.dragEnd(one)
    expect(store.getSnapshot().sessionOrderByAccount[FLAT_SESSION_ORDER_KEY]).toBeUndefined()
    expect(rowOrder()).toEqual(['session:one', 'session:two', 'session:three'])
  })
})
describe('session drag settle semantics', () => {
  it('lets drag end commit after a drop that resolves no order', () => {
    const store = renderFolderBrowser()
    const one = placeRow('one', 0)
    const two = placeRow('two', 1)
    placeRow('three', 2)
    fireEvent.dragStart(one, { dataTransfer: dragData() })
    fireDrag(two, 'dragOver', ROW_TOP + ROW_HEIGHT + 4)
    // Dropping on the source row itself bails, and must NOT settle the drag.
    fireDrag(one, 'drop', ROW_TOP + 4)
    expect(store.getSnapshot().sessionOrderByAccount.alpha).toBeUndefined()
    fireEvent.dragEnd(one)
    expect(store.getSnapshot().sessionOrderByAccount.alpha).toEqual(['two', 'one', 'three'])
    expect(rowOrder()).toEqual(['folder:f1', 'workspace:alpha', 'session:two', 'session:one', 'session:three'])
  })

  it('applies the landing once when drop and drag end both fire', () => {
    const store = renderFolderBrowser()
    const one = placeRow('one', 0)
    const two = placeRow('two', 1)
    placeRow('three', 2)
    fireEvent.dragStart(one, { dataTransfer: dragData() })
    fireDrag(two, 'dragOver', ROW_TOP + ROW_HEIGHT + 4)
    fireDrag(two, 'drop', ROW_TOP + ROW_HEIGHT + 4)
    expect(store.getSnapshot().sessionOrderByAccount.alpha).toEqual(['two', 'one', 'three'])
    // The stale hover would move the row back above the target if drag end re-applied it.
    fireEvent.dragEnd(one)
    expect(store.getSnapshot().sessionOrderByAccount.alpha).toEqual(['two', 'one', 'three'])
    expect(rowOrder()).toEqual(['folder:f1', 'workspace:alpha', 'session:two', 'session:one', 'session:three'])
  })
})
