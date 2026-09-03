# Agent Note: 精简编排与协作工具描述

Status: implemented

[English](2026-08-27-concise-orchestration-collab-descriptions.md) | 中文

## Problem

编排与协作族工具的模型可见描述冗长且呈论文式写法——`workflow` 约 1500 字符、`list_agents` 约 1000 字符，`cordis_*` 每个 300–550 字符，`todo_write`/`schedule_create`/`ralph`/`interrupt_agent`/`report`/`subagent` 均超过 200 字符。每次组装的模型请求都会携带完整工具目录，因此这些叙述膨胀了提示词成本并稀释了对工具本身的注意力，违背 ADR-0016 的 token 优先优先级链。极简原生插件工作（win-shell-mcp 批次 19）希望原生全量目录的提示词预算与极简 preset 相当；冗长描述破坏了这一预算。shell/fs/编辑/终端族已在[姊妹笔记](./2026-08-27-concise-shell-fs-terminal-descriptions.zh.md)精简，本工单覆盖其余可见工具集。

## Decision

将编排与协作工具的描述精简为保留模型正确使用所需行为事实的最短措辞。变更包：`tool-ask-user`（`ask_user_question`）、`dsh-tools`（`run_code`）、`plan-mode`（`exit_plan_mode`）、`tool-todo`（`todo_write`）、`tool-workflow`（`workflow`）、`tool-ralph`（`ralph`）、`tool-subagent`（`subagent` 两个分支）、`tool-subagent-control`（`interrupt_agent`/`list_agents`/`send_message`）、`tool-subagent-report`（`report`）、`tool-jobs`（`job_output`）、`tool-goal`（`create_goal`/`get_goal`/`update_goal`）、`schedule`（`schedule_create`/`schedule_delete`/`schedule_list`）、`tool-agent-team`（`wait_agent`）、以及 `tool-cordis`（全部七个工具）。

每处精简都保留模型选择并正确使用该工具所需的行为事实——独立上下文 vs 继承上下文 subagent 语义、`[status: ...]` job 输出约定、经 `job_output`/`job_kill` 收集后台 job、一次性 vs 可延续 subagent 调度、目标权威规则（需直接顶层人类请求）、schedule 选择器约束（`every_seconds >= 300`、会话本地投递）、cordis 的 define/run/stop 审批与版本指针保证，以及 workflow 脚本钩子（`agent`/`pipeline`/`parallel`/`phase`/`log`/`args`）、其 schema 子集与无 fs/无网络/无定时器约束。行为、schema、参数、执行路径完全不变——只改描述文本。

生成的 `docs/tool-catalog.md` 及其 `docs/tool-catalog.zh.md` 译文已重新生成/同步并重录 i18n 对；acp-agent 固定 header sidecar（`tool-schemas.expected.json` / `system-prompt.expected.md`）已 keyless 刷新。曾固定精确描述子串的包级测试断言均已保留（下方保留清单显示每个固定事实均存活）。

## Alternatives considered

**维持描述不变。** 否决：冗长叙述正是极简原生工作要移除的成本，且精简只改 description 字段，对所有消费者向后兼容。

**改为将行为指引搬进 system-prompt section。** 否决：这会把 token 从一处搬到另一处而非删除，改动面超过描述字符串，违背工单"只改描述文本"约束。

## Consequences

挂载这些工具的组合中，每次模型请求都携带更小的工具目录。携带不可约行为事实的编排工具仍超过 200 字符（`workflow`、`list_agents`、及 `cordis_*` 保留其操作性保证）；工单 03 门禁为此放宽 workflow 与 shell 族。固定渲染后描述的快照套件（acp-agent sidecar、tool-catalog）已在同一次改动中更新。部分测试断言精确描述子串（`BODY of an`、`worker reports completion`、`Keep AT MOST ONE todo`、`does not see this conversation` 等）；每个都在精简措辞中保留，故无测试改动。