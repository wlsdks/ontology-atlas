---
id: ab94a694-180d-4141-bb6b-6cc0e8362bbc
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: source-search
---
**Observed**: The read-only CI repair reviewer reported that an `rg --files` filter matched the parent directory `acp-probe-fix-worktree` instead of target basenames. Its tool reported171,653underlying output tokens before truncation. The full command is not retained in this host report; the reviewer corrected the search to an anchored direct-child basename filter and made no source edits or test runs.

**Cost**:171,653estimated underlying output tokens reported by the reviewer. Delivered or billed tokens and elapsed time are unknown.

**Suspected cause**: The filter was applied to full paths whose parent already contained the searched words.

**Proposed change**: none beyond the search correction. Prefer `rg --files -g '<basename-pattern>' <narrow-root>`; when filtering full paths, anchor the basename after the last slash. Keep output bounded. A directory-name match is not evidence that the target file matched.
