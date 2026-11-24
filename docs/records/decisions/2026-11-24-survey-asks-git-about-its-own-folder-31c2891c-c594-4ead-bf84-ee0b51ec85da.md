---
id: 31c2891c-c594-4ead-bf84-ee0b51ec85da
date: 2026-11-24
---
## 2026-11-24 — The survey asks Git only about the folder it surveys, walks it once, and says it leaves ignored files out

**Why**: Since #3883 the survey leaves out what Git ignores. Git could still answer about another folder: a `GIT_DIR` or `GIT_INDEX_FILE` inherited from a git hook, or a repository's own `core.worktree`, made the walk drop a tracked file or a same-named file. The ability list walked the repository a second time, and the `analyze_repo_structure` description did not say that ignored files are left out.
**Prior**: Extends 2026-11-24 change `78ccf410` (#3883: the share of code on the map leaves out what Git ignores) and 2026-11-19 `fbb466df` (the first survey is a breadth map); both stand.
**Decision**: Every MCP git run drops inherited `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR` and `GIT_INDEX_FILE`. The survey asks `rev-parse --show-toplevel` first and uses Git's ignored list only when that work tree holds the surveyed folder; otherwise it counts every file, as outside Git. The ability list reuses the survey's product files instead of walking again. The tool description gains one sentence: files Git ignores (build output, scratch folders) are left out, so a working checkout is surveyed like a clean one. Inputs and the response shape are unchanged.
**Dissent**: Refusing to survey a repository whose `core.worktree` points elsewhere would surface a planted config. It lost: the survey runs no repository code, and a layout with a separate work tree is legitimate, so counting every file is the safer answer than no answer.
**Falsifier**: A survey drops a tracked file when the process inherits a git hook's repository variables; one survey runs `git ls-files` more than once; the survey text of a clean export changes with this change; an agent still reports a working checkout's share as differing from a clean one's because of ignored files.
**Owner**: Stark
