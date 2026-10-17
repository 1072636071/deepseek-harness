/**
 * Client folder definitions and the module augmentations that publish them to
 * programs resolving the client service and the generated Remote namespace.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-workspace-folders/remote'
import { ClientWorkspaceFoldersModel } from './model.ts'
import { WorkspaceFoldersController } from './service.ts'

export { ClientWorkspaceFoldersModel } from './model.ts'
export type { WorkspaceFoldersCommand, WorkspaceFoldersRemote, WorkspaceFoldersSnapshot } from './model.ts'
export { WorkspaceFoldersController } from './service.ts'
export type { IWorkspaceFolders } from './service.ts'
export type {
  WorkspaceFolderId, WorkspaceFolderView, WorkspaceFoldersValue,
} from '../types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** React-free Client folder state and commands. */
    workspaceFolders: import('./service.ts').IWorkspaceFolders
  }
}

/** Required Client Remote services. */
export const inject = ['remote', 'remote.workspaceFolders']

/**
 * Install Client folder state and load the first projection.
 * @param ctx - Client root Context.
 */
export function apply(ctx: Context): void {
  const model = new ClientWorkspaceFoldersModel(ctx.remote.workspaceFolders)
  new WorkspaceFoldersController(ctx, model)
  // A failed first load is not fatal: the browsing region falls back to the
  // plain Workspace list and the next mutation retries against the Host.
  void model.load().catch(() => {})
}
