---
slug: desktop-app-distribution
kind: capability
title: macOS Desktop App Distribution
domain: vault-local-first
dependencies: [capabilities/agent-config-onboarding, capabilities/frontmatter-to-ontology, capabilities/vault-live-updates]
elements: [scripts/check-macos-release-slot.mjs]
relates: [domains/ai-agent-partner, domains/views]
---

`oh-my-ontology` should explore a macOS-first desktop app as a local install
path over the same markdown vault.

The quality bar is Obsidian / Claude Desktop / Codex Desktop class: a stable
native `.app`, trustworthy vault-folder permission UX, recent vault recall,
clear local data location, offline operation, and visible Claude Code / Codex
handoff checks. A thin hosted-site wrapper is not enough; if the desktop shell
cannot make the local ontology workflow feel first-class, it should remain an
internal prototype.

The first slice is a feasibility proof, not a second product architecture:
wrap the existing Next.js static export in a Tauri shell, open the same local
vault folder, render `/download`, `/docs`, `/ontology`, `/topology`, and
`/ontology/edit`, then verify the same CLI/MCP setup gates still work for
Claude Code and Codex.
The hosted Firebase site is intentionally demoted to product introduction,
download, and read-only demo: hosted empty states and demo badges route users to
`/download`, while the installed Tauri runtime keeps `/docs/?intent=local` as
the writable local vault picker path.
The repository now has the first `src-tauri/` shell with `frontendDist: "../out"`
and macOS `.app` targeting. Its WebView CSP is enabled for local app assets,
data/blob images, local styles, and the Tauri IPC endpoint, so the installed app
is not shipped with an open CSP while still allowing native vault commands. The
default capability remains scoped to the `main` window with `core:default` only,
so broad filesystem, shell, HTTP, or opener plugin permissions are not granted.
`src-tauri/Info.plist` explains selected vault-folder access for protected
macOS locations such as Documents, Downloads, Desktop, network volumes, and
removable volumes.
The desktop first-run path also keeps empty vaults actionable: after a user
selects a blank local folder, the main workspace pane shows the ontology starter
directly, creates the starter markdown and vault-local agent configs, then opens
the generated `README.md` instead of showing a generic empty document state.
`scripts/package-macos-dmg.mjs` wraps that `.app`
with a reproducible `hdiutil` DMG so the download artifact does not depend on
Tauri's Finder AppleScript DMG styling step, then writes a `.sha256` checksum.
`scripts/verify-macos-dmg.mjs` mounts the DMG read-only, verifies that checksum,
and checks for the app bundle plus an Applications symlink pointing to
`/Applications`. `pnpm desktop:check`
is the scaffold-aware gate for that slice: it checks the Next.js static export
shape, static image mode, trailing-slash routes, docs-vault build freshness
path, CLI/MCP verification script availability, `desktop:dev` /
`desktop:smoke` / `desktop:verify-app` / `desktop:build` /
`desktop:verify-dmg` / `desktop:verify-install` scripts, the Tauri shell files, the explicit
desktop-grade quality bar, and the first prototype route-smoke scope. `pnpm
desktop:smoke` checks the built `out/` payload that the `.app` / `.dmg`
packages: the root app entry, locale-prefixed `/download`, `/docs`,
`/ontology`, `/topology`, and `/ontology/edit` routes, `_next` assets, and
offline desktop docs under `docs-vault/`. `pnpm desktop:verify-app` launches
the built `.app` executable from inside its `Contents/MacOS` executable
directory long enough to catch early Tauri/WebView startup crashes, then
terminates it.
`pnpm desktop:verify-install` mounts the generated DMG, verifies the
drag-to-Applications symlink target, copies the bundled app to a temporary
install folder, launch-smokes that copied app from its own executable directory,
and removes the temporary install after detaching the image.
`pnpm test:desktop:bridge` locks the native vault bridge at the API boundary:
Vitest exercises the WebView `FileSystemDirectoryHandle` shim and `cargo test`
checks that Rust relative paths and symlinks cannot escape the selected vault
root for read, write, mkdir, exists, or remove operations.
`pnpm desktop:doctor` is the local
machine and ontology-handoff diagnosis for that same track: it reports Tauri
CLI, Cargo, rustc, macOS Xcode command line tool readiness, the dogfood
`docs/ontology` vault, the `cli:mcp-verify` handoff gate, and offline desktop
docs before a user attempts `.app` builds.
`pnpm checks:changed` also routes desktop-related edits to this gate, and routes
checker, doctor, and smoke implementation edits through focused
`pnpm exec node --test scripts/check-desktop-readiness.test.mjs` and
`pnpm exec node --test scripts/desktop-doctor.test.mjs` /
`pnpm exec node --test scripts/desktop-smoke.test.mjs` contracts first.

The first local macOS bundle proof now exists: `pnpm desktop:build` produces
`src-tauri/target/release/bundle/macos/Context Atlas.app` and
`src-tauri/target/release/bundle/dmg/oh-my-ontology_0.1.0_aarch64.dmg` on macOS
once the Tauri icon set generated from `public/logo.png` is present under
`src-tauri/icons/`, with a sibling `.sha256` checksum file. The installed app
now has a native vault bridge: `src-tauri/src/lib.rs` owns folder selection and
file read/write plus file/directory delete commands, while
`src/shared/lib/tauri-vault-fs.ts` wraps those commands as a
`FileSystemDirectoryHandle`-compatible adapter through the supported
`@tauri-apps/api/core` `invoke` / `isTauri` API, so the existing manifest
builder, editor, image resolver, conflict guard, and agent-config bootstrap
flows work inside the desktop WebView even when browser
File System Access APIs are absent. `src/views/root-entry/ui/RootEntryPage.tsx`
keeps the hosted web root as the marketing surface but routes first-run Tauri
sessions without a restored vault to `/docs/?intent=local` without rendering
the hosted marketing page; `DocsVaultPage` then opens the native vault picker
once, so the installed app starts in local work mode instead of the download
page. The picker keeps a small recent-vault list from persisted Tauri paths,
can reopen those vaults without another Finder selection, shows the last-opened
time for each remembered vault so repeated desktop work does not become a blind
path list, keeps that relative time live while the picker stays open, and can
remove stale recent paths when folders have moved or been deleted. If a
restored folder needs macOS permission re-authorization, the same
recent-vault list stays visible so the user can switch to another remembered
vault instead of clearing state or reopening Finder first. If a restored desktop
handle no longer produces a manifest, the root entry sends the user back to the
picker instead of rendering a broken workspace. The ontology starter also copies
CLI proof and JSON agent-gate commands against the selected absolute vault path
when Tauri exposes one, so first-run users can verify local agent readiness
without first moving their terminal into the vault folder. The AI agent setup
panel applies the same selected-path behavior to its verification prompt, CLI
graph runbook, JSON gate, setup packet, first-contact proof, setup-state check,
and repair command while keeping `.` fallbacks for browser and source-checkout
contexts. The
`.github/workflows/release-macos.yml` workflow builds those artifacts on `v*`
tags, fails closed through `pnpm desktop:release-secrets` unless all Apple
Developer ID and notary secrets are present and structurally usable, and runs
docs-vault freshness, desktop checker, and native bridge tests in both release
lanes. It builds Apple Silicon on `macos-14` and Intel on `macos-15-intel`, route-smokes
the static desktop payload, verifies the `v*` tag matches package, Tauri, and
Cargo versions before signing credentials enter the path, imports the
certificate, signs the `.app` through `pnpm desktop:sign`, packages each DMG,
notarizes and staples it through `pnpm desktop:notarize`, refreshes the
checksum after stapling, redacts notary credentials from failed command logs,
runs `pnpm desktop:verify-release-dmg` so the mounted
app signature and stapled notarization ticket plus Gatekeeper assessment are
required, runs `pnpm desktop:verify-install` so the DMG copy-and-launch path is
exercised, and uploads workflow artifacts only after those release gates pass.
The publish job checks that the same tag has no existing GitHub Release before
attaching both DMGs plus checksums to a draft GitHub Release, runs the download
verifier against draft assets with `--allow-draft`, publishes the verified
release as stable, and then verifies the public assets again. `pnpm
desktop:verify-download` checks the public GitHub Release channel and fails
unless users can reach both `oh-my-ontology_*_aarch64.dmg` and
`oh-my-ontology_*_x64.dmg` assets with plausible DMG download content types,
those assets are not reported as empty files, both architecture assets carry the
same version as the release tag, each architecture appears exactly once, and
their `.sha256` files name the same DMGs.
The verifier also downloads each public DMG and compares its SHA-256 digest to
the checksum asset. The tag workflow runs that same download verifier against
`${GITHUB_REF_NAME}` before and after publication, so a green release job proves
both draft asset integrity and public downloadability for Apple Silicon and
Intel users. The same release workflow intentionally avoids Firebase Hosting
deploy steps so signed DMGs can publish without backend or hosting credentials;
the hosted promo/download site is deployed and verified through the separate
`deploy-hosting.yml` path. When a requested tag has no GitHub Release yet, the verifier
reports the missing tag as the release-blocking condition instead of exposing a
raw GitHub API 404, so the next operator action is to push the tag and let the
macOS release workflow publish the signed/notarized assets. When the workflow
is verifying a draft release with `--allow-draft`, the verifier also falls back
from tag lookup to the releases list if GitHub hides draft releases from the tag
endpoint, then matches the requested `tag_name` before checking asset bytes.
`pnpm desktop:release-github` is the operator-side pre-tag guard for that final
step: it checks `gh` authentication, the active `release-macos.yml` release
workflow, required Apple signing/notary secret names,
optional tag/version alignment, clean local and remote same-tag Git ref slots,
and the clean same-tag Release slot before the release tag is pushed. It cannot read
secret values, so the workflow still fails closed through
`pnpm desktop:release-secrets`. The workflow also runs
`pnpm desktop:release-source` before signing, so a tag pushed from an unmerged PR
branch or stale commit cannot publish signed DMGs. `pnpm test:desktop:check` covers this
operator-side gate with a fake `gh` binary so PR-only workflow,
missing-secret, tag/version, stale local/remote Git tag, and stale release-slot failures
remain explicit in the PR gate. The operator-side guard also catches the
current external blocker earlier: the repo is missing Apple release secret names
without making Firebase Hosting a macOS app blocker. Its missing-secret output
includes `gh secret set <NAME> --repo wlsdks/oh-my-ontology` hints so the
operator can move directly from readiness failure to secret registration.
`pnpm desktop:release-status -- --pr=<number> --tag=<tag>` is the completion
audit once the PR and release path are expected to be ready. It accepts an
already merged PR or checks tag/package/Tauri/Cargo version alignment, PR
review/merge readiness, active macOS release workflow availability, clean local
and remote same-tag Git ref slots, required Apple release secret names, public
stable GitHub Release state, and then runs the public DMG/checksum download verifier.
When PR checks block the release, it includes the failing or pending check names
plus each check's GitHub Actions details URL when available, and the exact
`gh pr checks <number> --repo wlsdks/oh-my-ontology` command. When all PR
checks pass but review or merge state still blocks release, it skips redundant
check rerun advice and points directly at the PR review/merge blocker. With
`--json`, the same audit emits `ready`, `blockerCount`, and per-check `next`
actions as compact stdout so goal runners and release dashboards can consume
blockers without scraping human text or truncating small output buffers. With
`--json-file=<path>`, it writes the same blocker snapshot as a pretty disk
artifact for package-runner contexts that may add lifecycle output around stdout.
With `--markdown-file=<path>`, it writes the same audit as a human-readable
reviewer/operator checklist. The snapshot includes
`schemaVersion`, `generatedAt`, `status`, `readyAt`, and `blockedAt` so saved
release evidence can be versioned, ordered, and filtered by outcome. Top-level
`blockerIds`, `localBlockerIds`, `externalBlockerIds`, `blockersByOwner`, and
`nextActions` summarize the blocked checks, and each check also carries a
stable `id` plus `scope` and `owner` (`pull_request`,
`apple_release_secrets`, `github_release`, `download_assets`, and related setup
checks) so automation does not branch on human labels. Actionable blockers also
carry `commands[]` entries for exact diagnostic, setup, pre-tag source-check, or
post-merge tag-push commands, plus the `desktop:release-run` tag-commit-scoped release-workflow watch and public download
verification, and Apple signing blockers expose `missingSecrets[]` for direct
GitHub Secrets reconciliation.
Firebase Hosting remains a separate static
website deployment checked with `pnpm desktop:verify-hosted`.
`pnpm desktop:verify-hosted` fetches the live `oh-my-ontology.web.app`
landing/download pages and rejects a stale public deployment that still shows
the old browser vault picker CTA or lacks `/ko/download/`.
It is intentionally read-only and fail-closed, so the macOS app work is not
treated as complete while review, secrets, release publication, public asset
verification, tag/package/Tauri/Cargo version alignment, or hosted-site
deployment are still blocked.
`pnpm desktop:release-preflight` is the local pre-tag gate for readiness,
docs-vault freshness, desktop checker tests, runtime split tests, native bridge
tests, runtime doctor, `cli:mcp-verify docs/ontology --timeout-ms 15000`,
`dogfood:agent-setup-gate`, build, route smoke, DMG verification, and temporary
install launch smoke before signing credentials enter the path.
The hosted web surface now moves toward product introduction and macOS
distribution: the landing/download primary CTAs open the GitHub Releases page
instead of depending on `/releases/latest` before a public macOS DMG exists. The
secondary CTA opens `/download/` as a static install guide, and the hosted
landing/download pages no longer route users into `/docs/?intent=local`. The
download page also explains that missing first-release DMGs mean the macOS app
release is still waiting on PR review, tag/package/Tauri/Cargo version
alignment, Apple signing, or the `v0.1.0` GitHub Release, while Firebase Hosting
is named separately as the promo/download website deploy gate for hosted
`/ko/download/`.
Once verified public DMGs are published and the hosted download route is live,
`NEXT_PUBLIC_OMOT_FIRST_RELEASE_PENDING=0` hides that pre-release checklist on the next hosted rebuild without a code change.
Hosted `/docs` sessions also keep local vault work disabled: `?intent=local`
only opens the picker in the Tauri runtime, while browser users are sent back to
the macOS download path for writable local work. The handle store also filters
persisted Tauri path records outside the Tauri runtime, so installed-app recents
cannot leak into the hosted browser as writable vault state.

This keeps the desktop app aligned with the core ontology definition: the
frontmatter graph remains the source of truth, the CLI/MCP graph engine remains
the agent interface, and the app is only a native-feeling local shell for the
workbench.

Remaining distribution hardening after this slice is release-channel policy,
updater behavior, and whether MCP/CLI sidecars are bundled or installed
separately. Public downloads still require real Apple Developer credentials in
the tag workflow before the primary download can be published and verified.
