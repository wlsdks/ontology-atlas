---
name: review-and-land
description: Carry a returned slice, or branches that must land together, to main — one independent review with the right lenses, one numbered fix round, landing on the train or as one integration branch, and cleanup only after the landing is proven. Not for writing the brief (parallel-brief) or for your own change with no review due.
---

# Review and land

The author never approves its own slice, and nothing is deleted until `main`
provably has it. This is the order that keeps both promises cheap.

## 1. Brief one reviewer

Give the review to one agent that did not write the change, with
`.agents/agents/reviewer.md` as its brief; never review it yourself. The brief carries:

- **Kind**: returned slice, with the pull request number, branch, worktree path
  (read-only) and the diff to read: `git diff origin/main...<branch>`.
- **Its brief**: the scratch path the author followed, and the author's report
  with each command as run and its result.
- **Lenses** from the table below, and the files in this diff that most need
  each one.
- **Output**: the verdict first (`land` or `fix`), then numbered findings, each
  with file:line, the defect in one sentence, and the exact replacement.

| The diff | Lenses |
|---|---|
| any returned slice | the returned-slice checks in the reviewer brief |
| hygiene, refactor, or structure | `self-explaining` and `lean`; `algorithm` for layout, search and matching, diffing, parsing, or graph traversal |
| rendered UI | the lenses `pnpm design:route` returned, with the `/design-build` captures |
| product behaviour | the lenses `pnpm po:route` returned |
| a path `pnpm checks:changed` calls a security surface, or a `security-raw-sinks` raise record | `security`; comment-only hunks skip it |

In a campaign of many slices the pilot slice goes first; its findings become
lettered amendments at the top of the shared brief before the rest start
(`/parallel-brief`).

## 2. One fix round

- `land`: go to §3.
- `fix`: send the numbered list unchanged to the same
  agent, in the same worktree. It answers each number with a commit, or with one
  line when a finding conflicts with its brief; you decide those.
- Send the fixes back to the reviewer only when a fix changed behaviour or
  answered a `security` or `algorithm` finding; otherwise check each number
  against the fix commit's diff yourself.
- A finding that comes back a second time means the slice needed judgment:
  re-plan the slice before sending it out again.

## 3. Land

One branch, from its worktree:

    pnpm conflicts:scan -- --head=<branch>
    pnpm pr:land <number>    # in the background; exit 0 landed, 1 ejected or closed

The lander waits and reports. Do not poll GitHub in a loop: every landing
shares one API quota. `pnpm pr:queue` once shows the queue and the train.

- **Refused or ejected on a conflict**: in the branch worktree run
  `git fetch origin main` and `git merge origin/main`. Resolve by intent, never
  with a blanket `--ours` or `--theirs`: a hunk the slice only reworded
  (comments, test titles, messages) takes `main`'s code and re-applies the
  wording where it still fits; a hunk where both sides changed behaviour goes
  back to the author. Rerun the slice's acceptance and
  `pnpm checks:changed -- --run`, push, and run `pnpm pr:land <number>` again.
- **Ejected red**: read the failing context and its run. A context known to
  flake gets one more landing with `--flaky=<context>`; any other failure goes
  to a debugging agent with the run URL and the ejection comment.

Several branches: `pnpm bundle:plan -- <branches or --match=<glob>>` reports
each as `empty`, `contained` or `pending`, the files two branches share, and
the trial-merge conflicts. Select only branches you created.

- **The train**, the default when each branch stands alone and the trial
  merge is clean: in each branch run `pnpm conflicts:scan`, push, open a draft,
  and `pnpm pr:land <number> --no-wait`; then run `pnpm pr:land --conduct`, or
  keep one landing waiting. `pnpm pr:land --plan <n...>` is the dry run.
- **One integration branch**, when the trial merge conflicts, a shared file
  needs a reading neither branch can do alone, or one slice does not build
  without another: in a clean worktree,
  `git switch -c <prefix>/bundle-<topic>-<yyyy-mm-dd> origin/main`, then
  `git merge --no-ff --no-edit <branch>` once per branch in plan order. Resolve
  by intent as above, keep both sides' keys in
  `messages/<locale>/<Namespace>.json`, resolve generated docs-vault JSON with
  `pnpm docs-vault:resolve-conflicts -- --dry-run` and then its write command,
  and recount a ratchet once on the merged tree. Read every file the plan
  listed as shared, run `node scripts/classify-change.mjs --base=origin/main`
  and `pnpm checks:changed -- --run`, push, and open one draft whose body lists
  each component (branch @ short sha, and its pull request number) and a
  `### Conflicts` section naming each shared file and how it was resolved.
  Land it with `pnpm pr:land <number>`; leave the component drafts unqueued.

## 4. Clean up after the proof

Only after `pnpm pr:land` exits 0 for that pull request:

    pnpm bundle:prune -- <branch...>            # dry run: the landing commit, or why it keeps
    pnpm bundle:prune -- <branch...> --apply

The apply step closes an open component draft, removes the worktree (unlocking
it only when the process that locked it has exited), deletes the local branch,
its `worktree-agent-*` twin and the origin branch, and prunes worktree
metadata. A branch it keeps did not land as-is: read it before deleting
anything by hand, and never select a branch another session created.
