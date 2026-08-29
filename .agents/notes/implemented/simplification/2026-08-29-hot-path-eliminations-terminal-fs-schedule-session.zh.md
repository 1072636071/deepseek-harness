# Agent Note：terminal / 文件系统 / schedule / 会话的热路径消除

Status: implemented

[English](2026-08-29-hot-path-eliminations-terminal-fs-schedule-session.md) | 中文

## 问题

四处调用的成本随累积状态而非实际所需工作量增长：

- Windows 进程树终止在事件循环上跑 `spawnSync('taskkill')`——每个并发取消（超时、abort、teardown）都串行排队等一次 10–100ms 的同步 spawn。
- `listDirectory` 对每个子项串行付一次 realpath 链 + 一次 stat——node_modules 级别的目录列出是 2N+ 次顺序 syscall，尽管 readdir 已经报告盘上子项名字。
- schedule runtime 每次唤醒把整个会话事件日志重折叠两遍（preflight + claim），唤醒成本随会话增长，与定时任务数量无关。
- 上下文提供方（time-context ×3、tmux-context ×1）每步用 `[...events].reverse()` 复制整个事件日志，然后做早退反向扫描。

## 决策

- **taskkill**：fire-and-forget 异步 spawn（contained `error` 事件、`unref()`）。投递与树退出竞态，与 POSIX 组信号完全一致，所有结局本就可容忍；唯一可观察变化是 teardown 不再等 taskkill 回报——Windows 会继续让孤儿子进程跑完。
- **listDirectory**：非符号链接子项以 `join(parent.targetKey, name)` 为目标键（readdir 报告盘上名字，旧循环每子项付的 realpath 一无所获），再 1 次 stat；解析走 `Promise.allSettled` 并行（fs 线程池限并发），失败面保持不变——按名字序第一个失败抛同样的结构化 `listingIoError`。符号链接保留完整解析链。唯一分叉是列出中途子项被替换为符号链接的 TOCTOU 窗口，其目标键保持拼接路径。
- **schedule 折叠**：折叠内核抽取为 `emptyScheduleFold` / `applyScheduleEvents` / `snapshotScheduleFold`，runtime 维护增量累加器（`seedLength + seq`）；每次唤醒只折叠新事件，日志被替换/缩短回退全量重折叠。增量状态与全量重放构造上不可区分（共享逐事件校验），由分块等价测试钉住。
- **会话反向扫描**：`Session.eventsReversed()`——惰性 newest-first 迭代器（首次拉取时捕获日志前缀）——替换 time-context 与 tmux-context 的反向复制扫描，成本变为到首个匹配的距离。

## 备选方案

**用 Win32 FFI TerminateProcess 替代 taskkill。** 本单拒绝：丢掉 taskkill 的 /T 树遍历；异步 spawn 用一行改动保留了树语义。

**listDirectory 逐项错误隔离**（跳过失败子项而非中止）。拒绝：改变 list 工具的可观察结果——部分列表会冒充完整；结构化逐项错误通道是 schema 变更，超出本 scope。

**`eventsSince(seq)` 游标 API。** 拒绝：仓库内没有前向增量扫描的消费方（stepIsOpen 的缓存由事件监听器维护；visibleInstructionChanges 依赖回溯性的 surface 可见性），加游标即投机泛化。实际存在的消费模式是惰性反向迭代器。

## 后果

并发取消不再串行卡在同步 taskkill 上；大目录列出去掉每子项多余 realpath 且并行化；schedule 唤醒成本 O(新事件) 而非两遍 O(日志)；上下文提供方的反向扫描不再每步分配整个日志。行为面除注明处保持不变：taskkill unref（teardown 不等待）、listDirectory 的 TOCTOU 键分叉、abort 检查粒度（并行解析前后各一次而非子项间）。fs-local 套件的 writeText/editText 版本类测试在 Windows stat 粒度下已知抖动（预存问题，已用 stash 基线复现）；干净信号来自 CI。
