/**
 * Deliverables plugin, node half. Registers Web file-reference guidance and
 * serves authenticated native opens of declared files. The browser
 * half ships via exports["./client"], discovered through the package.json
 * dsh.client declaration.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-workspace-changes/types'
import { registerPresentOpen } from './present-open.ts'

/** Services required for file-reference guidance, change summaries, and authenticated native opens. */
export const inject = ['systemPrompt', 'connection', 'sessionQuery', 'sessionController', 'workspaceFiles', 'fs', 'sandboxPolicy', 'workspaceChanges']

/** Static Web guidance for primary outputs and existing-file references. */
const FILE_REFERENCE_PROMPT = 'Prefer primary results in the final response with a brief explanation. '
  + 'Use ![Description](<path/to/image.png>) for images that support an explanation or comparison; use [Description](<path/to/image.png>) when referring to an image or listing files. Enclose Markdown file destinations in angle brackets, especially paths with spaces. '
  + 'Do not call present only to list edited source files or to check whether a diff view will appear. '
  + 'Use present when a separate file card helps the user open the deliverable: images, Office documents, spreadsheets, slide decks. '
  + 'Do not repeat results already shown inline unless the card adds useful access. '
  + 'Outside commands, configuration expressions, and code blocks, link every mention of an existing file to its full path relative to the working directory or absolute, repeats and tables included; append #L24 or #L24-L30 for known lines. '
  + 'Label with the filename or a clear alias, adding only enough parent directories to distinguish files; keep full paths out of labels. Default to the name alone; when precise locations matter, append :24 or :24–30, with no # or L in the line suffix.'

/**
 * Register Web file-reference guidance and native opens for declared files.
 * @param ctx - host context carrying the system-prompt registry.
 */
export function apply(ctx: Context): void {
  registerPresentOpen(ctx)
  ctx.systemPrompt.section({
    name: 'ui:deliverable-file-references',
    order: ctx.systemPrompt.getSectionOrder('DELIVERABLE_FILE_REFERENCES'),
    text: FILE_REFERENCE_PROMPT,
  })
}
