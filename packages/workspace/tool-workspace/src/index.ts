/**
 * Enumerate the Workspace registry for the model: one read-only tool listing
 * every DSH workspace with its title, canonical path, and session count.
 * @module @deepseek-ai/dsh-tool-workspace
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'

/** Cordis plugin name. */
export const name = 'tool-workspace'
/** Services used by the tool. */
export const inject = ['tools', 'workspaceRegistry']

/** The fields one rendered workspace line needs. */
interface WorkspaceLine {
  readonly title: string
  readonly path: string
  readonly sessionCount: number
  readonly status?: 'ok' | 'missing-dir'
}

/**
 * Render one workspace as a single line: title, path, and session count, with
 * the live directory status appended when it was checked.
 * @param workspace - one entry of the canonical result.
 * @returns the line without a trailing newline.
 */
function workspaceLine(workspace: WorkspaceLine): string {
  const count = workspace.sessionCount
  const line = `${workspace.title}  ${workspace.path}  (${String(count)} session${count === 1 ? '' : 's'})`
  return workspace.status === undefined ? line : `${line} [${workspace.status}]`
}

/**
 * Register the workspace-listing tool for this composition.
 * @param ctx - context providing the tool registry and the Workspace registry.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'workspace_list',
    description: 'List every workspace in the workspace registry, in registry order: its title, canonical path, '
      + 'and session count. A workspace is a registry record over an existing directory with a title and its '
      + 'sessions; it is not a filesystem directory listing. Use it to find the canonical path of another '
      + 'workspace before a cross-workspace task. Read-only: it never creates, deletes, renames, or changes any '
      + 'working directory.',
    parameters: {
      includeSessions: {
        type: 'boolean',
        description: "Include each workspace's session ids. Defaults to false.",
      },
      checkMissing: {
        type: 'boolean',
        description: 'Check every workspace directory on disk and report status ok or missing-dir. Defaults to false.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          workspaces: {
            type: 'array',
            required: true,
            description: 'Every registered workspace, in registry order.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true, description: 'Stable workspace id (generated uuid), never the path.' },
                title: { type: 'string', required: true, description: 'Display title; duplicates across workspaces are allowed.' },
                path: { type: 'string', required: true, description: 'Canonical absolute directory path of the workspace.' },
                sessionCount: { type: 'integer', required: true, description: 'Number of sessions attached to the workspace.' },
                createdAt: { type: 'string', required: true, description: 'ISO-8601 creation instant.' },
                updatedAt: { type: 'string', required: true, description: 'ISO-8601 instant of the last durable mutation.' },
                sessionIds: { type: 'array', items: { type: 'string' }, description: 'Session ids in the workspace account; present only with includeSessions.' },
                status: { type: 'string', enum: ['ok', 'missing-dir'], description: 'Live directory status; present only with checkMissing.' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.workspaces.length === 0
          ? 'no workspaces registered'
          : value.workspaces.map(workspaceLine).join('\n'),
      }],
    },
    async execute(args) {
      const includeSessions = args.includeSessions ?? false
      const checkMissing = args.checkMissing ?? false
      const workspaces = await Promise.all(ctx.workspaceRegistry.list().map(async workspace => ({
        id: workspace.id,
        title: workspace.title,
        path: workspace.path,
        sessionCount: workspace.sessionIds.length,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        ...(includeSessions ? { sessionIds: workspace.sessionIds.map(sessionId => String(sessionId)) } : {}),
        ...(checkMissing ? { status: await workspace.status() } : {}),
      })))
      return { workspaces }
    },
  }))
}
