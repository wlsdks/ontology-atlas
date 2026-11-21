---
id: 9f2c7994-6850-45a6-89d5-ca3f03b8082b
date: 2026-11-21
---
## 2026-11-21 — Every slice commit reaches main, and a branch name goes only after main's history holds its head

**Why**: The owner, 2026-11-21: every commit from every component branch must survive in `main`'s history, nothing collapsed into one commit; and the integration flow should be a skill backed by scripts, not prose.
**Prior**: extends 2026-10-05 38273453 (preserve original commit history during landing) from `main` down to the integration branch. Overturns the squash-aware landing proof `bundle:prune` used (tree containment from the first-parent commits touching a branch's files): it could delete a branch whose commits `main` holds only as a squash. Builds on today's 77b860b5.
**Decision**: a slice enters the integration branch only by `git merge --no-ff`, and the integration branch enters `main` only by `pnpm pr:land`'s merge commit; squash, rebase-merge, `git merge --squash`, rebasing a slice and cherry-picking in place of a merge are forbidden at both levels. `bundle:prune` deletes a branch only when `git merge-base --is-ancestor <head> origin/main` holds. `/integrate` and `pnpm integration:start|add|pr|prune` carry the flow; `add` refuses any result but a merge commit whose second parent is the slice head.
**Dissent**: branches squashed into `main` before 2026-10-05 can no longer be pruned by the script; each is reported and needs a person.
**Falsifier**: a commit made on a merged slice branch that `git merge-base --is-ancestor` does not find in `origin/main`, or a branch `bundle:prune` deleted whose head `main` does not contain.
**Owner**: Ontology Atlas owner.
