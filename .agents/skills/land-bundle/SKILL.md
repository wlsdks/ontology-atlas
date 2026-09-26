---
name: land-bundle
description: Land two or more branches (Workflow or subagent worktrees, a fan-out of fixes, several open drafts) either as one draft pull request per slice that the `pnpm pr:land` landing train batches behind one CI run, or as one hand-built integration branch when they must be resolved together; also use when briefing a fan-out whose agents will each leave a branch. A single branch lands with `pnpm pr:land <number>` instead.
---

# Land many branches

`pnpm pr:land` is a queue now: it labels the pull request `landing-queue`, and
the conductor merges up to 20 queued pull requests onto one `train/*` branch
behind **one** CI run, bisecting a red train so one bad slice is ejected
instead of blocking the rest. So twenty independent slices no longer need a
hand-made bundle to share a CI run. The bundle remains for branches that only
make sense resolved together.

## 0. Before the fan-out (when you author the Workflow or brief)

- Each agent works in its own worktree, commits on its own branch, and runs
  `pnpm checks:changed -- --run` for its slice. Whether it pushes and opens its
  own draft is the brief's call: yes for the train path, no for a bundle.
- Name the branches with one prefix you can select later, such as
  `wf/<topic>/<slice>`, or keep the worktrees under one directory.
- Give ratchet baselines, a shared message namespace file and shared docs one
  owner, or expect to recount them on the merged tree (`/parallel-brief` §2).

## 1. Select, plan, and choose the path

```bash
pnpm bundle:plan -- --match='wf/<topic>/*'          # or branch names, or --worktrees=<dir>
```

The plan (no ref, index or worktree changes) reports each branch as `empty`,
`contained` (already in `origin/main`) or `pending`, lists files that two
branches both touch, and trial-merges the pending ones in the order given.
Leave `empty` and `contained` branches out. Selection is always explicit. Never
sweep branches you did not create: other sessions keep theirs in the same
repository.

- **The train** (default): the pending branches trial-merge cleanly and each
  stands alone. Go to §2.
- **A bundle**: the trial merge conflicts, a shared file needs a reading that
  neither branch can do alone, or a slice does not build without another. The
  train would eject the conflicting slice; a bundle resolves it once. Go to §3.

## 2. The train path

For each pending branch: push it, open a draft, and queue it without waiting.

```bash
git push -u origin <branch>
gh pr create --draft --head <branch> --title "<type>: <slice>" --body-file <file>
pnpm pr:land <number> --no-wait
```

Then one process conducts, or keep one of the landings waiting:

```bash
pnpm pr:land --plan <n...>     # dry run: fast-path verdicts, the next train, trial merges
pnpm pr:land --conduct         # runs trains until the queue is empty
pnpm pr:queue                  # the queue, the train in flight and its CI
```

A slice that is already green on its own head and touches nothing `main` or the
train in flight touches merges on the fast path without waiting. A red train is
split and rerun; the breaker gets a comment and loses its label. Fix it and
`pnpm pr:land <number>` again. The conductor closes landed components and
deletes branches `main` provably contains; `pnpm bundle:prune` cleans up the
local worktrees afterwards.

## 3. The bundle path

In a clean worktree you own (a new one is fine):

```bash
git fetch origin main
git switch -c <prefix>/bundle-<topic>-<yyyy-mm-dd> origin/main   # prefix per .claude/rules/git.md
git merge --no-ff --no-edit <branch>                              # once per pending branch, in plan order
```

Resolve conflicts by intent, never with a blanket `--ours`/`--theirs`: keep
both sides' keys in `messages/<locale>/<Namespace>.json` (the composite
`messages/<locale>.json` is generated and ignored), run
`pnpm docs-vault:resolve-conflicts -- --dry-run` and then the write command for
generated docs-vault JSON, and recount a ratchet once on the merged tree instead
of picking either side's number. After the last merge, read every file the plan
listed as shared, even without a textual conflict.

```bash
node scripts/classify-change.mjs --base=origin/main   # the CI plan; gates=true means also run pnpm lint
pnpm checks:changed -- --run
git push -u origin HEAD
gh pr create --draft --title "<type>: <what the bundle does>" --body-file <file>
pnpm pr:land <bundle-number>
```

Body: `## Summary` with one line per component (branch @ short sha, and its PR
number if it had one), the commits added on top and why, a `### Conflicts`
section naming each shared file and how it was resolved, then `## Test plan`.
Leave component drafts unqueued; never land them separately. After it lands:

```bash
pnpm bundle:prune -- <same selection>            # dry run: lists what main provably contains
pnpm bundle:prune -- <same selection> --apply    # closes component PRs, removes worktrees and branches
```

`bundle:prune` acts only on branches whose content `origin/main` provably
contains, skips worktrees with uncommitted changes, and prints each head sha for
recovery. A branch it keeps means content did not land as-is: inspect it before
deleting anything by hand.
