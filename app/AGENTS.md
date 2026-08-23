# AGENTS.md — `app/`

Claude Code loads the rules below automatically from their `paths:` frontmatter.
Codex, Cursor, Antigravity CLI and every other agent must open them before
changing a file in this directory — nothing else surfaces them.

- `.claude/rules/architecture.md` — `app/**`
- `.claude/rules/codegraph.md` — `app/**`
- `.claude/rules/design.md` — `app/**/*.css`, `app/**/*.tsx`

The repository root `AGENTS.md` still applies; this file adds to it rather than
replacing it. Pointers only: the rules are never copied here, so the merged
instruction set stays under Codex's 32 KiB `project_doc_max_bytes` (standing
decision, 2026-07-31 — "a one-line pointer, a reference and not a copy").
