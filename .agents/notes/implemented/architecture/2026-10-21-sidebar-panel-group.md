# Agent Note: Bounded sidebar global-panel list

Status: implemented

English | [中文](2026-10-21-sidebar-panel-group.zh.md)

## Problem

`sidebar.panellist` is a root-scoped list any plugin may add to: ui-plugin-manager registers at order 0, ui-schedule at 10, and third-party plugins (MCP connectors, agent centers, and others) append their own rows. Every row is a 36px button above the Workspace browser, so each new plugin shortens the session list and eventually pushes it off the column. The shell had no bound and no way for a user to reclaim the space.

## Decision

The shell pins the first `PANEL_HEAD_ROWS` (four) rows by `order` and folds the rest into one disclosure group declared by the shell itself. The count lives in the header (`More panels (n)` / `Show fewer panels`), so a fold never hides the existence of a row.

### Why the shell, not the panel registry

A cap inside the slot registry would need every list to share one policy and would remove entries from `entries()`, changing what plugins and tests observe. The shell already owns the column's vertical budget and knows nothing about individual panel ids, so the bound belongs to its render pass: the registrations stay intact, and a superset renders only as many rows as the budget allows.

### Placeholder rows versus unmounted rows

Hidden rows unmount. Each `PanelRow` subscribes to its own selection through `usePanelInfo`, and keeping a collapsed row mounted would keep that subscription and its icon slot occupant alive behind a fold with nothing on screen to justify it. The body element still renders (empty) so the header's `aria-controls` always resolves.

### Selection inside a closed group

A collapsed group that holds the selected panel paints the header with the rows' selected surface. Without it the closed list shows no selection at all while the main column displays a panel no row admits to. Opening the group returns the treatment to the row, so the header is selected only while it is the sole visible representative of the selection.

### Rail width

The 56px rail has no room for a group name. There every registered panel renders as its own icon row and the header is omitted, so collapsing the sidebar still reaches every panel in one click. This asymmetry is the column width's, not a second disclosure policy.

### Persistence

The disclosure state is a shell-declared store (`stores.ts`, `dsh.sidebar.panels.v1`) rather than component state, so it survives the shell's registration being rebuilt and a page reload. The persisted value is a single boolean read through the store's own persistence; a stale or hand-edited entry cannot change the shape the component reads.

## Alternatives considered

**Cap the registration list in the slot registry.** Rejected: one global policy would apply to every list slot, and hiding entries from `entries()` would break observers that count registrations and tests that assert their disposal.

**Render every row but let the list scroll.** Rejected: the list sits above the Workspace browser in a flex column whose remaining height belongs to the browser. A nested scroll area inside the column gives the two regions competing scrollbars and makes the panel list feel like a page of its own rather than navigation.

**Always show a group, even below the threshold.** Rejected: a disclosure header over three pinned rows adds a click and a chrome row to reach what already fits; the bound should appear only when the column actually runs out of room.

**Collapse to a single "More" menu instead of an inline group.** Rejected: a menu hides plugin identity behind a popover and loses the icon rows the `sidebar.panellist` contract exists to render; the inline group keeps each row's own label and icon.

## Consequences

- A plugin author needs no new API: the fifth and later registrations fold automatically, and the first four keep their authored `order`.
- `SidebarRootComponentProps` gains the `PropsStore<PanelListStoreHandle>` share. Every direct render of `SidebarRoot` (tests included) must now supply `useStore` and `actions`; the renderer binds them from the declared store in production.
- Four rows is a layout constant, not a user setting. It matches the height budget that keeps the Workspace browser usable at the minimum sidebar width; changing it is a shell layout decision.
