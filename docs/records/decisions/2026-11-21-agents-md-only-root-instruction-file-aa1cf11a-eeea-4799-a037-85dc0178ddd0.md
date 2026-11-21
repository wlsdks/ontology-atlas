---
id: aa1cf11a-eeea-4799-a037-85dc0178ddd0
date: 2026-11-21
---
## 2026-11-21 — AGENTS.md is the only root instruction file for both harnesses

**Why**: The owner asked on 2026-11-21 for one root instruction file. Claude Code 2.1.277+ reads `AGENTS.md` itself when no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` sits in the working directory or above it (https://code.claude.com/docs/en/memory.md); 2.1.330 is installed. The `CLAUDE.md` wrapper only imported `AGENTS.md` and added 1,260 bytes.
**Prior**: updates 2026-08-24 (112) where it assumed a `CLAUDE.md` wrapper, and the 2026-10-05 adapter policy (d4d8575a6: keep `CLAUDE.md` a small adapter importing `@AGENTS.md`). The nested pointers stand.
**Decision**: delete the root `CLAUDE.md`; `AGENTS.md` carries rule loading, skill discovery and hook ownership. `rules-path-scope.contract.test.ts` refuses a root `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`. A profile whose `CLAUDE_CONFIG_DIR` is not `~/.claude` counts `~/.claude/CLAUDE.md` as an ancestor and silently loads only `.claude/rules`; it needs the user setting `instructionFiles: claude-md-and-agents-md`. The owner approved it and it is set in all three local profiles; `claude -p` then quotes `# AGENTS.md — ontology-atlas`.
**Dissent**: keep a one-line `CLAUDE.md` holding `@AGENTS.md`: it loads in every profile with no setting, at the cost of a second root file to keep empty.
**Falsifier**: a Claude Code session here whose `/memory` lacks `AGENTS.md`, or that breaks a rule only `AGENTS.md` states.
**Owner**: Ontology Atlas owner.
