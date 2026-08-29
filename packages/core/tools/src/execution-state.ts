/**
 * Per-execution registry-owned lifecycle state. One state object replaces the
 * former exec-keyed side tables (deferred contexts, concluding flag, caller
 * cancellation, content finalizer) whose missing entries each needed an
 * invariant defense.
 * @module
 */

import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { ToolDefinition, ToolExecution } from './definition.ts'

/**
 * One execution's complete registry-owned lifecycle state: caller cancellation
 * (kept outside the wrapper-mutable execution object), whether the tool body
 * started, context deferred by the body, the body's turn-concluding marker,
 * and the definition-owned final content transform snapshotted before policy
 * begins. Created once at execution mint time.
 */
export interface ToolExecutionState {
  readonly callerSignal: AbortSignal
  bodyInvoked: boolean
  readonly deferredContexts: UserMessage[]
  concludedTurn: boolean
  readonly contentFinalizer: ToolDefinition['finalizeContent'] | undefined
}

/** Executions minted by this module's registries, each with its lifecycle state. */
const registryExecutionStates = new WeakMap<ToolExecution, ToolExecutionState>()

/**
 * Read one registry-minted execution's lifecycle state. Only executions this
 * registry created carry state, so a miss is a caller bug — the single defense
 * that replaced one throw per former side table.
 */
export function executionStateOf(exec: ToolExecution): ToolExecutionState {
  const state = registryExecutionStates.get(exec)
  /* v8 ignore next -- only registry-minted executions reach the staged scheduler methods */
  if (state === undefined) throw new Error('tool registry scheduler invariant violated: unprepared execution')
  return state
}

/** Record one freshly minted execution's lifecycle state. */
export function registerExecutionState(exec: ToolExecution, state: ToolExecutionState): void {
  registryExecutionStates.set(exec, state)
}
