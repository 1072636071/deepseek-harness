# Agent Note: Tool-description length gate

Status: implemented

English | [中文](2026-08-27-tool-description-length-gate.zh.md)

## Problem

The two description-trim batches shrank every model-visible tool description (63 tools, total rendered descriptions 21,627 -> 17,489 characters, -19.1%), but nothing enforced that budget: any future edit could silently regrow a description back toward essay length, and the trim incentives existed only in review discipline. The minimal-native plugin work (win-shell-mcp batch 19) additionally assumes a bounded full-catalog prompt; unbounded regrowth defeats that assumption, and ADR-0016 makes token cost the first priority of interaction design.

## Decision

`verify-tool-catalog` now also gates per-description length. The generator asserts, right after harvesting each package's schemas, that every model-visible description fits its character budget: the default bound is 200 characters, and a package-keyed registry (`DESCRIPTION_LENGTH_LIMITS` in `scripts/gen-tool-catalog.ts`) holds explicit per-tool ceilings whose comments justify each relaxation from observed irreducible behavior facts (one-shot `bash` 850, `pwsh` 1100, `workflow` 2000, `todo_write` 750, the `cordis_*` approval/version-pointer guarantees, cap/sampling disclosures such as `glob` 400, etc.). The assertion runs inside `collectToolCatalog()`, so both generation and `--check` fail closed; harvest entries propagate their manifest `dir` so same-named tools across packages keep exactly one limit-key namespace. Negative tests cover the exact-at-bound pass, the offender message (`tool len>limit`), the ceiling lookup, and a full-tree sweep proving every shipped description is within budget.

Re-measurement after both trims: 17,489 description characters across 63 tools (average ~278). A full read-through of all 63 descriptions — not only the 29 above the default budget — found dense behavior facts throughout (hook signatures, denial markers, delivery semantics) and no filler sentences or example padding left to cut; the registry therefore records today's honest shape instead of pretending a lower bound. The minimal-preset anchor surface was re-verified around the trim: replay still pins the fixed single-line persona, exactly two shell+editor tools, persistent-state semantics, and line-numbered editor output; the apps/web lane is deterministically red on win32 hosts because the preset platform-gates bash/pwsh stacks (identical failure before and after these changes, stash-checked; Linux CI replays it green).

## Alternatives considered

**Rely on review only.** Rejected: freshness already fails closed for stale catalogs; leaving the newest regression axis open made the trim effort one refactor away from evaporating.

**Enforce 200 everywhere immediately.** Rejected: it would force cutting irreducible facts this batch — sandbox denial markers, approval flows, hook failure semantics — trading model correctness for a rounder number, against the ticket's own acceptance wording ("行为事实可放宽").

## Consequences

A description edit that outgrows its budget fails `pnpm run gen-tool-catalog` / `verify-tool-catalog` with an actionable message: trim to behavior facts or register a justified ceiling, making every relaxation a visible reviewed decision rather than drift. Ceilings are ceilings, not targets — new tools should aim at the 200-character default. Combined with ticket-02 pruning of the API-SDK prompt segment, the whole batch cut rendered catalog description cost 21,627 -> 17,489 characters while keeping the wire schema byte-identical except for description fields.
