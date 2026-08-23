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
- offline usefulness: `/docs`, `/topology`, `/ontology/studio`, and
  `/ontology/insights` remain usable from the packaged app against the local
  vault; legacy `/ontology` and `/ontology/edit` links still converge on
  Topology and Workshop instead of breaking.

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
pnpm desktop:release-artifact          # credentialed signed/notarized DMG path
pnpm desktop:goal-audit -- --pr=<number> --tag=v1.0.0  # local preflight + public release/hosted audit
pnpm desktop:release-github -- --tag=v1.0.0  # GitHub workflow + Developer ID direct-download secret-name gate
pnpm desktop:release-source -- --mode=admit --tag=v1.0.0 --sha="$(git rev-parse origin/main)"  # tag must be main head
pnpm desktop:release-run -- --tag=v1.0.0 --ref=main  # dispatch and watch the protected run
pnpm desktop:release-status -- --pr=<number> --tag=v1.0.0  # completion audit
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
  dependencies (SDK ban). The hosted website deploys via the separate GitHub
  Pages workflow, not the local-only app package.
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
  private Tauri WebView internals. The same shim now exposes the `values()`
  iterator used by ontology-block recursion, so INDEX block import and realm
  block export use a purpose-titled native folder picker in the installed app
  instead of being disabled when WebView `showDirectoryPicker()` is absent.
  Import still opens a dry-run merge preview before any vault write; cancelling
  either native picker leaves the current vault and realm state unchanged.
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
  Use `--kill-existing --open-app --require-window
  --require-capturable-window --require-accessibility-window` when checking the actual LaunchServices app
  window after iterative local builds so stale processes from the same bundle do
  not hide the freshly built app and the smoke fails if no on-screen macOS
  window appears or no screenshot artifact can be produced for that window.
- `scripts/verify-macos-dmg.mjs` verifies that the `.sha256` line names the DMG
  basename, checks the bytes, runs `hdiutil verify`, mounts the image read-only,
  and checks for `Ontology Atlas.app` plus the Applications symlink pointing to
  `/Applications`. Release verification uses
  `pnpm desktop:verify-release-dmg`, which additionally requires strict
  `codesign` verification of the mounted app, a valid stapled notarization
  ticket on the DMG, and `spctl` Gatekeeper assessment for both the app
  execution path and DMG open path.
- `scripts/verify-macos-install-smoke.mjs` mounts the DMG, copies the bundled
  app into a temporary install folder with `ditto`, opens that copied app through
  LaunchServices, requires a visible Ontology Atlas window plus Accessibility
  text, detaches the DMG, and removes the temp install.
- `scripts/check-macos-release-secrets.mjs` fails the protected release workflow before build
  when any required Apple Developer ID, notary, or Tauri updater secret is missing, blank, or
  structurally unusable, including a certificate secret that is base64 but not
  a PKCS#12 DER payload, so GitHub Releases cannot accidentally publish an
  unsigned or unnotarized macOS artifact.
- `scripts/check-macos-release-github.mjs` checks the GitHub-side prerequisites
  before dispatch: `gh` authentication, the active `release-macos.yml` workflow,
  the `release-signing` environment policy, API 3 environment secret names,
  retained certificate/updater 4 repository secret names,
  absence of same-name repository secret copies, optional tag/version alignment,
  and clean remote tag/Release slots. It cannot inspect secret values, so the
  protected workflow still runs `desktop:release-secrets` before signing.
  `pnpm test:desktop:check` covers this operator-side gate with a fake `gh`
  binary, including PR-only workflow cases, missing Developer ID direct-download secret names,
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
  fail so the release page cannot show ambiguous downloads. The protected workflow uses
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
  signing, or the `v1.0.0` GitHub Release. It names the hosted website deploy
  separately (GitHub Pages) as the promo/download website deploy gate for the
  hosted `/ko/download/` route. After verified public DMGs are published and the
  hosted download route is live, rebuild the hosted site with
  `NEXT_PUBLIC_OATLAS_FIRST_RELEASE_PENDING=0` to hide that pre-release checklist
  without a code change.
- `scripts/check-hosted-download-surface.mjs` verifies the deployed hosted
  website after the GitHub Pages deploy: `/ko/` must be promo/download-first,
  must not expose the old browser vault picker CTA, and `/ko/download/` must
  exist with the stable GitHub Releases download path instead of
  `/releases/latest`. This catches the stale live-site
  state where the app code is ready but `wlsdks.github.io/ontology-atlas` still
  serves the previous web-workbench landing page or a missing download route. If
  the live `/ko/download/` route returns 404, merge the desktop PR so
  `.github/workflows/deploy-pages.yml` exists on the default branch, run
  `gh workflow run deploy-pages.yml --repo wlsdks/ontology-atlas`, then rerun
  `pnpm desktop:verify-hosted`.
- The `/docs/?intent=local` vault-opening path is desktop-only: hosted browser
  sessions keep `/docs` in the read-only packaged docs mode, disable the local
  vault source, and point users back to the macOS download path instead of
  calling the browser folder picker.
- `pnpm desktop:release-preflight` is the local operator shortcut before
  creating the release tag: it runs readiness checks, docs-vault freshness, desktop checker
  tests, native bridge tests, runtime doctor, `cli:mcp-verify` against the
  dogfood vault, the `dogfood:agent-setup-gate` JSON fallback/performance gate,
  static build, packaged-route smoke, app/DMG build, LaunchServices app content
  proof (`--open-app --require-window --require-owner-name="Ontology Atlas"
  --min-window-size=1040x720 --require-accessibility-text="Ontology Atlas"`),
  DMG mount/checksum smoke, and temporary install launch smoke. It does not require
  Developer ID credentials, so it is the fast local proof for an unsigned
  prototype artifact.
- `pnpm desktop:release-artifact` is the credentialed artifact path for direct
  downloads: it requires Developer ID/notary credentials, rebuilds and route-smokes
  the app, signs the `.app`, packages the DMG, notarizes/staples it, runs
  `desktop:verify-release-dmg`, and install-smokes the final DMG.
- `pnpm desktop:goal-audit -- --pr=<number> --tag=v1.0.0` is the single goal-level
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
- the first prototype smoke keeps the current route contract explicit:
  `/docs`, `/topology`, `/ontology/studio`, and `/ontology/insights`, plus the
  `/ontology` → Topology and `/ontology/edit` → Workshop compatibility entries.

`desktop:doctor` checks the local machine runtime and the local ontology handoff
surface: Tauri CLI, Cargo, rustc, macOS Xcode command line tools, the dogfood
`docs/ontology` vault, the `cli:mcp-verify` setup gate, the
`dogfood:agent-setup-gate` JSON gate, offline desktop docs, and the current
local `.app` signing state. Ad-hoc local prototype bundles are reported as a
warning without blocking development; public direct-download artifacts still
need Developer ID signing and notarization.
It exits successfully as a report by default, and
`pnpm desktop:doctor -- --require-runtime` can be used in a local build session
when missing prerequisites should fail fast.

`desktop:smoke` checks the built `out/` payload that Tauri packages. It verifies
the root entry, `_next` assets, offline docs, and both `en` and `ko` variants of
`/download`, `/docs`, `/ontology`, `/topology`, `/ontology/edit`, and
`/ontology/insights`. The proof follows current route meaning:

- Download includes the install → vault → AI-assistant handoff plus fact,
  checksum, and release-availability components.
- Docs includes its header/viewer and Files/Graph/Agent source contract.
- `/ontology` packages the compatibility redirect to
  `/topology?index=expanded`; `/ontology/edit` packages the redirect to
  `/ontology/studio`, including its `?node=` handoff.
- Topology packages canvas-v2 plus relation-focus and path-state contracts.
- Insights packages `maintenance-board`, `one-tab-one-question`, and
  `tab-query`.

The smoke does not require the retired tree browser, ERD builder, or query
cockpit. If a root, route, asset, or offline doc is missing, the next action is
to rebuild. If only a title, current copy, or component marker differs, the
report names static contract drift and asks the maintainer to compare the
product and smoke source before rebuilding once.

`desktop:verify-app` checks the built `.app` runtime after packaging. It runs
the app executable from inside `Contents/MacOS` for a short hold window and
fails if the Tauri process exits early. This is not a substitute for a visual
native-picker smoke, but it catches the startup failures that static route
checks and DMG mounting cannot see without masking source-checkout path
dependencies through the repo root cwd. The verifier takes a per-app lock before
stale-process cleanup, so parallel local checks cannot kill each other and
misreport a healthy app as an early SIGTERM exit. `--kill-existing` also clears
installed or temporary `.app` copies with the same `Contents/MacOS/ontology-atlas`
executable, preventing a stale `/Applications/Ontology Atlas.app` from sharing
the bundle id during local dogfood. The Codex Run action (`./script/build_and_run.sh`)
also refreshes an existing `/Applications/Ontology Atlas.app` when its bundle id
matches the freshly built app, so Computer Use app-name dogfood opens the current
build instead of an older installed copy. When that refresh happens, the Run
action verifies and leaves running the refreshed `/Applications` app so shell
evidence and Computer Use app-name evidence point at the same bundle. It also
prints CoreGraphics window diagnostics and writes
`.tmp/ontology-atlas-dogfood-desktop.png`, which is the fallback visual artifact
when Computer Use cannot attach to the running app. For desktop UI dogfood
sessions, run
`pnpm desktop:verify-app -- --kill-existing --open-app --require-window --require-capturable-window --require-accessibility-window --require-owner-name="Ontology Atlas" --min-window-size=1040x720 --hold-ms=5000`
to clear stale copies, launch the packaged `.app` through macOS LaunchServices,
and require an on-screen Ontology Atlas window that can also produce a local
screenshot artifact at a size large enough for desktop-only surfaces such as
`/ontology/edit`. Add repeated `--require-accessibility-text="..."` options when
the specific question is whether the current WebView build exposes expected
ontology and agent-handoff copy through macOS automation. That optional text
gate narrows the gap between shell launch proof and Computer Use screen
inspection when the AX tree exposes WebView text; otherwise it fails closed with
the missing text or empty-payload diagnosis. The capture and Accessibility
checks are diagnostic gates; with `--print-window-diagnostics`, capture failures
also print `captureRows` beside CoreGraphics windows and AX rows before exiting.
The CoreGraphics rows include alpha, sharing state, store type, and memory usage,
and the capture rows include sharing state and alpha, so the failure still
records whether the app had a real opaque/shareable window and which capture
method failed. Add `--require-frontmost` when the question is whether
LaunchServices opened the app as the foreground process that desktop-control
tools should target.
the installed-app dogfood pass still comes from observing the same app with
Computer Use.

`desktop:verify-install` checks the generated DMG from the user-install angle.
It mounts the image, requires the drag target symlink to point to
`/Applications`, copies `Ontology Atlas.app` to a temporary install folder,
verifies that copied app through the same LaunchServices app content proof used
by `desktop:release-preflight`, and cleans up the temp install after detaching
the image.

## First Prototype Scope

1. Run `pnpm desktop:doctor` and resolve any missing Cargo / rustc / Xcode
   command line tool, dogfood vault, CLI/MCP handoff, or offline-doc reports.
2. Run `pnpm install` so `@tauri-apps/cli` is available.
3. Build `out/` with `pnpm build`.
4. Run `pnpm desktop:smoke` to prove the packaged static payload includes the
   current route titles, compatibility redirects, workbench component markers,
   and offline docs.
5. Run `pnpm test:desktop:runtime` to prove hosted `/docs?intent=local` stays
   desktop-only while installed-app first-run routing opens the local vault path.
6. Run `pnpm test:desktop:bridge` to prove the WebView handle shim and Rust path
   guard still match the installed-app vault bridge.
7. Launch the macOS app shell with `pnpm desktop:dev`, open a vault folder from
   the native picker, and confirm `/docs`, `/topology`, `/ontology/studio`, and
   `/ontology/insights` read the same local markdown files. Confirm legacy
   `/ontology` and `/ontology/edit` links redirect to the current destinations.
   Build the unsigned local `.app` and `.dmg` prototypes with
   `pnpm desktop:build`.
8. Launch-smoke the built app with `pnpm desktop:verify-app`.
9. Verify the generated DMG with `pnpm desktop:verify-dmg`.
10. Copy-and-launch smoke the DMG app with `pnpm desktop:verify-install`.
11. Open the dogfood vault and smoke `/docs`, `/topology`,
   `/ontology/studio`, and `/ontology/insights`.
12. Run `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` after the app
   smoke so the desktop path still proves Claude Code / Codex handoff readiness.

## Release channels — stable and RC

The tag determines the channel. **Semver pre-releases come after the hyphen**, and that single character separates "those who want to try first" from "everyone."

| Tag | GitHub | Recipient |
|---|---|---|
| `v1.1.0` | Official release | Everyone — pointed to by `releases/latest` |
| `v1.1.0-rc.1` | **Pre-release** badge | Only those who specifically seek it out to try first |

The reason for using RCs is that once a tag is pushed, it becomes public, and there is no way to retrieve it from those who have already received it. An RC creates **one reversible step** in between:

```
v1.1.0-rc.1  →  Issue discovered
v1.1.0-rc.2  →  Fixed and pushed again
v1.1.0       →  Now official
```

The procedure is **exactly the same** as for official releases — no separate workflow or script is needed. Just align the versions in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` to `1.1.0-rc.1`, create the same tag, and push it to remote. Then manually dispatch `pnpm desktop:release-run -- --tag=v1.1.0-rc.1 --ref=main` on `main`. The workflow reads whether the input `RELEASE_TAG` is a pre-release and applies it to both the draft and publish stages. `pnpm desktop:check` locks this guidance as a contract — hardcoding it differently will cause failure.

### `-rc.1` and CFBundleVersion — Actual Results (2026-07-27)

This was left as an unknown for a while. **I verified it directly, and it passes.**

Tauri inserts the string values from the three version files into the bundle **without any conversion**:

| Field | Value |
|---|---|
| `CFBundleShortVersionString` | `1.0.0-rc.1` |
| `CFBundleVersion` | `1.0.0-rc.1` |

`plutil -lint` passed, Spotlight reads it as `kMDItemVersion`, and after ad-hoc signing, I launched it via LaunchServices and verified the window.

> **However, this deviates from the specification.** Apple's documentation specifies `CFBundleVersion` as a dot-separated integer string. Direct distribution (our path) is lenient in macOS and actually causes no issues, but **it will be rejected for App Store submission paths.** Since we only do direct distribution, this holds for now — if we consider the App Store, we will revisit this notation.

## Protected Release Runbook (v1.0.0)

The release workflow is deliberately two-stage: unprivileged admission proves
the requested tag and current `main` SHA agree, then the signing jobs run in the
protected `release-signing` environment. The workflow is dispatched from
`main`; pushing a tag alone does not start it.

**1 — Prepare Apple Developer credentials (owner-only).** Create a Developer ID
Application certificate, export the `.p12`, and create an App Store Connect API
key for notarization. Keep its `.p8`, key ID, and issuer ID. The repository code cannot configure GitHub
environment settings automatically; the one-time GitHub cutover below is manual.

**2 — Configure the one-time GitHub cutover.** Put the three App Store Connect
API values in `release-signing`: `APPLE_API_KEY_P8_BASE64`,
`APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`. Retain the existing Developer ID
certificate pair and Tauri updater pair as repository secrets. From the repository root:

```bash
base64 -i DeveloperID.p12 | pbcopy
gh secret list --env release-signing
gh secret set APPLE_CERTIFICATE_P12_BASE64 < /path/to/APPLE_CERTIFICATE_P12_BASE64
gh secret set APPLE_CERTIFICATE_PASSWORD < /path/to/APPLE_CERTIFICATE_PASSWORD
gh secret set APPLE_API_KEY_P8_BASE64 --env release-signing < /path/to/APPLE_API_KEY_P8_BASE64
gh secret set APPLE_API_KEY_ID --env release-signing < /path/to/APPLE_API_KEY_ID
gh secret set APPLE_API_ISSUER_ID --env release-signing < /path/to/APPLE_API_ISSUER_ID
gh secret set TAURI_SIGNING_PRIVATE_KEY < /path/to/TAURI_SIGNING_PRIVATE_KEY
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD < /path/to/TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

`APPLE_KEYCHAIN_PASSWORD` and `APPLE_SIGNING_IDENTITY` are not hosted secrets.
The workflow generates the temporary keychain password and derives the signing
identity from the imported certificate. Repository copies of the API three and
obsolete `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` must be
unused by the new workflow. Keep them only through the first API-key transition
release, then remove exactly those three after signing, notarization, publication,
and public-download verification pass; the certificate/updater four stay.

Configure `release-signing` to admit exactly the `main` branch: one custom
deployment branch rule, branch `main`, no tag rule, administrator bypass
disabled, and no required reviewer on this signing environment. Keep the
existing required-reviewer approval on the separate `release` environment: it
is the human install approval for the exact draft bytes before publication.
That environment also admits only branch `main`, has no tag rule, and disables
administrator bypass; unlike `release-signing`, it must retain a reviewer.

**3 — Verify, create, and push the existing tag.** Run the local checks before
creating the tag, then create and push that tag at the current `main` head:

```bash
pnpm desktop:release-github -- --tag=v1.0.0 --allow-obsolete-repository-secrets  # first API-key transition release only
pnpm desktop:release-preflight
git fetch origin main --tags
git tag v1.0.0 origin/main
git push origin v1.0.0
```

**4 — Dispatch and watch the protected run.** `desktop:release-run` dispatches
`release-macos.yml` with `--ref main`, passes the tag as workflow input, and
waits for the exact `workflow_dispatch` run. Admission pins the tag to the
`main` SHA; build, staging, and publication keep using that admitted SHA even
if `main` moves later.

```bash
pnpm desktop:release-run -- --tag=v1.0.0 --ref=main
```

**5 — Install the draft before publication.** The workflow builds and verifies
both macOS architectures plus the Windows updater artifact, creates a verified
draft Release, and pauses at the separate `release` environment. Install that
exact draft DMG on a real Mac, launch it, and open a vault. Then approve the
`release` environment. Publication rechecks the admitted source, publishes and
verifies the Release, and refreshes the generated `/download` facts on `main`.

## Creating a Developer ID Certificate — Executable Procedure

**This procedure is done once every five years** (Developer ID certificate validity period). The person doing it then is not the person doing it now, and prose procedures inevitably become outdated in between. Therefore, I embedded the path into a script: `scripts/apple-signing-setup.mjs`. The following is an explanation of what that script does, not a separate procedure — **if there is a discrepancy, the script is correct.**

### What remains for humans are only two moments

Both involve **moments of handling credentials**, so they are not automated: Apple login (password + 2FA) and App Store Connect API key generation · one-time download of `.p8`. The rest — keypair generation · CSR creation · `.p12` assembly · GitHub registration command generation · verification — is inside the script.

### Why not use the Keychain Access GUI?

Common guides say to create a CSR in Keychain Access, install the certificate, and then export it as `.p12`. That path has a **quiet trap** — if you export from the "Certificates" category instead of "My Certificates", **the private key is omitted, yet the file is created perfectly.** The failure only appears minutes later in CI's `codesign`.

Here, since we create and hold the private key ourselves, **that mistake is structurally impossible.** `.p12` always contains both the key and the certificate.

### 1 — Keypair and CSR (Automated)

```bash
node scripts/apple-signing-setup.mjs csr \
  --name="Legal Full Name" --email="Apple Account Email"
```

`--name` must be the **legal full name** of the Apple account. A nickname will delay or reject the review. The output is placed in `~/.ontology-atlas-signing/` — private key permissions `0600`, directory permissions `0700`, **outside the repository** (if placed in the working tree, it could be committed).

**It asks for a password to protect the private key.** It doesn't appear on screen, so it looks like nothing is being entered, but it is — **just pressing Enter creates an unprotected key** (actual result 2026-07-27: one was created this way). Only **humans know** the password: if the script sets it, humans won't know it, and then even with a backup file, it cannot be used.

> **Why lock it.** This key will eventually be backed up off-disk — if lost, the certificate becomes useless, so you must back it up. However, an unlocked private key file means **whoever obtains it gains signing authority**: they can sign apps in your name.
>
> **If you lose a private key, that certificate is unusable.** Do not delete this directory. The script stops if an existing key is found rather than overwriting it.

**How to check if it's locked** — the first line of the file tells you:

```
-----BEGIN ENCRYPTED PRIVATE KEY-----   ← Locked
-----BEGIN PRIVATE KEY-----             ← Unlocked
```

The updater key (`tauri-updater.key`) is the same — base64-decode the first line and it must contain `encrypted` in `rsign encrypted secret key`.

### 2 — Issuing a certificate from Apple (manual)

1. https://developer.apple.com/account/resources/certificates/add
2. Type: **Developer ID Application** — for direct distribution, not App Store submission
3. Upload the `.certSigningRequest` created in step 1 → download the `.cer`

### 3 — Assembling `.p12` and registering with GitHub (automated)

```bash
node scripts/apple-signing-setup.mjs bundle --cer=~/Downloads/developerID_application.cer
```

Convert the `.cer` (DER) to PEM, combine it with the private key to create a `.p12`, then register `APPLE_CERTIFICATE_P12_BASE64` and `APPLE_CERTIFICATE_PASSWORD`.

**The export password is generated randomly by the script and seen by no one** — not humans,
logs, or models. Its only purpose is to wrap the file while it travels to GitHub, and the recipient (CI) receives the same value as a secret. Showing a value that humans have no reason to remember to a human only increases leakage paths. Pass it to `gh` via
**stdin**, not as an argument — if passed as an argument, it appears in the process list.

### 4 — The remaining five values are entered by humans (credentials)

| secret | Where |
|---|---|
| `APPLE_API_KEY_P8_BASE64` | The entire `.p8` downloaded once from App Store Connect, encoded in base64 |
| `APPLE_API_KEY_ID` | Key ID of the App Store Connect API key |
| `APPLE_API_ISSUER_ID` | Issuer ID from App Store Connect Users and Access |
| `TAURI_SIGNING_PRIVATE_KEY` | `~/.ontology-atlas-signing/tauri-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password chosen for the updater key |

```bash
gh secret set APPLE_API_KEY_P8_BASE64 --env release-signing
gh secret set APPLE_API_KEY_ID --env release-signing
gh secret set APPLE_API_ISSUER_ID --env release-signing
gh secret set TAURI_SIGNING_PRIVATE_KEY
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Running without arguments receives values with input masked.

### 5 — Verification

```bash
node scripts/apple-signing-setup.mjs verify
```

It tells you what remains and **whether humans or the script entered it**.
Once everything is in place, the workflow automatically proceeds to the signing path from the next tag — no code changes required.

### Only three files need to be backed up

GitHub secrets **cannot be read by anyone once saved** — that is the protection,
and it also means you cannot recover them if the original is lost. The originals reside in `~/.ontology-atlas-signing/` and there are only two backup targets.

| File | If leaked | If lost |
|---|---|---|
| `developer-id.key` | App can be signed in the owner's name | **Reissuable** after revocation by Apple |
| `AuthKey_*.p8` | Notarization requests possible with the owner's App Store Connect API permissions | **Reissuable** after revoking the existing key |
| `tauri-updater.key` | Fake updates can be pushed to installed apps | **Irrecoverable** — users who already installed will never receive updates again |

`.certSigningRequest` is an already-used request, and `.pub` is in the config file, so they are not backup targets.

**Lock both with passwords.** Even if backups are leaked, they must be unusable without the password.
And **keep passwords separate from the files** — if kept in the same place, the purpose of locking is halved.

> **There is a defined time when the updater key can be changed.** Since the public key is embedded in the app bundle,
> changing the key after release means users who already installed it cannot receive updates.
> The last moment you can reconsider locking is **just before the first release**.

### Where secrets live

The three App Store Connect API keys are GitHub Actions **`release-signing` environment
secrets**. The two Developer ID certificates and two Tauri updater keys remain as existing repository secrets with no recoverable originals. Environment values are injected only after the workflow reaches `release-signing`, and while repository settings can be verified via commands in this document, the code does not automatically change GitHub environment policies.

### What to do after obtaining certificates

`docs/DECISIONS.md` states that ""v1.0.0 will be released as an unsigned DMG, and instead we will honestly guide users" — *"Once a certificate is obtained, this decision is automatically reversed — the page text at that time will also be reverted."* Remove the Gatekeeper bypass guidance from the download page and revert the trust statement. **This is the only part that does not happen automatically.**

## Release Signing and Notarization

Local development does not require Apple credentials. Public macOS downloads do,
when the app is distributed like Obsidian: the website links to a signed DMG,
the user downloads it, copies the app locally, and runs it outside the Mac App
Store. These are Developer ID direct-download signing/notarization credentials,
not App Store submission credentials. The protected release workflow fails closed
unless the following split-scope seven secrets are present:

**Seven hosted secrets are required** — 3 for the API (`release-signing`), and 4 for the certificate and updater identity repository scope.

- `APPLE_CERTIFICATE_P12_BASE64`: base64-encoded Developer ID Application
  certificate export (`.p12`).
- `APPLE_CERTIFICATE_PASSWORD`: password for that `.p12`.
- `APPLE_API_KEY_P8_BASE64`: base64 of the complete App Store Connect `.p8`
  private key. The orchestrator writes it to a `0600` temporary file only for notarization.
- `APPLE_API_KEY_ID`: App Store Connect API key ID.
- `APPLE_API_ISSUER_ID`: App Store Connect API issuer UUID.
- `TAURI_SIGNING_PRIVATE_KEY`: Tauri updater private key.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password for that updater key.

In addition to the five Apple secrets, two Tauri updater secrets are also needed. Conversely, these are **not hosted secrets but local/CI values**, so they are not registered — fewer secrets for humans to register means fewer mistakes.

- `APPLE_KEYCHAIN_PASSWORD` — The keychain is created and destroyed within the job.
  The workflow generates it on-the-fly with `openssl rand -base64 24` and masks it
  with `::add-mask::`. It was a value no human needs to remember.
`APPLE_SIGNING_IDENTITY` is derived from the imported certificate. Neither value
is a hosted secret.

The operator first creates and pushes the existing tag, then
`pnpm desktop:release-run -- --tag=v1.0.0 --ref=main` dispatches
`release-macos.yml` from `main`. The unprivileged admission job checks
`workflow_dispatch`, `refs/heads/main`, the workflow/event SHA, and that the
requested tag resolves to the current `main` head. It emits the admitted tag and
SHA; later jobs pin their checkouts and recheck that tag-to-SHA binding before
signing, draft creation, and publication. There is no tag-triggered run and no
tag-derived release ref input.

Each architecture lane writes the generated DMG filename, byte size, and SHA-256
value to the GitHub Actions step summary before uploading artifacts, so reviewers
can inspect the signed/notarized candidate without downloading every artifact
first. If the tag is stale, the version drifts from package/Tauri/Cargo metadata,
or the required split-scope secrets are missing, blank, or structurally invalid, the
workflow fails before uploading an unsigned or wrongly sourced candidate.
Before creating the tag, run `pnpm desktop:release-github -- --tag=v1.0.0` to
catch missing split-scope secret names, obsolete/over-scoped repository copies, environment
policy drift, or an inactive workflow. For the first API-key transition release only,
append `--allow-obsolete-repository-secrets`: this permits the unused legacy Apple
ID/password/team names to remain until the release is proven, but it never permits
repository copies of the API credentials. After the public download verifier passes,
delete the three legacy names and rerun the command without that option.
Use `pnpm desktop:release-status -- --pr=<number> --tag=v1.0.0` as the completion
audit before calling the macOS app goal done: it accepts an already merged PR
  only when that PR is the latest merged PR on `main`, or checks
tag/package/Tauri/Cargo version alignment, PR review/merge readiness,
active macOS release workflow availability, expected release-tag presence or
creation state, the API 3 environment + retained identity 4 repository secret names and policy,
public stable GitHub
Release state, then delegates to the public desktop-artifact/checksum download verifier. If PR checks are
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
`local_preflight`, `apple_release_secrets`, `github_release`, and
`download_assets`. Standalone `desktop:release-status` runs record
`local_preflight` as skipped because they do not launch the native app or mount
the DMG. `pnpm desktop:goal-audit` first runs `desktop:release-preflight`, then
passes `OATLAS_RELEASE_STATUS_LOCAL_PREFLIGHT=1` into `desktop:release-status`
so saved JSON/Markdown evidence records `local_preflight=ok` only after the
LaunchServices app content proof and DMG install smoke have passed locally.
The default terminal output also prints `local blockers` and `external blockers`
before the per-check list, so a pending GitHub PR check does not hide the fact
that the local preflight path is clean and the remaining work belongs to the
reviewer or release operator.
The desktop goal audit keeps the macOS app release gate scoped to GitHub
Releases; the hosted promo/download website deploys separately through GitHub
Pages (`deploy-pages.yml`) and is not part of this app blocker snapshot. The
Markdown checklist renders the Apple and Tauri signing secrets under each blocked row's
missing-secret section, so handoff reviewers do not have to cross-read the JSON
payload. The default
`.tmp/desktop-goal-status` artifacts include `local_preflight=ok` only because
the goal-audit wrapper has already completed the local release preflight in the
same process chain.
`pnpm desktop:release-run -- --tag=v1.0.0 --ref=main` is the protected-release
dispatcher and watcher used by that runbook. It dispatches
`release-macos.yml` from `main`, waits for the exact `workflow_dispatch` run
matching the admitted tag commit, then runs `gh run watch --exit-status` against
that run so operators do not accidentally watch an unrelated latest workflow run.
Actionable blockers also carry `commands[]` so reviewers and release operators
can copy exact diagnostic, environment-secret setup, pre-dispatch source checks,
tag creation/push, tag-commit-scoped release-workflow dispatch/watch, and public download verification commands from
the default terminal output, JSON, or Markdown without parsing prose. The
release handoff fetches `main`, creates and pushes the new tag, then
dispatches with `--ref main`. Developer ID direct-download signing blockers
additionally expose `missingSecrets[]` for direct comparison against the
`release-signing` environment.
The hosted website deploy is not part of the macOS app release gate;
run `pnpm desktop:verify-hosted` after the separate GitHub Pages deploy.
When it reports missing secrets, set each value at its named scope:

```bash
gh secret set APPLE_CERTIFICATE_P12_BASE64 < /path/to/APPLE_CERTIFICATE_P12_BASE64
gh secret set APPLE_CERTIFICATE_PASSWORD < /path/to/APPLE_CERTIFICATE_PASSWORD
gh secret set APPLE_API_KEY_P8_BASE64 --env release-signing < /path/to/APPLE_API_KEY_P8_BASE64
gh secret set APPLE_API_KEY_ID --env release-signing < /path/to/APPLE_API_KEY_ID
gh secret set APPLE_API_ISSUER_ID --env release-signing < /path/to/APPLE_API_ISSUER_ID
gh secret set TAURI_SIGNING_PRIVATE_KEY < /path/to/TAURI_SIGNING_PRIVATE_KEY
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD < /path/to/TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

The protected workflow first requires a clean GitHub Release slot for the
admitted tag, uploads
release assets as a draft, runs
`pnpm desktop:verify-download -- --allow-draft` against those draft assets with
`github.token`, publishes the verified release, then runs
`pnpm desktop:verify-download` again to prove the public download surface
exposes reachable Apple Silicon and Intel DMGs plus exactly one Windows x64
installer, with filename versions that match the release tag and checksum files
that name and hash the same re-downloaded artifacts. After that public verification, the
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
`src-tauri/target/release/bundle/dmg/ontology-atlas_1.0.0_aarch64.dmg`, and
`src-tauri/target/release/bundle/dmg/ontology-atlas_1.0.0_aarch64.dmg.sha256`.
`.github/workflows/release-macos.yml` is dispatched from `main` with an existing
`v*` tag input, requires the split-scope seven signing secrets, runs
docs-vault freshness, desktop checker, and native bridge tests in
both lanes,
builds and route-smokes the static desktop payload, verifies the tag version
before signing, signs and notarizes each DMG, verifies the mounted
signed/stapled artifact, copies each DMG app to a temporary install folder and
launch-smokes it, stages the release assets into one flat folder
(`node scripts/stage-macos-release-assets.mjs`), uploads that folder as the
workflow artifact, creates a draft GitHub Release with both DMGs plus
checksums, both updater archives plus `.sig` files, and `latest.json` only
after confirming that tag has no existing Release, verifies those draft assets
with `pnpm desktop:verify-download -- --allow-draft --require-updater`,
publishes the release as stable, then runs
`pnpm desktop:verify-download -- --tag="${RELEASE_TAG}" --require-updater`
so the release run itself proves the hosted CTA can reach and re-hash every public
macOS/Windows installer and that `latest.json` points at archives this release actually has. It then
records the public GitHub Release URL plus the public asset filenames, byte
sizes, and SHA-256 values in the GitHub Actions step summary. The workflow does
not require any website deploy secrets; the installed app remains
local-only, and website deployment stays in `.github/workflows/deploy-pages.yml`.
Public downloads are still a distribution-hardening slice until the Apple and
Tauri credentials are configured and the dispatched workflow runs successfully.

## Later Distribution Work

Treat these as separate hardening slices after the prototype works:

- public release-channel policy after the first stable macOS tag release is exercised.
- updater and release-channel policy.
- whether MCP/CLI binaries are bundled as sidecars or installed separately.
- native filesystem permission UX beyond the current selected-folder bridge.
