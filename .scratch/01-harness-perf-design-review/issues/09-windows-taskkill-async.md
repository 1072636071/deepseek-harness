# Windows taskkill 终止路径异步化

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** Windows 进程树终止不再用同步 `spawnSync('taskkill')` 阻塞事件循环：改异步 spawn（fire-and-forget 或可等待），或复用 win32-process 已有的 FFI `TerminateProcess` 路径。终止语义不变：SIGTERM→SIGKILL 阶梯、grace 窗口、进程树（含子进程）覆盖。对用户可感知：多 agent / 多后台任务并发取消（超时、abort、teardown）时，不再出现所有工具执行被同步 taskkill 串行卡顿数十至上百毫秒。

**验收标准：**

- [ ] terminate() 路径上事件循环无同步 spawn（代码审计 + 测试）
- [ ] Windows 下进程树仍被完整终止（含子进程的集成测试）
- [ ] 超时 / abort / teardown 各触发路径的取消语义不变（现有测试全绿）
- [ ] 非 Windows 平台路径不受影响

## 评论
