# Independent development records

Each change adds a file; unrelated worktrees never reserve the same next number
or edit a shared record index. The three historical ledgers are frozen by
`legacy.json`. Their bodies remain readable in Git. The Docs Vault and existing
finder/check commands compose history with new records when needed.

## Write and read

Use Node 24 and run `pnpm install` in each worktree. Installation creates the
ignored static imports without requiring MCP dependencies. `pnpm dev` and
`pnpm build` refresh them again. If installation used `--ignore-scripts`, run
`pnpm docs-vault:build` before types, lint or tests.

A decision uses the six-field template printed by `pnpm decisions:check -- --template`.
Put that body in a temporary file, then run:

```sh
pnpm record:new -- --kind=decision --date=2026-09-13 --slug=short-subject --input=/tmp/decision.md
pnpm decisions:find short-subject
```

A user-visible change is one concrete fact with category `Added`, `Changed`,
`Fixed` or `Removed`. Internal maintenance belongs in commit messages.

```sh
pnpm record:new -- --kind=change --date=2026-09-13 --slug=short-subject --category=Fixed --input=/tmp/change.txt
```

The writer creates `decisions/YYYY-MM-DD-slug-UUID.md` or
`changes/YYYY-MM-DD-slug-UUID.md` with exclusive file creation. Keep the printed
UUID and path; later decisions cite that path instead of a mutable line number.
Superseding a decision adds another record with its prior cited.

At a release cut, add one `releases/vX.Y.Z.md` marker selecting the exact change
UUIDs included in that release. Unselected facts remain Unreleased. Never assign
a fact twice or silently include a concurrently landed change in an older tag.
This command records a release; it does not publish one:

```sh
pnpm record:new -- --kind=release --date=2026-09-13 --version=v1.2.2 --title='Release subject' --changes=UUID,UUID
```

Read the complete current changelog in the app or, after `pnpm docs-vault:build`,
in `public/docs-vault/CHANGELOG.md`. The original `docs/CHANGELOG.md` is history.

PO pilot records use `pnpm po:record -- --type=run|update|policy --input=/tmp/record.json`.
The input schemas and accepted values are enforced by
`scripts/lib/po-pilot-records.mjs` and `scripts/lib/po-pilot.mjs`. A run receives
its own UUID; later observations add update files referencing that UUID (or a
legacy numeric run). A policy record requires the same owner authority as the
former outcome edit. `pnpm po:pilot` reports the composed current state.

## Worktrees and old branches

The generated `src/entities/docs-vault/data/` and `public/docs-vault/` trees are
local build products. Commit authored documents, fragments and generator code.
Never force-add generated mirrors. Checkout and merge hooks regenerate them
without touching the index. Actual edits to the same implementation or current
reference document still require an ordinary reviewed merge.

For a branch started before this migration:

1. Save its new ledger records outside the repository and inspect its diff
   against the branch's merge base. Preserve every independent authored change.
2. Merge current main. Use `pnpm docs-vault:resolve-conflicts -- --dry-run` for
   generated-only conflicts, then its write mode. It removes old generated
   conflict entries from the index and recreates local output.
3. If a frozen ledger conflicts or was edited, recover the exact historical
   baseline from the Git blob named in `docs/records/legacy.json`. Convert the
   saved new decisions/facts/observations to fragments with the writers. Do not
   overwrite history or refresh its checksum to make a check pass.
4. Stage the resolved authored inputs, run `pnpm checks:changed -- --run`, commit
   and push. Open a draft PR and land with `pnpm pr:land <number>`.

The resolver refuses ambiguous historical changes. It does not use an `ours`
or `union` merge driver. Release facts, external registry captures, golden
fixtures and accepted review evidence remain tracked because they are inputs
or historical evidence, rather than reproducible Docs Vault output.
