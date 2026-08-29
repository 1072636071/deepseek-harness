# 工具注册表 view() 按 registry generation 缓存

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** 工具注册表（packages/core/tools）的 `view()`/`get()` 不再在每次调用时沿 scope 链重建 Map/Set 并逐层 `admits()` 过滤。利用 `ScopedLayers.onChange` 的既有变更通知，按 registry generation 缓存 per-scope 的 ToolView；一次工具调用链（createExecution → resolveExecution → postExecute → normalizeDispatchResult → executionMode 并行调度）以及 timeout-policy 包装里的重复 view 计算全部命中缓存。对用户可感知的行为：完全不变——工具可见性、restrictable 集合、并行调度结果与改造前一致，只是每次调度的 CPU/分配成本大幅下降。

**验收标准：**

- [ ] ScopedLayers 变更（工具注册/卸载/undo 回收）后缓存失效，下一个调用即刻看到新工具集（有测试覆盖）
- [ ] 单次工具调度全链路 view 计算次数从 ≥5 降为 ≤1（计数断言或微基准）
- [ ] 现有 tools 相关测试全绿，行为无变化
- [ ] 缓存不持有已卸载 scope 的强引用（无泄漏，配合 ctx.effect 生命周期）

## 评论

## 评论

- 实现：`ToolRuntime.viewCache`（per-scope Map），在 `ScopedLayers.onChange` 回调整体清空后再 emit `tools/change`；`guard()` 因 `notify: false` 不影响视图，天然不触发失效。测试：`tests/view-cache.spec.ts`（8 例：缓存命中同一实例、注册/注销/限制/展示模式变更即时生效、层回收后不复活、guard 不污染缓存）。
- 状态：tools 405 全绿、agent-loop 341 全绿、仓库级 `npm run typecheck` 通过。
- **复审记录**：第一轮提出 10 项发现（标准 3 硬性 + spec 2 缺失），已修复：viewCache 改 WeakMap（scoped）+ 全局单槽，onChange 双清，消除 scope 强引用滞留；补"调度全程视图复用"恒等断言（execute 体内 get 与调度前 get 同实例，即 view 派生 ≤1 的计数代理）。复审结论：验收 4 条全部达成。
