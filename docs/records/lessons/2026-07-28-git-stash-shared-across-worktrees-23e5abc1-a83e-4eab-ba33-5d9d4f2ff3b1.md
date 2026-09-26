---
id: 23e5abc1-a83e-4eab-ba33-5d9d4f2ff3b1
date: 2026-07-28
kind: mistake
status: reported
harness_area: git-worktree
---
**Observed**: `git stash push -u` in one worktree was taken by `git stash pop` in a concurrent worktree. The first worktree lost its whole working copy (recovered from a dangling commit); the second found 11 files it never touched.
**Cost**: A lost working copy recovered by hand, and a near-contaminated unrelated pull request.
**Suspected cause**: `refs/stash` is shared by every worktree of a repository.
**Proposed change**: rule: no `git stash` during parallel work; set work aside with a temporary commit or a patch file.
