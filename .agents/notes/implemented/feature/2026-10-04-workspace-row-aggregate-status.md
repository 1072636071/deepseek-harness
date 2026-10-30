# Agent Note: Workspace row aggregate status

Status: implemented

English | [中文](2026-10-04-workspace-row-aggregate-status.zh.md)

## Problem

A Workspace row showed only its title and a session count, so a collapsed Workspace gave no sign that one of its Sessions had failed, was still running, or had finished unviewed. The Session rows that carry those facts render only while the group is expanded, which is exactly when the reader does not need the summary.

## Decision

Every Workspace row carries one aggregate status dot over its own unarchived Sessions, and its hover card repeats the status as a named line. The dot is `aria-hidden`, so the row's status cell carries the accessible name and the row's own text stays the Workspace title.

| Status | Dot | Meaning |
|---|---|---|
| `attention` | Red `error` | A Session's latest turn ended `error` or `blocked` |
| `running` | `ongoing` loader | A Session is running |
| `unread` | Green `done` | A Session finished unviewed outside the main view |
| `present` | Blue `info` | The Workspace has Sessions and none of the above |
| `inactive` | Grey `idle` | The Workspace has no unarchived Session |

Precedence is fixed — attention, running, unread, presence — and independent of the order the Sessions appear in. `attention` is per Session and reflects only that Session's latest turn, so a later turn that succeeds clears it. Archived Sessions and the provisional blank New Session placeholder never contribute. Folder header rows carried no aggregate when this decision landed, because the request named the Workspace row; [Folder row aggregate status](2026-10-25-folder-row-aggregate-status.md) later reversed that for the folder grouping's folder rows, which now fold their member Workspace rows under the same precedence. The limitation that pending interactions do not aggregate into either row kind remains.

The fold reads a Workspace's complete unarchived ownership rather than its rendered rows, so a collapsed group reports the same status as an expanded one, and the archived-only filter and search cannot change it. `deriveGroups` collects that ownership separately from the visible member list it already built.

Four of the five inputs were already client-visible. The fifth — whether the latest turn ended `error` or `blocked` — was durable in the Host log but never left it: `turnBoundary` folds the same `turn/end` events and discards their reason. The `sessionTurnOutcome` projection in [`dsh-api-session-controller`](../../../../packages/api/session-controller/README.md) folds that discriminant into `{ lastTurnEnd }` and serves it through the list hints every other list-visible projection already uses. It projects the fact, not a policy: `TurnEndReasonMap` is merge-extensible, so any discriminant the consumer does not recognize is not an attention state rather than an error, and the client set of attention discriminants is a local constant.

Blue is a new `StateDot` state rather than a reuse of `idle` or `business`: a Workspace with ordinary Sessions is neither empty nor in business-brand use, and reusing a token by meaning keeps the color decision in the theme. `--dsw-alias-state-info-primary` is registered in both themes.

## Alternatives considered

**Aggregate to a folder header row as well.** Rejected in this change: the folder layer groups Workspaces without owning Sessions, so a folder dot would report a second-hand summary over rows that already each carry one, and the request named the Workspace row. [Folder row aggregate status](2026-10-25-folder-row-aggregate-status.md) later adopted this alternative for folder rows.

**Show attention permanently until the user acknowledges it.** A stuck red dot on a Workspace whose later turn already succeeded would misreport current state, and nothing in the data model records acknowledgement. Last-turn-only is self-healing and needs no dismissal state.

**Derive attention from the client's existing `lastAgentError`.** It lives only on a materialized `Session` object, so it is absent for every collapsed and cold row, and it is not durable across reconnect. The list projection is what makes the dot correct before a Session is opened.

**Put the outcome in the `turnBoundary` projection.** That unit is registered by `dsh-agent-loop` at `stateVersion` 2; adding a field would invalidate every cached row and tie a client presentation concern to a loop-owned fold. A new key with its own `stateVersion` touches nothing existing.

**Reuse `warning` for attention.** Pending interactions already own `warning` on Session rows; a red `error` separates "failed on its own" from "waiting for you".

## Consequences

A collapsed Workspace now reports whether it holds work that needs a human, is still working, or finished unread. The client folds five states from data it almost entirely already had; only the last-turn outcome needed new Host plumbing, and it arrives through the existing list projection and change-feed path with no new endpoint, no namespace, and no format-version bump.

The projection key is absent in an assembly that does not register it, in which case the row reports the remaining four states and simply never shows attention — the same graceful degradation the folder capability uses. Because `TurnEndReasonMap` is merge-extensible, the client never treats an unknown discriminant as attention, so a plugin that adds a turn-end variant cannot turn a Workspace red by accident.

`ui-primitives` `StateDot` now has six states, which is a deliberate widening of a union the README described as fixed at five; the catalog table and the limitation bullet are updated with it, and no consumer switches exhaustively over the union.

`tree.ts` folds ownership separately from visible membership, so both derivations are covered independently. `workspaceRowStatus` pins the fixed precedence, the self-healing turn replacement, the unknown-discriminant pass-through, the archived and blank exclusions, and expansion independence; the row spec pins every state's dot plus its accessible name and English copy; the Host spec pins the fold's verbatim discriminants, its latest-turn replacement, and its reference-preserving return. The full GUI suite, the i18n gate, and the doc gates pass.
