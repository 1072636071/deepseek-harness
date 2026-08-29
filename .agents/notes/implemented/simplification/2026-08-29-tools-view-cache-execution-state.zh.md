# Agent Note：工具注册表视图缓存、单一执行状态与结果物化短路

Status: implemented

[English](2026-08-29-tools-view-cache-execution-state.md) | 中文

## 问题

工具注册表位于 harness 最热的路径上，三笔成本在此叠加。`ToolRuntime.view()` 每次调用都重建继承表、限制过滤器与两个名字集合，而一次工具调度会触发它五次以上（查找、解析、模式分类、post-execute、呈现）。一条成功结果被深拷贝三到四遍：value/content/meta 快照、`createSuccessResult` 内的再次物化、以及 finish 阶段的又两次物化。此外，一次执行的生命周期事实散落在四张 exec 键控旁表中（`deferredContexts`、`concludingExecutions`、`cancellationStates`、`contentFinalizers`），每张表的缺失条目各配一处 invariant throw。

## 决策

对 `@deepseek-ai/dsh-tools` 的三项改动（机械到结构），可观察行为零变化：

- **Per-scope 视图缓存。** `view()` 按作用域记忆化派生的 `ToolView`（scoped 键用 WeakMap，全局视图单独一槽）。每次有通知的 `ScopedLayers` 变更先整体清缓存再 emit `tools/change`；`guard()` 以 `notify: false` 注册、被有意排除——guard 是执行期策略，不是视图事实。
- **结果物化短路。** `createSuccessResult` 原位组装并 deep-freeze（其字段已是刚 detach 的快照），物化结果登记进 `finalizedResults` WeakSet，`finishScheduledExecution` 直接复用而非再深拷贝。`canonicalResults`（dispatch token 标记）与 `finalizedResults` 保持结果键控；四张 exec 键控旁表收敛为单一 `ToolExecutionState`，防御点收敛为一处 `executionStateOf`。
- **模块拆分。** 约 1950 行的 `index.ts` 将类型、纯 helper、层、调度器契约、配置与 Cordis 事件增强外移到 `results.ts`、`definition.ts`、`execution-state.ts`、`signals.ts`、`layer.ts`、`scheduler.ts`、`config.ts`、`events.ts`。包根保留 `ToolRuntime` 组合根，并经 re-export 逐名保持公共导出面（由 `tests/public-surface.spec.ts` 钉住）。

## 备选方案

**按作用域增量失效**（只重算链路穿过变更层的视图）。暂不采纳：整体清除平凡正确，且变更频率远低于读取；WeakMap 已消除唯一的滞留风险。

**把结果键控的 canonical 标记并入执行状态。** 拒绝：这些标记以结果对象为键，回答"这条结果由哪个 dispatch 产生"，与执行记录是不同的键空间。

## 后果

一次工具调度在两次变更之间只做一次视图派生、每条结果只做一次物化；大输出工具（read/bash）不再为每条结果支付两到三次冗余深拷贝。四处 invariant throw 收敛为一处。消费方可观察的运行时成本不变：`tools/result` 观察者与 `execute()` 返回值同引用、内容深冻结、`finalizeContent` 恰好调用一次、`additionalContexts` 传递——均由 `tests/result-materialization.spec.ts` 与既有管线套件钉住。
