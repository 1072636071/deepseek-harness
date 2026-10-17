/**
 * Host folder registry (`ctx.workspaceFolders`): durable user-defined folder
 * grouping over the Workspace registry, posed as a Typert Remote service.
 *
 * The registry owns the `workspace_folders` storage domain, which is separate
 * from the `workspace` domain by design: folder grouping is navigation state,
 * so its format can change, or be dropped entirely, without rewriting the
 * authoritative Workspace records or blocking an upgrade of either side.
 *
 * Every mutation answers with the complete folder projection. The projection is
 * small (one entry per user-created folder), so a caller layers no merge logic
 * over partial responses and a reconnect needs no change stream.
 * @module @deepseek-ai/dsh-api-workspace-folders
 */

import { randomUUID } from 'node:crypto'
import z from '@deepseek-ai/schemastery'
import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Domain, DomainGlobal, KvTable } from '@deepseek-ai/dsh-storage-domain'
// Type-only: pulls the `ctx.workspaceRegistry` declaration the registry reads.
import type {} from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { MAX_FOLDER_TITLE_LENGTH, workspaceFoldersDomainSpec } from './spec.ts'
import type { WorkspaceFolderRecord, WorkspaceFoldersDomainState } from './spec.ts'
import type {
  WorkspaceFolderCreateRequest,
  WorkspaceFolderDeleteRequest,
  WorkspaceFolderExpandedRequest,
  WorkspaceFolderId,
  WorkspaceFolderMembershipRequest,
  WorkspaceFolderRenameRequest,
  WorkspaceFolderView,
  WorkspaceFoldersValue,
} from './types.ts'

export type * from './types.ts'
export { MAX_FOLDER_TITLE_LENGTH, workspaceFoldersDomainSpec } from './spec.ts'
export type { WorkspaceFolderRecord, WorkspaceFoldersDomainState } from './spec.ts'

/** Plugin config. */
export interface Config {
  /** Longest accepted folder title; defaults to {@link MAX_FOLDER_TITLE_LENGTH}. */
  maxTitleLength?: number
}

/** Config after schema defaults have been applied. */
type ResolvedConfig = Required<Config>

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable user-defined Workspace folder grouping. */
    workspaceFolders: WorkspaceFolders
  }
}

/**
 * Brand a string as a {@link WorkspaceFolderId}.
 * @param id - Raw folder id string.
 * @returns the same string, branded at compile time.
 */
export function WorkspaceFolderId(id: string): WorkspaceFolderId {
  return brandString<WorkspaceFolderId>(id)
}

/**
 * Durable folder registry over the Workspace registry. Startup waits for
 * `storageDomain` and `workspaceRegistry`; folding is independent of the
 * registry's own bootstrap, so folders whose members are all gone still open.
 */
export class WorkspaceFolders extends TypertRemoteService {
  static inject = ['storageDomain', 'workspaceRegistry']

  static Config: z<Config, ResolvedConfig> = z.object({
    maxTitleLength: z.natural().min(1).default(MAX_FOLDER_TITLE_LENGTH),
  })

  private readonly config: ResolvedConfig
  private table?: KvTable<WorkspaceFolderId, WorkspaceFolderRecord>
  private global?: DomainGlobal<WorkspaceFoldersDomainState>
  private state?: WorkspaceFoldersDomainState
  private operationTail: Promise<void> = Promise.resolve()

  /**
   * @param ctx - Host context carrying the storage domain facility and the Workspace registry.
   * @param config - folder title policy.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'workspaceFolders')
    this.config = WorkspaceFolders.Config(config)
  }

  /** Open the folder domain and drop members the Workspace registry no longer holds. */
  protected async [Service.init](): Promise<void> {
    const domain: Domain<typeof workspaceFoldersDomainSpec> =
      await this.ctx.storageDomain.open(workspaceFoldersDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'workspace-folders.domainClose')
    this.table = domain.table('folders')
    this.global = domain.global
    this.state = domain.global.get()
    await this.pruneDanglingMembers()
  }

  /**
   * Read the complete folder projection in durable folder order.
   * @returns every folder with its current member Workspaces.
   */
  @Remote('list')
  list(): WorkspaceFoldersValue {
    return this.baseline()
  }

  /**
   * Create one folder with a unique title.
   * @param request - new folder title.
   * @returns the complete folder projection.
   */
  @Remote('create')
  create(request: WorkspaceFolderCreateRequest): Promise<WorkspaceFoldersValue> {
    return this.enqueue(async () => {
      const title = this.validateTitle(request.title)
      if (this.titleTaken(title, undefined)) throw nameConflict(title)
      const id = WorkspaceFolderId(randomUUID())
      const record: WorkspaceFolderRecord = {
        title,
        workspaceIds: [],
        expanded: true,
        createdAt: new Date().toISOString(),
      }
      await this.requireTable().put(id, record)
      await this.setState({ folderIds: [...this.requireState().folderIds, id] })
      return this.baseline()
    })
  }

  /**
   * Rename one folder to a unique title.
   * @param request - folder identity and proposed title.
   * @returns the complete folder projection.
   */
  @Remote('rename')
  rename(request: WorkspaceFolderRenameRequest): Promise<WorkspaceFoldersValue> {
    return this.enqueue(async () => {
      const record = this.requireFolder(request.folderId)
      const title = this.validateTitle(request.title)
      if (this.titleTaken(title, request.folderId)) throw nameConflict(title)
      if (record.title !== title) {
        await this.requireTable().put(request.folderId, { ...record, title })
      }
      return this.baseline()
    })
  }

  /**
   * Delete one folder. Its Workspaces return to the ungrouped list; no
   * Workspace registration, directory, or Session log is touched. An unknown
   * folder resolves without writing.
   * @param request - folder identity to remove.
   * @returns the complete folder projection.
   */
  @Remote('delete')
  delete(request: WorkspaceFolderDeleteRequest): Promise<WorkspaceFoldersValue> {
    return this.enqueue(async () => {
      const state = this.requireState()
      if (state.folderIds.includes(request.folderId)) {
        await this.requireTable().delete(request.folderId)
        await this.setState({ folderIds: state.folderIds.filter(id => id !== request.folderId) })
      }
      return this.baseline()
    })
  }

  /**
   * Persist one folder's expansion state.
   * @param request - folder identity and the desired expansion.
   * @returns the complete folder projection.
   */
  @Remote('setExpanded')
  setExpanded(request: WorkspaceFolderExpandedRequest): Promise<WorkspaceFoldersValue> {
    return this.enqueue(async () => {
      const record = this.requireFolder(request.folderId)
      if (record.expanded !== request.expanded) {
        await this.requireTable().put(request.folderId, { ...record, expanded: request.expanded })
      }
      return this.baseline()
    })
  }

  /**
   * Move one Workspace into a folder, or out of every folder when the request
   * omits `folderId`. A Workspace belongs to at most one folder, so a move
   * removes it from its previous folder in the same operation. The moved
   * Workspace lands last in its destination folder's member order.
   * @param request - Workspace identity and the destination folder.
   * @returns the complete folder projection.
   */
  @Remote('setMembership')
  setMembership(request: WorkspaceFolderMembershipRequest): Promise<WorkspaceFoldersValue> {
    return this.enqueue(async () => {
      if (!this.ctx.workspaceRegistry.list().some(workspace => workspace.id === request.workspaceId)) {
        throw new WorkspaceFolderUnknownWorkspaceError(request.workspaceId)
      }
      if (request.folderId !== undefined) this.requireFolder(request.folderId)
      for (const folder of this.baseline().folders) {
        const holds = folder.workspaceIds.includes(request.workspaceId)
        const gains = folder.folderId === request.folderId
        if (!holds && !gains) continue
        const members = folder.workspaceIds.filter(id => id !== request.workspaceId)
        await this.requireTable().put(folder.folderId, {
          ...this.requireFolder(folder.folderId),
          workspaceIds: gains ? [...members, request.workspaceId] : members,
        })
      }
      return this.baseline()
    })
  }

  /** Current projection in durable folder order. */
  private baseline(): WorkspaceFoldersValue {
    const table = this.requireTable()
    return {
      folders: this.requireState().folderIds.flatMap((id) => {
        const record = table.get(id)
        return record === undefined ? [] : [folderView(id, record)]
      }),
    }
  }

  /** Drop members the Workspace registry no longer holds, rewriting only changed folders. */
  private async pruneDanglingMembers(): Promise<void> {
    const known = new Set(this.ctx.workspaceRegistry.list().map(workspace => workspace.id))
    for (const folder of this.baseline().folders) {
      const workspaceIds = folder.workspaceIds.filter(id => known.has(id))
      if (workspaceIds.length === folder.workspaceIds.length) continue
      await this.requireTable().put(folder.folderId, {
        ...(this.requireTable().get(folder.folderId) as WorkspaceFolderRecord),
        workspaceIds,
      })
    }
  }

  private validateTitle(title: string): string {
    const trimmed = title.trim()
    if (trimmed === '' || trimmed.length > this.config.maxTitleLength) {
      throw new RemoteError(
        'workspace-folders/invalid-title',
        `folder title must be 1 through ${this.config.maxTitleLength} characters`,
        { title },
      )
    }
    return trimmed
  }

  private titleTaken(title: string, except: WorkspaceFolderId | undefined): boolean {
    return this.baseline().folders.some(folder => folder.folderId !== except && folder.title === title)
  }

  private requireFolder(id: WorkspaceFolderId): WorkspaceFolderRecord {
    const record = this.requireTable().get(id)
    if (record === undefined || !this.requireState().folderIds.includes(id)) {
      throw new WorkspaceFolderNotFoundError(id)
    }
    return record
  }

  private requireTable(): KvTable<WorkspaceFolderId, WorkspaceFolderRecord> {
    if (this.table === undefined) throw new Error('workspace folder registry is not started yet')
    return this.table
  }

  private requireState(): WorkspaceFoldersDomainState {
    if (this.state === undefined) throw new Error('workspace folder registry is not started yet')
    return this.state
  }

  private async setState(state: WorkspaceFoldersDomainState): Promise<void> {
    await (this.global as DomainGlobal<WorkspaceFoldersDomainState>).set(state)
    this.state = state
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => {}, () => {})
    return result
  }
}

/** No folder carries the requested identity. */
export class WorkspaceFolderNotFoundError extends RemoteError {
  /**
   * @param folderId - the missing folder identity.
   */
  constructor(folderId: WorkspaceFolderId) {
    super('workspace-folders/not-found', `unknown workspace folder '${folderId}'`, { folderId })
  }
}

/** The membership request named a Workspace the registry does not hold. */
export class WorkspaceFolderUnknownWorkspaceError extends RemoteError {
  /**
   * @param workspaceId - the unknown Workspace identity.
   */
  constructor(workspaceId: WorkspaceId) {
    super(
      'workspace-folders/unknown-workspace',
      `the Workspace registry holds no workspace '${workspaceId}'`,
      { workspaceId },
    )
  }
}

function nameConflict(title: string): RemoteError<'workspace-folders/name-conflict'> {
  return new RemoteError(
    'workspace-folders/name-conflict',
    `another folder already uses the title "${title}"`,
    { title },
  )
}

/** Project one stored folder into its Remote value. */
function folderView(folderId: WorkspaceFolderId, record: WorkspaceFolderRecord): WorkspaceFolderView {
  return {
    folderId,
    title: record.title,
    workspaceIds: [...record.workspaceIds],
    expanded: record.expanded,
    createdAt: record.createdAt,
  }
}

export default WorkspaceFolders
