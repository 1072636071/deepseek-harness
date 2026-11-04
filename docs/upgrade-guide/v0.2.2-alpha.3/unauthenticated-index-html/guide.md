---
kind: upgrade-guide
description: "An unauthenticated browser navigation now receives an HTML sign-in page instead of the plain-text 401 line."
---

# The unauthenticated index response is HTML for browsers

English | [中文](guide.zh.md)

## Change

An index request without a valid browser cookie or launch-token exchange answered `401` with `content-type: text/plain; charset=utf-8` and the line `dsh web authentication required; reopen the URL printed by dsh web.` for every caller.

A request whose `Accept` header contains `text/html` — what a browser navigation sends — now receives `401` with `content-type: text/html; charset=utf-8`, `content-security-policy: default-src 'none'`, and a page naming the URL `dsh web` prints plus a `Retry` link to `./`. Requests that do not accept HTML, including `Accept: text/plain` and `Accept: */*`, keep the previous plain-text body, status, and `cache-control: no-store`.

This affects operators and scripts that request the index without signing in: a browser now shows an instruction page instead of an unstyled line, and any script that asserted the response content type of a `text/html` request must accept two outcomes.

## Migration

1. Read the URL printed by `dsh web` at startup, and open it once per browser to mint the cookie. The `token` query is process-scoped: a URL kept from a previous start answers `401`.
2. If a script requests the index and needs the plain-text report, send `Accept: text/plain`; it receives the unchanged body `dsh web authentication required; reopen the URL printed by dsh web.`
3. Confirm the migration by requesting `GET /` with `Accept: text/html` and no cookie: the response is `401` with `content-type: text/html; charset=utf-8` and contains `DSH Web requires the URL printed by <code>dsh web</code>.` The same request with `Accept: text/plain` still returns the single-line report.
