---
description: "用户自定义的工作区分组文件夹：与 Workspace 注册表分离存储的持久化导航分组。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-workspace-folders

[English](README.md) | 中文

## 概述

把侧栏浏览区中的工作区归入用户自建、可重命名、可删除、可归置的文件夹。一个工作区最多属于一个文件夹。文件夹分组属于导航状态，因此本包把它放在独立的 `workspace_folders` 存储域中，与 `workspace` 域并列：任一方的格式变更都不会改写另一方的记录，工作区注册表继续持有权威的工作区与对话账目。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发者说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Web bundle 把本包与 `@deepseek-ai/dsh-api-workspace-controller` 一起挂载。Host 半侧持有 `ctx.workspaceFolders` 与生成的 `ctx.remote.workspaceFolders` namespace；Client 半侧安装 `ctx.workspaceFolders`，浏览区通过可选服务查找读取它。

| 配置项 | 默认值 | 含义 |
|---|---|---|
| `maxTitleLength` | `120` | 去除首尾空白后接受的文件夹标题最大长度 |

`remote.workspaceFolders` 暴露 `list`、`create`、`rename`、`delete`、`setExpanded` 与 `setMembership`。每个方法都以完整文件夹投影作答，调用方因此整体安装列表而无需合并增量，重连也不需要变更流。标题在文件夹之间唯一，比较前会去除首尾空白。`setMembership` 把一个工作区移入指定文件夹；省略 `folderId` 会把它从当前所在文件夹移出；在文件夹之间移动时，同一次操作即从原文件夹移除。被移动的工作区落在目标文件夹成员顺序的末尾。

空白、仅含空白或超过 `maxTitleLength` 的标题会被拒绝；重复标题会被拒绝；成员关系请求若指向注册表没有的工作区会被拒绝，指向未知文件夹同样被拒绝。删除文件夹会使其中的工作区回到未分组列表；删除未知文件夹不写入并直接成功。任何文件夹操作都不会删除工作区注册、目录或对话记录。

只有当本包的 Client 半侧被组合时，浏览区才提供文件夹分组。缺失时 `ctx.get('workspaceFolders')` 为 `undefined`，浏览区的文件夹投影为空，分组菜单不显示文件夹模式，界面行为与本包存在之前完全一致。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

该域声明一张以生成的文件夹 id 为键的 `folders` 表，外加 `folderIds` 顺序单例。记录包含 `title`、按显示顺序排列的成员 `workspaceIds`、默认 `true` 的 `expanded` 标志，以及 `createdAt`。所有变更都经过同一条操作链，因此并发写入无法交错读-改-写。

打开该域时会依据 `ctx.workspaceRegistry.list()` 修剪成员关系：注册表已不再持有的成员会从其文件夹中移除，且只重写真正发生变化的文件夹。空文件夹会被保留，因为空文件夹仍是用户正在填充的合法分组。因此移除工作区注册无需在打开时做文件夹侧记账。

Client 模型按到达顺序用 Host 的应答整体替换投影。Host 以自身写入当时的当前状态作答，所以最后到达的应答也就是最新的，慢响应不会留下过期行。模型通过 Client 快照存储发布，浏览区经框架绑定的选择器 hook 读取它。

不发布不变量伴生模块。注册表是该域表与顺序的唯一写入者，其投影派生自它刚写入的同一份内存状态，因此不存在可独立观察的关系可供比对。

</details>

<a id="further-exploration"></a>
## 延伸阅读

- [Workspace 控制器](../workspace-controller/README.zh.md)——本包所分组的权威工作区注册表。
- [Workspace 注册表](../../workspace/workspace/README.zh.md)——工作区记录与对话账目。
- [Storage 域](../../storage/storage-domain/README.zh.md)——两个包共同打开的 schema 校验域形式。
- [工作区浏览区](../../client/ui-workspace/README.zh.md)——渲染文件夹的侧栏界面。

<a id="model-experience"></a>
## 模型体验

无。本包只安排侧栏的导航分组。

#### KV Cache 影响

无；文件夹从不进入模型请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 不支持文件夹嵌套：文件夹持有工作区，绝不持有另一个文件夹。
- 文件夹内的工作区顺序沿用浏览区的工作区顺序，而非按文件夹保存的顺序，因此手动工作区顺序仍是唯一排序权威。
- 文件夹投影没有变更流。第二个 Client 窗口只会在自己下一次请求后看到文件夹改动，因为每次请求都以完整列表作答。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

本包声明 `dsh.client`，因为它带有 Client 服务半侧；`scripts/package-dependency-policy.ts` 把它列入 `CLIENT_FACE_EXCLUDE`，理由与 `@deepseek-ai/dsh-api-workspace-controller` 相同：其 Host 半侧导入 `storage-domain` 的 `defineDomain` 与 `domainTable`，这两个导出共享注册表身份，既不属于可重复安装安全，也不属于 peer 必需；而 Client 面经由模块表加载，不经过那条 Host 导入图。

</details>
