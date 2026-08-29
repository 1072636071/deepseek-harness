# subagent provider 生命周期骨架收敛（三份合一）

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** 三个 out-of-process subagent provider（acp / claude-code / codex）各自平行实现的"一次性子代理生命周期"骨架——failureDiagnostic、Startup/RunFailure 类型、dispose 阶梯（EOF grace → terminate → tree join）、textTask、grace 常量——抽取为共享 helper；provider 只声明 wire 协议与失败分类表。三份拷贝收敛为一份，dispose 语义改动只落一处（windowsProcessTree 已用 jscpd:ignore 承认镜像，重复感知已存在，此单把它收敛掉）。

**验收标准：**

- [ ] 三个 provider 的 dispose 阶梯行为与改造前一致（各 provider 集成测试全绿）
- [ ] grace 常量等配置单一来源
- [ ] 退出清理路径（正常结束 / 启动失败 / 中途抛错 / 超时）行为逐一对齐旧实现（对比测试）
- [ ] 新增 provider 的生命周期代码量显著下降（以模板或文档验证）

## 评论
