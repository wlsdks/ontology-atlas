# Merge parallel work through one integration branch

Parallel slices reach `main` through one integration branch and one pull
request. Slices merge into it as they return, with no CI; the integration
pull request runs CI once. A single task stays one branch, one draft and one
`pnpm pr:land`.

## 0. Before the fan-out

```bash
git fetch origin main
git worktree add .claude/worktrees/integration-<topic> -b integration/<topic>-<yyyy-mm-dd> origin/main
git -C .claude/worktrees/integration-<topic> push -u origin integration/<topic>-<yyyy-mm-dd>
```

Pushing the integration branch starts no CI: every workflow under
`.github/workflows/` limits its `push` trigger to `main`, and the
`pull_request` triggers need a pull request, which does not exist yet.

- Generate each brief with `pnpm brief:new` (`/delegate`). Each agent works in
  its own worktree, commits on its own branch, and finishes with
  `pnpm checks:changed -- --run --slice`: the unit tests beside its files, lint
  on them, the e2e specs that reach them, and the Rust lane only when
  `src-tauri/**` changed. It does not push and opens no pull request.
- Name the branches with one prefix you can select later, such as
  `wf/<topic>/<slice>`.
- Give ratchet baselines, a shared message namespace file and shared docs one
  owner, or expect to recount them on the merged tree (`/delegate` §3).

## 1. Merge each slice as it returns

Review the slice (`/merge` §1-2), then merge it at once, while its conflicts
are fresh, instead of waiting for the rest:

```bash
pnpm bundle:plan -- --base=integration/<topic>-<yyyy-mm-dd> <branch>   # pending or not, and its trial-merge conflicts
git merge --no-ff --no-edit <branch>        # in the integration worktree
```

Resolve conflicts by intent, never with a blanket `--ours`/`--theirs`: keep
both sides' keys in `messages/<locale>/<Namespace>.json` (the composite
`messages/<locale>.json` is generated and ignored), run
`pnpm docs-vault:resolve-conflicts -- --dry-run` and then the write command for
generated docs-vault JSON, and recount a ratchet on the merged tree instead of
picking either side's number. Run that slice's checks on the merged tree and
push:

```bash
pnpm checks:changed -- --run --slice <the slice's paths...>
git push
```

## 2. One pull request, one CI run

After the last slice:

```bash
git fetch origin main
git merge origin/main
pnpm checks:changed -- --run                # clean tree: scope origin/main...HEAD
pnpm test:contracts
pnpm knip
pnpm typecheck
node scripts/ci/classify-change.mjs --base=origin/main   # gates=true means also run pnpm lint
git push
gh pr create --draft --base main --head integration/<topic>-<yyyy-mm-dd> --title "<type>: <what it does>" --body-file <file>
pnpm pr:land <number>
```

Read every file two slices both touch before opening the pull request, even
without a textual conflict. Body: `## Summary` with one line per component
(branch @ short sha) and the commits added on top and why, a `### Conflicts`
section naming each shared file and how it was resolved, then `## Test plan`.
One `reviewer` reads it when the `AGENTS.md` workflow table requires one.

## 3. Remove everything that belonged to it

Only after `pnpm pr:land` exited 0, from the main checkout:

```bash
pnpm bundle:prune -- integration/<topic>-<yyyy-mm-dd> <component branch...>            # dry run
pnpm bundle:prune -- integration/<topic>-<yyyy-mm-dd> <component branch...> --apply
```

`bundle:prune` acts only on branches whose content `origin/main` provably
contains and prints each head sha for recovery. It removes each worktree under
`.claude/worktrees/`, closes a component draft still open, deletes the local
branch, its `worktree-agent-*` twin and the origin branch (also when only the
origin copy is left), then runs `git worktree prune` and `git fetch --prune`.
A branch it keeps did not merge as-is: report it, never delete it by hand.
