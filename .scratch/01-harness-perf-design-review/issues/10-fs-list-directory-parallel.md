# listDirectory dirent 短路 + 并行 syscall

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** fs-local 的 listDirectory：`readdir(withFileTypes)` 已返回的 dirent 类型用于短路额外探测，子项解析（realpath + stat）并行化（Promise.all），单个子项失败不再中断整个列表而是按既有错误协议隔离上报。对用户可感知：大目录（如 node_modules）的列目录工具显著变快——每子项的额外串行 syscall 从 ~2 次降到接近 0–1 次并行。

**验收标准：**

- [ ] 每子项额外 syscall ≤1 且并行执行（微基准：大目录列出耗时较改造前明显下降）
- [ ] 单个子项解析失败不中断整体列表，错误按稳定码上报（错误隔离测试）
- [ ] 列表排序与条目内容与旧实现一致（对比测试）
- [ ] 符号链接 / 缺失祖先等边界行为不变（现有测试全绿）

## 评论
