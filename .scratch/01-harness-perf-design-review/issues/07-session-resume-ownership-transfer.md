# 会话恢复路径 ownership-transfer 零拷贝

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** 会话恢复（resume）零拷贝：persistence 层不再对整个 log `structuredClone` 一遍后再被 Session 构造器逐事件 snapshot，统一走 core/session 已有的 `seedSource:'persistence'` / ownership-transfer 机制。对用户可感知：大会话的 resume 时间明显缩短；恢复后的会话内容、deep-frozen 语义、派生消息共享行为不变。

**验收标准：**

- [ ] resume 路径无全量 structuredClone（代码审计 + 计数断言）
- [ ] 恢复后 deriveMessages/requestHeader 输出与旧实现一致（快照测试）
- [ ] 恢复后日志为 deep-frozen 且派生消息可安全共享（现有不变量测试全绿）
- [ ] 恢复中途失败不留半初始化会话（错误路径测试）

## 评论

## 评论

- **关键澄清**：coordinator 的真正 resume 路径（prepareCore）**已经是零拷贝**——backend 独占图经 `adoptStoredEvents` 原地升级 + `seedSource: 'persistence'` → `Session.fromRestore` 原地冻结；原审查报告所称「Session 构造器 seed 再逐事件 snapshot」不适用于 persistence 种子（mode restore 跳过 snapshot）。唯一冗余拷贝在**服务层 `prepare()`**：对 load() 结果逐事件 `structuredClone`。
- **实现**：服务层 `prepare()` 对「信封与 data 均冻结」的事件按引用转移所有权（fromRestore 的原地冻结对其为 no-op；load() 的三条路径产出的图均已冻结），未冻结回退克隆；meta 仍克隆（loadLiveSnapshot 可能返回 coordinator 持有的活跃 header 对象）。
- **测试**：tests/resume-zero-copy.spec.ts——冻结存储事件零克隆计数断言（structuredClone 间碟：存储事件对象从未被逐个克隆；backend 自身按契约产出新鲜图的那次克隆不计）+ 未冻结回退克隆 + restore-mode 会话继续追加并落盘（seq 连续）。回归：persistence 157 + core/session 287 + jsonl/sqlite 373 全绿，仓库级 typecheck 通过。
- **复审记录**：标准与 spec 均通过。已按审查意见补注释（浅冻结判定由 restore 全图深冻结自底向上闭合）、工单 05 勾选状态对齐、顺带的测试适配（delta-zero-copy/write-behind 的 chunk 事件 shape 与类型修正）在此补记。spec 审查确认共享冻结事件与活跃日志无可变别名（所有 load 路径产出图均冻结 + restore 深冻结兜底）。
