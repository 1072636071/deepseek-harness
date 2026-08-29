/**
 * Shared lifecycle skeleton for the out-of-process subagent providers.
 *
 * Every provider drives the same one-shot child shape — spawn through the
 * subprocess seam, publish only after its protocol startup, settle through
 * {@link settleRunResult}, and dispose to whole-tree quiescence — while the
 * wire protocol and the failure classification stay provider-owned. This
 * module owns the parts all three share: the disposal grace constants, the
 * one-shot text-task validation, the fixed-facts failure diagnostic renderer
 * with its provider failure base class, and the stdin-EOF → terminate →
 * tree-join disposal ladder. A new provider declares its protocol and failure
 * table and inherits the rest.
 *
 * @module @deepseek-ai/dsh-subagent/provider-lifecycle
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SubprocessHandle, SubprocessOutcome } from '@deepseek-ai/dsh-subprocess'

/** EOF grace for child flush and nested-process teardown; wider than the signal grace below. */
export const DEFAULT_DISPOSE_EOF_GRACE_MS = 6_000

/** Default POSIX grace between SIGTERM and SIGKILL on dispose (the `disposeGraceMs` config). */
export const DEFAULT_DISPOSE_GRACE_MS = 3_000

/**
 * Validate and preserve the one-shot task before crossing a provider process
 * boundary: text blocks only, never empty. The per-provider failure text is
 * identical except for the package prefix, so one validation serves every
 * provider's `textTask` facade.
 * @param prompt - task content accepted from the shared subagent service.
 * @param pkg - provider package prefix used in the thrown error messages.
 * @returns the text blocks' content, in order.
 */
export function providerTextTask(prompt: readonly ContentBlock[], pkg: string): string[] {
  if (prompt.length === 0) {
    throw new Error(`${pkg}: the one-shot task must contain only text blocks`)
  }
  const texts: string[] = []
  for (const block of prompt) {
    if (block.type !== 'text') {
      throw new Error(`${pkg}: the one-shot task must contain only text blocks`)
    }
    texts.push(block.text)
  }
  if (texts.every(text => text.trim().length === 0)) {
    throw new Error(`${pkg}: the one-shot task must not be empty`)
  }
  return texts
}

/**
 * Render a provider failure's fixed safe facts — the only provider-derived
 * text allowed to reach model-visible diagnostics. Facts the provider did not
 * observe are omitted rather than guessed.
 * @param parts - the failure headline (`Subagent failure` / `Product subagent
 *   failure`), the provider identity field, and the ordered fact fields.
 * @returns the fixed diagnostic line.
 */
export function providerFailureDiagnostic(parts: {
  label: 'Subagent failure' | 'Product subagent failure'
  subject: string
  fields: readonly (readonly [string, string | number | null | undefined])[]
}): string {
  const present = parts.fields
    .filter((field): field is readonly [string, string | number] => field[1] !== null && field[1] !== undefined)
    .map(([name, value]) => `${name}: ${String(value)}`)
  return `${parts.label} (${[parts.subject, ...present].join('; ')})`
}

/**
 * Base class for a provider's fixed-facts failure: the provider package
 * prefix, the rendered diagnostic, and the structured facts retained beside
 * the chained cause. Subclasses supply only their classification table.
 */
export class ProviderRunFailure<Facts> extends Error {
  /** The provider's structured failure facts (also read by run settlement). */
  readonly facts: Facts

  constructor(
    pkg: string,
    facts: Facts,
    diagnostic: string,
    cause?: unknown,
  ) {
    super(`${pkg}: ${diagnostic}`, cause === undefined ? undefined : { cause })
    this.facts = facts
    this.name = new.target.name
  }
}

/** Bounded whole-tree exit wait: polls the handle's tree liveness until it exits or `ms` elapses. */
export async function childExitsWithin(child: SubprocessHandle, ms: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, ms)
  try {
    return await child.waitForExit(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Cooperative teardown ladder shared by the providers that own the child's
 * stdin: stdin EOF (an optional tier-1 window for the child to flush
 * persistence and reap its own descendants), then the terminate() escalation
 * (SIGTERM → configured grace → SIGKILL) and its whole-tree exit proof.
 * Failures propagate raw — the provider wraps them with its own failure type
 * and observed facts.
 * @param child - the spawned child's handle.
 * @param options - `endStdin` ends the piped stdin before waiting; a positive
 *   `eofGraceMs` grants the tier-1 EOF window before terminating.
 * @returns the exit outcome, or `undefined` for a spawn-failed handle.
 */
export async function disposeProviderChild(
  child: SubprocessHandle,
  options: { endStdin?: boolean; eofGraceMs?: number } = {},
): Promise<SubprocessOutcome | undefined> {
  // A spawn failure has no process to tear down; observe the rejection so
  // disposal in a finally block cannot surface it as unhandled.
  if (child.pid <= 0) {
    await child.done.catch(() => {})
    return undefined
  }
  if (options.endStdin === true) {
    try {
      child.stdin?.end()
    } catch {
      // A concurrently closed stdin does not change tree ownership below.
    }
  }
  if (options.eofGraceMs !== undefined && await childExitsWithin(child, options.eofGraceMs)) {
    return await child.done
  }
  // terminate() owns the bounded SIGTERM→SIGKILL timer. Its unbounded wait is
  // the process owner's exit proof, not a second derived grace that can overflow.
  child.terminate()
  await child.waitForExit()
  return await child.done
}
