---
description: "List every DSH workspace in the workspace registry — the set the GUI sidebar shows — with its title, canonical path, and session count."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-workspace

English | [中文](README.zh.md)

## Summary

List every DSH workspace in the workspace registry — the set the GUI sidebar shows — with its title, canonical path, and session count. One read-only tool: no creates, deletes, renames, or directory changes.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount alongside `tools` and `workspaceRegistry`. Call `workspace_list({})` for the registry order, `workspace_list({ includeSessions: true })` to add each workspace's session ids, and `workspace_list({ checkMissing: true })` to stat every workspace directory. The tool has no configuration fields.

```yaml
- name: '@deepseek-ai/dsh-tool-workspace'
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The tool reads `ctx.workspaceRegistry.list()` once per call and projects each entry into the canonical result: id, title, path, session count, creation and update instants. `sessionIds` and `status` are added only on request; `status` awaits every workspace's own live `status()` check concurrently. Native rendering prints one line per workspace, and an empty registry renders one explanatory line instead of an empty string.

No runtime invariant companion is published because the tool owns no state: it only reads the registry.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Workspaces](../../../docs/subsystems/workspace.md) — the shared registry behavior this tool reads.
- [Workspace group](../README.md) — durable workspace services.
- [Testing](../../../docs/testing.md) — composition and replay verification.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schema and result

#### What the model sees

The [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-workspace) defines the optional `includeSessions` and `checkMissing` arguments and the canonical `workspaces` array. The description states that a workspace is a registry record, not a filesystem directory listing.

#### Token effect

The registered schema and one result row per workspace contribute tokens when the tool is available and invoked; the optional fields add tokens only when requested.

#### KV Cache effect

Changing tool availability changes its schema context. A tool call appends ordinary call and result history without replacing prior messages.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Read-only by design** — creating, deleting, reordering, and switching the Session directory stay with other owners; this package only lists.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
