---
id: 390c0c51-94ad-4fdd-843f-fa5034006585
date: 2026-09-26
kind: mistake
status: reported
harness_area: git-hooks
---
**Observed**: pushing the messages split ran its new fixture tests inside `.githooks/pre-push`; their temp-repository `git init`/`config`/`commit` acted on the real repository (user.name/email and commit.gpgsign written to the shared .git/config, a stray branch, a worktree HEAD moved). Reproduced on a scratch repo: with GIT_DIR inherited, `git init && git config user.name Leak` in a temp dir writes to the other repository.
**Cost**: shared repository state changed for every session until repaired by hand; commits in that window could carry a fixture author.
**Suspected cause**: git exports GIT_DIR and friends to hooks, and every lane inherits them.
**Proposed change**: hook: resolve the checkout, then unset GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE and related variables before any lane runs.
