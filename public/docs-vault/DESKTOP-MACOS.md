# macOS Desktop App Track

**Ontology Atlas** is the user-facing macOS app name and current release asset
identity for the `ontology-atlas` project. `ontology-atlas` stays the
repository, CLI, and MCP package name so existing terminal and agent package
contracts remain stable.
The current release asset identity is `ontology-atlas`.

`ontology-atlas` can become a macOS-installed app without changing the source of
truth. The desktop app should be a native shell around the same local markdown
vault, not a backend, cloud sync layer, or second data store.

## Current Decision

Use Tauri first for the prototype. The repository now includes the first
`src-tauri/` shell so desktop work can move from planning to local app smoke.

- The web app already builds as a static export (`next.config.ts` keeps
  `output: 'export'`).
- The desktop shell points at the generated `out/` directory through
  `src-tauri/tauri.conf.json`.
- In the installed app, local vault selection uses native Tauri commands when
  browser `showDirectoryPicker` is not available in the WebView, then adapts the
  selected folder to the same manifest/editor pipeline as the web prototype.
- The desktop picker persists a small recent-vault list and can reopen a recent
  Tauri vault from its stored local path, so closing one vault does not force the
  user back through Finder every time.
- Recent desktop vaults can also be removed from the picker, so stale paths from
  moved or deleted folders do not trap the user in a broken first-run loop.
- Stored Tauri vault paths are ignored outside the Tauri runtime, so the hosted
  website cannot revive installed-app recents as writable browser vault state.
- The local vault, CLI graph engine, and MCP setup gates remain the authority.
- Electron stays a fallback if a later slice needs bundled Node.js behavior.

## Product Quality Bar

The target is not a thin website wrapper. The macOS app should feel credible
next to Obsidian, Claude Desktop, and Codex Desktop:

- native installation with a stable `.app` launch path, dock behavior, window
  sizing, recent vault recall, and clear local permission prompts.
- first-run setup that explains the vault folder, CLI, and MCP handoff without
  sending the user back to hosted docs for the core path.
- local-file confidence: the user can see which vault is open, where data is
  stored, and what will be written before ontology edits touch markdown.
- agent confidence: Claude Code and Codex setup checks remain one click or one
  copied command away, and desktop smoke must include MCP verification.
- offline usefulness: `/docs`, `/ontology`, `/topology`, `/ontology/edit`, and
  `/ontology/insights` remain usable from the packaged app against the local
  vault.

If a prototype cannot meet these standards, keep desktop as an exploration
track instead of shipping a weaker app under the product name.

## Readiness Gate

Run:

```bash
pnpm desktop:check
pnpm desktop:doctor
pnpm build && pnpm desktop:smoke
pnpm test:desktop:runtime
pnpm test:desktop:bridge
pnpm desktop:build
pnpm desktop:verify-app
pnpm desktop:verify-dmg
pnpm desktop:verify-install
pnpm desktop:release-preflight         # full local pre-tag gate
pnpm desktop:goal-audit -- --pr=274 --tag=v0.1.0  # local preflight + public release/hosted audit
pnpm desktop:release-github -- --tag=v0.1.0  # GitHub workflow + Apple secret-name gate
pnpm desktop:release-source -- --sha="$(git rev-parse HEAD)"  # tag only default-branch head
pnpm desktop:release-run -- --tag=v0.1.0  # wait for the pushed tag workflow run
pnpm desktop:release-status -- --pr=274 --tag=v0.1.0  # completion audit
```

`desktop:check` verifies the static frontend and Tauri scaffold prerequisites
for a macOS prototype:

- Next.js static export is enabled.
- Image optimization is disabled for static packaging.
- trailing-slash routes are emitted for file-backed navigation.
- `pnpm build` refreshes the docs vault before `next build`.
- `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
  keep the same version so the app metadata, DMG filename, and release tag do
  not drift apart.
- the root package stays free of Firebase SDK, Firebase Admin, and Firebase CLI
  dependencies. Firebase Hosting deploys use the separate website workflow and
  `npx firebase-tools`, not the local-only app package.
- `docs-vault:check`, `cli:mcp-verify`, `desktop:doctor`, `desktop:dev`,
  `desktop:smoke`, `desktop:verify-app`, `desktop:build:app`,
  `desktop:build`, `desktop:release-source`, `desktop:release-tag`,
  `desktop:release-github`, `desktop:release-run`, `desktop:release-status`, `desktop:sign`,
  `desktop:notarize`, `desktop:verify-dmg`, `desktop:verify-install` are
  available for packaging,
  app launch, local runtime diagnosis, packaged-route smoke, startup crash
  detection, signing, notarization/stapling, DMG mount/checksum verification,
  temporary-install launch smoke, and agent handoff checks.
- `src-tauri/tauri.conf.json` loads `../out`, runs `pnpm build` before
  packaging, and targets the macOS `.app` bundle.
- the app bundle metadata identifies the install as a `DeveloperTool` with a
  local-first ontology workbench description, so Finder/Gatekeeper-facing
  metadata does not ship as an anonymous web wrapper.
- `src-tauri/Info.plist` explains why the app opens the user-selected markdown
  ontology vault when macOS asks about protected Documents, Downloads, Desktop,
  network, or removable-volume folders.
- the Tauri WebView CSP is enabled instead of left open: it allows local app
  assets, data/blob images, local styles, and the Tauri IPC endpoint required by
  native vault commands, without allowing arbitrary remote hosts.
- `src-tauri/capabilities/default.json` stays scoped to the `main` window with
  `core:default` only; the desktop app does not grant broad Tauri filesystem,
  shell, HTTP, or opener plugin permissions.
- `src-tauri/src/lib.rs` exposes the local vault bridge used by the installed
  app: native folder selection, recursive directory listing, markdown/image
  reads, text writes, file and directory deletion, directory creation, and
  existence checks.
- `src/shared/lib/tauri-vault-fs.ts` wraps those commands as a
  `FileSystemDirectoryHandle`-compatible shim through the supported
  `@tauri-apps/api/core` `invoke` / `isTauri` API, so the desktop app reuses
  the same `buildLocalManifest`, editor save, image preview, conflict guard, and
  agent-config bootstrap flows that the web prototype uses without depending on
  private Tauri WebView internals.
- the shim preserves browser File System Access create semantics: asking for a
  file handle with `{ create: true }` creates a missing file, but it first checks
  `vault_path_exists` and does not truncate an existing markdown file.
- `src/views/root-entry/ui/RootEntryPage.tsx` keeps the hosted web root on the
  product landing page, but routes the Tauri app root to `/docs/?intent=local`
  after the stored-vault restore attempt when no vault is loaded, without
  rendering the hosted marketing page inside the installed app.
- `src/views/docs-vault/ui/DocsVaultPage.tsx` treats that desktop intent as the
  installed-app first-run path and shows a vault setup welcome before opening
  the native picker from an explicit user action.
- `pnpm test:desktop:bridge` verifies that shim against the Tauri command names,
  vault-local agent config validation, and Rust unit tests for the relative-path guard that keeps file
  operations inside the selected vault root. The Rust guard canonicalizes
  existing targets and nearest existing parents so symlinks inside the vault
  cannot redirect read, write, mkdir, exists, or remove operations outside the
  selected root. Write-target parent directories are checked before
  `create_dir_all`, so a symlinked vault directory cannot create folders outside
  the selected root as a failed-write side effect.
- `scripts/package-macos-dmg.mjs` wraps the built `.app` in a reproducible
  `hdiutil` DMG with an Applications symlink, avoiding the Finder AppleScript
  dependency in Tauri's generated `bundle_dmg.sh`, and writes a `.sha256`
  checksum file next to the DMG.
- `scripts/verify-macos-app-launch.mjs` launches the built `.app` executable
  long enough to catch early Tauri/WebView startup crashes, then terminates it.
  Use `--kill-existing --open-app --require-window` when checking the actual
  LaunchServices app window after iterative local builds so stale processes from
  the same bundle do not hide the freshly built app and the smoke fails if no
  on-screen macOS window appears.
- `scripts/verify-macos-dmg.mjs` verifies that the `.sha256` line names the DMG
  basename, checks the bytes, runs `hdiutil verify`, mounts the image read-only,
  and checks for `Ontology Atlas.app` plus the Applications symlink pointing to
  `/Applications`. Release verification uses
  `pnpm desktop:verify-release-dmg`, which additionally requires strict
  `codesign` verification of the mounted app, a valid stapled notarization
  ticket on the DMG, and `spctl` Gatekeeper assessment for both the app
  execution path and DMG open path.
- `scripts/verify-macos-install-smoke.mjs` mounts the DMG, copies the bundled
  app into a temporary install folder with `ditto`, launch-smokes that copied
  app, detaches the DMG, and removes the temp install.
- `scripts/check-macos-release-secrets.mjs` fails the tag workflow before build
  when any required Apple Developer ID or notary secret is missing, blank, or
  structurally unusable, including a certificate secret that is base64 but not
  a PKCS#12 DER payload, so GitHub Releases cannot accidentally publish an
  unsigned or unnotarized macOS artifact.
- `scripts/check-macos-release-github.mjs` checks the GitHub-side prerequisites
  before pushing a public tag: `gh` authentication, the active
  `release-macos.yml` release workflow, required Apple signing/notary secret
  names, optional tag/version alignment, clean local and remote same-tag Git tag
  slots, and a clean same-tag Release slot. It cannot inspect secret values, so the tag
  workflow still runs `desktop:release-secrets` before signing.
  `pnpm test:desktop:check` covers this operator-side gate with a fake `gh`
  binary, including PR-only workflow cases, missing Apple secret names,
  tag/version alignment, stale local/remote Git tags, and stale same-tag Release slots.
- `scripts/check-macos-release-slot.mjs` runs inside the publish job before
  upload and fails if the same tag already has a draft, prerelease, or public
  GitHub Release, preventing stale DMG assets from mixing with newly signed
  artifacts during a rerun.
- `.github/workflows/release-macos.yml` removes the temporary Developer ID
  keychain and decoded `.p12` with an `always()` cleanup step after the per-arch
  artifact handoff, so failed signing/notarization attempts do not leave release
  credentials on the runner filesystem for the rest of the job.
- `scripts/sign-macos-app.mjs` deeply signs the built `.app` with hardened
  runtime using `APPLE_SIGNING_IDENTITY`, then runs strict deep `codesign`
  verification.
- `scripts/notarize-macos-dmg.mjs` submits the DMG with `xcrun notarytool`,
  waits for notarization, staples and validates the ticket, then refreshes the
  `.sha256` file because stapling changes the DMG bytes. Notary failure logs
  redact Apple ID, app-specific password, and keychain profile arguments before
  printing the failed command.
- `scripts/check-macos-download-release.mjs` verifies the GitHub Release assets
  that the hosted landing page sends users to: the normal mode requires a
  non-draft release with reachable `ontology-atlas_*_aarch64.dmg` and
  `ontology-atlas_*_x64.dmg` assets whose filename versions match the release
  tag, each architecture appears exactly once, plus matching `.sha256` checksum
  assets whose contents name the same DMG files and match the downloaded DMG bytes. Any extra
  `ontology-atlas_*.dmg` asset with an unsupported architecture suffix fails
  the gate instead of being silently ignored, and duplicate architecture DMGs
  fail so the release page cannot show ambiguous downloads. The tag workflow uses
  `--allow-draft` first so uploaded draft assets are byte-checked before the
  release is made public; if GitHub hides the draft from tag lookup, the
  verifier falls back to the releases list and matches the requested `tag_name`
  before byte-checking assets.
- The hosted landing and primary download CTAs open the GitHub Releases page
  instead of depending on a `/releases/latest` URL that is broken before the
  first public macOS release exists. The landing secondary CTA still sends
  users to `/download/`, a static installation guide, and the download page
  secondary CTA opens the source repository instead of duplicating the release
  action or steering new users into the web workbench. The download page also
  states that missing first-release DMGs mean the macOS app release is still
  waiting on PR review, tag/package/Tauri/Cargo version alignment, Apple
  signing, or the `v0.1.0` GitHub Release. It names Firebase Hosting separately
  as the promo/download website deploy gate for the
  hosted `/ko/download/` route. After verified public DMGs are published and the
  hosted download route is live, rebuild the hosted site with
  `NEXT_PUBLIC_OATLAS_FIRST_RELEASE_PENDING=0` to hide that pre-release checklist
  without a code change.
- `scripts/check-hosted-download-surface.mjs` verifies the deployed hosted
  website after Firebase Hosting deploy: `/ko/` must be promo/download-first,
  must not expose the old browser vault picker CTA, and `/ko/download/` must
  exist with the stable GitHub Releases download path instead of
  `/releases/latest`. This catches the stale live-site
  state where the app code is ready but `ontology-atlas.web.app` still serves
  the previous web-workbench landing page or a missing download route. If the
  live `/ko/download/` route returns 404, merge the desktop PR so
  `.github/workflows/deploy-hosting.yml` exists on the default branch, run
  `gh workflow run deploy-hosting.yml --repo wlsdks/ontology-atlas`, then rerun
  `pnpm desktop:verify-hosted`.
- The `/docs/?intent=local` vault-opening path is desktop-only: hosted browser
  sessions keep `/docs` in the read-only packaged docs mode, disable the local
  vault source, and point users back to the macOS download path instead of
  calling the browser folder picker.
- `pnpm desktop:release-preflight` is the local operator shortcut before a
  public tag: it runs readiness checks, docs-vault freshness, desktop checker
  tests, native bridge tests, runtime doctor, `cli:mcp-verify` against the
  dogfood vault, the `dogfood:agent-setup-gate` JSON fallback/performance gate,
  static build, packaged-route smoke, app/DMG build, app launch smoke, DMG
  mount/checksum smoke, and temporary install launch smoke.
- `pnpm desktop:goal-audit -- --pr=274 --tag=v0.1.0` is the single goal-level
  operator check: it requires PR and tag evidence before starting the expensive
  local preflight, then runs the public release status audit with
  `--include-hosted-surface` so local app packaging, PR/release readiness,
  GitHub Release assets, hosted deploy workflow/secrets, and the live download
  page are all represented before the goal is called complete.
- In the Tauri app, the local vault tools panel shows the selected absolute
  vault path, lets the user copy it, and opens the folder in Finder, so local
  data location is visible instead of hidden behind a folder nickname.
- When no vault is open, the same picker lists recently opened desktop vaults
  from persisted Tauri paths, reopens them without another Finder selection, and
  lets stale recent paths be removed from the list. If a restored desktop handle
  no longer produces a manifest, the root entry sends the user back to that
  picker instead of rendering a broken workspace.
- When a newly selected local vault has no markdown docs yet, the main
  workspace pane shows the ontology starter directly, creates the starter vault
  files plus local agent configs, and opens the generated `README.md` instead
  of leaving the user at a generic "select a document" empty state.
- vault-local agent setup validation treats `.mcp.json` and
  `.codex/config.toml` as ready only when they point `OATLAS_VAULT` at `.`, so a
  stale config copied from another vault does not look ready inside the
  installed app.
- the Rust entrypoint and default Tauri capability files exist.
- the Tauri icon set exists under `src-tauri/icons/` so a fresh checkout can
  build the `.app` instead of failing during `generate_context!()`.
- this document keeps the desktop-grade quality bar explicit: native `.app`
  launch, vault-folder permissions, recent vault recall, visible local data
  location, agent setup visibility, and offline route usefulness.
- the first prototype smoke keeps the same route contract explicit: `/docs`,
  `/ontology`, `/topology`, `/ontology/edit`, and `/ontology/insights`.

`desktop:doctor` checks the local machine runtime and the local ontology handoff
surface: Tauri CLI, Cargo, rustc, macOS Xcode command line tools, the dogfood
`docs/ontology` vault, the `cli:mcp-verify` setup gate, the
`dogfood:agent-setup-gate` JSON gate, and offline desktop docs.
It exits successfully as a report by default, and
`pnpm desktop:doctor -- --require-runtime` can be used in a local build session
when missing prerequisites should fail fast.

`desktop:smoke` checks the built `out/` payload that Tauri packages. It verifies
that the root `out/index.html` app entry exists, that both `en` and `ko` static
routes exist for `/download`, `/docs`, `/ontology`, `/topology`,
`/ontology/edit`, and `/ontology/insights`, that the ontology workbench route
titles match the expected app surfaces, that `/docs` bundles the Source Vault
graph-gate copy action, that `/ontology`, `/ontology/edit`, and
`/ontology/insights` bundle the graph DB proof copy (`Graph DB proof`,
`Browse`, `Write`, `Query`, `dogfood:graph-db`, `focused_blast_radius`, and
`relation_name_parity`), that `/ontology` also bundles the canonical slug
handle copy used by the Browse tree handoff and the runtime gate copy action
used to prove the graph DB pack from Browse, that `/ontology/edit` also bundles
the active slug handle copy used by the Builder proof rail and the Guard packet
copy action that carries relation preflight into query verification, that
`/ontology/insights` bundles the runtime gate copy action for graph DB pack
verification, that
`_next` assets are present, and that the desktop docs are bundled under
`docs-vault/` for offline reference.

`desktop:verify-app` checks the built `.app` runtime after packaging. It runs
the app executable from inside `Contents/MacOS` for a short hold window and
fails if the Tauri process exits early. This is not a substitute for a visual
native-picker smoke, but it catches the startup failures that static route
checks and DMG mounting cannot see without masking source-checkout path
dependencies through the repo root cwd. For desktop UI dogfood sessions, run
`pnpm desktop:verify-app -- --kill-existing --open-app --require-window --require-owner-name="Ontology Atlas" --min-window-size=1040x720 --hold-ms=5000`
to clear stale copies, launch the packaged `.app` through macOS LaunchServices,
and require an on-screen Ontology Atlas window large enough for desktop-only
surfaces such as `/ontology/edit`.

`desktop:verify-install` checks the generated DMG from the user-install angle.
It mounts the image, requires the drag target symlink to point to
`/Applications`, copies `Ontology Atlas.app` to a temporary install folder,
launches that copied app from its own executable directory for the same hold
window, and cleans up the temp install after detaching the image.

## First Prototype Scope

1. Run `pnpm desktop:doctor` and resolve any missing Cargo / rustc / Xcode
   command line tool, dogfood vault, CLI/MCP handoff, or offline-doc reports.
2. Run `pnpm install` so `@tauri-apps/cli` is available.
3. Build `out/` with `pnpm build`.
4. Run `pnpm desktop:smoke` to prove the packaged static payload includes the
   desktop routes, ontology workbench route titles, and offline docs.
5. Run `pnpm test:desktop:runtime` to prove hosted `/docs?intent=local` stays
   desktop-only while installed-app first-run routing opens the local vault path.
6. Run `pnpm test:desktop:bridge` to prove the WebView handle shim and Rust path
   guard still match the installed-app vault bridge.
7. Launch the macOS app shell with `pnpm desktop:dev`, open a vault folder from
   the native picker, and confirm `/docs`, `/ontology`, `/topology`, and
   `/ontology/edit` read the same local markdown files. Build the unsigned local
   `.app` and `.dmg` prototypes with `pnpm desktop:build`.
8. Launch-smoke the built app with `pnpm desktop:verify-app`.
9. Verify the generated DMG with `pnpm desktop:verify-dmg`.
10. Copy-and-launch smoke the DMG app with `pnpm desktop:verify-install`.
11. Open the dogfood vault and smoke `/docs`, `/ontology`, `/topology`, and
   `/ontology/edit`.
12. Run `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` after the app
   smoke so the desktop path still proves Claude Code / Codex handoff readiness.

## Release Signing and Notarization

Local development does not require Apple credentials. Public macOS downloads do,
and the tag workflow fails closed unless these GitHub Secrets are all present:

- `APPLE_CERTIFICATE_P12_BASE64`: base64-encoded Developer ID Application
  certificate export (`.p12`).
- `APPLE_CERTIFICATE_PASSWORD`: password for that `.p12`.
- `APPLE_KEYCHAIN_PASSWORD`: temporary CI keychain password.
- `APPLE_SIGNING_IDENTITY`: Developer ID Application identity name or SHA-1
  hash used by `codesign`.
- `APPLE_ID`: Apple ID for `notarytool`.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that Apple ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

The tag workflow verifies `${GITHUB_SHA}` with
`pnpm desktop:release-source` and `${GITHUB_REF_NAME}` with
`pnpm desktop:release-tag` before signing credentials enter the path, then runs
`pnpm desktop:release-secrets`, builds the `.app`, imports the certificate with
the macOS `base64 -D` decoder,
signs with `pnpm desktop:sign`, packages the DMG, notarizes/staples with
`pnpm desktop:notarize`, and runs `pnpm desktop:verify-release-dmg` against the
final artifact. Each architecture lane also writes the generated DMG filename,
byte size, and SHA-256 value to the GitHub Actions step summary before uploading
artifacts, so release reviewers can inspect the signed/notarized candidate
without downloading every artifact first. If the tag was pushed from an unmerged or stale commit, the tag
version drifts from package/Tauri/Cargo metadata, or the Apple secrets are not
configured, blank, or structurally invalid, the workflow fails before uploading
an unsigned or wrongly sourced distribution candidate.
Before pushing the tag, run
`pnpm desktop:release-github -- --tag=v0.1.0` to catch missing GitHub secret
names or a disabled release workflow from the operator machine. In the current
repo state this is a real external gate: GitHub authentication works, but the
release workflow is still on the macOS app PR branch and the Apple release
secret list is still incomplete, so a tag push would fail before signing. Merge
the PR first so GitHub sees `.github/workflows/release-macos.yml` on the default
branch, then configure the Apple secrets.
Use `pnpm desktop:release-status -- --pr=274 --tag=v0.1.0` as the completion
audit before calling the macOS app goal done: it accepts an already merged PR or
checks tag/package/Tauri/Cargo version alignment, PR review/merge readiness,
active macOS release workflow availability, clean local and remote same-tag Git
ref slots, required Apple signing/notary secret names, public stable GitHub
Release state, then delegates to the public DMG/checksum download verifier. If PR checks are
still blocking the release, the audit prints the failing or pending check names
plus `gh pr checks <number> --repo wlsdks/ontology-atlas` as the next action.
Use `--json` for automation that needs `ready`, `blockerCount`, and per-check
`next` actions without scraping terminal text; stdout JSON is compact so goal
runners with small output buffers do not truncate it. Use `--json-file=<path>`
when the command is wrapped by a package runner and the automation needs a clean,
pretty JSON artifact on disk. Use `--markdown-file=<path>` when a reviewer or release
operator needs a shareable checklist artifact. The snapshot includes
`schemaVersion`, `generatedAt`, `status`, `readyAt`, and `blockedAt` for stored
release evidence, top-level `blockerIds` / `localBlockerIds` /
`externalBlockerIds` / `blockersByOwner` / `nextActions`, and stable check ids
plus `scope` and `owner` values such as `pull_request`,
`apple_release_secrets`, `github_release`, and `download_assets`.
For the full desktop goal audit, add `--include-hosted-surface`; this keeps the
macOS app release gate local to GitHub Releases by default, but adds the live
promo/download deployment as `hosted_deploy_workflow`, `hosted_deploy_secrets`,
and `hosted_surface` in the same JSON/Markdown blocker snapshot when goal
completion needs both surfaces. The Markdown checklist renders both Apple
signing secrets and `FIREBASE_SERVICE_ACCOUNT_JSON` under each blocked row's
missing-secret section, so handoff reviewers do not have to cross-read the JSON
payload to finish the hosted deploy setup.
`pnpm desktop:release-run -- --tag=v0.1.0` is the post-tag watcher used by that
runbook. It waits until the `release-macos.yml` push run for the pushed tag
commit appears, then runs `gh run watch --exit-status` against that exact run so
operators do not accidentally watch an unrelated latest workflow run.
Actionable blockers also carry `commands[]` so reviewers and release operators
can copy exact diagnostic, secret setup, pre-tag source checks, post-merge
tag-push, tag-commit-scoped release-workflow watch, and public download verification commands from
the default terminal output, JSON, or Markdown without parsing prose. The post-merge tag commands resolve the
repository's current default branch through `gh repo view ... defaultBranchRef`
before `git fetch`, `desktop:release-source`, or `git tag`, so the release
handoff keeps following the real default branch if it is renamed. Markdown
checklists label these commands as one-shell-session commands because
`DEFAULT_BRANCH` is intentionally shared by the following fetch, source-check,
and tag commands. Apple signing blockers additionally
expose `missingSecrets[]` and hosted deploy blockers expose
`missingHostedSecrets[]` for direct comparison against GitHub Secrets.
Firebase Hosting is not part of the macOS app release gate;
run `pnpm desktop:verify-hosted` after the separate website deploy.
When it reports missing secrets, set each value through `gh secret set`, for
example:

```bash
gh secret set APPLE_CERTIFICATE_P12_BASE64 --repo wlsdks/ontology-atlas < /path/to/APPLE_CERTIFICATE_P12_BASE64
gh secret set APPLE_CERTIFICATE_PASSWORD --repo wlsdks/ontology-atlas < /path/to/APPLE_CERTIFICATE_PASSWORD
gh secret set APPLE_KEYCHAIN_PASSWORD --repo wlsdks/ontology-atlas < /path/to/APPLE_KEYCHAIN_PASSWORD
gh secret set APPLE_SIGNING_IDENTITY --repo wlsdks/ontology-atlas < /path/to/APPLE_SIGNING_IDENTITY
gh secret set APPLE_ID --repo wlsdks/ontology-atlas < /path/to/APPLE_ID
gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo wlsdks/ontology-atlas < /path/to/APPLE_APP_SPECIFIC_PASSWORD
gh secret set APPLE_TEAM_ID --repo wlsdks/ontology-atlas < /path/to/APPLE_TEAM_ID
```

The tag workflow first requires a clean GitHub Release slot for the tag, uploads
release assets as a draft, runs
`pnpm desktop:verify-download -- --allow-draft` against those draft assets with
`github.token`, publishes the verified release, then runs
`pnpm desktop:verify-download` again to prove the public download surface
exposes reachable Apple Silicon and Intel DMGs with filename versions that
match the release tag, exactly one DMG per architecture, and checksum files that
name and hash the same downloaded DMGs. After that public verification, the
workflow writes the published GitHub Release URL plus the DMG filenames, byte
sizes, and SHA-256 values to the GitHub Actions step summary so the release
record is inspectable without re-running the verifier. Local runs may need
`GITHUB_TOKEN` or `GH_TOKEN` when the unauthenticated
GitHub API rate limit is exhausted.
If the requested tag has not produced a GitHub Release yet, the verifier reports
that missing tag directly and points back to `.github/workflows/release-macos.yml`
instead of surfacing a raw GitHub API 404.

Current local checkpoint (2026-05-26): `pnpm desktop:doctor -- --require-runtime`,
`pnpm test:desktop:bridge`, `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000`,
`pnpm dogfood:agent-setup-gate`,
`pnpm desktop:smoke`, `pnpm desktop:build`, `pnpm desktop:verify-app`,
`pnpm desktop:verify-dmg`, and `pnpm desktop:verify-install` all pass locally.
The unsigned Apple Silicon build produces
`src-tauri/target/release/bundle/macos/Ontology Atlas.app`,
`src-tauri/target/release/bundle/dmg/ontology-atlas_0.1.0_aarch64.dmg`, and
`src-tauri/target/release/bundle/dmg/ontology-atlas_0.1.0_aarch64.dmg.sha256`.
`.github/workflows/release-macos.yml` builds Apple Silicon (`macos-14`) and
Intel (`macos-15-intel`) artifacts on `v*` tags, requires Apple release
secrets, runs docs-vault freshness, desktop checker, and native bridge tests in
both lanes,
builds and route-smokes the static desktop payload, verifies the tag version
before signing, signs and notarizes each DMG, verifies the mounted
signed/stapled artifact, copies each DMG app to a temporary install folder and
launch-smokes it, uploads workflow artifacts, creates a draft GitHub Release
with both DMGs plus checksums only after confirming that tag has no existing
Release, verifies those draft assets with
`pnpm desktop:verify-download -- --allow-draft`, publishes the release as
stable, then runs
`pnpm desktop:verify-download -- --tag="${GITHUB_REF_NAME}"` so the release run
itself proves the hosted CTA can reach both public release assets. It then
records the public GitHub Release URL plus the public asset filenames, byte
sizes, and SHA-256 values in the GitHub Actions step summary. The workflow does
not require Firebase secrets or deploy Hosting; the installed app remains
local-only, and website deployment stays in `.github/workflows/deploy-hosting.yml`.
Public downloads are still a
distribution-hardening slice until the Apple credentials are configured and the
tag workflow runs successfully.

## Later Distribution Work

Treat these as separate hardening slices after the prototype works:

- public release-channel policy after the first stable macOS tag release is exercised.
- updater and release-channel policy.
- whether MCP/CLI binaries are bundled as sidecars or installed separately.
- native filesystem permission UX beyond the current selected-folder bridge.
