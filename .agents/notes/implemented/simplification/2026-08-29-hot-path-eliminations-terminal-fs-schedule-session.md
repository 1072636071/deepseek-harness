# Agent Note: Hot-path eliminations across terminal, filesystem, schedule, and session

Status: implemented

English | [中文](2026-08-29-hot-path-eliminations-terminal-fs-schedule-session.zh.md)

## Problem

Four per-call costs grew with accumulated state rather than with the work actually needed:

- Windows process-tree termination ran `spawnSync('taskkill')` on the event loop — every concurrent cancel (timeout, abort, teardown) serialized behind a 10–100 ms synchronous spawn.
- `listDirectory` paid a realpath chain plus a stat per child, serially — a node_modules listing was 2N+ sequential syscalls even though readdir already reports the on-disk child name.
- The schedule runtime re-folded the WHOLE session event log twice per wake (preflight + claim), so wake cost grew with the session, independent of the schedule count.
- Context providers (time-context ×3, tmux-context ×1) copied the entire event log with `[...events].reverse()` per step before an early-breaking backward scan.

## Decision

- **taskkill**: fire-and-forget async spawn (contained `error` event, `unref()`). Delivery races tree exit exactly like a POSIX group signal, so every outcome was already tolerated; the only observable change is that teardown no longer waits for taskkill to report — Windows keeps the orphaned child running to completion.
- **listDirectory**: non-symlink children use `join(parent.targetKey, name)` as the target key (readdir reports the on-disk name, so the realpath the old loop paid per child bought nothing), then one stat; resolution runs on `Promise.allSettled` (the fs threadpool bounds concurrency) and the failure surface is preserved — the first failing entry in name order throws the same structured `listingIoError`. Symlinks keep the full resolution chain. The only divergence is a mid-listing TOCTOU replacement of a child by a symlink, whose target key stays the joined path.
- **schedule fold**: the fold kernel was extracted (`emptyScheduleFold` / `applyScheduleEvents` / `snapshotScheduleFold`) and the runtime keeps an incremental accumulator (`seedLength + seq`); each wake folds only new events, and a replaced/shrunk log falls back to a full refold. Incremental state is indistinguishable from a full refold by construction (shared per-event validation), pinned by chunked-equivalence tests.
- **session backward scans**: `Session.eventsReversed()` — a lazy newest-first iterator that captures the log prefix on first pull — replaces the reverse-copy scans in time-context and tmux-context, making the cost the distance to the first match.

## Alternatives considered

**Win32 FFI TerminateProcess instead of taskkill.** Rejected for this change: it loses the /T tree walk that taskkill provides; the async spawn keeps the tree semantics with a one-line change.

**Per-entry error isolation in listDirectory** (skip a failed child instead of aborting). Rejected: it changes the list tool's observable result — a partial listing would masquerade as complete; structured per-entry error channels are a schema change beyond this scope.

**`eventsSince(seq)` cursor API.** Rejected: no in-repo consumer scans forward incrementally (the stepIsOpen cache is maintained by an event listener; `visibleInstructionChanges` depends on retroactive surface visibility), so the cursor would be speculative generality. The lazy reverse iterator is the consumption pattern that actually exists.

## Consequences

Concurrent cancels no longer serialize behind synchronous taskkill; large-directory listings drop to one syscall per child in parallel; schedule wakes cost O(new events) instead of O(log) twice; context-provider backward scans stop allocating the whole log per step. Behavioral surface is preserved except where noted: the taskkill unref (teardown does not wait), the listDirectory TOCTOU key divergence, and the abort-check granularity (before/after the parallel resolve instead of between children). The fs-local suite's writeText/editText version tests are known-flaky on Windows stat granularity (pre-existing, reproduced on a stashed baseline); clean signals come from CI.
