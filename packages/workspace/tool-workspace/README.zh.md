---
description: "列出工作区注册表中的全部 DSH 工作区——与 GUI 侧边栏显示的是同一批——含标题、规范路径与 session 数量。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-workspace

[English](README.md) | 中文

## 概述

列出工作区注册表中的全部 DSH 工作区——与 GUI 侧边栏显示的是同一批——含标题、规范路径与 session 数量。只有一个只读工具：不创建、不删除、不改名、不切换目录。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

与 `tools` 和 `workspaceRegistry` 一起挂载。调用 `workspace_list({})` 得到注册表顺序；`workspace_list({ includeSessions: true })` 额外带上每个工作区的 session id；`workspace_list({ checkMissing: true })` 逐个检查工作区目录是否存在。此工具没有配置字段。

```yaml
- name: '@deepseek-ai/dsh-tool-workspace'
```

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

每次调用读取一次 `ctx.workspaceRegistry.list()`，把每个条目投影成规范结果：id、标题、路径、session 数量、创建与更新时间。`sessionIds` 与 `status` 仅在请求时附加；`status` 会并发等待每个工作区自己的实时 `status()` 检查。原生渲染一行一个工作区；空注册表渲染一行说明文字，而不是空串。

不发布 `./invariant` 伴生模块，因为此工具不拥有任何状态，只读取注册表。

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [工作区](../../../docs/subsystems/workspace.zh.md) — 本工具读取的共享注册表行为。
- [Workspace 包组](../README.zh.md) — 持久化工作区服务。
- [测试](../../../docs/testing.zh.md) — 组合与回放验证。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema 与结果

#### 模型可见内容

[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-workspace) 定义可选的 `includeSessions`、`checkMissing` 参数与规范 `workspaces` 数组。描述中写明工作区是注册表记录，不是文件系统目录列表。

#### Token 影响

工具可用及被调用时，注册的 schema 与每个工作区一行结果贡献 token；可选字段只在请求时才增加 token。

#### KV Cache 影响

改变工具可用性会改变其 schema 上下文。工具调用追加普通调用和结果历史，不替换已有消息。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **按设计只读** — 创建、删除、重排序与切换 Session 目录仍由其他所有者负责；本包只负责列举。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护工作上下文 — 点击展开</summary>

无。

</details>
