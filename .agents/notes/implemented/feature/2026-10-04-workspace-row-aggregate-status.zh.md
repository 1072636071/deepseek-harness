# Agent Note: 工作区行聚合状态

Status: implemented

[English](2026-10-04-workspace-row-aggregate-status.md) | 中文

## 问题

工作区行只显示标题与会话数，因此折叠的工作区无法提示其中某个 Session 已失败、仍在运行，或已完成但未查看。承载这些事实的 Session 行只在分组展开时渲染，而那恰恰是读者不需要这份摘要的时候。

## 决策

每个工作区行都基于自身未归档的 Session 显示一个聚合状态点，其悬浮卡片以带名称的一行重复该状态。状态点为 `aria-hidden`，因此无障碍名称由该行的状态格承载，行自身的文本仍只是工作区标题。

| 状态 | 状态点 | 含义 |
|---|---|---|
| `attention` | 红色 `error` | 某个 Session 的最近一轮以 `error` 或 `blocked` 结束 |
| `running` | `ongoing` 加载点 | 某个 Session 正在运行 |
| `unread` | 绿色 `done` | 某个 Session 在主视图之外完成，尚未查看 |
| `present` | 蓝色 `info` | 该工作区有 Session，且不属于以上任何一种 |
| `inactive` | 灰色 `idle` | 该工作区没有未归档的 Session |

优先级固定——需处理、运行中、未查看、有会话——且与 Session 的排列顺序无关。`attention` 按 Session 判定，且只反映该 Session 的最近一轮，因此之后有一轮成功即会清除。已归档的 Session 与临时的空白 New Session 占位行都不参与。本决策落地时文件夹头行不携带聚合状态，因为需求点名的是工作区行；[文件夹行聚合状态](2026-10-25-folder-row-aggregate-status.zh.md)随后为按文件夹分组的文件夹行反转了这一点，它们现在按同一优先级折叠其成员工作区行。"待处理交互不聚合到任何一种行"的限制继续有效。

折叠遍历该工作区完整的未归档归属，而不是已渲染的行，因此折叠分组与展开分组报告相同状态，且「仅已归档」筛选与搜索都无法改变它。`deriveGroups` 在已构建的可见成员列表之外单独收集该归属。

五个输入中有四个本就对 Client 可见。第五个——最近一轮是否以 `error` 或 `blocked` 结束——原本持久化在 Host 日志中，却从未离开过它：`turnBoundary` 折叠同一批 `turn/end` 事件却丢弃了其原因。[`dsh-api-session-controller`](../../../../packages/api/session-controller/README.zh.md) 中的 `sessionTurnOutcome` 投影把该判别值折叠为 `{ lastTurnEnd }`，并通过其他所有列表面向投影共用的列表提示下发。它投影事实而非策略：`TurnEndReasonMap` 可合并扩展，因此消费方不认识的任何判别值都不构成需处理状态，而不会被当作错误；Client 侧的需处理判别值集合是本包的局部常量。

蓝色是 `StateDot` 新增的状态，而不是复用 `idle` 或 `business`：一个只有普通 Session 的工作区既不是空的，也不是品牌业务用法；按语义复用 token 可把颜色决策留在主题里。`--dsw-alias-state-info-primary` 在明暗两套主题中都已注册。

## 考虑过的替代方案

**同时聚合到文件夹头行。** 本次改动中拒绝：文件夹层只对 Workspace 分组而不拥有 Session，因此文件夹状态点会重复报告一份二手摘要，而其中每一行本就各自携带状态点；且需求点名的是工作区行。[文件夹行聚合状态](2026-10-25-folder-row-aggregate-status.zh.md)随后为文件夹行采纳了该替代方案。

**在用户确认前永久显示需处理。** 一个工作区若之后的一轮已经成功，仍长期亮红点会误报当前状态，且数据模型不记录确认。只看最近一轮可自愈，也不需要额外的消除状态。

**从 Client 已有的 `lastAgentError` 派生需处理。** 该字段只存在于已物化的 `Session` 对象上，因此对每个折叠行与冷行都不存在，且不跨重连持久化。列表投影才是让状态点在 Session 被打开之前就正确的原因。

**把结果并入 `turnBoundary` 投影。** 该单元由 `dsh-agent-loop` 以 `stateVersion` 2 注册；新增字段会使每一行缓存失效，并把 Client 展示层的关切绑到 loop 拥有的折叠上。使用自带 `stateVersion` 的新 key 不触碰任何既有内容。

**复用 `warning` 表示需处理。** Session 行上的待处理交互已占用 `warning`；红色 `error` 把"自己失败了"与"在等你"区分开。

## 结果

折叠的工作区现在会报告其中是否有人工待办、仍在运行、或已完成未读。Client 从几乎本就齐备的数据折叠出五个状态；只有最近一轮结果需要新的 Host 管线，而它经由既有的列表投影与变更流路径到达，没有新增端点、namespace 或格式版本提升。

若组合未注册该投影 key，该行仍会报告其余四个状态，只是永远不会显示需处理——与文件夹能力使用同一种优雅降级。由于 `TurnEndReasonMap` 可合并扩展，Client 绝不把未知判别值当作需处理，因此新增 turn-end 变体的插件无法意外把工作区标红。

`ui-primitives` 的 `StateDot` 现在有六个状态，这是对 README 中"固定五态"这一联合的有意扩大；分类表与限制条目已同步更新，且没有任何消费方对联合做穷举 switch。

`tree.ts` 把归属折叠与可见成员分开，两套派生各自独立覆盖。`workspaceRowStatus` 钉住固定优先级、最近一轮的可自愈替换、未知判别值透传、归档与空白排除，以及展开无关性；行测试钉住每个状态的状态点、无障碍名称与英文文案；Host 测试钉住折叠的逐字判别值、最近一轮替换，以及保持引用的返回。完整 GUI 套件、i18n 门禁与文档门禁全部通过。
