---
description: "User-defined Workspace folders: durable navigation grouping stored apart from the Workspace registry."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-workspace-folders

English | [中文](README.zh.md)

## Summary

Group the Workspaces in the sidebar's browsing region under folders the user creates, renames, deletes, and fills. A Workspace belongs to at most one folder. Folder grouping is navigation state, so this package stores it in its own `workspace_folders` storage domain beside the `workspace` domain: changing either format never rewrites the other's records, and the Workspace registry keeps owning the authoritative Workspace and Session accounts.

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

The Web bundle mounts this package beside `@deepseek-ai/dsh-api-workspace-controller`. The Host half owns `ctx.workspaceFolders` and the generated `ctx.remote.workspaceFolders` namespace; the Client half installs `ctx.workspaceFolders`, which the browsing region reads through an optional service lookup.

| Configuration | Default | Meaning |
|---|---|---|
| `maxTitleLength` | `120` | Longest accepted folder title after trimming |

`remote.workspaceFolders` exposes `list`, `create`, `rename`, `delete`, `setExpanded`, and `setMembership`. Every method answers with the complete folder projection, so a caller installs the whole list instead of merging increments and a reconnect needs no change stream. Titles are unique among folders and are trimmed before comparison. `setMembership` moves one Workspace into the named folder; omitting `folderId` removes it from whichever folder holds it, and a move between folders removes it from the previous one in the same operation. The moved Workspace lands last in its destination folder's member order.

A folder title that is blank, whitespace-only, or longer than `maxTitleLength` is refused. A duplicate title is refused. A membership request naming a Workspace the registry does not hold is refused, as is one naming an unknown folder. Deleting a folder returns its Workspaces to the ungrouped list; deleting an unknown folder resolves without writing. No folder operation deletes a Workspace registration, directory, or Session log.

The browsing region offers folder grouping only while this package's Client half is composed. Without it `ctx.get('workspaceFolders')` is `undefined`, the region's folder projection is empty, and the group-by menu omits the folder mode, so the surface behaves exactly as it did before this package existed.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The domain declares one `folders` table keyed by a generated folder id plus the `folderIds` order singleton. A record holds `title`, member `workspaceIds` in display order, an `expanded` flag defaulting to `true`, and `createdAt`. Every mutation runs through one operation chain, so concurrent writes cannot interleave a read-modify-write.

Opening the domain prunes membership against `ctx.workspaceRegistry.list()`: a member the registry no longer holds is dropped from its folder, and only folders that actually changed are rewritten. Empty folders are retained, because an empty folder is a valid grouping the user is still filling. Removing a Workspace registration therefore needs no folder-side bookkeeping at open time.

The Client model replaces its projection with the Host's answer for each request, in arrival order. The Host replies with the state current at its own write, so the last answer to arrive is also the newest one, and a slow response cannot leave a stale row behind. The model publishes through the Client snapshot store, and the browsing region reads it through the framework's bound selector hook.

No invariant companion is published. The registry is the sole writer of this domain's table and order, and its projection is derived from the same in-memory state it just wrote, so there is no independently observed relationship to compare.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Workspace controller](../workspace-controller/README.md) — the authoritative Workspace registry this package groups.
- [Workspace registry](../../workspace/workspace/README.md) — Workspace records and Session accounting.
- [Storage domain](../../storage/storage-domain/README.md) — the schema-validated domain form both packages open.
- [Workspace browsing region](../../client/ui-workspace/README.md) — the sidebar surface that renders folders.

<a id="model-experience"></a>
## Model Experience

None, as this package only arranges the sidebar's navigation grouping.

#### KV Cache effect

None; folders never enter a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Folder nesting is not supported: a folder holds Workspaces, never another folder.
- Workspace order inside a folder follows the browser's Workspace order rather than a per-folder saved order, so the manual Workspace order remains the single ordering authority.
- The folder projection has no change stream. A second Client window sees folder edits only after its own next request, because every request answers with the complete list.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The package declares `dsh.client` because it carries a Client service half, and `scripts/package-dependency-policy.ts` lists it in `CLIENT_FACE_EXCLUDE` for the same reason as `@deepseek-ai/dsh-api-workspace-controller`: its Host half imports `storage-domain`'s `defineDomain` and `domainTable`, whose shared registry identity makes them neither duplicate-install-safe nor peer-required, and the Client face loads through the module table rather than that Host import graph.

</details>
