---
id: aa1cf11a-eeea-4799-a037-85dc0178ddd0
date: 2026-11-21
---
## 2026-11-21 — AGENTS.md is the only root instruction file for both harnesses

**Why**: The owner asked on 2026-11-21 for one root instruction file. Claude Code 2.1.277 and later reads `AGENTS.md` itself when no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` sits in the working directory or above it (https://code.claude.com/docs/en/memory.md, "AGENTS.md"); the installed version is 2.1.330. The `CLAUDE.md` wrapper only imported `AGENTS.md` and added 1,260 bytes of loading and hook notes.
**Prior**: updates 2026-08-24 (112) "Rules reach non-Claude agents through nested AGENTS.md pointers, never copies" only where it assumed a `CLAUDE.md` wrapper owning Claude loading; the nested pointers stand.
**Decision**: delete the root `CLAUDE.md`. `AGENTS.md` carries its loading sentence (resident and path-loaded rules), skill discovery for both harnesses, and hook ownership. `rules-path-scope.contract.test.ts` reads `AGENTS.md` for those facts and refuses a root `CLAUDE.md` or `.claude/CLAUDE.md`. Product code that reads a user's `CLAUDE.md` is unchanged.
**Dissent**: the default loads `AGENTS.md` only when no `CLAUDE.md` counts anywhere above the working directory. A Claude Code profile whose config directory is not `~/.claude` (`CLAUDE_CONFIG_DIR` set elsewhere, as on the owner's machine) treats `~/.claude/CLAUDE.md` as an ancestor `.claude/CLAUDE.md`, so on 2026-11-21 `claude -p` in this worktree and in another repository without a `CLAUDE.md` loaded no `AGENTS.md`; the same worktree with `instructionFiles: claude-md-and-agents-md` in a `--settings` file did. Such a profile needs that user setting before this holds.
**Falsifier**: a Claude Code session in this repository where `/memory` does not list `AGENTS.md`, or that violates a rule only `AGENTS.md` states.
**Owner**: Ontology Atlas owner.
