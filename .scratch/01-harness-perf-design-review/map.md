# 01-harness-perf-design-review · 地图

**来源：** 2026-08-29 对 monorepo（commit 42dff72b，v0.1.2-alpha.1）的静态深读审查，完整报告见同目录 `report.html`（含全部 file:line 证据）。审查分区：核心基础设施 / 模型与会话 / 执行层 / 客户端与 API / 外围与扩展。

**总评：** 工程质量显著高于平均水平；性能余量集中于单一主题——热路径上的重复深拷贝与重复重建（约 60% 的性能发现），修复局部化、不需动架构。设计债集中在四处（God 文件、5 张 WeakMap、provider 三份生命周期、LLM 错误映射双口径）。

## 工单索引（依赖拓扑序）

| # | 工单 | 类型 | 阻塞于 |
|---|------|------|--------|
| 01 | tools-view-generation-cache | 性能·高 | 无 |
| 02 | canonical-result-snapshot-shortcircuit | 性能·高 | 无 |
| 03 | delta-persistence-zero-copy | 性能·高 | 无 |
| 04 | pty-scrollback-ring-buffer | 性能·高 | 无 |
| 05 | prompt-assembly-memoization | 性能·中 | 无 |
| 06 | session-events-cursor-api | 性能·中 | 无 |
| 07 | session-resume-ownership-transfer | 性能·中 | 无 |
| 08 | token-meter-incremental-pricing | 性能·中 | 无 |
| 09 | windows-taskkill-async | 性能·中 | 无 |
| 10 | fs-list-directory-parallel | 性能·中 | 无 |
| 11 | store-persistence-raf-batch | 性能·中 | 无 |
| 12 | chat-list-windowing | 性能·中 | 无 |
| 13 | schedule-incremental-fold | 性能·中 | 无 |
| 14 | low-severity-cleanup-batch | 性能·低 | 无 |
| 15 | execution-state-consolidation | 设计·中 | 01, 02 |
| 16 | tools-module-split | 设计·中 | 15 |
| 17 | llm-error-normalization | 设计·中 | 无 |
| 18 | subagent-provider-lifecycle-dedup | 设计·中 | 无 |

## 建议推进顺序

1. **第一批（同主题收敛）**：01 → 02 → 15 → 16。四个工单都在 core/tools 一带，串行做避免冲突；01/02/15 完成后"重复克隆 + 状态分散"两大主题一次清掉。
2. **第二批（独立热点，可并行认领）**：03、04、05、07、08。其中 03（delta 零拷贝）收益最大。
3. **第三批**：06、09、10、11、12、13、14、17、18——互相独立，按需认领。
4. 客户端区（11、12）建议先用仓库自带 `vitest.web.perf.config.ts` / `BENCHMARK.md` 建立基线再动手。

## 决策记录

- 拆解粒度询问用户未获响应，按推荐方案（18 张：13 独立性能 + 1 低严重度批 + 4 设计债）发布；工单为本地 markdown，随时可合并/拆分。
- 低严重度发现合并为 14 号清理批（逐项拆单不值得上下文成本），要求每项独立 commit 可回滚。
- wire 协议版本协商（低）、ChatNodeSeat 职责收敛（低）、workflow 四标志状态合并（低）、deadline 归属下沉（低）等设计项未立单——价值/成本比偏低，若要推进可追加。
- 工单内引用保留到包/文件级路径、不含行号（行号随 commit 漂移）；精确行号证据见 `report.html`。
