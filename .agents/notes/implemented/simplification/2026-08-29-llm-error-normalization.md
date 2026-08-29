# Agent Note: Shared LLM HTTP failure classification

Status: implemented

English | [中文](2026-08-29-llm-error-normalization.zh.md)

## Problem

Two adapters classified provider failures with two drifting rulebooks: llm-deepseek decided by HTTP status with detail-driven exceptions, llm-pi-ai pattern-matched flattened message text (pi-ai discards the original Error upstream). The quotas, rate limits, size caps, and context overflows already shared two predicates (`isQuotaExceededError` / `isContextWindowExceededError`) but the surrounding status logic was duplicated with diverging order — the same logical failure could code differently per provider.

## Decision

`normalizeHttpFailureCode({ status?, detail })` in dsh-llm is now the single classifier for the shared classes (AUTH, QUOTA, INVALID_REQUEST, RATE_LIMIT, CONTEXT_WINDOW_EXCEEDED, SERVER). Order is pinned: auth by status, terminal quota by detail (beats a 429 — exhaustion is not throttling), body-size cap (beats context wording — a 413 cap is a request fault), transient rate limiting, context overflow by detail, malformed request, server faults, caller fallback. Status equality decides when the transport preserved the status; the status-as-text patterns apply only in text-only mode, so provider wording quoting unrelated numbers never reclassifies a known status. llm-deepseek's `httpErrorCode` delegates (keeping its `HTTP_<status>` fallback); pi-ai's `classifyPiAiError` (now exported) delegates and keeps only its transport tail — timeouts, mid-stream truncation wording, socket drops, and the `PI_AI_ERROR` catch-all.

## Alternatives considered

**A shared table of provider message regexes.** Rejected: the tables would drift again; the stable contract is the class order, not the wording list — providers change wording constantly.

**Moving pi-ai's transport tail into the shared module.** Rejected: the truncation/timeout wording is pi-ai's flattening artifact, not a provider-neutral concept; keeping it provider-side is exactly the "adapters keep transport differences" split.

**Unifying by always letting detail beat status.** Rejected: provider wording quoting unrelated numbers would reclassify a known status; both suites pin status-decides.

## Consequences

Same-class failures now code identically across providers, pinned by a cross-adapter table test (`http-failure.spec.ts` feeds equivalent status/body and flattened-text inputs to both adapters and asserts equal codes). Two deliberate edge alignments in pi-ai's text mode, documented in the module: the body-size cap now ranks before rate limiting, and detail-driven context overflow is recognized where pi-ai previously fell through to `PI_AI_ERROR`. Retry/backoff behavior is unchanged — every mapped class keeps its previous retryability, and the full llm lane (1089 tests) is green.
