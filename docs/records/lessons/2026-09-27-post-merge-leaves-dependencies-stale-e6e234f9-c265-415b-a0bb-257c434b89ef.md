---
id: e6e234f9-c265-415b-a0bb-257c434b89ef
date: 2026-09-27
kind: tool-efficiency
status: reported
harness_area: post-merge
---
**Observed**: In an agent worktree, `git merge --no-edit origin/main` brought in #2059, which adds `remark-parse` and `unified` to `package.json` and `pnpm-lock.yaml`. `.githooks/post-merge` rebuilt the Docs Vault and messages, but did not install the new packages. The next `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4027 pnpm checks:changed -- --run` passed 6 of 7 steps. Its web-surface smoke then logged `Error: Module not found: Can't resolve 'remark-parse'` (and `'unified'`) from `src/features/library/lib/question-desk-brief.ts`. `pnpm install --frozen-lockfile` linked both packages ("Already up to date", with `node_modules/remark-parse` stamped at that moment). The rerun needed no other change.
**Cost**: one killed `checks:changed` run, about 3 minutes, plus reading the log to tell the failure apart from a code defect.
**Suspected cause**: `.githooks/post-merge` refreshes generated assets but not dependencies. A merge that changes `pnpm-lock.yaml` leaves `node_modules` behind the tree it checks.
**Proposed change**: hook. When `pnpm-lock.yaml` differs between `ORIG_HEAD` and `HEAD`, `.githooks/post-merge` prints one line naming `pnpm install --frozen-lockfile`, or runs it.
