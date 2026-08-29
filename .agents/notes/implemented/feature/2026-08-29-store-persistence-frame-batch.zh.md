# Agent Note：store 持久化写盘并入帧通道

Status: implemented

[English](2026-08-29-store-persistence-frame-batch.md) | 中文

## 问题

每个开启持久化的 snapshot store 都直接订阅原始 zustand api，每次 `setState` 同步付出一次完整 `JSON.stringify` + `localStorage.setItem`。UI 热路径（拖拽排序、往持久化草稿里输入）中一帧可能携带几十次大状态树的写盘，而已有的订阅通知 rAF 批量对存储毫无帮助。

## 决策

写盘改走按 key 的 pending 注册表：一帧内第一次变更登记写盘，帧末以最终状态落一次 `setItem`；同帧后续变更被吸收。隐藏标签页不会绘制，因此其中的变更加同步落盘；一对模块级共享的 `visibilitychange`/`pagehide` 监听（`pagehide` 而非移动端不可靠的 `unload`）在刷新/关闭前冲刷所有未落写盘。同 key 实例创建时若存在 pending 写，先把它落地——同 key 重挂载重水化到的是最新状态而非帧前值。`clearPersisted` 先丢弃 pending 写再删 key，被掩埋的会话作用域无法借已排队的帧写复活。调度原语与通知通道共享（`nextFrame`），`flush: 'raf'` 的通知语义不动。

## 曾考虑的替代方案

**zustand persist 中间件。** 沿用原手工实现的拒绝理由：其 `partialize({ ...get() })` 会把原始类型状态爆炸成索引键。

**空闲期回写（`requestIdleCallback`）。** 暂缓：会拉宽崩溃丢失窗口并引入第二套调度机制；帧通道已把序列化挪出输入路径。日后可无契约变更地叠加。

**保留每实例监听。** 拒绝：全局 document 监听会钉住每实例闭包直到页面关闭；按 key 注册表只在一个写盘落地前持有它。

## 后果

每帧存储成本从 O(setState 次数 × 状态大小) 降到 O(1 次写)。断言同步持久化的测试改为 `waitFor` 落定后再读存储；workspace 视图 store 的种子重置全部持久化字段（种子实例可能重水化上一测试的 pending 写）。微基准（node，约 145 KB 状态，60 次更新）：60 写 / 28.4 ms → 1 写 / 0.5 ms。可观察语义：持久化帧级延迟（帧内崩溃丢该帧写盘；隐藏/卸载冲刷关闭刷新窗口），同帧内同 key 实例创建读到新值而非陈值。
