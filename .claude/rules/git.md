# Git workflow

> Auto-loaded.

## Commit messages

- The whole message is English: prefix, subject, and body.
- Prefixes: `feat:` · `fix:` · `docs:` · `refactor:` · `chore:` · `test:` ·
  `style:` · `perf:` · `design:`, an optional `(scope)`, then a space. `wip` is
  not a prefix. `.githooks/commit-msg` enforces both rules; Git-generated merge,
  revert, and fixup subjects are exempt.
- The body explains **why**; the diff already says what. Lines stay within 80
  characters.

## Branches

- Use `feat/...`, `fix/...`, `docs/...`, `chore/...`, or `refactor/...`.
- Never push directly to `main`; use a pull request.

## Commit scope

- Commit small, coherent units. Do not mix unrelated work, and separate a
  recurring-bug fix from a structural cleanup.
- Documentation lands first or in the same commit when a schema, route, or
  operating workflow changes:

| Code change | Documentation that must change with it |
|---|---|
| Add or remove a route | `docs/ARCHITECTURE.md` (canonical route list), its `docs/features/` file, and a `docs/records/decisions/` fragment (`decisions:check` enforces this) |
| Add a command or script | `README.md` |
| Restructure architecture | `docs/ARCHITECTURE.md` and `AGENTS.md` |
| Add a design token | `docs/DESIGN-SYSTEM.md` and `app/globals.css`; register a ramp step in `cn.ts` too |
| Add or rename an MCP tool | `mcp/README.md`, `docs/ontology/capabilities/mcp-tool-server.md`, and the vault README |
| Add a capability, domain, or element | `docs/ontology/<kind>s/<slug>.md` |

## Landing a pull request

- Open every pull request as a draft (`gh pr create --draft`); drafts run no CI.
- `pnpm pr:land <number>` is the only way to `main`. It serializes landings and
  fires the one CI run. `pnpm pr:queue` names the lock holder and waiters,
  `pnpm pr:ci <n>` buys an early run, and `pnpm pr:land --release` frees a
  wedged lock.
- Two or more branches (a Workflow, a fan-out, several drafts) land as one
  integration branch and one draft through `/land-bundle`, never one landing
  per branch.
- Never run `gh pr merge`, `gh pr update-branch`, or `gh pr create` without
  `--draft`; `.claude/hooks/block-manual-landing.sh` refuses them.
- The title starts with a conventional prefix. The body has `Summary` and
  `Test plan` sections and records which checks ran and passed. Visual changes
  attach dark-mode before/after screenshots (the app has no light mode).

## Do not

- Do not bypass hooks with `--no-verify`. If a lane is wrong, repair the lane
  (`docs/DECISIONS.md` (96)).
- Run `git reset --hard` or `git push --force` only when the user asks, and
  never on `main`.
- Never hand-resolve conflicts in generated JSON under
  `src/entities/docs-vault/data/*` or `public/docs-vault/**`: run
  `pnpm docs-vault:resolve-conflicts -- --dry-run`, then the write command
  (`docs/records/README.md`).
