# Agent Note: Concise shell, filesystem, editor, and terminal tool descriptions

Status: implemented

English | [中文](2026-08-27-concise-shell-fs-terminal-descriptions.zh.md)

## Problem

The model-visible tool descriptions of the shell, filesystem, editor, and terminal families were long and essay-like — one-shot `bash` ≈1600 characters and one-shot `pwsh` ≈1900, with `str_replace_editor` ≈700 and several filesystem tools above the 200-character target. Every assembled model request carries the full tool directory, so that prose inflated prompt cost and diluted attention on the tools themselves, against ADR-0016's token-first priority chain. The minimal-native plugin work (win-shell-mcp batch 19) wants a native full-catalog presentation whose prompt budget stays comparable to the minimal preset; verbose descriptions defeat that budget.

## Decision

Trim the model-visible description text of the one-shot `bash` and `pwsh` tools, `str_replace_editor`, `read_image`, `glob`, and `grep` to the shortest wording that keeps the behavior facts the model needs:

- one-shot vs persistent shell semantics (`workdir`, not `cd`; no state persists),
- the `[exit code: N]` exit-code convention,
- the `[sandbox: file access denied under <mode> mode]` denial marker as a policy denial, not a command bug, and the one-shot `sandbox_permissions` + `justification` escalation retry,
- `run_in_background: true` returning a job id for `job_output`/`job_kill`,
- output truncation to the tail with the full output saved to a reported path.

Already-concise descriptions — the `read`/`write`/`edit` filesystem tools, the six `terminal_*` tools, and the persistent `bash`/`pwsh` tools — are unchanged. Behavior, schemas, parameters, and execution paths are untouched: only description text changed.

The generated `docs/tool-catalog.md` and its `docs/tool-catalog.zh.md` translation were regenerated, the acp-agent pinned header sidecars (`system-prompt.expected.md` / `tool-schemas.expected.json`) were refreshed keylessly, and the Python SDK minimal model-visible snapshot now carries the new `str_replace_editor` description.

Among the minimal-preset anchor tools, `tool-str-replace-editor` changes its package default description. The persistent-shell anchors keep their already-concise defaults, and the minimal preset overrides those persistent-shell descriptions through `agent.cordis.yml` config anyway, so its runtime surface is unchanged; batch ticket 03 re-verifies the anchor surface and adds the per-description length gate.

## Alternatives considered

**Leave the descriptions unchanged.** Rejected: the verbose prose is the cost the minimal-native work exists to remove, and trimming is backward-compatible for every consumer because only the description field differs.

**Move behavior guidance into system-prompt sections instead.** Rejected: it would move rather than remove tokens and would touch more than the description strings, contrary to the ticket's "only description text changes" constraint.

## Consequences

Every model request in a composition mounting these tools carries a smaller tool directory — roughly half the previous description bytes for the one-shot shell tools and more for `str_replace_editor`. The shell-family descriptions remain above 200 characters because the mandated behavior facts are irreducible; the ticket 03 gate relaxes the shell and workflow families for that reason. Snapshot suites that pin the rendered descriptions (acp-agent sidecars, Python SDK model-visible snapshot) were updated in the same change. The one-shot shell descriptions keep every sandbox and escalation safety fact — the `[sandbox: …]` denial marker, pwsh's ConstrainedLanguage and named-pipe EPERM boundary, the one-shot escalation retry with `sandbox_permissions` + `justification`, the approval-consent and approval-disabled-final guardrails, and the `$DSH_*`/`$env:DSH_*` environment hints — with only redundant essay phrasing tightened, so their remaining length stays above the 200-character gate that the shell family relaxes.
