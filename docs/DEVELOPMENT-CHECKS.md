# Development Checks

Maintainer-only checks live here so the public README stays readable. Use this
page when you touch `mcp/`, `cli/`, package manifests, release scripts, or the
dogfood ontology.

## Default Gate

Run this before pushing broad docs, package, MCP, or web changes:

```bash
pnpm test:mcp:docs
pnpm vault:validate
pnpm exec tsc --noEmit
pnpm build
pnpm bundle:check
```

For user-facing UI changes, add the relevant Playwright route check.

## Quick Matrix

| Area | First check | Escalate when needed |
|---|---|---|
| App/type safety | `pnpm exec tsc --noEmit` | `pnpm build` |
| Lint/style | `pnpm lint` | `pnpm test:run` |
| Static deploy safety | `pnpm build` | `pnpm bundle:check` |
| Static dogfood manifest | `pnpm docs-vault:check` | `pnpm test:docs-vault` |
| Vault integrity | `pnpm vault:validate` | `pnpm vault:audit` |
| CLI argument parsing | `pnpm test:cli:args` | `pnpm test:cli:lib` |
| MCP/docs contract | `pnpm test:mcp:docs` | `pnpm package:check` |
| Dogfood MCP smoke | `pnpm dogfood:status` | `pnpm dogfood:verify` |
| Packed CLI release | `pnpm smoke:packed-cli` | `pnpm test:mcp:package` |

`pnpm test:mcp:docs` also guards Firebase Hosting config as static-only:
`firebase.json` must stay Hosting-only, point at `out/`, and not add Functions,
Firestore, Storage, emulators, or rewrites.

## Vault Checks

```bash
pnpm vault:validate              # frontmatter integrity audit
pnpm vault:validate /your/vault  # validate any folder
pnpm vault:validate -- --help    # print validator usage without scanning
pnpm test:vault:validate         # focused validator CLI argument contract
pnpm docs-vault:check            # static dogfood manifest freshness
pnpm test:docs-vault             # focused docs-vault build/check helper contract
pnpm docs-vault:build            # refresh static dogfood manifest and public md
pnpm vault:audit                 # dogfood path drift guard
pnpm test:vault:audit            # focused vault audit CLI argument contract
pnpm vault:migrate --list        # registered migrations
```

`health --json` and `workspace-brief --json` are fail-closed machine outputs:
malformed diagnosis payloads are command failures, not clean vaults.

Focused diagnosis flags are forwarded to MCP `query_ontology`:

```bash
oh-my-ontology health ./ontology --dependency-types dependencies
oh-my-ontology workspace-brief ./ontology --component-types domains,domain,capabilities
oh-my-ontology workspace-brief ./ontology --component-limit 5 --node-limit 10
```

## MCP And CLI Checks

Use focused scripts first. Escalate only when you touched shared package,
verify, or release behavior.

| Command | Use when |
|---|---|
| `pnpm package:check` | Package files, entrypoints, docs contracts |
| `pnpm test:cli:args` | CLI argument parser contracts |
| `pnpm test:cli:lib` | CLI shared helper contracts |
| `pnpm test:cli:mcp-call` | CLI MCP wrapper parser/spawn behavior |
| `pnpm integration:cli:compile` | CLI compile / `--fix` canonicalization contracts |
| `pnpm test:contracts` | Cross-package schema/parser contracts |
| `pnpm test:mcp:docs` | Explicit root/MCP/CLI/dogfood docs contracts plus Firebase static-hosting guard |
| `pnpm test:mcp:verify` | MCP verifier helper behavior |
| `pnpm test:mcp:verify:first-contact` | First-contact MCP safety and unknown-tool recovery guidance |
| `pnpm test:mcp:verify:timeout` | Timeout/startup retry diagnostics |
| `pnpm test:mcp:maintenance` | `maintenance_plan` cursor/filter behavior |
| `pnpm test:mcp:suggestions` | Enum and argument suggestion quality |
| `pnpm test:mcp:package` | MCP/CLI package and tarball checks |
| `pnpm test:mcp:dogfood` | Focused live dogfood helper contracts |
| `pnpm dogfood:test` | Full dogfood helper regression suite |

`pnpm test:mcp:docs` intentionally lists explicit test-name fragments instead
of a broad `README` token, so documentation-only changes do not accidentally
expand into unrelated package contract checks.
Focused package scripts that call Node's `--test-name-pattern` go through
`scripts/run-focused-node-test.mjs`, so a typoed pattern that matches 0 tests
fails instead of passing as all skipped, and a signal-killed `node --test`
subprocess reports the signal plus target path.

## Dogfood Shortcuts

These target this repo's own `docs/ontology` vault:

```bash
pnpm dogfood:compile
pnpm dogfood:compile-fix
pnpm test:dogfood:args
pnpm test:dogfood:script-refs
pnpm test:dogfood:compile-fix
pnpm dogfood:health
pnpm dogfood:brief
pnpm dogfood:status
pnpm test:dogfood:status
pnpm dogfood:verify
pnpm dogfood:walk
pnpm dogfood:help
```

`pnpm dogfood:compile-fix` runs `compile --fix` against docs/ontology and fails
if it leaves a git diff, so the dogfood vault stays canonicalized. `pnpm
test:dogfood:compile-fix` checks that idempotence guard without the full dogfood
suite. `pnpm test:dogfood:args` checks the shared pnpm separator and nearest
`--help` hint helper without invoking any dogfood gate. `pnpm
test:dogfood:script-refs` checks that help text and package script body
`pnpm ...` references still resolve to root package scripts, and that focused
Node test wrappers fail when a pattern matches 0 tests.

`pnpm dogfood:status` runs the cheap human-readable health + workspace-brief
gates together. It still prints workspace-brief when health fails, then preserves
the first failing exit code. Use `pnpm dogfood:verify` for the full
installed-style dogfood vault gate, and `pnpm dogfood:test` only when the dogfood
helper itself changed or the focused `test:mcp:dogfood` subset is not enough.
Use `pnpm dogfood:compile-fix -- --help` / `pnpm dogfood:status -- --help`
when you need shortcut usage without running those gates; unsupported shortcut
arguments fail with exit 2 before any child check starts, and close `--help`
typos include a `Did you mean --help?` hint.

For slower filesystems:

```bash
OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk
```

## Filtered Integration Runs

Use these when the full integration suite is more than the change needs:

```bash
OMOT_TEST_NAME_PATTERN="mcp-verify" pnpm integration:cli
pnpm integration:cli:compile
pnpm integration:cli:mcp-verify
pnpm integration:cli:maintenance
OMOT_TEST_NAME_PATTERN="tools/list|initialize" pnpm integration:mcp
pnpm integration:mcp:readme
```

When using Node's `--test-name-pattern`, call `pnpm exec node --test ...`
directly. Do not append it after `pnpm integration:* --`; pnpm forwards `--`
as a test file.
Committed root shortcuts that use `--test-name-pattern` should go through
`scripts/run-focused-node-test.mjs`, so a stale pattern fails instead of
reporting an all-skipped pass.

## Source-Checkout Verify

From the repo root:

```bash
pnpm cli:mcp-verify docs/ontology --timeout-ms 15000
pnpm cli:mcp-verify -- --help
```

From `mcp/`:

```bash
cd mcp
OMOT_VAULT=../docs/ontology npm run verify
npm run verify -- ../docs/ontology
npm run verify -- --vault ../docs/ontology
npm run verify -- ../docs/ontology --timeout-ms 15000
```

Timeout mistakes include a concrete retry hint, for example:

```bash
npm run verify -- --timeout-ms 15000
npm run verify -- --vault <path> --timeout-ms 15000
oh-my-ontology mcp-verify --vault <path> --timeout-ms 15000
```

## Release Smoke

Use this before publishing package artifacts:

```bash
pnpm smoke:packed-cli
```

It checks installed CLI/MCP behavior, `mcp-verify --help`, project-less and
empty-vault paths, strict argument/enum handling, destructive dry-runs, health
tuning, and dependency-cycle failure behavior.

Key dogfood coverage:

- `get_concepts` success and partial rows
- `workspace_brief.nextActions[]` and `workspace_brief.health.checks`
- `health` and `workspace_brief` tuned diagnosis flags
- graph lookup smoke for `neighbors`, `path`, and `project_scope`
- fail-closed JSON behavior for malformed `compile`, `cycles`, `path`,
  `health`, and `workspace-brief` payloads
