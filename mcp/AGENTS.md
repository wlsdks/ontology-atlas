# AGENTS.md — `mcp/`

Claude Code loads the rules below automatically from their `paths:` frontmatter.
Codex, Cursor, Antigravity CLI, Copilot and every other agent must open them
before changing a file in this directory — nothing else surfaces them.

- `.claude/rules/documentation.md` — `mcp/README.md`

The repository root `AGENTS.md` still applies. Pointers only: never copy a
rule here, so the merged instructions stay under Codex's 32 KiB cap.
