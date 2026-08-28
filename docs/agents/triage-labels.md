# Triage 标签

技能使用五种规范 triage 角色来表述。此文件将这些角色映射到此仓库 issue tracker 中实际使用的标签字符串。

| mattpocock/skills 中的标签 | 我们 tracker 中的标签 | 含义                                       |
| -------------------------- | --------------------- | ------------------------------------------ |
| `needs-triage`             | `needs-triage`        | 维护者需要评估此 issue                     |
| `needs-info`               | `needs-info`          | 等待报告者提供更多信息                     |
| `ready-for-agent`          | `ready-for-agent`     | 已完全指定，可供 AFK agent 处理            |
| `ready-for-human`          | `ready-for-human`     | 需要人工实现                               |
| `wontfix`                  | `wontfix`             | 不会采取行动                               |

当技能提到某个角色（例如"应用 AFK-ready triage 标签"）时，使用此表中对应的标签字符串。

编辑右侧列以匹配你实际使用的词汇。

## 实现 / 审查状态

上述五个 triage 角色描述工单的**分类与就绪度**。当工单进入 `ready-for-agent` 并由 agent 实现后，还经历**实现 / 审查执行状态**：`pending-review`（待审查，第一轮功能开发完成）与 `done`（结束，代码审查通过）。完整生命周期定义见 `issue-tracker.md` 的「工单状态与生命周期」节。