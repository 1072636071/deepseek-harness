# Agent Note: dsh-llm 中临时 CallId 兼容别名

Status: implemented

[English](2026-08-28-llm-callid-compat-alias.md) | 中文

## Problem

已发布的 profile 插件（例如 `dsh-archived-chats@1.0.2`）依赖较旧的 `@deepseek-ai/dsh-session` 版本（`^0.1.0-rc.7`，实际解析为 `0.1.0-rc.8`）。该旧版 `dsh-session` 从 `@deepseek-ai/dsh-llm` 导入 `CallId`。当前工作区已将此品牌类型重命名为 `ToolCallId`，因此运行时导入失败：

```text
The requested module '@deepseek-ai/dsh-llm' does not provide an export named 'CallId'
```

由于模块回退机制会将 profile 中的旧版 `dsh-session` 链接到工作区的新版 `dsh-llm`，`pnpm dsh web` 无法启动。

## Decision

在 `packages/llm/llm/src/brand.ts` 中添加临时兼容别名：

- `export type CallId = ToolCallId`
- `export function CallId(id: string): ToolCallId`

两者均标记为 `@deprecated`，并指向 `ToolCallId`。该别名没有运行时开销，也不会改变已使用 `ToolCallId` 的调用点。

## Alternatives considered

- **直接移除别名，要求所有 profile 插件升级。** 短期内拒绝：我们无法控制第三方插件的发布节奏，且该失败会阻止已安装这些插件的用户正常启动 `dsh web`。
- **手动修补 profile 本地 `node_modules`。** 拒绝：下次安装会被覆盖，且无法帮助遇到同一冲突的其他用户。

## Consequences

- 在旧版 `dsh-session` 仍位于依赖闭包中时，`pnpm dsh web` 可以正常启动。
- 该别名扩大了公共 API 面积，一旦没有受支持的插件版本再导入 `CallId`，就应移除。弃用注释记录了此意图。
- 无模型可见、线路或持久性格式变更；两个名称标记的是同一个底层 `string` 值。
