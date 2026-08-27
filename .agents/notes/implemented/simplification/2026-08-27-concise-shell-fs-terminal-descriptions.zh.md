# Agent Note: 精简 shell、文件系统、编辑器和终端工具描述

Status: implemented

[English](2026-08-27-concise-shell-fs-terminal-descriptions.md) | 中文

## Problem

shell、文件系统、编辑器和终端族工具的模型可见描述冗长且呈论文式写法——一次性 `bash` 约 1600 字符、一次性 `pwsh` 约 1900 字符，`str_replace_editor` 约 700 字符，多个文件系统工具也超过 200 字符目标。每次组装的模型请求都会携带完整工具目录，因此这些叙述膨胀了提示词成本并稀释了对工具本身的注意力，违背 ADR-0016 的 token 优先优先级链。极简原生插件工作（win-shell-mcp 批次 19）希望原生全量目录的提示词预算与极简 preset 相当；冗长描述破坏了这一预算。

## Decision

将一次性 `bash`、`pwsh` 工具以及 `str_replace_editor`、`read_image`、`glob`、`grep` 的模型可见描述文本精简为能保留模型所需行为事实的最短措辞：

- 一次性与持久 shell 的语义差异（`workdir` 而非 `cd`；状态不保留），
- `[exit code: N]` 退出码约定，
- `[sandbox: file access denied under <mode> mode]` 拒绝标记是策略拒绝而非命令缺陷，以及一次性 `sandbox_permissions` + `justification` 升级重试，
- `run_in_background: true` 返回 job id，配合 `job_output`/`job_kill`，
- 输出仅保留尾部截断，完整输出保存到报告路径。

本就简洁的描述——`read`/`write`/`edit` 文件系统工具、六个 `terminal_*` 工具以及持久 `bash`/`pwsh` 工具——保持不变。行为、schema、参数和执行路径均未改动：只改了描述文本。

已重新生成 `docs/tool-catalog.md` 及其翻译 `docs/tool-catalog.zh.md`，以无密钥方式刷新了 acp-agent 锚定头部 sidecar（`system-prompt.expected.md` / `tool-schemas.expected.json`），并更新了 Python SDK 极简模型可见快照中的 `str_replace_editor` 描述。

极简 preset 锚定工具中，`tool-str-replace-editor` 会改变包默认描述。持久 shell 锚定工具保持本就简洁的默认描述，且极简 preset 本就通过 `agent.cordis.yml` 配置覆盖持久 shell 描述，因此其运行时表面不变；批次工单 03 将重新验证锚定表面并加入每条描述的长度门禁。

## Alternatives considered

**保持描述不变。** 已否决：冗长叙述正是极简原生工作要消除的成本，且只改描述字段对所有消费者向后兼容。

**将行为指引移入 system-prompt 段。** 已否决：这是移动而非移除 token，且会触碰描述字符串之外的更多内容，违反工单"只改描述文本"的约束。

## Consequences

凡是挂载这些工具的组装，每次模型请求携带的工具目录都会更小——一次性 shell 工具的描述字节数大约减半，`str_replace_editor` 减幅更大。shell 族描述仍超过 200 字符，因为必需的行为事实不可再压缩；工单 03 的门禁正是为此放宽 shell 与 workflow 族。锚定渲染描述的快照套件（acp-agent sidecar、Python SDK 模型可见快照）已在同一变更中更新。一次性 shell 描述保留了全部 sandbox 与升级安全事实——`[sandbox: …]` 拒绝标记、pwsh 的 ConstrainedLanguage 与命名管道 EPERM 边界、`sandbox_permissions` + `justification` 一次性升级重试、审批同意与审批禁用即终局护栏，以及 `$DSH_*`/`$env:DSH_*` 环境提示——仅收紧冗余论文式措辞，因此其剩余长度仍超过门禁为 shell 族放宽的 200 字符。
