# schedule 增量 fold

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** schedule runtime 的 readFolded 支持增量 fold：缓存上次 fold 结果 + 游标，基于 seedLength 只消费新事件，driveOnce 单次 dispatch 内不再重复 fold 两遍。对用户可感知：常驻定时任务的 root agent 在长会话中每次唤醒的成本与事件日志长度解耦（现在每次 agent 活动触发的 requestDrive 都可能全量重放整条事件日志）。

**验收标准：**

- [ ] 增量 fold 结果与全量重放 fold 一致（属性/对比测试）
- [ ] 事件追加后仅新事件被消费（计数断言）
- [ ] driveOnce 单次 dispatch 内 fold 计算 ≤1 次（审计 + 测试）
- [ ] 定时任务的触发时机与守卫行为不变（现有测试全绿）

## 评论
