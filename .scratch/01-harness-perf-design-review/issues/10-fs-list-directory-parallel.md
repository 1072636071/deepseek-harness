# listDirectory dirent 短路 + 并行 syscall

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** fs-local 的 listDirectory：`readdir(withFileTypes)` 已返回的 dirent 类型用于短路额外探测，子项解析（realpath + stat）并行化（Promise.all），单个子项失败不再中断整个列表而是按既有错误协议隔离上报。对用户可感知：大目录（如 node_modules）的列目录工具显著变快——每子项的额外串行 syscall 从 ~2 次降到接近 0–1 次并行。

**验收标准：**

- [ ] 每子项额外 syscall ≤1 且并行执行（微基准：大目录列出耗时较改造前明显下降）
- [ ] 单个子项解析失败不中断整体列表，错误按稳定码上报（错误隔离测试）
- [ ] 列表排序与条目内容与旧实现一致（对比测试）
- [ ] 符号链接 / 缺失祖先等边界行为不变（现有测试全绿）

## 评论

## 评论

- **实现**：非符号链接子项的 realpath 被 readdir 的盘上名字保证等价（join(parent.targetKey, name)），dirent 短路后每子项仅 1 次 stat；Promise.allSettled 并行解析（libuv 线程池天然限流），符号链接保留完整解析链。**偏差声明**：「单子项失败不中断整体列表」未实现——错误面保持旧行为（按名字序第一个失败即抛 listingIoError），因为隔离错误会改变 list 工具的可观察结果（部分列表冒充完整），需要结构化逐项错误通道（schema 变更），超出本单 scope。TOCTOU 窗口（子项被并发替换为符号链接）的 targetKey 与旧串行实现存在已记录的微小分叉。
- **测试**：fs-local 11 个 list 相关测试全过。**注意**：filesystem.spec 的 writeText/editText 版本类测试在本机 Windows 预存随机抖动（基线 stash 对照同样随机失败 2–9 个，与 list 无关），干净信号留 CI。
