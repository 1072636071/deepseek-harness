# 低严重度热点清理批（6 项）

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** 六项低严重度热点一次清理，每项独立 commit、独立可回滚：

1. **grep 渲染 retention 复用**：render 与 presentationMeta 各自调用一次 retainGrepMatches（每次对全部 match 重建 TextRetainer 逐行 preview）——保留一次结果传递共享。
2. **fork seed 反向扫描**：session `_forkSeed` 从 boundary 反向扫描定位 seed 边界，替代全量 slice + findLast。
3. **seedCoversPrefix 浅比较**：HMR/收养路径的前缀比对用引用相等 / seq + 浅结构比较，替代逐事件两次 JSON.stringify。
4. **冲突探测轻量化**：创建会话的存在性检查改用已有的 readStoredRevision 轻量钩子，不再 loadStored 全量解析。
5. **repeat-tool-reminder 单次 stringify**：canonical 与 key 两次 JSON.stringify 合并为一次。
6. **gateway 流帧合并**：stream-server 同一 tick 的多帧合并发送，减少逐条 await 的写放大（保留既有背压语义）。

对用户可感知：均为内部效率修复，无行为变化。

**验收标准：**

- [ ] 六项各自有行为不变的对比测试或审计断言
- [ ] 相关测试全绿，无一项改变对外语义
- [ ] 每项一个独立 commit，便于单独回滚

## 评论

**实现（2026-08-29）**：六项全部完成，每项独立 commit。

1. **grep retention 复用**：`retainOnce` 按 canonical match 数组身份 WeakMap 记忆化，render/presentationMeta/spill 后处理共享一次 retention（运行时 deep-freeze 发布值 + caps 每插件固定，前提已在注释声明）。
2. **fork seed 反向扫描**：`_forkSeed` 从 boundary 反向找最后一个回合分隔事件，不再整段 slice + findLast。
3. **seedCoversPrefix 分层比较**：恒等快路 → seq/type/time 廉价比对 → surface 元数据（sourceEventSeqs/surfaceOp）引用/浅比较 → 仅存活者落 stringify 深比较。**偏差声明**：工单原文"浅比较替代 stringify"会弱化碰撞守卫（嵌套 data 分歧漏检），实现保留 stringify 回退以保证语义严格不变；审查确认采纳。
4. **冲突探测轻量化**：`createCore` 改用 `readStoredRevision`（两后端均实现，缺失即 undefined，语义等价）。
5. **repeat-tool-reminder 单次 stringify**：key 改 `name + NUL + canonical`（JSON.stringify 转义裸 NUL，单射），省去第二次 stringify。
6. **gateway 流帧合并**：新增 `batch` wire 帧（成员为预序列化帧文本，单帧序列化失败只影响自己）；同一 flush 微任务排水的帧合并一条物理消息，单帧保持裸格式；pump 逐项 await 物理写，背压与跨流顺序不变。**偏差声明**：这需要协议新增消息类型，host 与 client 同包发布成对升级；审查确认采纳。

验收：六项各自的行为不变测试均已落地（retention 单次 spy 断言、长尾回合分隔、同内容异对象收养 vs surface 元数据分歧拒绝、revision 钩子探测审计、跨工具/含 NUL 参数 chain key、batch 合并与成员校验）；受影响套件全绿（gateway 28、persistence 121、fork 15、reminder 20+、tools 108、presentation 18）；typecheck 通过。审查（标准+spec 双维度）两轮通过；Agent Note：`.agents/notes/implemented/simplification/2026-08-29-low-severity-hotspot-cleanups.*`。
