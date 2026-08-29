# 会话恢复路径 ownership-transfer 零拷贝

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** 会话恢复（resume）零拷贝：persistence 层不再对整个 log `structuredClone` 一遍后再被 Session 构造器逐事件 snapshot，统一走 core/session 已有的 `seedSource:'persistence'` / ownership-transfer 机制。对用户可感知：大会话的 resume 时间明显缩短；恢复后的会话内容、deep-frozen 语义、派生消息共享行为不变。

**验收标准：**

- [ ] resume 路径无全量 structuredClone（代码审计 + 计数断言）
- [ ] 恢复后 deriveMessages/requestHeader 输出与旧实现一致（快照测试）
- [ ] 恢复后日志为 deep-frozen 且派生消息可安全共享（现有不变量测试全绿）
- [ ] 恢复中途失败不留半初始化会话（错误路径测试）

## 评论
