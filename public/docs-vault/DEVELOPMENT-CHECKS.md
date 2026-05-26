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
| Firebase Hosting deploy | `pnpm firebase:deploy-check` | `pnpm desktop:verify-hosted` after deploy |
| Static dogfood manifest | `pnpm docs-vault:check` | `pnpm test:docs-vault` |
| macOS desktop readiness | `pnpm desktop:check` | `pnpm desktop:doctor`, then `pnpm test:desktop:check` / `pnpm test:desktop:runtime` / `pnpm test:desktop:bridge` |
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
For production Firebase Hosting, `pnpm firebase:deploy-check` is the local
deploy preflight: it requires `.env.prod`, verifies `.firebaserc` matches
`FIREBASE_PROJECT_ID`, keeps `firebase.json` static Hosting-only, and confirms
`.env.prod` is excluded from both git and Firebase deploy packaging before
`firebase deploy --only hosting`. Changes to `firebase.json`, `.firebaserc`,
`.firebaseignore`, `.env.prod.example`, `.github/workflows/deploy-hosting.yml`,
or `scripts/check-firebase-hosting-deploy-env.mjs` route first to the fixture
backed `pnpm exec node --test scripts/check-firebase-hosting-deploy-env.test.mjs`;
the live `pnpm firebase:deploy-check` still requires a local `.env.prod`.
Firebase Hosting is deliberately separate
from the macOS app release workflow: `.github/workflows/release-macos.yml`
publishes signed/notarized local-only DMGs without Firebase secrets or deploy
steps. The website maintainer path is `.github/workflows/deploy-hosting.yml` for
manual dispatch or human-created Release events. It writes `.env.prod` from
repository variables, authenticates with `FIREBASE_SERVICE_ACCOUNT_JSON`, sets
`NEXT_PUBLIC_OMOT_FIRST_RELEASE_PENDING=0`, deploys only Hosting with
`firebase-tools@15.17.0`, and runs `pnpm desktop:verify-hosted` so the hosted
download route can be verified separately from the app release.

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
`scripts/desktop-smoke.mjs`, `scripts/package-macos-dmg.mjs`,
`scripts/verify-macos-app-launch.mjs`, `scripts/verify-macos-dmg.mjs`,
`scripts/verify-macos-install-smoke.mjs`,
`scripts/check-macos-download-release.mjs`,
`scripts/check-macos-release-secrets.mjs`, `scripts/check-macos-release-source.mjs`,
`scripts/check-macos-release-tag.mjs`,
`scripts/check-macos-release-slot.mjs`, `scripts/check-macos-release-github.mjs`,
`scripts/watch-macos-release-run.mjs`,
`scripts/sign-macos-app.mjs`,
`scripts/notarize-macos-dmg.mjs`,
`src/shared/lib/tauri-vault-fs.ts`, `docs/DESKTOP-MACOS.md`, `src-tauri/**`,
`package.json`, `.github/workflows/release-macos.yml`,
`.github/workflows/deploy-hosting.yml`, or `next.config.ts`
changes, run `pnpm desktop:check`; checker implementation changes also route to direct
`pnpm exec node --test scripts/check-desktop-readiness.test.mjs` and doctor
implementation changes route to
`pnpm exec node --test scripts/desktop-doctor.test.mjs`. Desktop smoke
implementation changes route to
`pnpm exec node --test scripts/desktop-smoke.test.mjs`, then
`pnpm test:desktop:check`. The desktop checker suite also covers the
operator-side GitHub release gate (`scripts/check-macos-release-github.mjs`) with
a fake `gh` binary, so workflow availability, required Apple secret-name
detection, tag/version alignment, stale same-tag Git refs, and stale release-slot
failures stay covered before a public tag is pushed. It also covers
`scripts/watch-macos-release-run.mjs` so the post-tag operator command waits for
the tag-commit push workflow run before handing control to `gh run watch`, and
`scripts/lib/macos-dmg-layout.mjs` so DMG mount parsing plus the drag-to-Applications
symlink target stay covered before install smoke.
Native vault bridge changes route to
`pnpm test:desktop:bridge`, which runs the WebView handle-shim tests plus
`cargo test --manifest-path src-tauri/Cargo.toml` for the Rust path guard.
`pnpm desktop:doctor` reports local Tauri / Cargo /
rustc / Xcode command-line-tool readiness plus the dogfood vault, CLI/MCP
handoff gate, and offline desktop docs before `.app` / `.dmg` builds; `pnpm
desktop:check` also requires the `package.json`, `src-tauri/tauri.conf.json`,
and `src-tauri/Cargo.toml` versions to match so app metadata, DMG filenames, and
release tags move together, and requires the root package to stay free of
Firebase SDK, Firebase Admin, and Firebase CLI dependencies so the local-only
app package cannot silently absorb the separate Hosting deploy toolchain;
`pnpm desktop:release-tag` compares the v-prefixed Git tag to those versions
before signing; `pnpm desktop:release-source` fails closed when a tag push
points at anything other than the current default-branch head, so signed DMGs
cannot be published from an unmerged PR branch;
`pnpm desktop:release-slot` fails
closed before GitHub Release upload when that same tag already has a draft,
prerelease, or public release so stale DMG assets cannot mix with the freshly
signed artifacts; `pnpm desktop:smoke` verifies the
built `out/` payload has the root app entry, locale-prefixed docs, ontology,
topology, builder routes, `_next` assets, and offline desktop docs;
`pnpm desktop:verify-app` launches the built `.app` long enough to catch early
Tauri/WebView startup crashes from inside the app executable directory and then
terminates it; `pnpm desktop:verify-install` mounts the DMG, verifies the
Applications symlink points to `/Applications`, copies the app to a temporary
install folder, launch-smokes that copied app from its own executable directory,
and removes the temp install;
`pnpm desktop:release-preflight` is the local pre-tag operator shortcut that
runs desktop readiness, docs-vault freshness, desktop checker tests, runtime
split tests, native bridge tests, runtime doctor, `cli:mcp-verify` against
`docs/ontology`, the `dogfood:agent-setup-gate` JSON fallback/performance gate,
static build, packaged-route smoke, app/DMG build, app launch smoke, DMG
mount/checksum smoke, and temporary install launch smoke;
`pnpm desktop:goal-audit -- --pr=<number> --tag=<tag>` requires PR and tag
evidence before starting the expensive local preflight, then chains that
preflight with the full public release/hosted download blocker audit, so a
single operator command proves both the installed-app artifact path and the
public download readiness path before a desktop goal is marked done;
`pnpm desktop:release-status -- --pr=<number> --tag=<tag>` is the macOS app
completion audit after PR/release work: it accepts an already merged PR or
checks tag/package/Tauri/Cargo version alignment, PR review/merge readiness,
active macOS release workflow availability, clean local and remote same-tag Git
ref slots, required Apple signing/notary secret names, public stable GitHub
Release state, and public DMG/checksum download
verification in one fail-closed pass. When PR checks block the release it names
the failing or pending GitHub check rows and prints the matching `gh pr checks`
command, so operators do not have to infer the blocker from a count like
`0/1 checks successful`. Add `--json` when a goal runner, CI wrapper, or release
dashboard needs `ready`, `blockerCount`, and per-check `next` actions without
parsing human text; stdout JSON is compact so small goal-runner buffers do not
truncate it. Add `--json-file=<path>` when the command is invoked through a
package runner that may add lifecycle text around stdout or when humans need a
pretty JSON artifact, and add `--markdown-file=<path>` when a reviewer or release
operator needs a human-readable checklist artifact. The JSON snapshot
includes `schemaVersion`, `generatedAt`, `status`, `readyAt`, and `blockedAt`
so stored release evidence can be versioned, ordered, and filtered by outcome;
top-level `blockerIds`, `localBlockerIds`, `externalBlockerIds`,
`blockersByOwner`, and `nextActions` summarize the blocked checks, and each
check also carries a stable `id`, `scope`, and `owner` such as `pull_request`,
`apple_release_secrets`, `github_release`, and `download_assets` so automation
does not branch on translated or edited labels. Actionable blockers include
`commands[]` entries, Apple signing blockers expose top-level
`missingSecrets[]`, and hosted deploy blockers expose `missingHostedSecrets[]`,
so follow-up runners can execute known diagnostics, secret
setup prompts, pre-tag source checks, the post-merge release tag push, release
workflow watch scoped to the pushed tag commit, and public download verification without parsing prose.
The default terminal output prints the same command groups under each blocker,
so an operator running the audit directly does not have to open the JSON or
Markdown artifact to find the next command.
The generated post-merge tag commands resolve the repository's current default
branch through `gh repo view ... defaultBranchRef` before `git fetch`,
`desktop:release-source`, or `git tag`, so the release handoff does not freeze a
`main` assumption into the final macOS tag path. The Markdown checklist labels
command groups as one-shell-session commands because the default-branch
variable is intentionally shared by the following fetch, source-check, and tag
commands.
Firebase Hosting is not part of the macOS
app release gate by default; verify the separate website with `pnpm desktop:verify-hosted`.
When using the command as the full desktop goal audit, pass
`--include-hosted-surface` to add the deployed promo/download website as
`hosted_deploy_workflow`, `hosted_deploy_secrets`, and `hosted_surface`
blockers in the same JSON/Markdown snapshot, including
`FIREBASE_SERVICE_ACCOUNT_JSON` in the checklist's missing-secret section;
the hosted download page keeps macOS app release blockers aligned with
review/signing/GitHub Release requirements while naming Firebase Hosting only
as the separate hosted-route deploy gate instead of sending users into the
browser workbench;
`pnpm desktop:dev` launches the Tauri shell for local prototype work, and
`pnpm desktop:build:app` targets the macOS `.app`; release builds must first
pass `pnpm desktop:release-secrets`, then run `pnpm desktop:sign` with a
Developer ID Application certificate and deep hardened-runtime signing, wrap the app with
`scripts/package-macos-dmg.mjs`, run `pnpm desktop:notarize` with Apple notary
credentials, and finish with `pnpm desktop:verify-release-dmg`, which checks the
DMG checksum, mounts it read-only, verifies the `.app` plus Applications symlink target,
requires strict app code-signature verification, validates the stapled
notarization ticket, and runs Gatekeeper assessment for the app execution and
DMG open paths before release upload. `pnpm desktop:build` keeps the local
unsigned prototype shortcut by running the app build and DMG packager.
Before a release is made public, the tag workflow runs
`pnpm desktop:verify-download -- --allow-draft` against the draft GitHub Release
assets with `github.token`; after publishing, run `pnpm desktop:verify-download`
to confirm the public GitHub Release exposes reachable Apple Silicon
(`aarch64`) and Intel (`x64`) macOS DMGs plus matching `.sha256` assets whose
contents name the same DMG files and match the downloaded DMG bytes. The two
architecture DMGs must carry the same version in their filenames, each
architecture may appear only once, and that
version must match the release tag. Any extra `oh-my-ontology_*.dmg` asset with
an unsupported architecture suffix fails the gate so the GitHub Release page
cannot present stale or ambiguous downloads; draft releases intentionally fail
unless `--allow-draft` is passed because the hosted landing page cannot serve
them to users. The draft path also falls back to the releases list when GitHub
hides draft releases from tag lookup, then matches the requested `tag_name`
before byte-checking assets.
After deploying the static website, run `pnpm desktop:verify-hosted` to confirm
the live `/ko/` landing page no longer exposes the browser vault picker CTA and
the live `/ko/download/` installation route exists and points directly to the
stable GitHub Releases page, not `/releases/latest`. This hosted-page check is separate from `pnpm desktop:release-status`
so a Firebase deployment problem cannot block the local-only macOS app release.
When `/ko/download/` returns 404, the recovery path is to merge the desktop PR
so `.github/workflows/deploy-hosting.yml` is available on the default branch,
run `gh workflow run deploy-hosting.yml --repo wlsdks/oh-my-ontology`, then
rerun `pnpm desktop:verify-hosted`.
The installed app's native vault bridge is part of this same gate:
`src-tauri/src/lib.rs` must expose folder-pick, directory-list, read, write,
file/directory delete, mkdir, and exists commands, and
`src/shared/lib/tauri-vault-fs.ts` must wrap the same commands as a handle shim
through `@tauri-apps/api/core` `invoke` / `isTauri`, not private Tauri
internals, so the existing local-vault manifest and editor paths run inside the
WebView. The Rust bridge also canonicalizes vault paths and nearest existing
parents so symlinks inside the vault cannot redirect read, write, mkdir,
exists, or remove operations outside the selected root. The default Tauri
capability stays scoped to the `main` window with `core:default` only, without
broad filesystem, shell, HTTP, or opener plugin permissions. `src-tauri/Info.plist`
must also explain selected vault-folder access for protected macOS locations
such as Documents, Downloads, Desktop, network volumes, and removable volumes.
The installed app must also keep first-run
entry local: `src/views/root-entry/ui/RootEntryPage.tsx` routes Tauri sessions
without a restored vault to `/docs/?intent=local` without rendering the hosted
marketing page, and `DocsVaultPage` opens the native picker once for that
intent. Hosted browser sessions must not treat `/docs/?intent=local` as a vault
opening path; they keep local vault work disabled and leave installation as the
path to writable local work. Runtime split changes in `RootEntryPage`,
`DocsVaultPage` persistence, or `OperationsNav` route to
`pnpm test:desktop:runtime` before the broader readiness gate. A loaded empty local vault must surface the
ontology starter in the main workspace pane and select the generated `README.md`
after creation, so the desktop first-run path does not dead-end behind a generic
empty document state.
`src/shared/lib/tauri-vault-fs.test.ts`
locks the handle shim against the command names and relative-path behavior used
by those flows. `VaultToolsMenu` and `LocalVaultPicker` keep the Tauri absolute
vault path visible, copyable, and openable in Finder for local data location
proof. `OntologyStarterCta` uses that same selected path when it copies CLI
proof and JSON agent-gate commands, so first-run desktop users do not have to
`cd` into the vault before checking agent readiness. The AI agent setup panel
uses the selected path for its verification prompt, CLI graph runbook, and JSON
gate as well, and the copied setup packet, first-contact proof, setup-state
check, and repair command reuse that selected path while preserving `.` fallbacks
for browser or source-checkout contexts. The picker exposes recently opened desktop vaults from persisted
Tauri paths so close/reopen does not require another Finder selection. The
handle store filters those Tauri path records outside the Tauri runtime, so a
hosted browser session cannot resurrect installed-app vault paths as writable
local state.
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
| `pnpm bundle:check` | Local-first static export bundle guard for the landing, download, docs, ontology, topology, and projects routes; run after `pnpm build` when `scripts/check-bundle.mjs` changed |
| `pnpm firebase:deploy-check` | Firebase Hosting deploy preflight for `.env.prod`, project-id alignment, static-only Hosting config, and deploy credential ignores |
| `pnpm desktop:check` | macOS desktop Tauri scaffold readiness gate for static export, image mode, docs-vault freshness, CLI/MCP verification, desktop-grade quality bar coverage, route smoke scope, and `src-tauri` shell files |
| `pnpm desktop:doctor` | Local machine prerequisite report for macOS desktop builds: Tauri CLI, Cargo, rustc, Xcode command line tools, and CLI/MCP agent setup gates |
| `pnpm desktop:smoke` | Built `out/` payload smoke for the packaged root app entry, locale routes, `_next` assets, and offline desktop docs before launching or bundling the `.app` / `.dmg` |
| `pnpm desktop:build:app` | Build the Tauri `.app` before optional release signing or local DMG packaging |
| `pnpm desktop:verify-app` | Launch the built `.app` from its executable directory long enough to catch early Tauri/WebView startup crashes, then terminate it |
| `pnpm desktop:verify-install` | Mount the DMG, require the `/Applications` symlink target, copy the app to a temporary install folder, launch-smoke that copy from its executable directory, then clean it up |
| `pnpm desktop:release-preflight` | Local pre-tag macOS release gate: readiness, docs-vault, checker tests, runtime split tests, bridge tests, runtime doctor, CLI/MCP handoff, agent JSON setup gate, build, route smoke, DMG, and install smoke |
| `pnpm desktop:goal-audit` | Full desktop goal gate: requires `--pr` and `--tag`, runs the local release preflight, then checks PR, signing, GitHub Release, hosted deploy, and download blockers |
| `pnpm test:desktop:runtime` | Hosted-vs-installed runtime split tests for `/docs?intent=local`, first-run desktop routing, and hosted download routing |
| `pnpm test:desktop:bridge` | WebView handle-shim tests plus Rust path-guard tests for the native vault bridge |
| `pnpm desktop:release-secrets` | Fail closed before tag release when any Apple signing or notarization secret is missing, blank, invalid base64, or not a PKCS#12 DER certificate payload |
| `pnpm desktop:release-source` | Fail closed before release signing when the tag commit is not the current default-branch head |
| `pnpm desktop:release-tag` | Fail closed before release signing when the v-prefixed Git tag does not match package.json, Tauri, and Cargo versions |
| `pnpm desktop:release-slot` | Fail closed before GitHub Release upload when the same tag already has a draft, prerelease, or public release |
| `pnpm desktop:release-github` | Operator-side macOS release readiness check for gh auth, active release workflow, required Apple secret names, optional tag/version alignment, clean local/remote same-tag Git ref slots, and clean same-tag Release slot |
| `pnpm desktop:release-run` | Wait for the tag-push `release-macos.yml` run scoped to the pushed tag commit, then watch that exact run to completion |
| `pnpm desktop:release-status` | macOS app completion audit for tag/package/Tauri/Cargo version alignment, PR review/merge readiness, active release workflow availability, clean local/remote same-tag Git ref slots, Apple release secret names, public stable Release state, public DMG/checksum download verification, and optional `--include-hosted-surface` deploy workflow, deploy secret, plus website verification |
| `pnpm desktop:sign` | Deeply sign the built `.app` with hardened runtime when `APPLE_SIGNING_IDENTITY` and a Developer ID certificate are available |
| `pnpm desktop:notarize` | Submit, staple, validate, and re-checksum the DMG when Apple notary credentials are available; failed command logs redact notary credentials |
| `pnpm desktop:verify-dmg` | Mount and checksum smoke for the generated macOS DMG, including app bundle presence and `/Applications` symlink target, before GitHub Release upload |
| `pnpm desktop:verify-release-dmg` | Release-only DMG verifier that also requires app code signing, stapled notarization, and Gatekeeper assessment |
| `pnpm desktop:verify-download` | Public GitHub Release verifier for the hosted download CTA: requires non-draft reachable same-version Apple Silicon and Intel DMG assets, rejects unsupported or duplicate-architecture `oh-my-ontology_*.dmg` names, and verifies matching `.sha256` contents and downloaded bytes |
| `pnpm desktop:verify-hosted` | Live hosted website verifier: requires `/ko/` to be promo/download-first and `/ko/download/` to exist with the stable GitHub Releases CTA, rejecting stale browser-vault CTAs and `/releases/latest` |
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

For macOS app release candidates, use:

```bash
pnpm desktop:release-preflight
pnpm desktop:goal-audit -- --pr=274 --tag=v0.1.0

# CI-only or local credentialed release signing path:
pnpm desktop:check
pnpm desktop:doctor -- --require-runtime
pnpm desktop:release-github -- --tag=v0.1.0
pnpm desktop:release-source -- --sha="$(git rev-parse HEAD)"
pnpm desktop:release-tag -- --tag=v0.1.0
pnpm desktop:release-secrets
pnpm desktop:build:app
pnpm desktop:sign
node scripts/package-macos-dmg.mjs
pnpm desktop:verify-app
pnpm desktop:verify-install
pnpm desktop:notarize
pnpm desktop:verify-release-dmg

# macOS app completion audit after PR review/merge, Apple secrets, tag workflow,
# public release publication, and DMG asset verification are expected to be done:
pnpm desktop:release-run -- --tag=v0.1.0
pnpm desktop:release-status -- --pr=274 --tag=v0.1.0
pnpm desktop:release-status -- --pr=274 --tag=v0.1.0 --json
pnpm desktop:release-status -- --pr=274 --tag=v0.1.0 --json-file=.tmp/release-status.json
pnpm desktop:release-status -- --pr=274 --tag=v0.1.0 --markdown-file=.tmp/release-status.md
```

For local unsigned smoke, `pnpm desktop:build` is the shortcut for
`pnpm desktop:build:app && node scripts/package-macos-dmg.mjs`; run
`pnpm desktop:verify-app` after it to catch app startup crashes, then
`pnpm desktop:verify-install` to mount the generated DMG, copy the bundled app
to a temporary install folder, launch-smoke that installed copy, and clean it up
before distribution checks.

`v*` tag pushes run `.github/workflows/release-macos.yml`, which builds the
same app only after docs-vault freshness, desktop checker tests, native bridge
tests, and the release tag/version gate pass on each macOS architecture lane.
It builds Apple Silicon on `macos-14` and Intel on `macos-15-intel`,
route-smokes the static desktop payload, verifies `${GITHUB_SHA}` is the current
default-branch head, verifies the release tag matches the package/Tauri/Cargo
version before signing credentials enter the path, checks all Apple release
secrets, signs the app, packages the DMG, notarizes/staples
it, verifies the checksum/mount/signature/staple
contract, copy-and-launch smokes the DMG app from a temporary install folder,
records the generated DMG filename, byte size, and SHA-256 value in the GitHub
Actions step summary, uploads workflow artifacts, attaches both DMGs plus
`.sha256` files to a draft GitHub Release, verifies those draft assets with
`pnpm desktop:verify-download -- --tag="${GITHUB_REF_NAME}" --allow-draft`,
publishes the release as stable, then runs
`pnpm desktop:verify-download -- --tag="${GITHUB_REF_NAME}"` so the same CI run
proves the hosted download CTA can reach both public DMGs and that each checksum
asset contains a SHA-256 line for the same DMG filename and bytes. After public
verification, the publish job writes the published GitHub Release URL plus the
public DMG filenames, byte sizes, and SHA-256 values to the GitHub Actions step
summary. The separate
`.github/workflows/deploy-hosting.yml` path deploys the hosted promo/download
site after release publication or manual dispatch and then runs
`pnpm desktop:verify-hosted`. The verifier
rejects unsupported extra `oh-my-ontology_*.dmg` names, mixed-version
architecture assets in the same release, duplicate architecture DMG assets, DMG
filenames whose version does not match the release tag, and DMG bytes whose
digest does not match the checksum.
Missing Apple secrets or structurally invalid
certificate secrets fail the workflow before upload instead of publishing an
unsigned or unnotarized artifact.
