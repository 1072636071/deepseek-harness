# Agent Note：低严重度热点清理（六项）

Status: implemented

[English](2026-08-29-low-severity-hotspot-cleanups.md) | 中文

## 问题

来自性能/设计审查的六个低严重度热点，每一项都是重复或超规模的计算，且不带来任何行为收益：

- `grep` 对一条被截断的结果最多重建三次逐行 preview retainer（render、presentationMeta、spill 后处理各一次）。
- `fork` 为了跑一次 `findLast` 找回合分隔事件，先整段复制事件前缀。
- 持久化前缀守卫对每个事件做两次 `JSON.stringify` 序列化比较——即使两个事件是同一冻结对象、或只在 O(1) 字段上有差异。
- 创建会话的冲突探测用 `loadStored`——完整解析事件日志——回答一个 `readStoredRevision` 本就能回答的存在性问题。
- repeat-tool 守卫做了两次 stringify：先对规范参数，再对包着它的 `[name, canonical]` key 数组。
- gateway 流多路复用为每个逻辑帧写一条 WebSocket 帧并逐帧 await；并发的多个流无法共享一次物理写。

## 决策

- **grep retention**：按 canonical match 数组身份记忆化，一次 `retainGrepMatches` 由 render、meta、spill 投影共享（工具运行时对发布的值深度冻结，caps 每插件实例固定）。
- **fork**：从边界反向扫描找最后一个回合分隔事件——找到同一事件，不再复制前缀。
- **前缀守卫**：分层比较——对象恒等，然后廉价的 seq/type/time 字段，然后按引用或浅结构比较 surface 元数据（`sourceEventSeqs`/`surfaceOp`），只有存活的候选才落到 stringify 深比较。stringify 回退不变，碰撞守卫不会比之前接受得更宽。
- **冲突探测**：`readStoredRevision`（两个后端均已实现；缺失即 `undefined`）替代全量 `loadStored` 存在性探测。
- **reminder key**：`name + NUL + canonical`——因 `JSON.stringify` 会转义裸 NUL 而保持单射——替代第二次 stringify。
- **gateway 批量**：同一次 flush 微任务前排队的帧合并为一条物理消息（`{type:'batch',frames:[...]}`，每个成员是预序列化的帧文本，因此无法序列化的帧仍只拒绝自己的流）。单帧保持裸帧格式。pump 仍逐项 await 自己帧所在批次的物理写，所以逐源背压与跨流顺序不变。协议两侧同包发布。

## 曾考虑的替代方案

**缓存 seed 事件的序列化结果。** 拒绝：守卫只在 adopt/claim 时运行，不是热循环；分层短路以零缓存失效面达到同样的拒绝效果。

**把深比较并入纯浅比较。** 直接拒绝：漏检嵌套分歧的碰撞守卫会错误收养不匹配的日志——语义优先于微基准。

**不改 wire 协议的合并。** 做不到：一次 `ws.send` 只携带一条消息，合并必须有双方都理解的信封。

## 后果

被截断的 grep 结果、fork、会话收养、并发远程流都不再为重复计算付费。每项独立 commit 便于单独回滚。测试逐项钉住不变性（retention 单次计数、长尾后的回合分隔、不同对象同内容收养 vs surface 元数据分歧拒绝、revision 钩子探测审计、跨工具与含 NUL 参数的 chain key、batch 合并与成员校验）。一处 wire 协议新增：会批量发送的 host 需要能解包 batch 的 client——host 与 client bundle 同一安装发布，成对升级。
