# Git workflow

> Auto-loaded.

## Commit messages

- Write the whole message in English — prefix, subject and body.
  `.githooks/commit-msg` blocks Hangul, kana and Han; merge, revert and
  fixup subjects are exempt because Git generates them.
- Allowed prefixes: `feat:` · `fix:` · `docs:` · `refactor:` · `chore:` ·
  `test:` · `style:` · `perf:`.
- Do not invent non-conventional prefixes.
- Examples:
  - `feat: move the search palette into a mobile sheet`
  - `fix: restore dark-mode alpha tokens at :root`
  - `docs: document the retired light-mode switch`
  - `refactor: unify vault ontology behind a mode-aware adapter hook`

The body explains **why** the change was needed; the diff already says what
changed. Keep lines within 80 characters.

## Branches

- Use `feat/...`, `fix/...`, `docs/...`, `chore/...`, or `refactor/...`.
- Never push directly to `main`; use a pull request.
- Do not put company codenames, personal names, or other product names in a
  branch name.

## Commit scope

- Commit small, coherent units frequently. Do not mix unrelated work.
- Separate a recurring-bug fix from a structural cleanup.
- Documentation comes first or in the same commit when a schema, route, or
  operating workflow changes.

### Code and documentation move together

This table lives here rather than in `documentation.md` because the person who
needs it is changing code. `git`, `forbidden`, and `local-first` load every turn;
other rules load only after a matching file is opened. Putting the table in a
Markdown-triggered rule reaches only someone who already decided to edit docs,
not the person most likely to forget them (audit finding, 2026-07-31).

| Code change | Documentation that must change with it |
|---|---|
| Add or remove a route | `docs/ARCHITECTURE.md` (canonical route list), `docs/FEATURES.md`, and `docs/DECISIONS.md` (`decisions:check` enforces this) |
| Add a command or script | `README.md` |
| Restructure architecture | `docs/ARCHITECTURE.md` and `AGENTS.md` |
| Add a design token | `docs/DESIGN-SYSTEM.md` and `app/globals.css`; register a ramp step in `cn.ts` too |
| Add or rename an MCP tool | `mcp/README.md`, `docs/ontology/capabilities/mcp-server.md`, and the dogfood README |
| Add a capability, domain, or element | `docs/ontology/<kind>s/<slug>.md` |
| Change `.claude/rules/` loading conditions | the table in `CLAUDE.md` and `tests/contract/rules-path-scope.contract.test.ts` |

Do not pick a subset from the `checks:changed` list. That choice, not the list,
caused two wasted CI rounds on 2026-08-20. Run
`pnpm checks:changed -- --run`; it executes every recommendation and stops at
the first failure.

## Pull requests

- Start the title with one of the conventional prefixes above. Use `Summary`
  and `Test plan` sections in the body.
- Record passing `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm test:run` when
  their risk scopes apply.
- Attach before/after screenshots for visual changes. Use dark mode; the app has
  no light mode.

## Do not

- Do not bypass hooks with `--no-verify`. `commit-msg` checks the message
  language; `pre-commit` catches generated drift; `pre-push` runs CI-like path
  lanes in parallel, leaving e2e to CI. Run the command it prints. If a lane
  is wrong, repair the lane instead of skipping it. Rationale and dissent:
  `docs/DECISIONS.md` (94), (95) and (96) — (96) overturns (95) and is the
  standing decision for the hook that exists today.
- Run `git reset --hard` or `git push --force` only when the user explicitly
  requests it. Never force-push `main`.
- Never hand-resolve conflicts in generated JSON. Files under
  `src/entities/docs-vault/data/*` and `public/docs-vault/**` come from
  `pnpm docs-vault:build`. If only those paths plus `docs/CHANGELOG.md` /
  `docs/DECISIONS.md` conflict, run `pnpm docs-vault:resolve-conflicts --
  --dry-run`, then the write command. It accepts only prepended dated records on
  byte-identical history, regenerates/stages outputs, and refuses anything else.
  Details: `docs/DEVELOPMENT-CHECKS.md`.
