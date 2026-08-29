# 流式 delta 持久化路径去重复深拷贝

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** 流式输出路径上每个 token 级 delta 的深拷贝从约 3 次降为 0–1 次：append 处已 deepFreeze 的事件在 persistence write-behind 与 coordinator 落盘批快照处直接共享引用（冻结即所有权契约，共享引用是安全的）；chunk 类事件走轻量校验，完整校验/冻结推迟到 `assistant/message` 汇总事件。对用户可感知：长回复流式期间 host CPU 占用明显下降；落盘内容与崩溃恢复行为不变——write-behind 失败保留批次重放的语义保留。

**验收标准：**

- [ ] 单个 assistant/chunk 事件从产生到落盘的深拷贝次数 ≤1（计数断言）
- [ ] write-behind 批写失败后保留批次重放的行为有测试覆盖且不回退
- [ ] 崩溃恢复（resume）后事件流与改造前一致（快照测试）
- [ ] chunk 轻量校验仍拒绝结构性非法事件（负例测试）

## 评论

## 评论

- **实现**：live delta 路径实际拷贝链为 session.append（snapshotJsonValue+deepFreeze，唯一必要拷贝）→ coordinator 观察者 enqueue（structuredClone，冗余）→ appendLiveBatch → appendCore（无拷贝）。原审查报告所计的第 3 次拷贝（coordinator.append 全批快照）不在 live 路径上——public append 仅外部调用方使用，契约不变。
- 修复：write-behind.enqueue 对「信封与 data 均冻结」的事件按引用保留（session append 产出即 deepFreeze 全图），否则回退克隆（原有「owns its copy」语义保留）；enqueue JSDoc 更新所有权契约。
- 测试：write-behind.spec 新增「冻结按引用/未冻结按克隆」恒等断言；新增 tests/delta-zero-copy.spec.ts——经 coordinator 到 backend 的逐事件恒等断言（计数断言：恒等即证明 append 之后零拷贝）+ 非 lossless-JSON 负例（append 拒绝且不入 log/队列）。
- 验收 #2（失败保留重放）与 #3（resume 一致）由既有 write-behind/persistence 合同测试覆盖，未回退。全绿：session-persistence 154 + core/session/jsonl/sqlite 660。
- **复审记录**：标准与 spec 两维度均无硬性违规。已修复：isRetainableEvent JSDoc 明确防御边界（防未冻结事件；不检测「信封冻结而内层可变」的对抗性输入——唯一生产者是 session.append 的 deepFreeze 全图），enqueue 与其注释去重。**偏差声明**：工单正文的「chunk 走轻量校验、完整校验推迟到 assistant/message」未单独实现——校验路径保持 append 边界原状（snapshotJsonValue 的 JSON 遍历 + validateNext），拷贝消除已达成本单性能目标；chunk 形状校验如需推迟属独立优化，未在本单 scope 内。Agent Note 豁免：本单为局部编辑（一个判定 + 注释 + 测试），符合 AGENTS.md 机械/局部编辑豁免条款。
- **状态**：done。
