# AGENTS.md — `tests/`

Claude Code loads the rules below automatically from their `paths:` frontmatter.
Codex, Cursor, Antigravity CLI, Copilot and every other agent must open them
before changing a file in this directory — nothing else surfaces them.

- `.claude/rules/design-gates.md` — `tests/contract/**`
- `.claude/rules/surfaces.md` — `tests/e2e/web-surface-smoke.spec.ts`, `tests/e2e/responsive-overflow-audit.spec.ts`
- `.claude/rules/testing.md` — `tests/**`

The repository root `AGENTS.md` still applies. Pointers only: never copy a
rule here, so the merged instructions stay under Codex's 32 KiB cap.
