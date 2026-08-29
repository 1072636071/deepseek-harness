# subagent provider 生命周期骨架收敛（三份合一）

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** 三个 out-of-process subagent provider（acp / claude-code / codex）各自平行实现的"一次性子代理生命周期"骨架——failureDiagnostic、Startup/RunFailure 类型、dispose 阶梯（EOF grace → terminate → tree join）、textTask、grace 常量——抽取为共享 helper；provider 只声明 wire 协议与失败分类表。三份拷贝收敛为一份，dispose 语义改动只落一处（windowsProcessTree 已用 jscpd:ignore 承认镜像，重复感知已存在，此单把它收敛掉）。

**验收标准：**

- [x] 三个 provider 的 dispose 阶梯行为与改造前一致（各 provider 集成测试全绿）
- [x] grace 常量等配置单一来源
- [x] 退出清理路径（正常结束 / 启动失败 / 中途抛错 / 超时）行为逐一对齐旧实现（对比测试）
- [x] 新增 provider 的生命周期代码量显著下降（以模板或文档验证）

## 评论

**实现（2026-08-29）**：dsh-subagent 新增 `provider-lifecycle.ts`（经 @deepseek-ai/dsh-subagent 导出，新增 @deepseek-ai/dsh-subprocess peer 依赖）：DEFAULT_DISPOSE_EOF_GRACE_MS / DEFAULT_DISPOSE_GRACE_MS 单一来源（三 provider 转发导出）；providerTextTask 共享校验（claude join / codex 数组两种门面）；providerFailureDiagnostic 固定事实渲染器（各 provider 分类表映射事实形状，跨 provider 字符串契约测试逐字钉住三种历史格式）；ProviderRunFailure<Facts> 失败基类（三类收缩为构造器）；childExitsWithin + disposeProviderChild 处置阶梯（acp 全量含 EOF 宽限层，codex 以 endStdin 使用并保留 outcome 旁路）。

**偏差声明**：claude-code 的 dispose 阶梯保留自身形态——须先关 SDK Query、不关 SDK 持有的 stdin、聚合收集失败而非首错即抛，折进抛错式共享阶梯会改变清理顺序与失败聚合；其常量/校验/渲染器/基类已收敛。三处行为中性差异：acp 的 stdin.end 加并发关闭防护（原无防护，可能在 terminate 前中断阶梯）；acp/codex 阶梯返回最终 outcome（原先丢弃）；codex 的最终 `await child.done` 由 try 外折进 try（正 pid 下 done 理论不拒绝，仅 teardown 包装路径的理论扩展）。

**模板验证**：新 provider 的生命周期代码 = 协议驱动器 + 失败分类表；常量/校验/渲染/基类/阶梯全部继承（provider run.ts 净缩约 90 行）。子代理车道 795 测试全绿（含三 provider 处置阶梯集成套件 + 共享模块阶梯分支对比测试）。typecheck 通过。Agent Note：`.agents/notes/implemented/simplification/2026-08-29-subagent-provider-lifecycle-skeleton.*`。
