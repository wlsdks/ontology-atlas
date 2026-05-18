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
| Vault integrity | `pnpm vault:validate` | `pnpm vault:audit` |
| CLI argument parsing | `pnpm test:cli:args` | `pnpm test:cli:lib` |
| MCP/docs contract | `pnpm test:mcp:docs` | `pnpm package:check` |
| Dogfood MCP smoke | `pnpm dogfood:verify` | `pnpm dogfood:walk` |
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
| `pnpm test:contracts` | Cross-package schema/parser contracts |
| `pnpm test:mcp:docs` | Explicit root/MCP/CLI/dogfood docs contracts plus Firebase static-hosting guard |
| `pnpm test:mcp:verify` | MCP verifier helper behavior |
| `pnpm test:mcp:verify:first-contact` | First-contact MCP safety guidance |
| `pnpm test:mcp:verify:timeout` | Timeout/startup retry diagnostics |
| `pnpm test:mcp:maintenance` | `maintenance_plan` cursor/filter behavior |
| `pnpm test:mcp:suggestions` | Enum and argument suggestion quality |
| `pnpm test:mcp:package` | MCP/CLI package and tarball checks |
| `pnpm test:mcp:dogfood` | Focused live dogfood helper contracts |
| `pnpm dogfood:test` | Full dogfood helper regression suite |

`pnpm test:mcp:docs` intentionally lists explicit test-name fragments instead
of a broad `README` token, so documentation-only changes do not accidentally
expand into unrelated package contract checks.

## Dogfood Shortcuts

These target this repo's own `docs/ontology` vault:

```bash
pnpm dogfood:compile
pnpm dogfood:health
pnpm dogfood:brief
pnpm dogfood:verify
pnpm dogfood:walk
pnpm dogfood:help
```

Use `pnpm dogfood:test` only when the dogfood helper itself changed or the
focused `test:mcp:dogfood` subset is not enough.

For slower filesystems:

```bash
OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk
```

## Filtered Integration Runs

Use these when the full integration suite is more than the change needs:

```bash
OMOT_TEST_NAME_PATTERN="mcp-verify" pnpm integration:cli
pnpm integration:cli:mcp-verify
pnpm integration:cli:maintenance
OMOT_TEST_NAME_PATTERN="tools/list|initialize" pnpm integration:mcp
pnpm integration:mcp:readme
pnpm exec node --test --test-name-pattern "README first exploration" mcp/src/integration.test.mjs
```

When using Node's `--test-name-pattern`, call `pnpm exec node --test ...`
directly. Do not append it after `pnpm integration:* --`; pnpm forwards `--`
as a test file.

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
