---
id: 38273453-81bd-4c78-8c4c-d3e56b7d287b
date: 2026-10-05
---
## 2026-10-05 — Preserve original commit history during landing

**Why**: The owner requires original commits to remain visible on main. The former train rewrote each component into one synthetic commit and the fast path squashed the PR, discarding original ancestry from main even when the PR retained it.
**Prior**: Supersedes the history clause of the 2026-09-26 landing-train decision (87a94add-9da4-4f49-8b0f-6a266e7fde7a) and the 2026-09-27 per-PR synthetic-commit implementation. Current GitHub settings were rechecked: main required linear history and allowed all three merge methods. Existing published history is left intact.
**Decision**: Both landing paths use SHA-pinned merge commits. Train components retain every original commit and add named integration merges; the final train adds one integration merge. A direct PR merge retains N original commits plus one merge commit. The repository permits only merge commits and main no longer requires linear history. Required check contexts, the no-skipped rule, drift/conflict guards, fast/train locks, speculative ordering, bisection and containment-based cleanup stay enforced. Bootstrap this change with the tested local pr:land implementation so the old main copy cannot squash the policy change itself.
**Dissent**: Train and branch-sync merges make the graph larger and first-parent logs show integration boundaries rather than all individual commits. Full ancestry, authorship, commit bodies and original SHAs take precedence over a flat PR-only history; first-parent remains available for summary navigation.
**Falsifier**: Any original component commit loses its SHA or becomes unreachable from main after a successful landing; either merge path requests squash/rebase; a required check, drift guard or cleanup ownership check stops blocking its established failing case.
**Owner**: Stark
