# Agent Note: Pluggable hero headline slot

Status: implemented

## Problem

The blank-session hero headline ("探索未至之境" / "Into the Unknown") renders the `hero.headline` locale key directly inside the empty-state hero. External persona plugins (dsh-web-ui-jx) have no way to replace it, yet that headline is exactly the copy a persona plugin should own. There is no extension point at that seat, and dsh slots are one-directional: a slot's declaration and render site must live in host code, so a plugin can never introduce one by itself.

## Decision

`ui-conversation` declares a `conversation.hero.headline` slot (single, root scope) next to `conversation.hero.brand.mark`. The empty-state hero renders the headline through `renderSlot` with a fallback that renders the existing `hero.headline` key inside the original styled node. No new locale keys are added. With no occupant the rendered output is unchanged, and the five pre-existing skeleton assertions pass unmodified. Occupants supply their own copy (time-of-day greeting, persona lines) — greeting logic and copy stay out of the host.

## Alternatives considered

- DOM hijack from the plugin's client bundle: the headline class is a CSS-module hash, so matching would have to key on visible copy and would break on locale switch while coupling the plugin to host DOM structure. Rejected.
- Moving greeting logic into `ui-conversation` and reading the user name from the persona plugin's store: logic split across repos with cross-repo configuration reads. Rejected.
- Persona plugin greets only through its speech bubble: zero host change, but the headline itself was the requested seat. Rejected.

## Consequences

The host carries one more declared slot permanently, and `ui-conversation`'s public slot surface grows by one. Persona plugins gain a peer dependency on the host conversation package — the same direction `ui-brand-official` already uses for the brand-mark seat. The fallback keeps host tests and the client-UI-i18n gate untouched; adding a seat with a fallback is the cheap contract, and withdrawing it later would be breaking.
