# tools God 文件拆分

**Status:** done

**Blocked by:** 15

**构建内容：** packages/core/tools 的约 1900 行主文件按既有接缝机械拆分为 scheduler / registry / ptc-wiring / presentation 等模块（参照 session 包 surface / chunk-rows / json 的切分范式；`ToolRuntimeScheduler` 接缝已存在）。纯移动 + re-export，行为零变化。15 的状态收敛完成后再动文件，避免同区间冲突。

**验收标准：**

- [ ] 对外公共 API 与导出面完全不变（导出快照测试）
- [ ] 单文件行数降到约定阈值内，jscpd / lint 通过
- [ ] 全量测试绿，无行为差异
- [ ] 各新模块间依赖方向单向、无循环引用

## 评论

## 评论

- 实现：机械外移到 7 个新模块——`results.ts`（结果类型 + 快照/失败 helper + 错误类）、`definition.ts`（执行/定义契约 + PtcDispatchLog + createExecutionToken）、`execution-state.ts`、`signals.ts`（信号熔断）、`layer.ts`（ToolLayer + maxParallel 解析）、`scheduler.ts`（调度器契约 + symbol）、`config.ts` + `events.ts`（配置与 Cordis 增强迁移）。`index.ts` 1945 → 约 1180 行，只保留 ToolRuntime 组合根、视图缓存与装配；公共导出面经 re-export 逐名保持不变。
- 修正：迁移 cordis `declare module` 时补回最初遗漏的 `Context.tools` 接口增强。
- 状态：同上全绿。
- **复审记录**：导出快照测试已补（tests/public-surface.spec.ts，钉 23 个运行时值导出；type-only 导出由仓库级 typecheck 覆盖）；同模块分裂 import 已合并；非平凡变更已按 AGENTS.md 补 Agent Note（implemented/simplification/2026-08-29-tools-view-cache-execution-state 三件套）。验收达成。
