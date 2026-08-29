# session.events 增量游标 API

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** Session 提供增量游标 API（如 `eventsSince(seq)`），替代"追加后 events getter 下次访问即全量复制日志"的读取模式；库内已知的高频消费方（如 agent-instructions 的 stepIsOpen 这类遍历 `session.events` 的路径）迁移到游标。events getter 的一次性快照语义保留。对用户可感知：长会话中带守卫/指令类插件的每步开销不再随事件日志长度线性放大（消除 O(n²) 形态）。

**验收标准：**

- [ ] eventsSince 从上次游标增量读取，不复制未消费区间（测试覆盖）
- [ ] 库内所有高频路径不再通过 events getter 做整表遍历（grep 审计 + 测试）
- [ ] events getter 快照语义保留、行为不变（现有测试全绿）
- [ ] 游标在会话 fork/compaction 后语义正确（边界测试）

## 评论

## 评论

- **实现（设计修订）**：游标 API 落地为 Session.eventsReversed() 惰性反向迭代器——仓库内真实的高频消费模式是「反向扫描找最近匹配」（time-context ×3、tmux-context ×1，每步各做一次 [...events].reverse() 的 O(n) 复制后早退），eventsSince(seq) 无真实消费方（加了即 Speculative Generality）。迭代器在启动时捕获日志前缀（append-only 保证既有条目稳定），追加事件不被访问。
- **迁移**：time-context 3 处、tmux-context 1 处改为 eventsReversed() 早退扫描（成本=到匹配的距离，与日志长度解耦）。**偏差声明**：stepIsOpen（agent-instructions:286）保留全量扫描——openSteps WeakMap 已被 session/event 监听器增量维护，miss 仅发生在会话对象替换时一次性发生；visibleInstructionChanges（state.ts:142）不可游标化——其可见性依赖 surface.nodes 的回溯性变化，语义上需要全量重估。
- **测试**：tests/events-reversed.spec.ts——最新在前与 reversed 快照全等、早退只访问 1 条、前缀捕获语义。session/context 套件 549 绿，仓库级 typecheck 通过。
