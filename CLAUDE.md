# CLAUDE.md

[`AGENTS.md`](AGENTS.md) is the canonical contributor guide. This wrapper adds
only Claude Code visibility, loading, and hook ownership.

@AGENTS.md

## Agent skills

- Issues: `docs/agents/issue-tracker.md`
- Triage labels: `docs/agents/triage-labels.md`
- Domain and decision sources: `docs/agents/domain.md`

## Visibility and mirrors

| Location | Claude Code | Codex |
|---|---|---|
| `AGENTS.md` | imported here | read directly, capped by `project_doc_max_bytes` |
| `<dir>/AGENTS.md` | not loaded | merged root-down on the path |
| `CLAUDE.md`, `.claude/**` | reads | not auto-loaded; opened on a pointer |
| `.agents/skills/**`, `.agents/agents/**` | does not read | reads |
| `.codex/**` | does not read | reads config and hooks |

Put shared rules in `AGENTS.md`. `.claude/rules/` is the one body Codex cannot
auto-load, so each rule-covered directory carries a nested `AGENTS.md` naming
the rules that reach it. Those are pointers, never copies; the merged set must
stay under the Codex cap, and
`tests/contract/nested-agents-pointers.contract.test.ts` derives the expected
rule set from the rules' own `paths:` frontmatter.

The two agent trees have matching
`skills/` and `agents/` files and must be byte-identical; relative
references resolve within each tree. Shared skill bodies must branch on
capability, not tool name. `pnpm agents:check` checks the import, cap,
references, pair parity, and that agent-read text is English-only.

## Claude Code loading

`.claude/rules/` contains always-loaded `forbidden`, `git`, and
`local-first` rules. Path-loaded rules are `design`, `design-gates`,
`architecture`, `testing`, `surfaces`, `documentation`, and
`codegraph`; their frontmatter paths and
`tests/contract/rules-path-scope.contract.test.ts` keep the conditions live.
Do not turn a conditional rule resident or add an always-loaded rule without
updating its contract and reason.

`.claude/agents/` holds the chief, PO seats, design seats, and
`design-guardian`; load them only when convened. The shared skills remain
available to both agent trees; `AGENTS.md` owns invocation triggers and
`docs/DECISIONS.md` owns decisions and dissent.

`.claude/settings.json` owns Claude permissions and hooks. It and
`.claude/hooks/` are inventoried agent files, so their text is gated too. Four
hooks mirror `.codex/hooks/`: block npm publishing, unsafe Git, and hand-editing
generated files, plus inject compact vault inventory at session start. A fifth,
`report-agent-file-drift.sh`, runs the drift checks after an edit inside the
agent-file surface and reports through `additionalContext`; it is Claude-only
because Codex's PostToolUse support for edit tools is unverified here, and an
unverifiable mirror is the dead gate this hook exists to catch. Change hook
wiring with `pnpm test:claude:hooks`.

## Synchronization

`AGENTS.md` is the source of truth. Update this wrapper only when the
visibility table, rule loading, mirror contract, or hook ownership changes. The
`@AGENTS.md` import organizes context but does not reduce imported bytes.
