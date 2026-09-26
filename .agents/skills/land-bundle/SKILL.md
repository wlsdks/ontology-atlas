---
name: land-bundle
description: Land two or more branches (Workflow or subagent worktrees, a fan-out of fixes, several open drafts) as one integration branch, one draft pull request, one CI run and one `pnpm pr:land`; also use when briefing a fan-out whose agents will each leave a branch. A single branch lands with `pnpm pr:land <number>` instead.
---

# Land a bundle

One landing costs a lock turn, a main merge, the local lanes and a full CI run.
Twenty branches landed one by one pay that twenty times and serialize for a day;
bundled, they pay it once. `#1883` is the reference bundle: four drafts merged
with `--no-ff`, overlaps read by hand, one CI run.

## 0. Before the fan-out (when you author the Workflow or brief)

- Each agent works in its own worktree, commits on its own branch, and runs only
  the focused tests for its slice. It does **not** push, open a pull request, or
  run `pnpm pr:land`. The bundle runs the full lanes once.
- Name the branches with one prefix you can select later, such as
  `wf/<topic>/<slice>`, or keep the worktrees under one directory.
- Give ratchet baselines, `messages/*.json` and shared docs one owner, or expect
  to recount them on the merged tree (`/parallel-brief` §2).

## 1. Select and plan

```bash
pnpm bundle:plan -- --match='wf/<topic>/*'          # or branch names, or --worktrees=<dir>
```

The plan (no ref, index or worktree changes) reports each branch as `empty`,
`contained` (already in `origin/main`) or `pending`, lists files that two
branches both touch, and trial-merges the pending ones in the order given.
Leave `empty` and `contained` branches out. If a step conflicts, try another
order; put the branch that others build on first.

Selection is always explicit. Never sweep branches you did not create: other
sessions keep theirs in the same repository.

## 2. Build the integration branch

In a clean worktree you own (a new one is fine):

```bash
git fetch origin main
git switch -c <prefix>/bundle-<topic>-<yyyy-mm-dd> origin/main   # prefix per .claude/rules/git.md
git merge --no-ff --no-edit <branch>                              # once per pending branch, in plan order
```

Resolve conflicts by intent, never with a blanket `--ours`/`--theirs`: keep
both sides' keys in `messages/*.json`, run
`pnpm docs-vault:resolve-conflicts -- --dry-run` and then the write command for
generated docs-vault JSON, and recount
a ratchet once on the merged tree instead of picking either side's number.
After the last merge, read every file the plan listed as shared, even without a
textual conflict, and fix what no longer reads as one change.

## 3. Check once, open one draft

```bash
node scripts/classify-change.mjs --base=origin/main   # the CI plan; gates=true means also run pnpm lint
pnpm checks:changed -- --run
```

Fix failures in commits on the bundle branch. Then push and open **one** draft:

```bash
git push -u origin HEAD
gh pr create --draft --title "<type>: <what the bundle does>" --body-file <file>
```

Body: `## Summary` with one line per component (branch @ short sha, and its PR
number if it had one), the commits added on top and why, a `### Conflicts`
section naming each shared file and how it was resolved, then `## Test plan`
with the commands that ran and their counts.

Leave component pull requests open as drafts; never land them separately.

## 4. Land and prune

```bash
pnpm pr:land <bundle-number>
pnpm bundle:prune -- <same selection>            # dry run: lists what main provably contains
pnpm bundle:prune -- <same selection> --apply    # closes component PRs, removes worktrees and branches
```

`bundle:prune` acts only on branches whose content `origin/main` provably
contains, skips worktrees with uncommitted changes, and prints each head sha for
recovery. A branch it keeps means content did not land as-is: inspect it
before deleting anything by hand.
