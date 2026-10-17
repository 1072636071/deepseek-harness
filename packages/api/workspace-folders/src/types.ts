/**
 * Browser-safe request, result, and state vocabulary for the Workspace-folder
 * Remote namespace. Folder grouping is user-authored navigation state that
 * lives beside the Workspace registry rather than inside it: a folder names
 * Workspaces by id and never owns their records.
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

export type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Identifies one user-defined folder. A generated uuid, never the title. */
export type WorkspaceFolderId = Branded<'WorkspaceFolderId'>

/**
 * One folder and the Workspaces it holds, in folder order. A Workspace belongs
 * to at most one folder; membership is never inferred from paths.
 */
export interface WorkspaceFolderView {
  readonly folderId: WorkspaceFolderId
  readonly title: string
  /** Member Workspace ids in display order. */
  readonly workspaceIds: readonly WorkspaceId[]
  /** Whether the folder's group is expanded in the browsing region. */
  readonly expanded: boolean
  /** ISO-8601 creation instant. */
  readonly createdAt: string
}

/**
 * Complete folder projection: every folder, in durable display order. Every
 * mutation answers with this value, so a caller never merges partial state.
 */
export interface WorkspaceFoldersValue {
  readonly folders: readonly WorkspaceFolderView[]
}

/** Folder creation request. */
export interface WorkspaceFolderCreateRequest {
  readonly title: string
}

/** Folder rename request. */
export interface WorkspaceFolderRenameRequest {
  readonly folderId: WorkspaceFolderId
  readonly title: string
}

/** Folder removal request; its membership disappears with the folder. */
export interface WorkspaceFolderDeleteRequest {
  readonly folderId: WorkspaceFolderId
}

/** Folder expansion persistence request. */
export interface WorkspaceFolderExpandedRequest {
  readonly folderId: WorkspaceFolderId
  readonly expanded: boolean
}

/**
 * Membership request. A `folderId` moves the Workspace into that folder;
 * omitting it removes the Workspace from whichever folder holds it.
 */
export interface WorkspaceFolderMembershipRequest {
  readonly workspaceId: WorkspaceId
  readonly folderId?: WorkspaceFolderId
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No folder carries that identity. */
    'workspace-folders/not-found': { readonly folderId: WorkspaceFolderId }
    /** Another folder already uses the requested title. */
    'workspace-folders/name-conflict': { readonly title: string }
    /** The title is empty, whitespace-only, or longer than the accepted bound. */
    'workspace-folders/invalid-title': { readonly title: string }
    /** The membership request named a Workspace the registry does not hold. */
    'workspace-folders/unknown-workspace': { readonly workspaceId: WorkspaceId }
  }
}
