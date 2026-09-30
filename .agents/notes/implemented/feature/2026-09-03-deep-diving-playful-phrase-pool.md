# Agent Note: Deep-diving playful phrase pool

Status: implemented

English | [中文](2026-09-03-deep-diving-playful-phrase-pool.zh.md)

## Problem

The running-turn status line shows the same static "深度求索中..." / "Deep diving..." copy on every turn; long waits feel dead. The user asked for roughly 100 random playful phrases instead, with anchor lines like "token，token，有 token 就干活。".

## Decision

`ui-chat` owns a frozen phrase pool (`deepDivingPool`: 100 zh + 100 en, aligned one-to-one) inside its locale-owner file, plus a pure `pickDeepDivingPhrase(localeId, random)` selector. `RunningStatus` — the running indicator below the transcript — draws one phrase per mount through a `useState` initializer, so its per-second clock tick re-renders without re-drawing, and reads the locale through the `activeLocale` member of the Chat view inject face. A locale id without a bucket, and a `RunningStatus` mounted without `activeLocale`, keep the static `chat.deepDiving` and `chat.deepDivingFor` copy; a drawn phrase replaces the visible label through `chat.deepDivingPhraseFor` and is what the hidden `role="status"` node announces. The pool lives in the locale-owner file, which the client-UI-i18n gate exempts by location; it is not part of the typed `t` dictionary because dictionary values are single strings.

## Alternatives considered

- Rotating the phrase on a timer: flicker on a per-second re-render surface, plus repeated aria-live announcements. Rejected.
- A new slot for the status line: it is a high-frequency internal element and the pool is product copy, not a persona asset. Rejected.
- Overriding the `chat` namespace from a plugin: locale registration is one-key-one-copy and cannot hold a pool. Rejected.

## Consequences

Roughly 200 lines of product copy now live in `locale.ts` by file-location exemption rather than through the typed dictionary — zh/en pairing is enforced by the pool's own structure, not by `satisfies` on the key union. The `random` parameter exists as a determinism seam; current tests pin determinism by spying on `Math.random` instead of passing it, so the seam is currently unused by tests. Future locales without a bucket fall back to the static key.
