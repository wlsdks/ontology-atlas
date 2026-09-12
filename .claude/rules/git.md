# Git workflow

> Auto-loaded.

## Commit messages

- Write the whole message in English — prefix, subject and body.
  `.githooks/commit-msg` blocks Hangul, kana and Han; merge, revert and
  fixup subjects are exempt because Git generates them.
- Allowed prefixes: `feat:` · `fix:` · `docs:` · `refactor:` · `chore:` ·
  `test:` · `style:` · `perf:` · `design:`, an optional `(scope)`, then a space.
  `.githooks/commit-msg` enforces the list and its refusal repeats it; merge,
  revert and fixup subjects are exempt because Git writes them. `wip` is not a
  prefix — the subject is what a reviewer and `git log` get.
- Examples:
  - `feat: move the search palette into a mobile sheet`
  - `fix: restore dark-mode alpha tokens at :root`

The body explains **why** the change was needed; the diff already says what
changed. Keep lines within 80 characters.

## Branches

- Use `feat/...`, `fix/...`, `docs/...`, `chore/...`, or `refactor/...`.
- Never push directly to `main`; use a pull request.
- No codenames or personal names in a branch name.

## Commit scope

- Commit small, coherent units frequently. Do not mix unrelated work.
- Separate a recurring-bug fix from a structural cleanup.
- Documentation comes first or in the same commit when a schema, route, or
  operating workflow changes.

### Code and documentation move together

This table lives here, not in `documentation.md`, because the person who needs
it is changing code: a Markdown-triggered rule reaches only someone who already
decided to edit docs (audit finding, 2026-07-31).

| Code change | Documentation that must change with it |
|---|---|
| Add or remove a route | `docs/ARCHITECTURE.md` (canonical route list), `docs/FEATURES.md`, and `docs/DECISIONS.md` (`decisions:check` enforces this) |
| Add a command or script | `README.md` |
| Restructure architecture | `docs/ARCHITECTURE.md` and `AGENTS.md` |
| Add a design token | `docs/DESIGN-SYSTEM.md` and `app/globals.css`; register a ramp step in `cn.ts` too |
| Add or rename an MCP tool | `mcp/README.md`, `docs/ontology/capabilities/mcp-server.md`, and the dogfood README |
| Add a capability, domain, or element | `docs/ontology/<kind>s/<slug>.md` |
| Change `.claude/rules/` loading conditions | the table in `CLAUDE.md` and `tests/contract/rules-path-scope.contract.test.ts` |

Do not pick a subset from the `checks:changed` list; that cost two CI rounds on
2026-08-20.

## Landing a pull request

`pnpm pr:land <number>` is the only way to `main`: it serializes. Open every
pull request as a draft (`gh pr create --draft`), which runs no CI.
One landing, in order: take the shared lock, merge today's `main` in, run the
local lanes on it, mark it ready, which fires the **one** CI run for that pull
request, then squash merge, delete the branch, release the lock.
`pnpm pr:queue` names the holder and the waiters; `pnpm pr:ci <n>` buys an early
run; `pnpm pr:land --release` frees a wedged lock. Why, and why GitHub's own
merge queue is unavailable: `scripts/pr-land.mjs`.

## Pull requests

- Start the title with one of the conventional prefixes above. Use `Summary`
  and `Test plan` sections in the body.
- Record which checks ran and passed.
- Attach before/after screenshots for visual changes. Use dark mode; the app has
  no light mode.

## Do not

- Do not bypass hooks with `--no-verify`. `commit-msg` checks the message
  language; `pre-commit` catches generated drift; `pre-push` runs CI-like path
  lanes. If a lane is wrong, repair the lane instead of skipping it. Rationale:
  `docs/DECISIONS.md` (96).
- Run `git reset --hard` or `git push --force` only when the user asks for it,
  and never on `main`.
- Do not run `gh pr merge`, `gh pr update-branch`, or `gh pr create` without
  `--draft`. Each one either spends a CI round or merges past the agent already
  landing; `.claude/hooks/block-manual-landing.sh` refuses all three.
- Never hand-resolve conflicts in generated JSON under
  `src/entities/docs-vault/data/*` or `public/docs-vault/**`: run
  `pnpm docs-vault:resolve-conflicts -- --dry-run`, then the write command.
  Details: `docs/DEVELOPMENT-CHECKS.md`.
