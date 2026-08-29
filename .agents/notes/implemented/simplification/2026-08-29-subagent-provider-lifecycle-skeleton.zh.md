# Agent Note：子代理 provider 生命周期骨架收敛

Status: implemented

[English](2026-08-29-subagent-provider-lifecycle-skeleton.md) | 中文

## 问题

三个出进程子代理 provider（acp、claude-code、codex）各自私有一份相同的生命周期家具：处置宽限常量、一次性文本任务校验、固定事实失败诊断渲染器、provider 失败 Error 类，以及（三者中的两个）stdin EOF → terminate → 树join 处置阶梯。重复已在树内被 claude-code run.ts 的 `jscpd:ignore` 承认。对其中任何一块做语义修改——例如处置阶梯——都要改三处、证明三遍。

## 决策

`packages/subagent/subagent/src/provider-lifecycle.ts`（经 `@deepseek-ai/dsh-subagent` 导出）现在是单一来源：

- `DEFAULT_DISPOSE_EOF_GRACE_MS` / `DEFAULT_DISPOSE_GRACE_MS` —— 三个 provider 转发导出，配置默认值与测试读到同一份定义。
- `providerTextTask(prompt, pkg)` —— 完全相同的 text-only/非空校验加调用方包前缀；claude-code join 结果，codex 保留数组。
- `providerFailureDiagnostic({label, subject, fields})` —— 固定事实渲染器；各 provider 的分类表把自己的事实形状（ACP 的 stop reason、Codex 的 HTTP status）映射到有序字段。跨 provider 字符串契约测试逐字钉住三种历史诊断格式。
- `ProviderRunFailure<Facts>` —— 承载包前缀、诊断、结构化事实与可选 cause 的基础 Error；三个 provider 类收缩为"事实 → 字段"映射的构造器。
- `childExitsWithin` + `disposeProviderChild(child, {endStdin, eofGraceMs})` —— 共享处置阶梯。acp 全量使用（含 stdin EOF 宽限层）；codex 以 `endStdin` 使用并保留预登记的 outcome 旁路通道，用于在 teardown 失败里引用退出事实；失败原样上抛，由 provider 包上自己的失败类型。

claude-code 的 `disposeClaudeCodeChild` 保留自身形态（偏差声明）：它必须先关闭 SDK Query、从不关闭子进程 stdin（SDK 持有）、并把 query 关闭与 join 失败聚合进一个 AggregateError 包裹的失败——折进会抛错的共享阶梯会改变其清理顺序与失败聚合。

## 曾考虑的替代方案

**三者完全统一的 dispose。** 拒绝：claude-code 的阶梯结构不同（SDK 持有 stdin、失败收集而非首错即抛）；为迁就它给阶梯加三种条件模式，比重复更复杂。

**新建包放共享模块。** 拒绝：dsh-subagent 已拥有 settlement 与 run handle；对 subprocess seam 加一条 peer 依赖比新包便宜。

**共享启动回滚路径。** 暂缓：各 SDK 的启动失败面（ACP 的竞速臂、Claude Code 的捕获回调、Codex 的 wire/进程失败 promise）确实不同；上文共享的家具才是真正相同的部分。

## 后果

新的出进程 provider 继承宽限常量、任务校验、诊断渲染、失败基类与处置阶梯——其生命周期代码只剩协议驱动器加一张失败分类表（三个 provider run.ts 净缩约 90 行）。两处行为中性差异已声明：acp 的 `stdin.end()` 现在对并发关闭的 stdin 加防护（原先是无防护调用，可能令阶梯在 terminate 前中断）；acp/codex 阶梯现在返回最终退出 outcome 而非丢弃。子代理车道 795 测试全绿，含各 provider 的处置阶梯集成套件。
