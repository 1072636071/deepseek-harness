# 流式 delta 持久化路径去重复深拷贝

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** 流式输出路径上每个 token 级 delta 的深拷贝从约 3 次降为 0–1 次：append 处已 deepFreeze 的事件在 persistence write-behind 与 coordinator 落盘批快照处直接共享引用（冻结即所有权契约，共享引用是安全的）；chunk 类事件走轻量校验，完整校验/冻结推迟到 `assistant/message` 汇总事件。对用户可感知：长回复流式期间 host CPU 占用明显下降；落盘内容与崩溃恢复行为不变——write-behind 失败保留批次重放的语义保留。

**验收标准：**

- [ ] 单个 assistant/chunk 事件从产生到落盘的深拷贝次数 ≤1（计数断言）
- [ ] write-behind 批写失败后保留批次重放的行为有测试覆盖且不回退
- [ ] 崩溃恢复（resume）后事件流与改造前一致（快照测试）
- [ ] chunk 轻量校验仍拒绝结构性非法事件（负例测试）

## 评论
