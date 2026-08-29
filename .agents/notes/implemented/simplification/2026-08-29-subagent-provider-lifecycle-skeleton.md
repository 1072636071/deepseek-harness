# Agent Note: Shared out-of-process subagent provider lifecycle skeleton

Status: implemented

English | [中文](2026-08-29-subagent-provider-lifecycle-skeleton.zh.md)

## Problem

The three out-of-process subagent providers (acp, claude-code, codex) each carried a private copy of the same lifecycle furniture: disposal grace constants, one-shot text-task validation, a fixed-facts failure diagnostic renderer, a provider failure Error class, and (for two of three) the stdin-EOF → terminate → tree-join disposal ladder. The duplication was already acknowledged in-tree by a `jscpd:ignore` in claude-code's run.ts. A semantics fix to any of these — e.g. the disposal ladder — had to be applied three times and re-proven three times.

## Decision

`packages/subagent/subagent/src/provider-lifecycle.ts` (exported through `@deepseek-ai/dsh-subagent`) is now the single source:

- `DEFAULT_DISPOSE_EOF_GRACE_MS` / `DEFAULT_DISPOSE_GRACE_MS` — the three providers re-export them, so config defaults and tests read one definition.
- `providerTextTask(prompt, pkg)` — the identical text-only/non-empty validation with the caller's package prefix; claude-code joins the result, codex keeps the array.
- `providerFailureDiagnostic({label, subject, fields})` — the fixed-facts renderer; each provider's classification table maps its fact shape (ACP's stop reason, Codex's HTTP status) onto ordered fields. A cross-provider string-contract test pins all three historical diagnostic formats verbatim.
- `ProviderRunFailure<Facts>` — the base Error carrying package prefix, diagnostic, structured facts, and optional cause; the three provider classes shrink to constructors that map facts → fields.
- `childExitsWithin` + `disposeProviderChild(child, {endStdin, eofGraceMs})` — the shared disposal ladder. acp uses it fully (stdin EOF grace tier included); codex uses it with `endStdin` and keeps its pre-registered outcome side channel to cite exit facts in its teardown failure; failures propagate raw for the provider to wrap with its own failure type.

claude-code's `disposeClaudeCodeChild` keeps its own shape (declared deviation): it must close the SDK Query first, never ends the child's stdin (the SDK owns it), and aggregates query-close and join failures into one AggregateError-wrapped failure — folding that into the throwing shared ladder would change its cleanup order and failure aggregation.

## Alternatives considered

**A fully unified dispose for all three.** Rejected: claude-code's ladder is structurally different (SDK-owned stdin, failure collection instead of first-failure throw); parameterizing the ladder until it fits would put three conditional modes in one function — more complex than the duplication.

**Moving the module into a new package.** Rejected: dsh-subagent already owns settlement and the run handle; one peer dependency on the subprocess seam is cheaper than a new package.

**Sharing the startup rollback paths.** Rejected for now: each SDK's startup failure surface (ACP race arms, Claude Code's capture callbacks, Codex's wire/process failure promise) is genuinely different; the shared furniture above is the part that was actually identical.

## Consequences

A new out-of-process provider inherits grace constants, task validation, diagnostic rendering, the failure base, and the disposal ladder — its lifecycle code reduces to the protocol driver plus a failure-classification table (the provider run.ts files shrank by ~90 lines net). Two behavior-neutral diffs are declared: acp's `stdin.end()` is now guarded against a concurrently closed stdin (previously an unguarded call that could abort the ladder before termination), and the acp/codex ladders now return the final exit outcome instead of discarding it. All 795 subagent-lane tests are green, including each provider's disposal-ladder integration suites.
