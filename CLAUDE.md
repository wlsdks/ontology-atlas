# CLAUDE.md

[`AGENTS.md`](AGENTS.md) is canonical. This wrapper adds only what differs for
Claude Code: loading and hook ownership. Anything true for both harnesses
belongs in `AGENTS.md`.

@AGENTS.md

## Claude Code loading

`.claude/rules/` contains always-loaded `forbidden`, `git`, and
`local-first` rules. Path-loaded rules are `design`, `design-gates`,
`architecture`, `testing`, `surfaces`, and `documentation`; their frontmatter
paths and
`tests/contract/rules-path-scope.contract.test.ts` keep the conditions live.
Adding an always-loaded rule, or making a conditional one resident, updates
that contract, this sentence, and the commit's reason together.

`.claude/agents/` holds the chief, PO seats, design seats, and
`design-guardian`; load them only when convened. Claude Code does not read
`.agents/**` or `.codex/**`; Codex does not auto-load `CLAUDE.md` or `.claude/**`.

## Hooks

`.claude/settings.json` owns Claude permissions and hooks. Every hook is
mirrored in `.codex/hooks/` as an adaptation (a Codex edit is an `apply_patch`
envelope), not a copy; `block-secret-read.sh` is Codex-only because Claude uses
`permissions.deny`. Hooks block irreversible commands, report lint and language
findings at edit time, and inject the vault census at session start; nothing
else. Hook headers say why each exists. `pnpm test:claude:hooks` guards the
wiring.
