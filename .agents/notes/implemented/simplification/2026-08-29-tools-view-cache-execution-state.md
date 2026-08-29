# Agent Note: Tools view caching, single execution state, and result materialization short-circuit

Status: implemented

English | [中文](2026-08-29-tools-view-cache-execution-state.zh.md)

## Problem

The tool registry sat on the harness's hottest paths, and three costs compounded there. `ToolRuntime.view()` rebuilt the inherited map, the restriction filter, and two name sets on every call, and one tool dispatch invoked it five-plus times (lookup, resolve, mode classification, post-execute, presentation). One successful result was deep-copied three to four times: value/content/meta snapshots, a re-materialization inside `createSuccessResult`, then two more materializations across the finish stages. And one execution's lifecycle facts were scattered across four execution-keyed side tables (`deferredContexts`, `concludingExecutions`, `cancellationStates`, `contentFinalizers`), each missing entry defended by its own invariant throw.

## Decision

Three mechanical-to-structural changes in `@deepseek-ai/dsh-tools`, with no observable behavior change:

- **Per-scope view cache.** `view()` memoizes its derived `ToolView` per scope (WeakMap for scoped keys, one slot for the global view). Every notified `ScopedLayers` mutation clears the cache wholesale before `tools/change` emits; `guard()` registers with `notify: false` and is deliberately excluded because guards are execution-time policy, not view facts.
- **Result materialization short-circuit.** `createSuccessResult` assembles and deep-freezes in place (its fields are already freshly detached snapshots), and materialized results are registered in a `finalizedResults` WeakSet so `finishScheduledExecution` reuses them instead of re-deep-copying. `canonicalResults` (dispatch-token marks) and `finalizedResults` stay result-keyed; the four execution-keyed tables collapsed into one `ToolExecutionState` record with a single `executionStateOf` defense.
- **Module split.** The ~1950-line `index.ts` moved its types, pure helpers, layer, scheduler contract, config, and Cordis event augmentation into `results.ts`, `definition.ts`, `execution-state.ts`, `signals.ts`, `layer.ts`, `scheduler.ts`, `config.ts`, and `events.ts`. The package root keeps the `ToolRuntime` composition root and re-exports every public name unchanged (pinned by `tests/public-surface.spec.ts`).

## Alternatives considered

**Per-scope incremental invalidation** (recompute only views whose chain crosses a changed layer). Rejected for now: wholesale clear is trivially correct and mutations are rare relative to reads; the WeakMap prevents the only real retention risk.

**Merging the result-keyed canonical marks into the execution state.** Rejected: those marks are keyed by result objects to answer "which dispatch produced this result", a different key space than the execution record.

## Consequences

A tool dispatch performs one view derivation per scope between mutations and one materialization per result; large-output tools (read/bash) stop paying two to three redundant deep copies per result. The four invariant-throw defenses collapse into one. The runtime cost consumers could observe is unchanged: result object identity between `tools/result` observers and `execute()` resolution, deep-frozen content, `finalizeContent` invoked exactly once, and `additionalContexts` ferrying are all pinned by `tests/result-materialization.spec.ts` and the existing pipeline suites.
