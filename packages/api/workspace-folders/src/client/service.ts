/** React-free Client Workspace-folder service. */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { WorkspaceFolderId } from '../types.ts'
import type { ClientWorkspaceFoldersModel, WorkspaceFoldersSnapshot } from './model.ts'

/** Workspace-folder Client service face. */
export interface IWorkspaceFolders {
  /** Host-authoritative folder projection, newest Host answer wins. */
  readonly list: ObservableSnapshot<WorkspaceFoldersSnapshot>
  /**
   * Create a folder.
   * @param title - proposed folder title.
   * @returns the Host failure, or undefined on success.
   */
  create(title: string): Promise<RemoteFailure | undefined>
  /**
   * Rename a folder.
   * @param folderId - target folder.
   * @param title - proposed folder title.
   * @returns the Host failure, or undefined on success.
   */
  rename(folderId: WorkspaceFolderId, title: string): Promise<RemoteFailure | undefined>
  /**
   * Remove a folder; its Workspaces return to the ungrouped list.
   * @param folderId - target folder.
   * @returns the Host failure, or undefined on success.
   */
  delete(folderId: WorkspaceFolderId): Promise<RemoteFailure | undefined>
  /**
   * Persist one folder's expansion state.
   * @param folderId - target folder.
   * @param expanded - desired expansion.
   * @returns the Host failure, or undefined on success.
   */
  setExpanded(folderId: WorkspaceFolderId, expanded: boolean): Promise<RemoteFailure | undefined>
  /**
   * Move a Workspace into a folder, or out of every folder when `folderId` is omitted.
   * @param workspaceId - Workspace to move.
   * @param folderId - destination folder.
   * @returns the Host failure, or undefined on success.
   */
  setMembership(workspaceId: WorkspaceId, folderId?: WorkspaceFolderId): Promise<RemoteFailure | undefined>
}

/** Owns the Client folder projection and its commands. */
export class WorkspaceFoldersController extends Service implements IWorkspaceFolders {
  readonly list: ObservableSnapshot<WorkspaceFoldersSnapshot>

  /**
   * @param ctx - Client root Context.
   * @param model - Remote-backed folder projection.
   */
  constructor(ctx: Context, private readonly model: ClientWorkspaceFoldersModel) {
    super(ctx, 'workspaceFolders')
    this.list = model.list
  }

  create(title: string): Promise<RemoteFailure | undefined> {
    return this.model.run({ kind: 'create', title })
  }

  rename(folderId: WorkspaceFolderId, title: string): Promise<RemoteFailure | undefined> {
    return this.model.run({ kind: 'rename', folderId, title })
  }

  delete(folderId: WorkspaceFolderId): Promise<RemoteFailure | undefined> {
    return this.model.run({ kind: 'delete', folderId })
  }

  setExpanded(folderId: WorkspaceFolderId, expanded: boolean): Promise<RemoteFailure | undefined> {
    return this.model.run({ kind: 'setExpanded', folderId, expanded })
  }

  setMembership(workspaceId: WorkspaceId, folderId?: WorkspaceFolderId): Promise<RemoteFailure | undefined> {
    return this.model.run({ kind: 'setMembership', workspaceId, ...(folderId === undefined ? {} : { folderId }) })
  }
}
