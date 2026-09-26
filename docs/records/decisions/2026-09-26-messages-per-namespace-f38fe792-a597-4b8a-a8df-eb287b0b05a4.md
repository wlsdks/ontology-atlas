---
id: f38fe792-a597-4b8a-a8df-eb287b0b05a4
date: 2026-09-26
---
## 2026-09-26 — Message catalogues are authored one file per namespace

**Why**: `messages/en.json` (450 KB) and `messages/ko.json` (494 KB) were touched by 76 and 72 of the last 170 commits (44%), the repository's largest merge-conflict hot spot for 20 people and 20 agents. Edits to different screens' copy collided only because they shared one file.
**Prior**: extends 2026-09-13 "Independent records and worktree-local Docs Vault materialization" to the catalogues: same prepare, checkout and merge hooks, same ignored output, same staged-index pre-commit check.
**Decision**: `messages/<locale>/<Namespace>.json` is the source, one object per top-level namespace, split byte for byte. `pnpm messages:build` composes the ignored `messages/<locale>.json` in sorted namespace order, so `src/i18n/request.ts` and the 179 importers are unchanged and no order file is shared. Adding a namespace is two new files. `--check` fails on a stale composite or a namespace in one locale; `messages:adopt` carries a pre-split branch's edits onto the parts. Vitest's global setup and the dev server keep the composite current; a part edit names the composite's importers for Vitest, because `--changed` cannot see an unimported file.
**Dissent**: a generated file every test imports can be stale; a part edited with the dev server stopped and no test run reaches a build only through `build`'s compose. Bounded: every entry point composes first and `messages:check` runs in `test:i18n:messages`. Also, one hot namespace (`library`, 54 KB) can still conflict with itself; splitting deeper waits for measurement.
**Falsifier**: two branches editing different namespaces conflict in Git; a clean checkout's `pnpm build` or Vitest run reads a missing or stale composite; within 30 days one namespace file is touched by more than 20% of commits, which would call for a deeper split.
**Owner**: Stark
