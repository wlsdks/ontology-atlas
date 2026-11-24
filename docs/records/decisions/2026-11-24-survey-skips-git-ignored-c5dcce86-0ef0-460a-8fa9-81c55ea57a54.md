---
id: c5dcce86-0ef0-460a-8fa9-81c55ea57a54
date: 2026-11-24
---
## 2026-11-24 — The repository survey leaves out files Git ignores, and every MCP git call stays local

**Why**: The coverage line measured "43 of 44 areas" on a developer's checkout and "41 of 42" on CI's clean checkout of the same commit, because build output and scratch files Git ignores counted as code not on the map; the release gate went red on one side only.
**Prior**: Keeps 2026-11-24 `4f94c421` (a recorded count is the one `validate_vault` gives); this changes what that count includes.
**Decision**: When the root is inside a Git work tree that holds it, `analyze_repo_structure`'s survey (and the coverage, source and family reads that share it) skips untracked files Git ignores, from one `ls-files --others --ignored --exclude-standard` call; tracked files under an ignored folder still count; when Git cannot answer, the walk is unchanged. Every MCP git call sets `GIT_NO_LAZY_FETCH=1` and an empty `GIT_ALLOW_PROTOCOL` and drops an inherited `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR` and `GIT_INDEX_FILE`, as the desktop runner does.
**Dissent**: A team that ignores generated code it wants on the map now has to track it or name it; the survey says nothing about what it left out.
**Falsifier**: A working checkout and a clean export of the same commit giving different Not mapped yet lines; a planted repository making an MCP git call fetch or run a command; a tracked file missing from the survey.
**Owner**: Stark
