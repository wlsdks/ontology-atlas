# CLAUDE.md

[`AGENTS.md`](AGENTS.md) is canonical. This wrapper adds only what differs for
Claude Code: loading and hook ownership. Anything true for both harnesses
belongs in `AGENTS.md`.

@AGENTS.md

## Claude Code loading

`.claude/rules/` contains always-loaded `forbidden`, `git`, and
`local-first` rules. Path-loaded rules are `design`, `design-gates`,
`architecture`, `testing`, `surfaces`, and `documentation`; their frontmatter
paths and `tests/contract/rules-path-scope.contract.test.ts` keep the
conditions live. Making a rule resident updates that contract, this sentence,
and the commit's reason together.

`.claude/agents/` sets effort per type: `implementer` builds a planned slice at
low; `planner`, `reviewer`, and the convened seats judge at max
(`docs/engineering/agent-effort.md`; `CLAUDE_CODE_EFFORT_LEVEL` flattens them).
Claude Code does not read `.agents/**` or `.codex/**`; Codex does not auto-load
`CLAUDE.md` or `.claude/**`.

## Hooks

`.claude/settings.json` owns Claude permissions and hooks. Every hook is
mirrored in `.codex/hooks/` as an adaptation (a Codex edit is an `apply_patch`
envelope), not a copy; `block-secret-read.sh` is Codex-only because Claude uses
`permissions.deny`. Hooks block irreversible commands, report lint and language
findings at edit time, and inject the vault census at session start; each
header says why. `pnpm test:claude:hooks` guards the wiring.
