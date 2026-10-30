---
description: "React and Slot adapters for Session Controller lists, interaction state, and per-session context."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-session

English | [中文](README.zh.md)

## Summary

Use this package to expose Session catalog, retain information, and unified UI status through standard Slot hooks. It materializes per-`SessionBinding` hooks and props, while `SessionProvider` can inherit an outer binding or bind an explicit `SessionReference`. It owns process-local pending-interaction and completion-reminder policy without owning Controller transport, history, or references.

Running status comes from Host list baselines or status events. Subagent catalog rows and retained subagent fallback rows do not establish running status; main view references still acknowledge completions.

## Table of Contents

- [Access Hooks](#access-hooks)
- [Scope Roster](#scope-roster)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="access-hooks"></a>
## Access Hooks

The package injects the Client `remoteAccess` service and publishes Session access Hooks over its `source()`: the root `useSessionAccess(sessionId, action)` answers on one Session resource, and the Session-scope `useAccess(action)` answers on the bound Session's resource; the `global` resource's answer is a different Hook, `useRemoteAccess(action)`, so neither shadows the other. The SessionMaybe-scope `useAccess(action)` returns `undefined` while no Session is bound, which callers treat as not allowed; a decision on the `global` resource reads `useRemoteAccess` instead. Snapshot semantics belong to [`dsh-api-remote-access`](../../api/remote-access/README.md#client-face).

<a id="scope-roster"></a>
## Scope Roster

`ctx.uiSession.provide()` contributions form the Session standard-source roster. Every provide and disposal rebuilds the bindings and then advances the adapter's `rosterRevision`; the Slot registry forwards that revision to the shared roster epoch, so a contained crash caused by a withdrawn Session seat retries when the seat returns, with no root binding publish involved. A withdrawal logs each removed seat by the prop consumers render, and a seat that never returns keeps its crash face.

<a id="model-experience"></a>
## Model Experience

None, as this package adapts browser-side Session state and registers nothing model-facing.

#### KV Cache effect

None; Session selectors and Slot scopes do not assemble model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Pending interactions are process-local projections** — the owning Remote waterfall must replay an outstanding request after a browser reconnect.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
