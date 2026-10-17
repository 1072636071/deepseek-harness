/**
 * The Workspace-folder domain declaration: one `folders` table plus the
 * ordered-folder singleton. This domain is deliberately separate from the
 * `workspace` domain: folder grouping is user navigation state whose format
 * can change without touching the authoritative Workspace records, and an
 * upgrade of either side leaves the other's stored documents untouched.
 * @module @deepseek-ai/dsh-api-workspace-folders/src/spec
 */

import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceFolderId } from './types.ts'

const folderId = z.string().transform(value => brandString<WorkspaceFolderId>(value))

const workspaceId = z.string().transform(value => brandString<WorkspaceId>(value))

/** Longest accepted folder title; the browser trims before sending. */
export const MAX_FOLDER_TITLE_LENGTH = 120

/**
 * Durable shape of one folder. `workspaceIds` is the ordered member account;
 * a Workspace listed here is expected to exist in the Workspace registry, and
 * a member the registry no longer holds is dropped on the next open.
 */
export const workspaceFolderRecord = z.object({
  title: z.string(),
  workspaceIds: z.array(workspaceId),
  expanded: z.boolean().default(true),
  createdAt: z.string(),
})

/** One stored folder record, inferred from {@link workspaceFolderRecord}. */
export type WorkspaceFolderRecord = z.infer<typeof workspaceFolderRecord>

/**
 * Durable folder-registry state: the authoritative display order of folders.
 * Members are pruned against the Workspace registry at open; a folder left
 * with no members is retained, because an empty folder is a valid grouping
 * the user is still filling.
 */
export const workspaceFoldersDomainState = z.object({
  folderIds: z.array(folderId),
})

/** Durable folder-registry state inferred from {@link workspaceFoldersDomainState}. */
export type WorkspaceFoldersDomainState = z.infer<typeof workspaceFoldersDomainState>

/**
 * The Workspace-folder domain spec: one `folders` table keyed by
 * {@link WorkspaceFolderId} plus the order singleton.
 */
export const workspaceFoldersDomainSpec = defineDomain({
  name: 'workspace_folders',
  version: 1,
  global: {
    schema: workspaceFoldersDomainState,
    initial: { folderIds: [] },
  },
  tables: { folders: domainTable<WorkspaceFolderId, WorkspaceFolderRecord>(workspaceFolderRecord) },
})
