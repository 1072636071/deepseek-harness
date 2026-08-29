# client store 持久化走 rAF 批量

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** client store 的 localStorage 持久化并入既有 rAF 批量通道：原 store 已有"一帧内 N 次变更合并 1 次通知"的 rafFlush，但持久化监听绕过它挂在原始 store 上，每次 setState 同步全量 `JSON.stringify` + `localStorage.setItem`。改为持久化也走 rafBatch（或 idle 回写），一帧内多次 setState 只写盘一次。对用户可感知：UI 高频更新时掉帧减少；刷新/崩溃后状态恢复不丢已确认的更新。

**验收标准：**

- [ ] 一帧内 N 次 setState 只触发 1 次 localStorage 写（计数断言）
- [ ] flush:'raf' 订阅者通知语义不受影响（现有测试全绿）
- [ ] 页面隐藏/卸载前仍有最终写盘（visibility/unload 路径覆盖）
- [ ] 大状态下的序列化不再出现在每帧热路径（性能剖析记录）

## 评论
