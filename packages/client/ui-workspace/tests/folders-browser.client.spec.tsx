// @vitest-environment jsdom
/**
 * User-defined folder grouping in the browsing region: folder sections render
 * their member Workspaces, expansion is Host-persisted, and a Workspace's menu
 * moves it between folders. The suite mounts the real WorkspaceBrowser with a
 * driven folder projection, so these are the shipped render and dispatch paths.
 */
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot, WorkspaceView, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceFoldersSnapshot } from '@deepseek-ai/dsh-api-workspace-folders/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type { DirectoryFlowOwnerProps, WorkspaceBrowserProps } from '../src/client/contract/slots.ts'
import { createWorkspaceShortcutControls } from '../src/client/shortcuts.ts'
import { createWorkspaceViewStore } from '../src/client/stores.ts'
import { WorkspaceBrowser } from '../src/client/rows/WorkspaceBrowser.tsx'
import { en } from '../src/client/locales.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const t = makeTranslate(en, commonEn)
const wid = (id: string): WorkspaceId => id as WorkspaceId
const sid = (id: string): SessionId => id as SessionId

const workspace = (id: string, sessionIds: string[], title = id): WorkspaceView => ({
  workspaceId: wid(id), path: `/projects/${id}`, title,
  sessionIds: sessionIds.map(sid), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const workspaceState = (items: readonly WorkspaceView[]): WorkspaceSnapshot => ({
  items, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})
const folderState = (
  folders: WorkspaceFoldersSnapshot['folders'],
): WorkspaceFoldersSnapshot => ({ folders, state: 'idle', error: null })
const noPendingInteraction: SessionStatusSnapshot = new Map()
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

const renderDirectoryFlowOnly: WorkspaceBrowserProps['renderSlot'] = (name: string, owner: object) =>
  name === 'sidebar.workspaces.directoryFlow' && (owner as DirectoryFlowOwnerProps).open
    ? <div data-testid="directory-flow" />
    : null

function mount(overrides: Partial<WorkspaceBrowserProps> = {}) {
  const controls = createWorkspaceShortcutControls()
  const store = createWorkspaceViewStore().create()
  store.actions.setGroupBy('folder')
  const props: WorkspaceBrowserProps = {
    useShortcuts: select => select([]),
    useWorkspaceShortcuts: bindSnapshotSelector(controls.state),
    requestSearch: controls.search,
    requestAddWorkspace: controls.add,
    closeAddWorkspace: controls.closeAdd,
    setDirectoryBusy: controls.directoryBusy,
    requestSessionRename: controls.rename,
    dismissForkError: controls.dismissForkError,
    wide: true,
    expandSidebar: vi.fn(),
    useSessions: hook({ ids: [], byId: {}, projectionsBySession: {}, phase: 'ready' } as unknown as SessionListState),
    useSessionStatus: hook(noPendingInteraction),
    useSessionRetainInfo: () => undefined,
    usePanelInfo, useResource,
    useWorkspaces: hook(workspaceState([])),
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
    useDirectoryFlow: bindSnapshotSelector({ getSnapshot: () => true, subscribe: () => () => {} }),
    useHostInfo: selector => selector({ home: undefined, isLoopback: true }),
    useFolders: hook(folderState([])),
    folderSupport: true,
    createFolder: vi.fn(async () => undefined),
    renameFolder: vi.fn(async () => undefined),
    deleteFolder: vi.fn(async () => undefined),
    setFolderExpanded: vi.fn(async () => undefined),
    setFolderMembership: vi.fn(async () => undefined),
    renderSlot: renderDirectoryFlowOnly,
    t,
    ...overrides,
  }
  const view = render(<WorkspaceBrowser {...props} />)
  return { view, props, store, controls }
}

beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

describe('WorkspaceBrowser folders', () => {
  it('renders each folder with its member Workspaces nested under it', () => {
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha', [], 'Alpha'), workspace('beta', [], 'Beta')])),
      useFolders: hook(folderState([
        { folderId: 'f1' as never, title: 'Work', workspaceIds: [wid('alpha')], expanded: true, createdAt: '2026-01-01T00:00:00.000Z' },
      ])),
    })
    // Folder header, then its member Workspace, then the unclaimed one.
    const rows = [...document.querySelectorAll('[data-row-key]')].map(row => row.getAttribute('data-row-key'))
    expect(rows).toContain('folder:f1')
    expect(rows).toContain('workspace:alpha')
    expect(rows).toContain('workspace:beta')
    expect(screen.getByText('Work')).toBeTruthy()
  })

  it('hides a collapsed folder\'s members and persists the toggle', () => {
    const setFolderExpanded = vi.fn(async () => undefined)
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha', [], 'Alpha')])),
      useFolders: hook(folderState([
        { folderId: 'f1' as never, title: 'Work', workspaceIds: [wid('alpha')], expanded: false, createdAt: '2026-01-01T00:00:00.000Z' },
      ])),
      setFolderExpanded,
    })
    // The folder row is present but its member Workspace is not rendered.
    expect(document.querySelector('[data-row-key="folder:f1"]')).toBeTruthy()
    expect(document.querySelector('[data-row-key="workspace:alpha"]')).toBeNull()
    fireEvent.click(screen.getByText('Work'))
    expect(setFolderExpanded).toHaveBeenCalledWith('f1', true)
  })

  it('offer create-folder only in folder mode and opens its dialog', async () => {
    const createFolder = vi.fn(async () => undefined)
    mount({ createFolder })
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    const input = screen.getByLabelText('Folder name')
    fireEvent.change(input, { target: { value: 'Research' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'New folder' })[1] as HTMLElement)
    await act(async () => { await Promise.resolve() })
    expect(createFolder).toHaveBeenCalledWith('Research')
  })

  it('moves a Workspace into a folder through its row menu', async () => {
    const setFolderMembership = vi.fn(async () => undefined)
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha', [], 'Alpha')])),
      useFolders: hook(folderState([
        { folderId: 'f1' as never, title: 'Work', workspaceIds: [], expanded: true, createdAt: '2026-01-01T00:00:00.000Z' },
      ])),
      setFolderMembership,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Workspace actions for Alpha' }))
    // Hover the move row to reveal its submenu, then pick the folder.
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to folder/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Work' }))
    await act(async () => { await Promise.resolve() })
    expect(setFolderMembership).toHaveBeenCalledWith(wid('alpha'), 'f1')
  })

  it('offers the detach row and reports a Workspace leaving every folder', async () => {
    const setFolderMembership = vi.fn(async () => undefined)
    mount({
      useWorkspaces: hook(workspaceState([workspace('alpha', [], 'Alpha')])),
      useFolders: hook(folderState([
        { folderId: 'f1' as never, title: 'Work', workspaceIds: [wid('alpha')], expanded: true, createdAt: '2026-01-01T00:00:00.000Z' },
      ])),
      setFolderMembership,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Workspace actions for Alpha' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to folder/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from folder' }))
    await act(async () => { await Promise.resolve() })
    expect(setFolderMembership).toHaveBeenCalledWith(wid('alpha'), undefined)
  })

  it('hides the folder group-by row when no folder capability is composed', () => {
    const { store } = mount({ folderSupport: false })
    store.actions.setGroupBy('workspace')
    fireEvent.click(screen.getByRole('button', { name: 'View options' }))
    expect(screen.queryByRole('menuitem', { name: 'By folder' })).toBeNull()
  })
})
