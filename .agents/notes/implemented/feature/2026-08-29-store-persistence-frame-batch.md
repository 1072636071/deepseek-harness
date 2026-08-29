# Agent Note: Store persistence write-back rides the frame channel

Status: implemented

English | [中文](2026-08-29-store-persistence-frame-batch.zh.md)

## Problem

Every persisted snapshot store subscribed to the raw zustand api and paid a full `JSON.stringify` + `localStorage.setItem` per `setState` — synchronously inside the update call. During UI hot paths (drag reorder, text input into persisted drafts) a frame could carry dozens of writes of a large state tree, and the notification rAF batching that already coalesced subscriber notifications did nothing for storage.

## Decision

Write-back now goes through a per-key pending registry: the first change in a frame registers a write, the frame's end lands one `setItem` with the final state; later changes in the same frame are absorbed. A hidden tab never paints, so changes there write synchronously, and one shared `visibilitychange`/`pagehide` listener pair (installed module-wide, `pagehide` rather than the mobile-unreliable `unload`) flushes anything still pending before reload/close. Instance creation with a key that has a pending write lands that write first, so a same-key remount rehydrates the freshest state instead of the pre-frame value. `clearPersisted` drops the pending write before removing the key, so a buried session scope cannot resurrect its state from an already-scheduled frame. The scheduling primitive is shared with the notification channel (`nextFrame`), and the `flush: 'raf'` notification semantics are untouched.

## Alternatives considered

**Zustand's persist middleware.** Rejected (unchanged from the original hand-rolled decision): its `partialize({ ...get() })` explodes primitive state into index keys.

**Idle-time write-back (`requestIdleCallback`).** Rejected for now: it widens the crash-loss window and adds a second scheduling regime; the frame channel already takes serialization off the input path. Can be layered later without contract changes.

**Keeping per-instance listeners.** Rejected: each instance's closures would be pinned by the global listener for the document's lifetime; the per-key registry holds a write only until it lands.

## Consequences

Storage cost per frame drops from O(setState calls × state size) to O(1 write). Tests that asserted synchronous persistence now settle with `waitFor` before reading storage, and the workspace view-store seed resets all persisted fields (a seed instance can rehydrate a previous test's pending write). Micro-benchmark (node, ~145 KB state, 60 updates): 60 writes / 28.4 ms → 1 write / 0.5 ms. Observable semantics: persistence is now frame-deferred (crash inside a frame loses that frame's writes; hide/pagehide flush closes the reload window), and same-key instance creation within one frame reads fresh state instead of going stale.
