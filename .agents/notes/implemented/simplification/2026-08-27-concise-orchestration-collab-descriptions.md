# Agent Note: Concise orchestration and collaboration tool descriptions

Status: implemented

English | [中文](2026-08-27-concise-orchestration-collab-descriptions.zh.md)

## Problem

The model-visible descriptions of the orchestration and collaboration tool families were long and essay-like — `workflow` ≈1500 characters, `list_agents` ≈1000, `cordis_*` 300–550 each, `todo_write`/`schedule_create`/`ralph`/`interrupt_agent`/`report`/`subagent` above 200. Every assembled model request carries the full tool directory, so this prose inflated prompt cost and diluted attention on the tools themselves, against ADR-0016's token-first priority chain. The minimal-native plugin work (win-shell-mcp batch 19) wants a native full-catalog presentation whose prompt budget stays comparable to the minimal preset; verbose descriptions defeat that budget. The shell/fs/editor/terminal family was already trimmed ([sibling note](./2026-08-27-concise-shell-fs-terminal-descriptions.md)); this ticket covers the rest of the visible toolset.

## Decision

Trim the model-visible description text of the orchestration and collaboration tools to the shortest wording that keeps the behavior facts the model needs. Changed packages: `tool-ask-user` (`ask_user_question`), `dsh-tools` (`run_code`), `plan-mode` (`exit_plan_mode`), `tool-todo` (`todo_write`), `tool-workflow` (`workflow`), `tool-ralph` (`ralph`), `tool-subagent` (`subagent` both forks), `tool-subagent-control` (`interrupt_agent`/`list_agents`/`send_message`), `tool-subagent-report` (`report`), `tool-jobs` (`job_output`), `tool-goal` (`create_goal`/`get_goal`/`update_goal`), `schedule` (`schedule_create`/`schedule_delete`/`schedule_list`), `tool-agent-team` (`wait_agent`), and `tool-cordis` (all seven tools).

Each trim keeps the behavior facts the model needs to select and use the tool correctly — independent-context vs inherited-context subagent semantics, the `[status: ...]` job-output convention, background-job collection via `job_output`/`job_kill`, one-shot vs continuable subagent scheduling, goal authority rules (direct top-level human request), schedule selector constraints (`every_seconds >= 300`, session-local delivery), cordis define/run/stop approval and version-pointer guarantees, and the workflow script hooks (`agent`/`pipeline`/`parallel`/`phase`/`log`/`args`), their schema subset, and the no-fs/no-network/no-timers constraint. Behavior, schemas, parameters, and execution paths are untouched: only description text changed.

The generated `docs/tool-catalog.md` and its `docs/tool-catalog.zh.md` translation were regenerated/synced and their i18n pair re-recorded; the acp-agent pinned header sidecars (`tool-schemas.expected.json` / `system-prompt.expected.md`) were refreshed keylessly. Package test assertions that pinned exact description substrings were preserved (the keep-lists below show every pinned fact survived).

## Alternatives considered

**Leave the descriptions unchanged.** Rejected: the verbose prose is the cost the minimal-native work exists to remove, and trimming is backward-compatible for every consumer because only the description field differs.

**Move behavior guidance into system-prompt sections instead.** Rejected: it would move rather than remove tokens and would touch more than the description strings, contrary to the ticket's "only description text changes" constraint.

## Consequences

Every model request in a composition mounting these tools carries a smaller tool directory. Orchestration tools that carry irreducible behavior facts stayed above 200 characters (`workflow`, `list_agents`, and the `cordis_*` tools keep their operational guarantees); the ticket 03 gate relaxes the workflow and shell families for that reason. Snapshot suites that pin the rendered descriptions (acp-agent sidecars, tool-catalog) were updated in the same change. Some test assertions named exact description substrings (`BODY of an`, `worker reports completion`, `Keep AT MOST ONE todo`, `does not see this conversation`, etc.); each was preserved in the trimmed wording so no test changed.