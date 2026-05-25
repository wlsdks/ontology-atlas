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
| macOS desktop readiness | `pnpm desktop:check` | `pnpm desktop:doctor`, then `pnpm test:desktop:check` |
| Vault integrity | `pnpm vault:validate` | `pnpm vault:audit` |
| CLI argument parsing | `pnpm test:cli:args` | `pnpm test:cli:lib` |
| MCP core units | `pnpm test:mcp:unit` | `pnpm integration:mcp:readme` |
| MCP/docs contract | `pnpm test:mcp:docs` | `pnpm package:check` |
| Graph hot-path perf | `pnpm perf:graph:check` | `pnpm perf:graph:scale` |
| Dogfood MCP smoke | `pnpm dogfood:status` | `pnpm dogfood:verify` |
| Packed CLI release | `pnpm smoke:packed-cli` | `pnpm test:mcp:package` |

`pnpm test:mcp:docs` also guards Firebase Hosting config as static-only:
`firebase.json` must stay Hosting-only, point at `out/`, and not add Functions,
Firestore, Storage, emulators, or rewrites. `pnpm test:mcp:docs` also guards
the tracked `.mcp.json`, `.mcp.json.example`, and `.codex/config.toml`
source-checkout templates so local agent registration keeps pointing at
`node ./mcp/src/index.js` with `OMOT_VAULT=./docs/ontology`. Use
`pnpm test:mcp:registration` when only those MCP registration templates changed.

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

`health --json`, `agent-brief --json`, and `workspace-brief --json` are fail-closed machine outputs:
malformed diagnosis payloads are command failures, not clean vaults.

Focused diagnosis flags are forwarded to MCP `query_ontology`:

```bash
oh-my-ontology health ./ontology --dependency-types dependencies
oh-my-ontology agent-brief ./ontology --component-types domains,domain,capabilities
oh-my-ontology workspace-brief ./ontology --component-types domains,domain,capabilities
oh-my-ontology workspace-brief ./ontology --component-limit 5 --node-limit 10
```

## MCP And CLI Checks

Use focused scripts first. Escalate only when you touched shared package,
verify, or release behavior.

When in doubt, ask the repo for the narrow starting point:

```bash
pnpm checks:changed
pnpm checks:changed -- cli/src/commands/mcp-verify.mjs mcp/scripts/verify.mjs
```

`pnpm checks:changed` reads tracked changes from `git diff --name-only HEAD`
plus untracked files from `git ls-files --others --exclude-standard`, excluding
local `.agents/` and `.codex/` agent state except shared repo skills,
Codex hooks, and Codex MCP config. Pass paths after `--` to inspect a planned
file set before editing. It prints first checks plus explicit
escalation gates, and is only an advisor; still add runtime/browser checks when
the touched behavior needs them. Vault helper changes route to direct sibling
`pnpm exec node --test ...` checks when available, then to their narrow package
shortcuts: `pnpm test:docs-vault`, `pnpm test:vault:validate`, or
`pnpm test:vault:audit`. Vault migration runner or migration files route to
`pnpm vault:migrate --list` first, and migration implementations also route to
`pnpm test:contracts` so schema-evolution fixtures stay checked. Any
`docs/**/*.md` change routes to `pnpm docs-vault:check`, because
the static docs vault indexes the whole docs tree, not only `docs/ontology`.
Parser/schema/validator parity changes, including the shared
`tests/fixtures/vault-schema-cases.mjs` fixture, route to
`pnpm test:contracts` before broader package or app checks. MCP core source
changes first print the direct sibling unit command (`pnpm exec node --test
mcp/src/<name>.test.mjs` when one exists), then `pnpm test:mcp:unit` before
readme-flow integration or full dogfood verification. CLI shared helper changes
do the same for `cli/src/lib/<name>.test.mjs`, so run the printed direct
`pnpm exec node --test ...` command before `pnpm test:cli:lib` when only one
helper moved.
Dogfood shortcut helpers, script helpers, focused node-test runner, and
focused-check advisor changes use the same pattern: direct
`pnpm exec node --test scripts/...test.mjs` first, then the aggregate shortcut.
Benchmark and smoke helpers use cheap command-level checks first:
`pnpm benchmark --dry-run`, `pnpm benchmark:scale --dry-run`,
`node scripts/perf-vault.mjs 10`, `pnpm perf:graph:check`, or
`pnpm smoke:onboarding` / `pnpm smoke:memory-loop`, depending on the touched
script.
App/source TypeScript changes under `app/` or `src/` first print a direct
Vitest sibling command (`pnpm exec vitest run <path>.test.ts[x]`) when that
test file exists or is part of the same changed path set.
Source TypeScript files under `src/**/*.ts[x]` also route to
`pnpm exec tsc --noEmit`, so files without sibling tests still get a focused
type-safety gate instead of no mapping.
E2E spec changes under `tests/e2e/` first print the exact Playwright command
(`pnpm exec playwright test tests/e2e/<name>.spec.ts`) so a single journey edit
does not start from the entire E2E suite.
`vitest.config.ts` / `vitest.setup.ts` changes route to a small config smoke:
`pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts`.
`playwright.config.ts` changes route to the local-vault picker spec first,
because it exercises the Playwright webServer startup path without beginning
with every browser journey.
`postcss.config.mjs` and `app/globals.css` route to the overflow sweep spec,
which exercises global Tailwind/CSS output across the core responsive routes
without starting from every Playwright journey.
The local-first bundle guard is artifact-based: when `scripts/check-bundle.mjs`
changes, run `pnpm build` first and then `pnpm bundle:check`.
The macOS desktop readiness gate is scaffold-aware and local-first: when
`scripts/check-desktop-readiness.mjs`, `scripts/desktop-doctor.mjs`,
`docs/DESKTOP-MACOS.md`, `src-tauri/**`, `package.json`, or `next.config.ts`
changes, run `pnpm desktop:check`; checker implementation changes also route to
direct `pnpm exec node --test scripts/check-desktop-readiness.test.mjs` and
doctor implementation changes route to
`pnpm exec node --test scripts/desktop-doctor.test.mjs`, then
`pnpm test:desktop:check`. `pnpm desktop:doctor` reports local Tauri / Cargo /
rustc / Xcode command-line-tool readiness before `.app` builds; `pnpm
desktop:dev` launches the Tauri shell for local prototype work, and `pnpm
desktop:build` targets the macOS `.app` bundle.
`next.config.ts` is static-export source-of-truth; changes route to
`pnpm desktop:check`, `pnpm exec tsc --noEmit`, `pnpm build`, and then
`pnpm bundle:check`.
Next App Router entries under `app/**/*.ts[x]` and `next-env.d.ts` route to
`pnpm exec tsc --noEmit`, so route exports, metadata routes, and page/layout
type drift are caught before broader browser or build checks.
Locale routing under `src/i18n/*.ts` and message catalogs under
`messages/*.json` route to `pnpm test:i18n:messages`; changes to the message
validator test itself first print
`pnpm exec node --test scripts/validate-messages.test.mjs`; i18n TypeScript
files also route to `pnpm exec tsc --noEmit`.
`eslint.config.mjs` changes route to `pnpm lint`. `tsconfig.json` changes route
to `pnpm exec tsc --noEmit` plus the CLI/MCP repo-analysis focused integrations,
because `infer_imports` also reads TypeScript path aliases.
GitHub quality-gate files (`.github/workflows/ci.yml`,
`.github/PULL_REQUEST_TEMPLATE.md`) route to `pnpm test:mcp:docs` and
`pnpm test:mcp:package`, with `pnpm package:check` as the escalation. The local
`.githooks/pre-push` hook routes to `pnpm exec tsc --noEmit`, mirroring the
hook's own enforced gate.
GitHub community templates under `.github/ISSUE_TEMPLATE/*.yml` and
`.github/DISCUSSIONS-CATEGORIES.md` route to `pnpm test:mcp:docs`, so issue and
discussion intake copy is checked with the rest of the public agent workflow
docs.
CLI/MCP verify help changes route to `pnpm test:dogfood:script-refs` too,
because those help surfaces list root `pnpm ...` shortcuts.
Claude Code/Codex agent rules and skills under `.claude/LOOP-PRINCIPLES.md`,
`.claude/rules/*.md`, `.claude/skills/*/SKILL.md`, and
`.agents/skills/*/SKILL.md` also route to
`pnpm test:dogfood:script-refs`, because those files contain executable
workflow snippets that should not drift from package scripts.
Claude Code/Codex hook wiring and publish guard changes under
`.claude/hooks/*.sh`, `.claude/settings.json`, `.codex/hooks/*.sh`, or
`.codex/hooks.json` route to `pnpm test:claude:hooks`.
Root/MCP/CLI README changes and this file also route to that gate when they may
change scanned `pnpm ...` references.
Changes to `scripts/check-package-contracts.mjs` or its test first route to
direct `pnpm exec node --test scripts/check-package-contracts.test.mjs`, then
to `pnpm test:mcp:docs`, because that mixed contract file owns public docs and
dogfood docs assertions as well as package/release assertions.
Root `pnpm-lock.yaml` and MCP/CLI package lockfiles route to
`pnpm test:mcp:package` plus `pnpm package:check` escalation, so dependency
resolution changes are not left with a no-mapping advisor result. MCP lockfile
changes still show `pnpm dogfood:verify` as an escalation because they touch the
agent runtime package directly; CLI lockfile changes stay on package contracts
unless the changed behavior itself needs installed-style dogfood verification.

| Command | Use when |
|---|---|
| `pnpm package:check` | Package files, lockfiles, entrypoints, docs contracts, and graph hot-path perf budget |
| `pnpm bundle:check` | Local-first static export bundle guard; run after `pnpm build` when `scripts/check-bundle.mjs` changed |
| `pnpm desktop:check` | macOS desktop Tauri scaffold readiness gate for static export, image mode, docs-vault freshness, CLI/MCP verification, desktop-grade quality bar coverage, route smoke scope, and `src-tauri` shell files |
| `pnpm desktop:doctor` | Local machine prerequisite report for macOS desktop builds: Tauri CLI, Cargo, rustc, and Xcode command line tools |
| `pnpm test:desktop:check` | Desktop readiness checker contract; use direct `pnpm exec node --test scripts/check-desktop-readiness.test.mjs` first when printed |
| `pnpm exec tsc --noEmit` | TypeScript and Next config type safety |
| `pnpm test:i18n:messages` | Locale routing/message catalog parity |
| `pnpm test:claude:hooks` | Claude Code/Codex hook wiring and npm publish guard |
| `pnpm exec vitest run <path>.test.ts[x]` | Direct app/source sibling test printed by `pnpm checks:changed` when available |
| `pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts` | Vitest config/setup smoke for jsdom setup plus contract discovery |
| `pnpm exec playwright test tests/e2e/<name>.spec.ts` | Direct E2E spec printed by `pnpm checks:changed` for changed Playwright specs |
| `pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts` | Playwright config/webServer smoke before broader E2E |
| `pnpm exec playwright test tests/e2e/overflow-sweep.spec.ts` | Global CSS/PostCSS responsive overflow smoke |
| `pnpm lint` | ESLint and FSD boundary config |
| `pnpm checks:changed` | Suggest first focused checks from changed paths |
| `pnpm test:checks:changed` | Changed-path focused-check suggestion helper; use the direct `pnpm exec node --test scripts/lib/focused-check-suggestions.test.mjs` or `scripts/suggest-focused-checks.test.mjs` first when printed |
| `pnpm test:cli:args` | CLI argument parser contracts |
| `pnpm test:cli:lib` | CLI shared helper contracts; use the direct sibling `pnpm exec node --test cli/src/lib/<name>.test.mjs` first when `pnpm checks:changed` prints one |
| `pnpm test:cli:mcp-call` | CLI MCP wrapper parser/spawn behavior |
| `pnpm integration:cli` | Full CLI integration contracts; use when `cli/src/integration.test.mjs` itself changed |
| `pnpm integration:cli:entry` | CLI entrypoint, help, command inventory, and `init` contracts |
| `pnpm integration:cli:compile` | CLI compile / `--fix` canonicalization contracts |
| `pnpm integration:cli:diagnosis` | CLI `health` / `agent-brief` / `workspace-brief` diagnosis contracts |
| `pnpm integration:cli:graph-read` | CLI read-only graph command contracts, including `match-nodes` / `match-edges` scans, `explain` relation evidence, `domain-matrix` coupling summaries, `reachability`, bounded `all-paths --plan` traversal guards, explicit `pattern-walk` traversals, and `project-map` containment summaries |
| `pnpm integration:cli:graph-write` | CLI graph write dry-run/confirm safety contracts |
| `pnpm integration:cli:repo-analysis` | CLI `analyze` / `infer-imports` / `bootstrap` code-to-vault contracts |
| `pnpm integration:cli:local-vault` | CLI local vault `add` / `import` / `list` / `find` / `validate` contracts |
| `pnpm integration:cli:growth` | CLI `growth_plan` wrapper, candidate rendering, malformed payload, and argument contracts |
| `pnpm test:contracts` | Cross-package schema/parser contracts |
| `pnpm test:mcp:docs` | Explicit root/MCP/CLI/dogfood docs contracts plus Firebase static-hosting and MCP registration-template guards |
| `pnpm test:mcp:registration` | Source-checkout `.mcp.json` / `.mcp.json.example` / `.codex/config.toml` registration templates |
| `pnpm test:mcp:unit` | MCP core parser, vault, compiler, query, import-analysis, and JSON-RPC line helpers; use the direct sibling `pnpm exec node --test mcp/src/<name>.test.mjs` first when `pnpm checks:changed` prints one, including `mcp/scripts/json-rpc-lines.mjs` → `mcp/src/json-rpc-lines.test.mjs` |
| `pnpm integration:mcp` | Full MCP integration contracts; use when `mcp/src/integration.test.mjs` itself changed |
| `pnpm integration:mcp:surface` | MCP JSON-RPC `tools/list`, `initialize`, and `tools/call` surface contracts |
| `pnpm integration:mcp:repo-analysis` | MCP `analyze_repo_structure` / `infer_imports` code-to-vault contracts; advisor routes those implementation files here before broader read/query gates |
| `pnpm integration:mcp:graph` | MCP `compile_ontology` / `query_ontology` graph artifact/query contracts |
| `pnpm integration:mcp:vault-read` | MCP list/get/find/path/orphans/validate vault read contracts |
| `pnpm integration:mcp:read` | MCP `query_concepts` and shared read/query validation contracts |
| `pnpm integration:mcp:write` | MCP write tool handler contracts |
| `pnpm test:mcp:verify` | MCP verifier helper behavior |
| `pnpm test:mcp:verify:first-contact` | First-contact MCP safety and unknown-tool recovery guidance |
| `pnpm test:mcp:verify:timeout` | Timeout/startup retry diagnostics |
| `pnpm test:mcp:maintenance` | `maintenance_plan` cursor/filter behavior |
| `pnpm test:mcp:suggestions` | Enum and argument suggestion quality; use the direct sibling `pnpm exec node --test mcp/src/suggestions.test.mjs` first when `pnpm checks:changed` prints one |
| `pnpm test:mcp:package` | MCP/CLI package and tarball checks |
| `pnpm test:mcp:dogfood` | Focused live dogfood helper contracts |
| `pnpm dogfood:test` | Full dogfood helper regression suite |
| `pnpm benchmark --dry-run` | Benchmark runner config without spawning Codex |
| `pnpm benchmark:scale --dry-run` | Scale benchmark config without tmp vault or Codex spawn |
| `node scripts/perf-vault.mjs 10` | Small vault walk/read/parse perf smoke |
| `pnpm perf:graph:check` | In-process graph compiler/query latency budget on a 1k-node generated vault, using 3-run medians; includes `agent_brief`, bounded traversal, `query_plan(match_nodes)`, `match_nodes`, `query_plan(match_edges)`, `match_edges`, and the full 10-call `graph_db_pack` used by `/ontology/insights` handoff |
| `pnpm perf:graph:scale` | Larger 1k + 5k in-process graph compiler/query latency budget for scale-sensitive changes; includes the same agent traversal strategy and graph scan hot paths |
| `pnpm smoke:onboarding` | Clean repo onboarding smoke |
| `pnpm smoke:memory-loop` | Fresh repo 10-minute memory loop smoke: init, bootstrap, MCP first-contact, node profile, and side-effect-free sync proposal |

`pnpm test:mcp:docs` intentionally lists explicit test-name fragments instead
of a broad `README` token, so documentation-only changes do not accidentally
expand into unrelated package contract checks.
Focused package scripts that call Node's `--test-name-pattern` go through
`scripts/run-focused-node-test.mjs`, so a typoed pattern that matches 0 tests
fails instead of passing as all skipped, and a signal-killed `node --test`
subprocess reports the signal plus target path. The wrapper also requires an
explicit pattern and at least one test target, so accidental full-suite runs use
`node --test` directly. Node test option values such as `--test-concurrency 1`
or `--test-timeout 1000` are not counted as targets, and a missing split option
value cannot leak the following option value into the target list. The wrapper
also rejects custom reporter options from argv or `NODE_OPTIONS` before spawning
because it needs the default TAP summary to prove at least one focused test
actually ran. Focused runs with TAP summaries end with `matched=N` before the
broader file-level `tests=N`, even when a matched test fails, so reviewers can
see the exact scoped-test count without subtracting skipped tests by hand. File
setup/import failures are reported separately as `setupFailures=N` instead of
inflating the matched-test count.

## Dogfood Shortcuts

These target this repo's own `docs/ontology` vault:

```bash
pnpm dogfood:compile
pnpm dogfood:compile-fix
pnpm test:dogfood:args
pnpm test:dogfood:script-refs
pnpm test:dogfood:compile-fix
pnpm dogfood:health
pnpm dogfood:agent
pnpm dogfood:agent-graph-db-pack
pnpm dogfood:agent-setup-gate
pnpm dogfood:agent-fallbacks
pnpm dogfood:brief
pnpm dogfood:growth
pnpm dogfood:maintenance
pnpm dogfood:status
pnpm test:dogfood:status
pnpm dogfood:verify
pnpm dogfood:walk
pnpm dogfood:help
```

`pnpm dogfood:compile-fix` runs `compile --fix` against docs/ontology and fails
if it leaves a git diff, so the dogfood vault stays canonicalized, and
successful runs end with `[dogfood:compile-fix] docs/ontology unchanged`. When it
does change the vault, it tells you to run `pnpm docs-vault:build` before rerunning
the shortcut. `pnpm
test:dogfood:compile-fix` checks that idempotence guard without the full dogfood
suite. `pnpm test:dogfood:args` checks the shared pnpm separator and nearest
`--help` hint helper without invoking any dogfood gate. `pnpm
test:dogfood:script-refs` checks that help text and package script body
`pnpm ...` references still resolve to root package scripts, that
`pnpm -C mcp ...` / `pnpm --dir cli ...` directory-scoped examples resolve
against the matching package scripts, that
`scripts/lib/test-name-pattern.mjs` keeps focused filter parsing stable, and
that focused Node test wrappers fail when a pattern matches 0 tests, print
matched counts for failed focused runs, and split setup/import failures into
`setupFailures=N`.
Benchmark README changes also route here because that page documents runnable
`pnpm` benchmark commands and is scanned by the package-script reference
contract.
When `pnpm checks:changed` prints direct script-helper tests such as
`pnpm exec node --test scripts/lib/test-name-pattern.test.mjs` or
`pnpm exec node --test scripts/lib/pnpm-script-refs.test.mjs`, run those before
the combined `pnpm test:dogfood:script-refs` gate.

`pnpm dogfood:maintenance` snapshots the dogfood vault `maintenance_plan` JSON
queue without running the full status preflight. `pnpm dogfood:agent-setup-gate`
prints the machine-readable agent setup gate for docs/ontology with `ok` and
`performanceOk`, so connector-less automation can separate broken setup from
slow local fallback latency without parsing the larger graph DB pack.
`pnpm dogfood:status` runs the
cheap human-readable health + workspace-brief + agent-brief + maintenance gates together. It
still prints workspace-brief, agent-brief, and maintenance when
health fails, then preserves the first failing exit code, ends with
`[dogfood:status] health:N · workspace-brief:N · agent-brief:N · maintenance:N`, and prints a
focused follow-up line (`pnpm dogfood:health`, `pnpm dogfood:brief`,
`pnpm dogfood:agent`, or `pnpm dogfood:maintenance` + `pnpm test:mcp:maintenance`) plus a
`pnpm dogfood:verify` follow-up hint on failure so the child statuses and next
escalation paths are visible. Use
`pnpm dogfood:verify` for the full
installed-style dogfood vault gate, and `pnpm dogfood:test` only when the dogfood
helper itself changed or the focused `test:mcp:dogfood` subset is not enough.
Use `pnpm test:mcp:maintenance` when only `maintenance_plan` filter, cursor,
resume, or formatter behavior changed.
`pnpm checks:changed` routes dogfood shortcut helper changes to their direct
`pnpm exec node --test ...test.mjs` test first, then `pnpm test:dogfood:args`,
`pnpm test:dogfood:script-refs`, or `pnpm test:dogfood:compile-fix` before
broader dogfood gates.
It routes dogfood MCP helper changes to direct
`pnpm exec node --test scripts/dogfood-mcp-walk.test.mjs` first, then
`pnpm test:mcp:dogfood:timeout` before the broader `pnpm test:mcp:dogfood` gate.
It routes MCP verify helper changes to `pnpm test:mcp:verify:first-contact`
and `pnpm test:mcp:verify:timeout` before the broader `pnpm test:mcp:verify`
gate.
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
pnpm integration:cli
pnpm integration:cli:entry
pnpm integration:cli:compile
pnpm integration:cli:mcp-verify
pnpm integration:cli:diagnosis
pnpm integration:cli:graph-read
pnpm integration:cli:graph-write
pnpm integration:cli:repo-analysis
pnpm integration:cli:local-vault
pnpm integration:cli:maintenance
pnpm integration:mcp
pnpm integration:mcp:surface
pnpm integration:mcp:repo-analysis
pnpm integration:mcp:graph
pnpm integration:mcp:vault-read
pnpm integration:mcp:read
pnpm integration:mcp:write
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
- `health`, `agent_brief`, and `workspace_brief` tuned diagnosis flags
- graph lookup smoke for `neighbors`, `path`, `all_paths`, and `project_scope`
- fail-closed JSON behavior for malformed `compile`, `cycles`, `path`,
  `health`, `agent-brief`, and `workspace-brief` payloads
