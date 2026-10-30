# Agent Note: Folder row aggregate status

Status: implemented

English | [中文](2026-10-25-folder-row-aggregate-status.zh.md)

## Problem

The folder grouping rendered its folder rows as a title, a disclosure triangle, and a menu, while the member Workspace rows that carry the aggregate status dot from [Workspace row aggregate status](2026-10-04-workspace-row-aggregate-status.md) rendered only under an expanded folder. A collapsed folder therefore showed no sign that a Workspace inside it needed a human, was still running, or had finished unviewed — the same gap that note closed for a collapsed Workspace, one level up.

## Decision

Every folder row carries the same aggregate status dot as a Workspace row, in the same row position after the disclosure triangle. A folder owns no Sessions, so `folderRowStatus` folds the statuses of its member Workspace rows under the precedence that decision fixed — attention, running, unread, presence, inactivity — and a folder with no member, or whose members are all inactive, reports `inactive`.

| Status | Dot | Meaning |
|---|---|---|
| `attention` | Red `error` | A member Workspace reports attention |
| `running` | `ongoing` loader | A member Workspace is running |
| `unread` | Green `done` | A member Workspace finished unviewed outside the main view |
| `present` | Blue `info` | The folder holds at least one non-inactive member |
| `inactive` | Grey `idle` | The folder holds no member, or every member is inactive |

The folder layout already holds every member Workspace row, expanded or not, so the fold is independent of the folder's expansion without touching the folder data: `layoutFolderSections` groups Workspaces by membership and never filters by `expanded`, and the browser row builder passes `folderRowStatus` over those members' `status`. No member session is read a second time, and `FolderHeaderNode` keeps its folder facts without a status field.

The folder row loses its `aria-label={folder.title}`. A row-level label masks the status dot's own `role="img"` name, so a screen reader would announce the folder title and never the aggregate. The row now names itself from its content, exactly as a Workspace row does: the title text plus the dot's accessible name from the `status.workspace.*` dictionary entry. Those entries were already worded without the word "Workspace", so the folder row reuses them instead of owning a duplicate set.

## Alternatives considered

**Fold the member Sessions at the folder level instead of the member rows.** `workspaceRowStatus` already folds one Workspace's unarchived Sessions; folding the folder's Sessions independently would duplicate that precedence, duplicate the attention-discriminant rule, and re-read every session the member rows already summarized.

**Carry the status on `FolderHeaderNode` in `deriveGroups`.** `deriveGroups` derives Workspace groups from the Session list and knows nothing about folders, which `layoutFolderSections` joins afterwards in the browser. Adding a folder field there would either move folder membership into the tree derivation or leave a field no producer in the tree sets.

**Keep `aria-label` and put the status in it.** That would make the folder's accessible name read "Work: A session is running", inventing a composed string outside the locale dictionary; the Workspace row's existing content-derived name is the pattern to match.

**Give folders their own locale keys.** The existing `status.workspace.*` copy names no Workspace and reads correctly on a folder row, so a duplicate set would only add translation surface to keep in step.

## Consequences

A collapsed folder now reports whether anything it holds needs a human, is still working, or finished unread, without expanding it and without reading any member Session. The folder row's accessible name changes from the bare title to title plus status label — the same reading a Workspace row already had — and the folder row spec, the folder browser spec, and the row spec were updated with it.

The dot reports the member rows' aggregate state, not a separate folder fact: pending interactions still do not aggregate into either row kind, so the limitation on that stands. A folder whose only member is inactive reads Inactive rather than the empty-folder wording, because the two are the same state in the row's vocabulary.

`folderRowStatus` pins the precedence, the empty and all-inactive cases, and the member-order independence; the folder browser spec pins the five dots on the real render path, the collapsed-folder dot, and a mixed folder taking its most urgent member. The i18n gate, the agent-note format gate, the translation pairing gate, and the doc gates pass.
