# AGENTS.md — `src/`

Claude Code loads the rules below automatically from their `paths:` frontmatter.
Codex, Cursor, Antigravity CLI, Copilot and every other agent must open them
before changing a file in this directory — nothing else surfaces them.

- `.claude/rules/architecture.md` — `src/**`
- `.claude/rules/design.md` — `src/**/*.tsx`, `src/**/*.css`, `src/**/ui/**`, `src/shared/motion/**`, `src/widgets/ontology-map/**`
- `.claude/rules/surfaces.md` — `src/shared/lib/tauri-*.ts`, `src/entities/vault-session/**`, `src/features/docs-vault-local/**`, `src/shared/config/mcp-server-launch.ts`

The repository root `AGENTS.md` still applies. Pointers only: never copy a
rule here, so the merged instructions stay under Codex's 32 KiB cap.
