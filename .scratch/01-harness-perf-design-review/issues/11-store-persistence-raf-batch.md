# client store 持久化走 rAF 批量

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** client store 的 localStorage 持久化并入既有 rAF 批量通道：原 store 已有"一帧内 N 次变更合并 1 次通知"的 rafFlush，但持久化监听绕过它挂在原始 store 上，每次 setState 同步全量 `JSON.stringify` + `localStorage.setItem`。改为持久化也走 rafBatch（或 idle 回写），一帧内多次 setState 只写盘一次。对用户可感知：UI 高频更新时掉帧减少；刷新/崩溃后状态恢复不丢已确认的更新。

**验收标准：**

- [x] 一帧内 N 次 setState 只触发 1 次 localStorage 写（计数断言）
- [x] flush:'raf' 订阅者通知语义不受影响（现有测试全绿）
- [x] 页面隐藏/卸载前仍有最终写盘（visibility/unload 路径覆盖）
- [x] 大状态下的序列化不再出现在每帧热路径（性能剖析记录）

## 评论

**实现（2026-08-29）**：持久化写盘并入帧通道（按 key 的 pending 注册表，一帧一写）；隐藏页同步写；共享的 visibilitychange/pagehide 监听对（pagehide 而非移动端不可靠的 unload）冲刷残留；同 key 实例创建先落地 pending 写再重水化（消除陈值窗口）；clearPersisted 先丢弃 pending 写（消除掩埋作用域复活窗口，审查发现项）。调度原语抽 `nextFrame` 与通知通道共享，flush:'raf' 通知语义不动。

**性能剖析**（node 微基准，~145KB 状态，60 次更新）：旧 60 写 / 28.4ms → 新 1 写 / 0.5ms（`.temp/scripts/bench-store-persist.mjs`）。

**偏差声明**：验收原文"unload 路径"实现为 pagehide（现代替代，unload 在移动端不可靠），已记录于 Agent Note。既有断言同步持久化的测试改为 waitFor 落定后读取；workspace 视图 store 种子改为显式重置全部持久化字段（种子实例可能重水化上一测试的 pending 写）。

验收：store 套件 23 测试全绿；client 全车道 3740 测试全绿；typecheck 通过。Agent Note：`.agents/notes/implemented/feature/2026-08-29-store-persistence-frame-batch.*`。
