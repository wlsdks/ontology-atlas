# CLAUDE.md

[`AGENTS.md`](AGENTS.md) is canonical. This wrapper adds only Claude Code
visibility, loading, and hook ownership; anything true for both trees belongs
there.

@AGENTS.md

`docs/agents/` holds the issue tracker, triage labels, and domain and decision
sources; nothing else points at them.

## Visibility and mirrors

| Location | Claude Code | Codex |
|---|---|---|
| `AGENTS.md` | imported here | read directly, capped by `project_doc_max_bytes` |
| `<dir>/AGENTS.md` | not loaded | merged root-down on the path |
| `CLAUDE.md`, `.claude/**` | reads | not auto-loaded; opened on a pointer |
| `.agents/skills/**`, `.agents/agents/**` | does not read | reads |
| `.codex/**` | does not read | reads config and hooks |

The Codex column covers every open-format reader: Cursor,
Antigravity CLI and Copilot resolve `AGENTS.md` and its nested files the same
way. That file owns the mirror contract, the nested-pointer rule, and what
`pnpm agents:check` enforces.

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
inventoried agent files. Eight mirror `.codex/hooks/`: the three blocks, the
vault census, the sensor lane, and usage. A Codex edit is
`apply_patch` carrying a patch envelope, so mirrors are adapted, not copied.
`report-agent-file-drift.sh` is Claude-only, `block-secret-read.sh` Codex-only.
Headers say why. `pnpm test:claude:hooks` guards wiring, `pnpm harness:report`
judges sensors, `pnpm harness:smoke` proves the runtimes.

## Synchronization

`AGENTS.md` is the source of truth. Update this wrapper only when the visibility
table, rule loading, or hook ownership changes.
