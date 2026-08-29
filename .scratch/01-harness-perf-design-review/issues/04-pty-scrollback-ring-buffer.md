# PTY scrollback 环形缓冲（消除 O(n²) 输出泵）

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** terminal-bash 的 BoundedTextBuffer 从"每 chunk 全量 split + `Array.from` 全量码点扫描"改为按行索引的环形缓冲；utf8Tail 改为从尾部按字节回退定位 UTF-8 边界。scrollback 上限（默认 4MB）内的 append 从 O(cap) 降为 O(chunk)。对用户可感知：构建类命令高速刷屏时输出不再拖慢 agent 循环——这是全库唯一真正的 O(n²) 热点；scrollback 的尾部截断与 UTF-8 多字节边界行为与之前一致。

**验收标准：**

- [x] 持续高速输出压力下 append 吞吐不随缓冲水位下降（微基准，证明无 O(cap) 扫描）
- [x] 多字节 UTF-8 字符跨 chunk 边界时截断不撕裂（固定用例或属性测试）
- [x] 行边界与尾部窗口语义与旧实现输出一致（对比测试）
- [x] 配置的 scrollback 上限语义不变（有界性测试）

## 评论

- **实现**：BoundedTextBuffer 从整串 value 改为行 deque（lines + 逐行字节账本 lineBytes + totalBytes），append 为 O(chunk)（首个 piece 延续末行，其余 pushBack）；utf8Tail 改为尾部按字节回退逐码点扫描（成对代理项=4B、孤立代理项按 U+FFFD=3B，与 Buffer.byteLength 语义一致），成本正比于保留后缀。
- **语义精确性（关键发现）**：旧实现是对 `lines.join('\n')` 的**扁平字符串**后退扫描，换行符作为普通 1 字节参与累积，后缀可始于任意行内任意位置（含恰在分隔符处）；首版「整行贪心 + 仅前行切割」在此不等价（属性测试抓到分歧）。终版 enforceLimits 用账本精确复刻扁平扫描：整行适配 O(1) 跳过，只对预算断裂的那一行做字符级后退扫描，均摊每字节至多检查一次。
- **测试**：tests/bounded-buffer.spec.ts——200 组随机流（4 种 UTF-8 长度类别混排）与逐字保留的旧参考实现对拍（snapshot/consume/truncated 全等）+ 8 倍 cap 吞吐恒定断言（消 O(cap)）+ 多字节跨 chunk/码点边界 + 有界性。terminal-bash 套件在 Windows 被平台排除（需 POSIX PTY），本地经临时 vitest 配置运行纯逻辑 spec 验证，完整套件留 CI。
- 全绿：bounded-buffer 5/5，仓库级 npm run typecheck 通过。
- **复审记录**：标准与 spec 两维度均无硬性违规；spec 审查额外以 8 配置 × 500 seed 强化模糊（含 bytes=1/2/3 极端值）全部通过。已修复唯一实质建议：utf8Tail 与 enforceLimits 的重复码点后退扫描提取为共享 suffixStartIndex(text, maxBytes, initialBytes)。utf8Tail 同时服务 maxReadBytes 读路径（语义与旧实现逐字等价）。
