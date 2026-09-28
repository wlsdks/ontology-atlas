---
title: macOS Desktop App Track
doc_type: runbook
status: current
area: release
---

# macOS Desktop App Track

This runbook is for the maintainer who builds, verifies, signs, and releases
the **Ontology Atlas** desktop app. It covers local builds, the installed-app
log, release versions, the protected release workflow, Apple signing and
notarization, and the Windows beta. Where a script owns a procedure, the script
wins over this page.

## Shell

The app is a Tauri shell around the same static export the website ships
(`output: 'export'`; `src-tauri/tauri.conf.json` loads `../out` and runs
`pnpm build` before packaging). It reads and writes the user's chosen Markdown
vault through a native bridge in `src-tauri/src/lib.rs`; it is not a backend,
sync layer, or second store. `ontology-atlas` stays the repository, CLI, MCP,
and release-asset name. The surface contract, bridge convention, and routing
live in [ARCHITECTURE.md](ARCHITECTURE.md#surface-contract--web-and-app).

## Build and verify locally

Local work needs no Apple credentials.

```bash
pnpm desktop:doctor                       # Tauri CLI, Cargo, rustc, Xcode CLT, vault, MCP handoff
pnpm desktop:check                        # static-export and Tauri scaffold contract
pnpm build && pnpm desktop:smoke          # packaged out/ payload: routes, assets, offline docs
pnpm test:desktop:runtime
pnpm test:desktop:bridge                  # vault shim vs Tauri commands + Rust path guard
pnpm desktop:dev                          # run the shell against a real vault
pnpm desktop:build                        # unsigned local .app and .dmg
pnpm desktop:verify-app
pnpm desktop:verify-dmg
pnpm desktop:verify-install
pnpm cli:mcp-verify docs/ontology --timeout-ms 15000
pnpm desktop:release-preflight            # local pre-tag gate; its steps are the package.json script
```

- `desktop:doctor` exits 0 as a report; add `-- --require-runtime` to fail on a
  missing prerequisite. An ad-hoc signed local bundle is a warning, not a block.
- `desktop:check` (`scripts/check-desktop-readiness.mjs`) owns the list of what
  it enforces. The security-relevant parts:
  - `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
    carry one version, so bundle metadata, DMG filename, and tag agree.
  - No Firebase SDK, Admin, or CLI dependency in the root package.
  - The WebView CSP is enabled; `connect-src` is exactly
    `'self' ipc: http://ipc.localhost` (`'self'` is load-bearing for App Router
    payloads). `scripts/lib/desktop-csp.mjs` holds the measurement and gates.
  - `src-tauri/capabilities/default.json` is scoped to the `main` window and
    enumerates permissions by name instead of `core:default`; broad Tauri
    filesystem, shell, HTTP, and opener plugin families are blocked by prefix.
  - `src-tauri/Info.plist` states why the app asks for protected folders.
- The Rust bridge canonicalizes targets and their nearest existing parents, so
  a symlink inside the vault cannot redirect a read, write, mkdir, exists, or
  remove outside the selected root; write parents are checked before
  `create_dir_all`. `test:desktop:bridge` proves it.
- `desktop:verify-app` launches the built `.app` for a hold window and fails on
  an early exit; it takes a per-app lock before stale-process cleanup. For a UI
  session, prove a real window through LaunchServices:

  ```bash
  pnpm desktop:verify-app -- --kill-existing --open-app --require-window --require-capturable-window --require-accessibility-window --require-owner-name="Ontology Atlas" --min-window-size=1040x720 --hold-ms=5000
  ```

  Add `--require-accessibility-text="..."` for expected WebView copy,
  `--require-frontmost` for foreground proof, and `--print-window-diagnostics`
  for CoreGraphics, capture, and AX rows on failure.
- `desktop:verify-dmg` checks the `.sha256`, runs `hdiutil verify`, mounts
  read-only, and requires `Ontology Atlas.app` plus the `/Applications` symlink.
- `desktop:verify-install` copies the app from the mounted DMG to a temporary
  folder, launches it through LaunchServices, runs the bundled
  `ontology-atlas-mcp` against `docs/ontology`, then detaches and cleans up.
- No build makes an updater archive (`createUpdaterArtifacts: false` in
  `tauri.conf.json`), so no build needs the updater private key;
  `desktop:repack-updater` makes and signs the only archive, from the signed app.
  `./script/build_and_run.sh` uses `desktop:build:app:local` and refreshes a
  matching `/Applications/Ontology Atlas.app`.
- `desktop:release-preflight` needs no credentials: it is the fast local proof
  of an unsigned artifact. Source MCP and ontology readiness run separately in
  `pnpm dogfood:release-gate`.
- `desktop:release-artifact` is the credentialed local path;
  `scripts/build-macos-release-artifact.mjs` owns the order: rebuild,
  route-smoke, sign the `.app`, repack the updater archive, package the DMG,
  sign the DMG (`desktop:sign:dmg`), notarize and staple,
  `desktop:verify-release-dmg`, then install-smoke the final DMG. The release
  workflow runs it as `--phase=build`, imports the certificate, then runs
  `--phase=sign`, so the build phase runs before the certificate is imported and
  with no credential in its environment.

## Installed-app log

A packaged `.app` has no reachable stdout, so the shell writes one rotating
file:

```
~/Library/Logs/dev.jinan.ontology-atlas/ontology-atlas.log
```

Attach it to any installed-app bug report. Its first line stamps the app
version. Rotation keeps one file: at the 5 MiB cap it is replaced.

The log is `Info` level and records what the app did (startup, vault watcher
lifecycle, ACP session events, window-geometry fallbacks), never vault content,
prompts, or secrets. It lives outside the vault, nothing reads it back or
uploads it, and sharing it is the owner's action.
`.ontology-atlas/llm-audit.jsonl` in the vault remains the ledger for opt-in
LLM transfers. Only the Rust side reaches the log: WebView JavaScript errors do
not, so a blank screen with a clean log points at the frontend.

## Release versions

Every release is a plain `vX.Y.Z` tag published as a normal GitHub release.
`pnpm desktop:release-tag`, the admission job's first check of the tag, refuses a
tag with a pre-release or build suffix such as `v1.4.0-rc.1`, so there is no
release-candidate channel; to soak a build, install the draft the workflow
stages before approving publication. The public `/download` facts describe the
release the workflow published, and the hosted updater manifest
(`scripts/stage-hosted-updater-manifest.mjs`, served at the updater endpoint in
`src-tauri/tauri.conf.json`) follows the newest published plain release, which
the app checks for automatically
(`src/features/app-update/model/use-app-update.ts`).
`pnpm desktop:verify-download` refuses a GitHub release someone marks as a
pre-release by hand.

## Release runbook

The workflow `.github/workflows/release-macos.yml` is two-stage and dispatched
from `main`; pushing a tag alone starts nothing. An unprivileged admission job
checks `workflow_dispatch`, `refs/heads/main`, and that the tag resolves to the
current `main` head; later jobs pin that admitted SHA and recheck it before
signing, draft creation, and publication.

**1. Check GitHub prerequisites.** `desktop:release-github` checks `gh` auth,
the active workflow, the `release-signing` policy, secret names at their scopes,
absence of repository copies of environment secrets, tag/version alignment, and
clean tag and Release slots. It cannot read values; the workflow runs
`desktop:release-secrets` before signing.

```bash
pnpm desktop:release-github -- --tag=<tag>
```

The legacy names `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and
`APPLE_TEAM_ID` are refused at repository scope; delete any that reappear.

**2. Prove locally, then tag at `main` head.** Merge everything first: the tag
must equal `main` head.

```bash
pnpm desktop:release-preflight
git fetch origin main --tags
git tag <tag> origin/main
git push origin <tag>
pnpm desktop:release-source -- --mode=admit --tag=<tag> --sha="$(git rev-parse origin/main)"
```

**3. Dispatch and watch.** This dispatches with `--ref main`, waits for the
exact `workflow_dispatch` run for the admitted commit, and runs
`gh run watch --exit-status` on it.

```bash
pnpm desktop:release-run -- --tag=<tag> --ref=main
```

The run builds, signs, notarizes, and install-smokes both macOS architectures
and builds the Windows x64 installer. Each lane writes DMG filename, size, and
SHA-256 to the step summary. The run also ships the MCP bundle and lists the
server in the official MCP Registry (the `list-mcp-registry` job), so a
dispatch publishes outside GitHub Releases. `scripts/check-macos-release-slot.mjs` refuses a
tag that already has any Release. Assets are staged
(`scripts/stage-macos-release-assets.mjs`) and uploaded as a draft, then
verified with `pnpm desktop:verify-download -- --allow-draft --require-updater`.

**4. Install the draft before publication.** The run pauses at the `release`
environment. Install that exact draft DMG on a real Mac, launch it, open a
vault, then approve. Publication rechecks the admitted source, publishes, runs
`pnpm desktop:verify-download -- --tag="${RELEASE_TAG}" --require-updater`
(reachable Apple Silicon and Intel DMGs, one Windows x64 installer, matching
checksums, `latest.json` pointing at real archives), writes the public URL and
asset hashes to the step summary, and uploads an
`ontology-atlas-release-facts-<tag>` artifact. The workflow token cannot push to
`main`.

**5. Land the download facts.** After a successful run, `desktop:release-run`
regenerates the `/download` facts and opens a PR with the operator's
credentials. Land it with `pnpm pr:land <number>`; if that part failed, retry it
alone:

```bash
pnpm desktop:release-run -- --tag=<tag> --refresh-only
```

Until it lands, `desktop:release-preflight` and the next release's admission
fail at `download:release-facts:check`.

**6. Audit completion.**

```bash
pnpm desktop:release-status -- --pr=<number> --tag=<tag>
pnpm desktop:goal-audit -- --pr=<number> --tag=<tag>
```

`desktop:release-status` reports blockers split into local and external, with
copyable `commands[]` and, for signing, `missingSecrets[]`. It supports
`--json`, `--json-file=<path>`, and `--markdown-file=<path>`. Run standalone,
it records `local_preflight` as skipped; `desktop:goal-audit` runs the
preflight first and passes `OATLAS_RELEASE_STATUS_LOCAL_PREFLIGHT=1`. The
hosted website deploys separately (`.github/workflows/deploy-pages.yml`);
check it with `pnpm desktop:verify-hosted`.

## Signing and notarization

Public downloads are Developer ID direct-download artifacts (not App Store).
The workflow fails closed unless seven hosted secrets are present and
structurally valid; `desktop:release-github` checks their scopes before
dispatch:

| Secret | Scope | Value |
|---|---|---|
| `APPLE_CERTIFICATE_P12_BASE64` | repository | base64 Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | repository | password for that `.p12` |
| `APPLE_API_KEY_P8_BASE64` | `release-signing` env | base64 of the whole App Store Connect `.p8` |
| `APPLE_API_KEY_ID` | `release-signing` env | App Store Connect API key ID |
| `APPLE_API_ISSUER_ID` | `release-signing` env | App Store Connect issuer UUID |
| `TAURI_SIGNING_PRIVATE_KEY` | repository | `~/.ontology-atlas-signing/tauri-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | repository | password chosen for the updater key |

`APPLE_KEYCHAIN_PASSWORD` and `APPLE_SIGNING_IDENTITY` are never hosted
secrets: the job generates the keychain password with `openssl rand -base64 24`
and masks it with `::add-mask::`, and derives the identity from the imported
certificate. An `always()` step deletes the temporary keychain and decoded
`.p12` after the per-arch handoff, even on failure.
`scripts/check-macos-release-secrets.mjs` rejects a missing, blank, or
structurally unusable secret (including base64 that is not PKCS#12 DER) before
build. The `.p8` is written to a `0600` temporary file only for notarization.

In the workflow, `scripts/sign-macos-app.mjs` deep-signs the `.app` with
hardened runtime and verifies with strict deep `codesign`, and with `--dmg`
signs the DMG before notarization;
`scripts/notarize-macos-dmg.mjs` submits via `xcrun notarytool`, waits,
staples, validates, refreshes the `.sha256` (stapling changes the bytes), and
redacts credential arguments from failure logs.
`pnpm desktop:verify-release-dmg` adds strict `codesign` on the mounted app, a
valid stapled ticket, and `spctl` assessment of both app and DMG.

### GitHub environments

- `release-signing`: one custom deployment branch rule for `main`, no tag
  rule, administrator bypass disabled, no required reviewer. Environment values
  reach a job only after it enters this environment.
- `release`: the same branch rule and bypass setting, and it **keeps** a
  required reviewer: the human install approval of the exact draft bytes.

The code does not change environment policies; `desktop:release-github` checks
them.

### Create a Developer ID certificate

Needed about once per certificate validity period (five years).
`scripts/apple-signing-setup.mjs` (`pnpm desktop:signing-setup`) owns the
procedure; if this page disagrees, the script is right. People handle only the
credential moments: Apple login with 2FA, and generating and downloading the
App Store Connect API key `.p8` once.

1. **Keypair and CSR.**

   ```bash
   node scripts/apple-signing-setup.mjs csr \
     --name="Legal Full Name" --email="Apple Account Email"
   ```

   `--name` must be the Apple account's legal full name. Output goes to
   `~/.ontology-atlas-signing/` (directory `0700`, key `0600`), outside the
   repository. The script asks for a password to lock the private key; input is
   hidden, and pressing Enter creates an **unlocked** key, so type one. Only a
   person knows it. The script stops rather than overwrite an existing key.
   Check the lock from the key file's first line:

   ```
   -----BEGIN ENCRYPTED PRIVATE KEY-----   ← Locked
   -----BEGIN PRIVATE KEY-----             ← Unlocked
   ```

   The updater key must also be locked: base64-decode its first line and it
   must read `rsign encrypted secret key`.

   This path avoids the Keychain Access export trap, where exporting from
   "Certificates" instead of "My Certificates" silently drops the private key
   and fails only later in CI `codesign`.

2. **Issue the certificate (manual).** At
   https://developer.apple.com/account/resources/certificates/add choose
   **Developer ID Application**, upload the `.certSigningRequest`, and download
   the `.cer`.

3. **Assemble the `.p12`.**

   ```bash
   node scripts/apple-signing-setup.mjs bundle --cer=~/Downloads/developerID_application.cer
   ```

   It combines the `.cer` with the private key into a `.p12`, writes
   `APPLE_CERTIFICATE_P12_BASE64` and `APPLE_CERTIFICATE_PASSWORD` to `0600`
   files outside the repository, and prints the `gh secret set ... < file`
   commands. It never prints a value and never changes GitHub. Pass secrets on
   stdin, never as arguments, which appear in the process list.

4. **Register the remaining secrets.** Without arguments, `gh` reads the value
   with input masked.

   ```bash
   gh secret set APPLE_CERTIFICATE_P12_BASE64 < /path/to/APPLE_CERTIFICATE_P12_BASE64
   gh secret set APPLE_CERTIFICATE_PASSWORD < /path/to/APPLE_CERTIFICATE_PASSWORD
   gh secret set APPLE_API_KEY_P8_BASE64 --env release-signing
   gh secret set APPLE_API_KEY_ID --env release-signing
   gh secret set APPLE_API_ISSUER_ID --env release-signing
   gh secret set TAURI_SIGNING_PRIVATE_KEY
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   ```

5. **Verify.**

   ```bash
   node scripts/apple-signing-setup.mjs verify
   ```

   Once all seven are registered, the next dispatched tag takes the signing
   path with no code change.

### Back up the originals

Saved GitHub secrets cannot be read back. The originals in
`~/.ontology-atlas-signing/` are the only recovery:

| File | If leaked | If lost |
|---|---|---|
| `developer-id.key` | Apps can be signed in the owner's name | Reissuable after revocation by Apple |
| `AuthKey_*.p8` | Notarization requests with the owner's API permissions | Reissuable after revoking the key |
| `tauri-updater.key` | Fake updates can reach installed apps | **Irrecoverable**: installed apps never update again |

The `.certSigningRequest` and `.pub` are not backup targets. Lock every backup
with a password and store passwords apart from the files. The updater public
key is embedded in the app, so changing the updater key after a release cuts
existing installs off from updates.

## Windows beta

The unsigned Windows x64 beta is an NSIS installer built by
`pnpm desktop:build:windows`. The user-facing `.exe` comes only from the
`build-windows` job in `release-macos.yml`.
`.github/workflows/windows-beta-check.yml` is an early-warning build on pull
requests and `main` pushes that touch native paths (Rust, bundled MCP, binary
and staging scripts, the workflows); it runs `pnpm desktop:check`,
`pnpm mcp:build-binary`, `pnpm test:desktop:bridge`, and an NSIS build without
updater artifacts.

## If it fails

| Symptom | Next step |
|---|---|
| `desktop:smoke` reports a missing route, asset, or offline doc | Rebuild with `pnpm build`; if only copy or a component marker differs, compare the product and `scripts/desktop-smoke.mjs` before rebuilding once |
| `desktop:verify-app` exits early or finds no window | Rerun with `--kill-existing --print-window-diagnostics`; a stale `/Applications` copy shares the bundle id |
| Workflow fails before build on secrets | `pnpm desktop:release-github -- --tag=<tag>`, then `node scripts/apple-signing-setup.mjs verify`; set values with the commands above |
| Admission fails: version | Align the three version files; `pnpm desktop:release-tag -- --tag=<tag>` |
| Admission fails: release facts | The previous release's facts PR has not landed; land it or `pnpm desktop:release-run -- --tag=<previous tag> --refresh-only` |
| Admission fails: ACP registry | Refresh drift with `pnpm acp:registry` and land it |
| Admission fails: tag not at `main` head | Merge first, retag, redispatch |
| Release slot check fails | A Release already exists for the tag; use the next version |
| `desktop:verify-download` hits the API rate limit | Set `GITHUB_TOKEN` or `GH_TOKEN` |
| `desktop:verify-download` reports a missing Release | The tag produced no run; dispatch `release-macos.yml` |
| `/download` facts are stale | Land the release-facts PR (step 5) |
| Hosted `/download/` is missing or 404 | `gh workflow run deploy-pages.yml --repo wlsdks/ontology-atlas`, then `pnpm desktop:verify-hosted` |
| Installed app misbehaves | Read the installed-app log above |
