# schedule 增量 fold

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** schedule runtime 的 readFolded 支持增量 fold：缓存上次 fold 结果 + 游标，基于 seedLength 只消费新事件，driveOnce 单次 dispatch 内不再重复 fold 两遍。对用户可感知：常驻定时任务的 root agent 在长会话中每次唤醒的成本与事件日志长度解耦（现在每次 agent 活动触发的 requestDrive 都可能全量重放整条事件日志）。

**验收标准：**

- [ ] 增量 fold 结果与全量重放 fold 一致（属性/对比测试）
- [ ] 事件追加后仅新事件被消费（计数断言）
- [ ] driveOnce 单次 dispatch 内 fold 计算 ≤1 次（审计 + 测试）
- [ ] 定时任务的触发时机与守卫行为不变（现有测试全绿）

## 评论

## 评论

- **实现**：domain.ts 折叠内核抽取为 emptyScheduleFold / applyScheduleEvents / snapshotScheduleFold（与全量 foldScheduleEvents 共享同一逐事件校验，增量状态与全量重放不可区分）；runtime.ts 维护 foldCache（seedLength + seq + 累加器），每次唤醒只折叠新增事件，preflight+claim 的两次 fold 不再全量重放；日志缩短/换种（seq 回退或 seedLength 变化）回退全量重折叠；损坏流保持旧行为（faulted + 每次调用告警）。
- **测试**：tests/domain.spec.ts 新增增量=全量等价（4 种分块边界逐快照对拍）+ seed 边界语义（种子内 id 对折叠不可见）。schedule 133 全绿。- **复审记录**：applyScheduleEvents 与原逐事件逻辑经审查逐行等价；按审查意见补记：foldCache 的续折前提是「runtime 绑定单一会话、日志替换必改 seedLength」（runtime 的 agent 绑定提供此前提，已写入 JSDoc）；seq 回退/seedLength 变化/损坏重置三条 runtime 路径靠 domain 层等价对拍与既有 runtime 套件覆盖。Agent Note 见 .agents/notes/implemented/simplification/2026-08-29-hot-path-eliminations-terminal-fs-schedule-session 三件套。
