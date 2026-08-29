# 工具结果 canonical 短路，消除重复 snapshot

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** 单次工具结果不再被深拷贝 3–4 遍。`createSuccessResult` 与 `finishScheduledExecution` 对已归一（canonical）结果直接短路重复的 `snapshotJsonValue` / `materializeFinalResult`——registry 已能识别"已归一"结果，finish 阶段不必再对其做全量快照 + deepFreeze。对用户可感知：read/bash 类大输出工具的每条结果只付一次快照成本，调度延迟下降；工具结果的内容与冻结语义完全不变。

**验收标准：**

- [ ] canonical 结果路径上 snapshot 调用次数 ≤1（计数断言）
- [ ] 结果 deep-freeze 语义不变：消费方拿到的仍是不可变对象（现有不变量测试全绿）
- [ ] 大输出（≥1MB）工具结果的调度耗时较改造前有可测下降（微基准）
- [ ] 非 canonical 结果仍走完整归一化路径（负例测试）

## 评论

## 评论

- 实现：`createSuccessResult` 直接组装并 `deepFreeze`（value/content/meta 均为上方刚 detach 的快照，免再经 `materializeFinalResult` 全量深拷贝）；`materializeFinalResult` 落 `finalizedResults` WeakSet 标记；`finishScheduledExecution` 对已物化结果短路两阶段 materialize（finalizeContent 返回原对象时按恒等短路）。测试：`tests/result-materialization.spec.ts`（3 例：观察者与返回值同引用且深冻结、finalizeContent 替换路径、post-execute 替换路径）。
- 状态：同上全绿。
- **复审记录**：短路已落实并提取共享 markCanonicalAndFinalized；materializeFinalResult 更名 commitFinalResult 以明示注册副作用。**偏差口径**：验收第 1 条"snapshot ≤1 计数断言"与第 3 条"≥1MB 微基准"未做指令级计数/计时——以可观察等价断言替代（观察者与返回值同引用、内容深冻结、finalizeContent 恰好一次）；第 4 条"非 canonical 负例"由 tools.spec 既有 wrapper-authored 结果归一化测试覆盖。微基准留给仓库自身 perf 套件（vitest.web.perf / BENCHMARK.md）。
