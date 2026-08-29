# PTY scrollback 环形缓冲（消除 O(n²) 输出泵）

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** terminal-bash 的 BoundedTextBuffer 从"每 chunk 全量 split + `Array.from` 全量码点扫描"改为按行索引的环形缓冲；utf8Tail 改为从尾部按字节回退定位 UTF-8 边界。scrollback 上限（默认 4MB）内的 append 从 O(cap) 降为 O(chunk)。对用户可感知：构建类命令高速刷屏时输出不再拖慢 agent 循环——这是全库唯一真正的 O(n²) 热点；scrollback 的尾部截断与 UTF-8 多字节边界行为与之前一致。

**验收标准：**

- [ ] 持续高速输出压力下 append 吞吐不随缓冲水位下降（微基准，证明无 O(cap) 扫描）
- [ ] 多字节 UTF-8 字符跨 chunk 边界时截断不撕裂（固定用例或属性测试）
- [ ] 行边界与尾部窗口语义与旧实现输出一致（对比测试）
- [ ] 配置的 scrollback 上限语义不变（有界性测试）

## 评论
