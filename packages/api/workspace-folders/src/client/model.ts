/**
 * Client-side Workspace-folder state: the Remote-backed projection plus the
 * commands that mutate it. Every mutation answers with the complete folder
 * list, so this model replaces its projection instead of merging increments and
 * needs no reconnect stream.
 */

import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {
  WorkspaceFolderCreateRequest,
  WorkspaceFolderDeleteRequest,
  WorkspaceFolderExpandedRequest,
  WorkspaceFolderId,
  WorkspaceFolderMembershipRequest,
  WorkspaceFolderRenameRequest,
  WorkspaceFolderView,
  WorkspaceFoldersValue,
} from '../types.ts'

/**
 * Complete generated `ctx.remote.workspaceFolders` namespace.
 *
 * Declared structurally rather than as `TypertClientRemote['workspaceFolders']`
 * so this module compiles before the generated Remote contribution exists; the
 * generated surface is structurally assignable to it.
 */
export interface WorkspaceFoldersRemote {
  list(): Promise<RemoteResult<WorkspaceFoldersValue>>
  create(request: WorkspaceFolderCreateRequest): Promise<RemoteResult<WorkspaceFoldersValue>>
  rename(request: WorkspaceFolderRenameRequest): Promise<RemoteResult<WorkspaceFoldersValue>>
  delete(request: WorkspaceFolderDeleteRequest): Promise<RemoteResult<WorkspaceFoldersValue>>
  setExpanded(request: WorkspaceFolderExpandedRequest): Promise<RemoteResult<WorkspaceFoldersValue>>
  setMembership(request: WorkspaceFolderMembershipRequest): Promise<RemoteResult<WorkspaceFoldersValue>>
}

/** Immutable Client folder projection. */
export interface WorkspaceFoldersSnapshot {
  /** Folders in durable display order. */
  readonly folders: readonly WorkspaceFolderView[]
  readonly state: 'idle' | 'loading' | 'error'
  readonly error: RemoteFailure | null
}

/** One folder mutation, applied as a complete-projection replacement. */
export type WorkspaceFoldersCommand =
  | { readonly kind: 'create'; readonly title: string }
  | { readonly kind: 'rename'; readonly folderId: WorkspaceFolderId; readonly title: string }
  | { readonly kind: 'delete'; readonly folderId: WorkspaceFolderId }
  | { readonly kind: 'setExpanded'; readonly folderId: WorkspaceFolderId; readonly expanded: boolean }
  | { readonly kind: 'setMembership'; readonly workspaceId: WorkspaceId; readonly folderId?: WorkspaceFolderId }

/**
 * Owns the Client folder projection. Each accepted response replaces the whole
 * list, in arrival order: the Host answers with the state current at its own
 * write, so the last answer to arrive is also the newest one.
 */
export class ClientWorkspaceFoldersModel {
  private readonly store = createSnapshotStore<WorkspaceFoldersSnapshot>({
    folders: [],
    state: 'loading',
    error: null,
  })

  /** @param remote - generated Workspace-folder Remote namespace. */
  constructor(private readonly remote: WorkspaceFoldersRemote) {}

  /** The folder projection as a bare observable source. */
  get list(): ObservableSnapshot<WorkspaceFoldersSnapshot> {
    return this.store
  }

  /**
   * Load the complete projection once at startup.
   * @returns resolution after the first Host answer settles.
   */
  async load(): Promise<void> {
    this.install(await this.remote.list())
  }

  /**
   * Apply one folder mutation and install the Host's complete answer.
   * @param command - the mutation to perform.
   * @returns the Host failure when the mutation was rejected.
   */
  async run(command: WorkspaceFoldersCommand): Promise<RemoteFailure | undefined> {
    const result = await this.dispatch(command)
    this.install(result)
    return result.ok ? undefined : result.error
  }

  private dispatch(command: WorkspaceFoldersCommand): Promise<RemoteResult<WorkspaceFoldersValue>> {
    switch (command.kind) {
      case 'create':
        return this.remote.create({ title: command.title })
      case 'rename':
        return this.remote.rename({ folderId: command.folderId, title: command.title })
      case 'delete':
        return this.remote.delete({ folderId: command.folderId })
      case 'setExpanded':
        return this.remote.setExpanded({ folderId: command.folderId, expanded: command.expanded })
      case 'setMembership':
        return this.remote.setMembership({
          workspaceId: command.workspaceId,
          ...(command.folderId === undefined ? {} : { folderId: command.folderId }),
        })
    }
  }

  private install(result: RemoteResult<WorkspaceFoldersValue>): void {
    this.store.set(result.ok
      ? { folders: result.value.folders, state: 'idle', error: null }
      : { folders: this.store.getSnapshot().folders, state: 'error', error: result.error })
  }
}
