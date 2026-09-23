# Agent Note: Context meter panel — hover preview, click to pin

Status: implemented

English | [中文](2026-09-23-context-meter-hover-preview.zh.md)

## Problem

The composer's context-occupancy ring opened its breakdown panel only on click ([original decision](../../archived/feature/2026-08-05-composer-context-meter-breakdown.md)); hovering surfaced a tooltip with the percent reading alone. Checking composition — the panel's actual content — required a deliberate click, and the panel then behaved like a menu that a stray click elsewhere dismissed, so reading it while continuing to compose cost two interactions and a pin the user never asked for.

## Decision

`ContextMeter` (packages/client/ui-conversation/src/client/skeleton/ContextMeter.tsx) splits the old single `open` flag into `hovered` and `pinned`, and renders the panel whenever either is true:

- **Hover previews immediately.** Entering the ring or the panel (both inside the root span) opens it with no delay; leaving closes it unless pinned. `.panel::after` is an invisible hover bridge across the 8px gap under the panel, so moving the cursor from ring to panel never leaves the root's hit region.
- **Click pins; a second click releases.** The ring button toggles `pinned` only; the panel's visibility keeps following `hovered` until pinned, and releasing while the pointer is away closes it at once.
- **Dismissal applies to the pin only.** Outside pointerdown and Escape clear `pinned`; the hover preview needs no dismissal because leaving already closes it. A capacity removal while mounted releases both the pin and the hover state — the unmounted ring receives no `mouseleave`, and a returning capacity must not show a panel the pointer no longer holds.
- **The tooltip yields to the panel.** `Tooltip` is disabled while the panel is visible, so the hover path shows the breakdown rather than the redundant percent bubble; keyboard focus still announces the reading through the tooltip, and `aria-expanded` tracks visibility, not the pin.

## Alternatives considered

- **Click-only, as shipped.** Rejected on reach: the occupancy reading is glanceable ambient information, and gating its breakdown behind a click plus menu-style dismissal made the common "just check" case the most expensive one.
- **Zero-delay tooltip instead of the panel on hover.** Rejected: the tooltip restates only the percent; the composition the user comes for lives in the panel, and two stacked surfaces on one hover would fight.
- **Hover-intent delay (≈150 ms).** Rejected for this control: the panel is cheap to mount, a mis-hover self-clears on leave, and the ring sits in the corner where the pointer passes toward composer chrome, not across content the user reads.
- **A pin toggle inside the panel.** Rejected: the panel carries no interactive elements, and the ring already owns opening it — a second control would split one decision across two surfaces.

## Consequences

- A pointer resting on the ring keeps the panel mounted; streaming projections updating `contextPressure`/`contextBreakdown` rerender it live, which was previously visible only while pinned.
- Component specs pin the hover-open, pin-survives-leave, and release-and-repreview sequence; the click, dismissal, and capacity-loss tests now assert the same outcomes through the pin.
- The generated slot catalog and locale dictionaries are unchanged; no product copy moved.
