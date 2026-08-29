# Agent Note: Low-severity hotspot cleanups (six items)

Status: implemented

English | [中文](2026-08-29-low-severity-hotspot-cleanups.zh.md)

## Problem

Six low-severity hotspots from the perf/design review, each a repeated or oversized computation with no behavioral payoff:

- `grep` rebuilt the per-line preview retainer up to three times per capped result (render, presentationMeta, spill post-execute).
- `fork` copied the whole event prefix just to run `findLast` over it for the turn-delimiter check.
- The persistence prefix guard serialized BOTH events with `JSON.stringify` per event, even when they were the same frozen object or differed in an O(1) field.
- The create-collision probe used `loadStored` — a full event-log parse — to answer an existence question that `readStoredRevision` already answers.
- The repeat-tool guard stringified twice: canonical arguments, then the `[name, canonical]` key array around them.
- The gateway stream mux wrote one WebSocket frame per logical frame with a per-frame await; concurrent streams could not share a physical write.

## Decision

- **grep retention**: one `retainGrepMatches` pass memoized per canonical match-list identity (the tools runtime deep-freezes published values, and caps are fixed per plugin instance), shared by render, meta, and the spill projection.
- **fork**: reverse scan from the boundary for the last turn delimiter — same event found, no prefix copy.
- **prefix guard**: layered comparison — object identity, then cheap seq/type/time fields, then surface metadata (`sourceEventSeqs`/`surfaceOp`) by reference or shallow structure, and only a surviving candidate falls through to the stringify deep compare. The stringify fallback is unchanged, so the collision guard never accepts less than before.
- **collision probe**: `readStoredRevision` (both backends already implement it; `undefined` iff absent) replaces the full `loadStored` existence probe.
- **reminder key**: `name + NUL + canonical` — injective because `JSON.stringify` escapes raw NULs — replacing the second stringify.
- **gateway batching**: frames queued before a flush microtask share one physical message (`{type:'batch',frames:[...]}`, each member the pre-serialized frame text, so an unserializable frame still rejects only its own stream). A lone frame stays bare. Pumps still await their frame's physical write per item, so per-source backpressure and cross-stream ordering are unchanged. Both wire sides ship in this package.

## Alternatives considered

**Caching stringified seed events.** Rejected: the guard runs on adopt/claim, not a hot loop; layered short-circuits reach the same rejection with no cache invalidation surface.

**Merging the deep compare into shallow-only.** Rejected outright: a collision guard that misses nested divergence would adopt mismatched logs — semantics before microbenchmarks.

**Batching without a wire change.** Not possible: one `ws.send` carries one message, so coalescing requires an envelope both sides understand.

## Consequences

Capped grep results, forks, session claims, and concurrent remote streams all stop paying for recomputation. Each item is an independent commit for isolated rollback. Tests pin each item's invariance (retention-once count, delimiter-behind-long-tail, distinct-object adoption vs surface-metadata rejection, revision-hook probe audit, chain keys across tools and NUL-bearing arguments, batch coalescing and member validation). One wire-protocol addition: hosts that batch require a client that unwraps batches — the host serves the client bundle from the same install, so the pair moves together.
