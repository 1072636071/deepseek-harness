# Agent Note: Retry slot crashes caused by withdrawn standard sources

Status: implemented

English | [中文](2026-10-25-slot-root-roster-crash-retry.zh.md)

## Problem

The Web client hot-replaces a Client plugin entry by tearing down its old fiber before importing its replacement. A provider such as `ui-workspace` disposes its `ctx.slots.provideRoot()` contribution during that teardown, so `SlotRegistry.rebuildRootBinding()` publishes a root binding without its seats for one interval while consumers keep rendering. A consumer that reads the withdrawn seat (`useWorkspaces`) gets `undefined` and throws; the per-entry boundary contains the crash and reports it, which abdicates the entry for the rest of its registration lifetime, and the Factory boundary keeps its failed state because its key carries only name, definition version, and scope identity. Neither failure is retried when the provider registers again, so the region stays on its crash face until the page reloads. The same defect has a second trigger chain: `ctx.uiSession.provide()` rebuilds the Session-scope bindings, an HMR teardown withdraws those seats the same way, and the abdicated Session entry stays retired unless a root publish happens to follow — which that axis never guarantees.

## Decision

Standard-source rosters share one epoch, and it is the retry signal for contained crashes. `SlotCore` owns the counter: `advanceRosterEpoch()` increments it after every published roster and returns the new value, and `rosterEpoch()` reads it. Two axes advance it: `SlotRegistry.rebuildRootBinding()` for `ctx.slots.provideRoot()` contributions, and `SlotRegistry.installScope()` whenever the installed `SlotScopeAdapter.rosterRevision` moves — `ui-session` advances that revision after every `ctx.uiSession.provide()` rebuild, and the subscription lives in the scope install effect, so a replaced or uninstalled adapter stops forwarding. `SlotRegistry` and every adapter hold no copy of the counter; the host `rosterEpoch` observable reads the core's value, so the projection filter and the retry signal cannot disagree. An abdication record stores the epoch current at report time; `entriesOfSlot()` filters an entry only while that value still equals `rosterEpoch()`, so a publish that follows the crash re-projects that entry. The epoch lives on the `SlotCore` instance, never in module or global state.

`SlotErrorBoundary` and `FactoryErrorBoundary` receive the epoch and share one reset policy (`retryOnEpochChange`): a moved epoch records the new value and clears `failed`, which keeps a crash during the retried render from resetting again on the next pass. Only a failed boundary resets; every boundary re-renders at the same element identity, so a healthy subtree keeps its local state and never remounts. A report that lands after the recovery publish still carries the older epoch, so that entry waits for the next publish — delayed, never permanently locked. Assembly errors still rethrow — a miswired shell fails loud, and a roster withdrawal stays a retryable runtime crash rather than an assembly fault.

Each roster rebuild logs every seat it withdrew, naming the prop consumers render (`use<Name>`) and stating that they crash until it returns: `rebuildRootBinding()` for root contributions, `UiSession.rebuildBindings()` for Session contributions. A withdrawal is not a load error; the diagnostic exists because the crash it produces is otherwise attributed only to the consumer.

## Alternatives considered

**Key the crash boundaries by the roster epoch.** A changed key remounts the whole boundary subtree on every publish, including healthy siblings, losing their local state and flickering exactly when a provider rebuilds. The epoch belongs in boundary state, not in identity.

**Retry every crash automatically, or drop abdication.** A permanent registrant failure then crashes, retries, and crashes again forever, and a dry shadowing cell could never present its crash face.

**Hold the failed boundary until the page reloads.** That is the defect: an HMR teardown is routine, and the provider returns seconds later.

**Treat a missing root seat as an assembly error.** A strict missing-source check exists for declared seats, but a roster that omits a seat entirely has no source to check, and treating the transient teardown as miswiring would black out the application instead of isolating one region.

**Keep the epoch in a module-level or `globalThis` singleton.** Instances of the registry and core are independent in tests and composition; shared state belongs to its service instance.

## Consequences

A transient roster shrinkage heals without a reload, and a source that never returns keeps its visible crash face (`data-slot-error` / `data-factory-error`) with the logged cause and no retry loop. Retries ride roster publishes only, so a seat that stays absent costs no repeated renders; the epoch is shared, so the reset is coarse — an unrelated contained failure, on either axis, also retries once per published roster. Shutdown and HMR teardown now log each withdrawn seat, which is expected noise on a real provider unload. A crash reported between the recovery publish and the next one heals one publish later rather than immediately. Coverage lives in the `ui-slots` core epoch spec, the renderer registry host-face spec (root and scope axes), the `ui-session` roster-revision spec, and the real-composition `root-roster` / `session-roster` specs that withdraw and restore a root and a Session source for entry, chain, and Factory consumers.
