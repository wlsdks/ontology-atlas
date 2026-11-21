# Integrate parallel work

Parallel slices reach `main` through one integration branch: slices merge into
it as they return, with no CI, and the one integration pull request runs CI
once. A single task does not use this; it is one branch, one draft and one
`pnpm pr:land` (`/merge`).

## Rules that hold at every step

- **History survives.** Every commit of every slice reaches `main` as it was
  made. A slice enters the integration branch only by `git merge --no-ff`
  (`pnpm integration:add` refuses anything but a merge commit whose second
  parent is the slice head), and the integration branch enters `main` only by
  `pnpm pr:land`, which makes a merge commit. Never squash, rebase-merge,
  `git merge --squash`, `git rebase` a slice onto the integration branch, or
  cherry-pick a slice's commits in place of merging it.
- **Slices check only themselves.** A slice runs
  `pnpm checks:changed -- --run --slice`: the unit tests beside its files, lint
  on them, the e2e specs that reach them, and the Rust lane only when
  `src-tauri/**` changed. Contracts, the security set, ratchets, `pnpm knip`
  and `pnpm typecheck` run once, on the integration tree, in step 3.
- **Merge as each returns.** Do not hold slices for the end; a conflict is
  cheapest while that slice is fresh.
- **Delete only what `main` holds.** A branch name goes only after
  `git merge-base --is-ancestor <head> origin/main` succeeds. A branch that
  fails it is reported, never deleted by hand.

## 1. Start, before the fan-out

    pnpm integration:start <topic>

It creates `integration/<topic>-<yyyy-mm-dd>` from `origin/main` in
`.claude/worktrees/integration-<topic>` and pushes it. Pushing starts no CI:
every workflow's `push` trigger is limited to `main`, and the `pull_request`
triggers need a pull request. Then brief each slice with `pnpm brief:new`
(`/delegate`): its own branch and worktree, `--slice` checks, no push, no pull
request.

## 2. Add each slice as it returns

Review it first (`/merge` §1-2: one reviewer when due, one fix round). Then, in
the integration worktree:

    pnpm integration:add <slice branch>

It merges with `--no-ff`, runs that slice's `--slice` checks on the merged tree
and pushes. On a conflict it stops with the files listed and the merge in
progress. Resolve each by intent, never with a blanket `--ours` or `--theirs`:
a hunk one side only reworded takes the other side's code and re-applies the
wording; a hunk where both sides changed behaviour goes back to an author.
Keep both sides' keys in `messages/<locale>/<Namespace>.json`, resolve
generated docs-vault JSON with `pnpm docs-vault:resolve-conflicts -- --dry-run`
and then its write command, and recount a ratchet on the merged tree. Then
`git add`, `git commit --no-edit`, and run `pnpm integration:add <slice branch>`
again: it continues with the checks and the push.

`pnpm bundle:plan -- --base=<integration branch> <slice branch>` previews a
slice's trial merge and the files it shares before you add it.

## 3. Open the one pull request

After the last slice, in the integration worktree:

    pnpm integration:pr -- --title="<type>: <what it does>" [--notes=<file>]

It merges `origin/main` (stopping on a conflict the same way; resolve, commit,
run it again), runs `pnpm checks:changed -- --run`, `pnpm test:contracts`,
`pnpm knip` and `pnpm typecheck` once, pushes, and opens one draft into `main`
(or updates the open one). The body lists each component as branch @ head sha,
a `### Conflicts` section naming each file that conflicted and the merge commit
that resolved it, and the lanes that passed. `--notes` adds your summary and
how each conflict was resolved. Read every file two slices both touched before
you continue, even without a textual conflict. One `reviewer` reads the pull
request when the `AGENTS.md` workflow table requires one.

## 4. Merge it

    pnpm pr:land <number>

This is the one CI run. It marks the draft ready, waits, and merges green with
a merge commit. Red returns: fix it on the integration branch with a new
commit, push, and run `pnpm pr:land <number>` again.

## 5. Clean up

Only after `pnpm pr:land` exited 0:

    pnpm integration:prune -- <integration branch>            # dry run
    pnpm integration:prune -- <integration branch> --apply

It reads the components from the integration branch's own merge commits and
hands them, with the integration branch, to `pnpm bundle:prune`. For each head
in `origin/main`'s history it removes the worktree (integration and slices),
closes an open draft, and deletes the local branch, its `worktree-agent-*`
twin and the origin branch; then it runs `git worktree prune` and
`git fetch --prune`. It refuses while the integration head is not in `main`,
and exits 1 naming every branch it kept, such as a slice that moved after it
was merged. Report those; never delete them by hand. Run it from the main
checkout or the integration worktree; `git status` is clean at the end.
