# Review and merge

The author never approves its own slice, and nothing is deleted until `main`
provably has it. This is the order that keeps both promises cheap.

## 1. Read the slice; brief one code-reviewer when one is due

A single branch with its own draft starts its CI first, so the run is done or
nearly done when you merge: `pnpm pr:ci <number>`. A slice of parallel work has
no pull request and runs no CI until the integration pull request.

Read a returned slice yourself against its brief. One `code-reviewer` is due, even
for a change you wrote, when the change is one-way (the `AGENTS.md` workflow
table), adds or removes a primary surface or changes navigation or grouping,
or touches a path `pnpm checks:changed` calls a security surface. Token and
primitive changes get the rendered inventory (`/ui-proof`), not a `code-reviewer`.

Give a due review to one agent that did not write the change, with
the current host's `code-reviewer` brief. The brief carries:

- **Kind**: returned slice, with its branch, worktree path (read-only), the
  pull request number when it has one, and the diff to read:
  `git diff origin/main...<branch>`.
- **Its brief**: the scratch path the author followed, and the author's report
  with each command as run and its result.
- **Lenses** from the table below, and the files in this diff that most need
  each one. Run `pnpm checks:changed` without `--run` in the branch worktree
  and add every lens its reasons name; the author's report carries only the
  pass count.
- **Output**: the verdict first (`land` or `fix`), then numbered findings, each
  with file:line, the defect in one sentence, and the exact replacement.

| The diff | Lenses |
|---|---|
| any returned slice | the returned-slice checks in the `code-reviewer` brief |
| hygiene, refactor, or structure | `self-explaining` and `lean`; `algorithm` for layout, search and matching, diffing, parsing, or graph traversal |
| a new or removed primary surface | `attention`, `reversibility`, `responsive-bands`, and `motion`, `map-marks`, `installed-app` or `agent-action` where the surface has them, with the `/ui-build` captures |
| a one-way change | `moment`, `evidence`, `boundaries`, `smallest-slice`; `spec` when a spec was written |
| a path `pnpm checks:changed` calls a security surface, or a `security-raw-sinks` raise record | `security`; comment-only hunks skip it |

In a campaign of many slices the pilot slice goes first; its findings become
lettered amendments at the top of the shared brief before the rest start
(`/delegate`). Review each slice as it returns, then add it to the
integration branch at once (`/integrate`); do not hold slices for the end.

## 2. One fix round

- `land`: go to §3.
- `fix`: send the numbered list unchanged to the same
  agent, in the same worktree. It answers each number with a commit, or with one
  line when a finding conflicts with its brief; you decide those.
- Send the fixes back to the `code-reviewer` only when a fix changed behaviour or
  answered a `security` or `algorithm` finding; otherwise check each number
  against the fix commit's diff yourself.
- A finding that comes back a second time means the slice needed judgment:
  re-plan the slice before sending it out again.

## 3. Merge

**One branch** (a single task), from its worktree:

    pnpm conflicts:scan -- --head=<branch>
    pnpm pr:land <number>    # in the background; exit 0 merged, 1 red or closed

`pnpm pr:land` marks the draft ready, waits for its CI run and merges it green.
Merge `origin/main` into the branch before the last push: a head behind `main`
makes it fall back to its dormant train code. `pnpm pr:land` merges with a
merge commit and refuses squash and rebase. Do not poll GitHub in a loop:
every merge shares one API quota.

- **Refused on a conflict**: in the branch worktree run
  `git fetch origin main` and `git merge origin/main`. Resolve by intent, never
  with a blanket `--ours` or `--theirs`: a hunk the slice only reworded
  (comments, test titles, messages) takes `main`'s code and re-applies the
  wording where it still fits; a hunk where both sides changed behaviour goes
  back to the author. Rerun the slice's acceptance and
  `pnpm checks:changed -- --run`, push, and run `pnpm pr:land <number>` again.
- **Red**: `pnpm pr:land` already reran only the failed jobs once on the same
  head, so this is red twice. Read the failing context and its run. A context
  known to flake gets one more attempt with `--flaky=<context>`; any other
  failure goes to a debugging agent with the run URL and what `pnpm pr:land`
  printed.

**Parallel work** never merges here slice by slice: reviewed slices go into one
integration branch and reach `main` as one pull request (`/integrate`).

## 4. Clean up after the proof

Only after it merged, when the waiting `pnpm pr:land <number>` exited 0, from
the main checkout:

    pnpm bundle:prune -- <branch>            # dry run: the merging commit, or why it keeps
    pnpm bundle:prune -- <branch> --apply

It deletes a branch only when `git merge-base --is-ancestor <head> origin/main`
holds, so a squashed, rebased or cherry-picked copy never costs the original
commits their name. The apply step removes the worktree, closes an open draft,
deletes the local branch, its `worktree-agent-*` twin and the origin branch
(also when only the origin copy is left), then runs `git worktree prune` and
`git fetch --prune`. It lifts a worktree lock only when the locking process has
exited, or when the lock is your own session's (the prune process or one of its
ancestors) on a branch proven merged with a clean worktree; a lock held by any
other live process stays. `not provably landed` means the head is not in
`main`'s history: report it. A branch kept for a lock or uncommitted changes
merged and waits for its holder. Never delete either by hand, and never select
a branch another session created.
