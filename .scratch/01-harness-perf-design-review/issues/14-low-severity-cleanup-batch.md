# 低严重度热点清理批（6 项）

**Status:** ready-for-agent
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
