# Review and merge

The author never approves its own slice, and nothing is deleted until `main`
provably has it. This is the order that keeps both promises cheap.

## 1. Read the slice; brief one reviewer when one is due

A single branch with its own draft starts its CI first, so the run is done or
nearly done when you merge: `pnpm pr:ci <number>`. A slice of parallel work has
no pull request and runs no CI until the integration pull request.

Read a returned slice yourself against its brief. One reviewer is due, even
for a change you wrote, when the change is one-way (the `AGENTS.md` workflow
table), adds or removes a primary surface or changes navigation or grouping,
or touches a path `pnpm checks:changed` calls a security surface. Token and
primitive changes get the rendered inventory (`/ui-proof`), not a reviewer.

Give a due review to one agent that did not write the change, with
the current host's reviewer brief. The brief carries:

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
| any returned slice | the returned-slice checks in the reviewer brief |
| hygiene, refactor, or structure | `self-explaining` and `lean`; `algorithm` for layout, search and matching, diffing, parsing, or graph traversal |
| a new or removed primary surface | `attention`, `reversibility`, `responsive-bands`, and `motion`, `map-marks`, `installed-app` or `agent-action` where the surface has them, with the `/ui-build` captures |
| a one-way change | `moment`, `evidence`, `boundaries`, `smallest-slice`; `spec` when a spec was written |
| a path `pnpm checks:changed` calls a security surface, or a `security-raw-sinks` raise record | `security`; comment-only hunks skip it |

In a campaign of many slices the pilot slice goes first; its findings become
lettered amendments at the top of the shared brief before the rest start
(`/delegate`). Review each slice as it returns, then merge it into the
integration branch at once (§3); do not hold slices for the end.

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

## 3. Merge

**One branch** (a single task), from its worktree:

    pnpm conflicts:scan -- --head=<branch>
    pnpm pr:land <number>    # in the background; exit 0 merged, 1 red or closed

`pnpm pr:land` marks the draft ready, waits for its CI run and merges it green.
Merge `origin/main` into the branch before the last push: a head behind `main`
makes it fall back to its dormant train code. Do not poll GitHub in a loop:
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

**Parallel work** always merges through one integration branch, with one CI
run at the end ([integration guide](guides/bundle.md)):

1. Before the fan-out, create and push
   `integration/<topic>-<yyyy-mm-dd>` from `origin/main` in its own worktree
   under `.claude/worktrees/`. Pushing it starts no CI: every workflow's `push`
   trigger is limited to `main`, and the `pull_request` ones need a pull
   request.
2. Each slice commits on its own branch in its own worktree and runs
   `pnpm checks:changed -- --run --slice`; it neither pushes nor opens a pull
   request (`pnpm brief:new` writes this into its brief).
3. As each slice returns and passes §1-2, merge it right away:
   `git merge --no-ff --no-edit <branch>` in the integration worktree. Resolve
   conflicts by intent as above while that slice is fresh, keep both sides'
   keys in `messages/<locale>/<Namespace>.json`, resolve generated docs-vault
   JSON with `pnpm docs-vault:resolve-conflicts -- --dry-run` and then its
   write command, and recount a ratchet on the merged tree. Run only that
   slice's checks (`pnpm checks:changed -- --run --slice` with its paths), then
   push.
4. After the last slice: `git fetch origin main`, `git merge origin/main`, read
   every file two slices share (`pnpm bundle:plan -- <components>` lists
   them), and run the
   repo-wide lanes once: `pnpm checks:changed -- --run` (its clean-tree scope
   is `origin/main...HEAD`), `pnpm test:contracts`, `pnpm knip` and
   `pnpm typecheck`; `node scripts/ci/classify-change.mjs --base=origin/main`
   with `gates=true` also means `pnpm lint`. Push and open one draft,
   `integration/...` into `main`, whose body lists each component (branch @
   short sha) and a `### Conflicts` section naming each shared file and how it
   was resolved. One `reviewer` reads it when the `AGENTS.md` table requires
   one. Then `pnpm pr:land <number>` once: that is the one CI run.

## 4. Clean up after the proof

Only after it merged, when the waiting `pnpm pr:land <number>` exited 0, remove
everything that belonged to it: the integration branch, every component branch
and its `worktree-agent-*` twin, local and origin, and every component and
integration worktree. Run it from the main checkout, not from a worktree it
removes:

    pnpm bundle:prune -- <integration branch> <component branch...>            # dry run
    pnpm bundle:prune -- <integration branch> <component branch...> --apply

`bundle:prune` deletes only what `origin/main` provably contains and reports
the rest. The apply step removes each worktree, closes an open component draft,
deletes the local branch, its `worktree-agent-*` twin and the origin branch
(also when only the origin copy is left), then runs `git worktree prune` and
`git fetch --prune`. It lifts a worktree lock only when the locking process has
exited, or when the lock is your own session's (the prune process or one of its
ancestors) on a branch proven merged with a clean worktree; a lock held by any
other live process stays. `not provably landed` means it did not merge as-is:
read it. A branch kept for a lock or uncommitted changes merged and waits for
its holder. Never delete either by hand, and never select a branch another
session created. `git status` in the main checkout is clean at the end.
