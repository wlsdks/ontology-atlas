# CLAUDE.md

[`AGENTS.md`](AGENTS.md) is the canonical contributor guide. This wrapper adds
only Claude Code visibility, loading, and hook ownership. Anything true for both
agent trees belongs there, not here.

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

`AGENTS.md` owns the mirror contract, the nested-pointer rule, and what
`pnpm agents:check` enforces. The `@AGENTS.md` import organizes context but does
not reduce imported bytes.

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

`.claude/settings.json` owns Claude permissions and hooks, and both are
inventoried agent files. Four mirror `.codex/hooks/`: block npm publishing,
unsafe Git, hand-editing generated files, and inject a vault census at session
start. Two do not — `report-agent-file-drift.sh` is Claude-only,
`block-secret-read.sh` is Codex-only — and each header says why. Change hook
wiring with `pnpm test:claude:hooks`.

## Synchronization

`AGENTS.md` is the source of truth. Update this wrapper only when the
visibility table, rule loading, or hook ownership changes.
