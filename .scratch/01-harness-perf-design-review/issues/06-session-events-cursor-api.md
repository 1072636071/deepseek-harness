# session.events 增量游标 API

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** Session 提供增量游标 API（如 `eventsSince(seq)`），替代"追加后 events getter 下次访问即全量复制日志"的读取模式；库内已知的高频消费方（如 agent-instructions 的 stepIsOpen 这类遍历 `session.events` 的路径）迁移到游标。events getter 的一次性快照语义保留。对用户可感知：长会话中带守卫/指令类插件的每步开销不再随事件日志长度线性放大（消除 O(n²) 形态）。

**验收标准：**

- [ ] eventsSince 从上次游标增量读取，不复制未消费区间（测试覆盖）
- [ ] 库内所有高频路径不再通过 events getter 做整表遍历（grep 审计 + 测试）
- [ ] events getter 快照语义保留、行为不变（现有测试全绿）
- [ ] 游标在会话 fork/compaction 后语义正确（边界测试）

## 评论
