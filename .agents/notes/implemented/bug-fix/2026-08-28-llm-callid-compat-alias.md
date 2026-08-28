# Agent Note: Temporary CallId compatibility alias in dsh-llm

Status: implemented

English | [中文](2026-08-28-llm-callid-compat-alias.zh.md)

## Problem

Published profile plugins (for example, `dsh-archived-chats@1.0.2`) depend on an older `@deepseek-ai/dsh-session` release (`^0.1.0-rc.7`, resolved to `0.1.0-rc.8`). That older `dsh-session` imports `CallId` from `@deepseek-ai/dsh-llm`. The current workspace renamed the brand to `ToolCallId`, so the import now fails at runtime:

```text
The requested module '@deepseek-ai/dsh-llm' does not provide an export named 'CallId'
```

Because the module-fallback mechanism links the profile's old `dsh-session` against the workspace's new `dsh-llm`, `pnpm dsh web` cannot boot.

## Decision

Add a temporary compatibility alias to `packages/llm/llm/src/brand.ts`:

- `export type CallId = ToolCallId`
- `export function CallId(id: string): ToolCallId`

Both are marked `@deprecated` with a pointer to `ToolCallId`. The alias has no runtime cost and does not change any call sites that already use `ToolCallId`.

## Alternatives considered

- **Remove the alias and require every profile plugin to upgrade.** Rejected in the short term: we do not control third-party plugin release cadences, and the failure blocks normal `dsh web` startup for users who already installed those plugins.
- **Patch the profile's local `node_modules` manually.** Rejected: it would be overwritten on the next install and would not help other users hitting the same conflict.

## Consequences

- `pnpm dsh web` boots while the old `dsh-session` release is still in the dependency closure.
- The alias increases public API surface and must be removed once no supported plugin release imports `CallId`. The deprecation comment records this intent.
- No model-visible, wire, or durable format changes; the two names brand the same underlying `string` value.
