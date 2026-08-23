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
| `CLAUDE.md`, `.claude/**` | reads | does not read |
| `.agents/skills/**`, `.agents/agents/**` | does not read | reads |
| `.codex/**` | does not read | reads config and hooks |

Put shared rules in `AGENTS.md`. The two agent trees have matching
`skills/` and `agents/` files and must be byte-identical; relative
references resolve within each tree. Shared skill bodies must branch on
capability, not tool name. `pnpm agents:check` checks the import, cap,
references, and pair parity.

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

`.claude/settings.json` owns Claude permissions and hooks. Its hooks mirror
`.codex/hooks/`: block npm publishing, unsafe Git, and hand-editing generated
files, plus inject compact vault inventory at session start. Change hook wiring
with `pnpm test:claude:hooks`.

## Synchronization

`AGENTS.md` is the source of truth. Update this wrapper only when the
visibility table, rule loading, mirror contract, or hook ownership changes. The
`@AGENTS.md` import organizes context but does not reduce imported bytes.
