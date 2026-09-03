# DeepSeek Harness (DSH) 项目长期备忘

## 项目学习资料系列约定（docs/项目学习资料/）
- 【2026-09-03 更新】格式改为"多页小书"：每本书一个目录（如 `DSH提示词图解小书/`），内含 index.html 封面目录 + chNN.html 章节 + assets/book.css 共享设计系统。
- book.css 即共享设计令牌（--brand-500 主蓝/--accent-500 青/--warn-500 琥珀）+ 书脊组件（.booktop 粘顶栏/.chaphead 章首/.pager 翻页器/.quote-card 原文卡）；后续新书复制 assets/book.css 改令牌即可。
- 章节页骨架：body[data-prev/next]（键盘←→翻页）→ .booktop → .wrap(.chaphead + 正文) → .pager(上/目录/下 + 页码)。
- 硬要求（沿袭 jxx-research 技能）：每个论断标注源码出处（文件路径），可追溯；提示词原文逐字抄录并保留 ${…} 插值槽。
- 已有：DSH提示词图解小书/（12 页，2026-09-03，由单文件 01 号重构而来，旧单文件已删）。

## 关键架构事实（已验证）
- 系统提示词 = `packages/core/system-prompt` 注册表 + 装配流水线，每 step `assemble()` 重算；动态上下文快照由 agent-loop 的 `RuntimeContextProjection` 投为 user 消息（变了才注入）。
- AGENTS.md/CLAUDE.md 由 `packages/context/agent-instructions` 注入，基线进 durable 上下文，文件触达后折入 inbox。
- 提示词设计强约束 KV-Cache 稳定前缀（第一方段位 -1000~9900 稀疏预留）。

## 环境坑
- agent-browser 在本机（Windows）打开 file:// 中文路径会无输出挂起，验证 HTML 用 python html.parser 即可。
