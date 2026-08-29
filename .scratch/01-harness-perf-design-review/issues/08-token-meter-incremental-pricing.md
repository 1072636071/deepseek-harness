# token-meter 增量定价缓存

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** token-meter 的 measure 不再每次全表面重定价并 `structuredClone` 整个测量结果：route 未变时按节点缓存定价，仅对 delta 增量计算；测量结构按需共享而非整树克隆。对用户可感知：长会话 compaction 一次事务内多次 measure 的累计成本线性下降，token 统计数值与压缩决策不变。

**验收标准：**

- [ ] 同一 route 连续 measure 不重复定价未变节点（计数断言）
- [ ] route 变更后立即反映新定价（测试覆盖）
- [ ] compaction stability check 依赖的 measure 数值与旧实现一致（对比测试）
- [ ] 测量结果消费方拿到的仍是不可变视图（现有测试全绿）

## 评论
