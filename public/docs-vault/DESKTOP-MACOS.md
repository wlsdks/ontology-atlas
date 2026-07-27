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
pnpm desktop:release-source -- --sha="$(git rev-parse HEAD)"  # tag only default-branch head
pnpm desktop:release-run -- --tag=v1.0.0  # wait for the pushed tag workflow run
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
- `scripts/check-macos-release-secrets.mjs` fails the tag workflow before build
  when any required Apple Developer ID or notary secret is missing, blank, or
  structurally unusable, including a certificate secret that is base64 but not
  a PKCS#12 DER payload, so GitHub Releases cannot accidentally publish an
  unsigned or unnotarized macOS artifact.
- `scripts/check-macos-release-github.mjs` checks the GitHub-side prerequisites
  before pushing a public tag: `gh` authentication, the active
  `release-macos.yml` release workflow, required Developer ID direct-download
  signing/notary secret names (not Mac App Store submission), optional
  tag/version alignment, clean local and remote same-tag Git tag slots, and a
  clean same-tag Release slot. It cannot inspect secret values, so the tag
  workflow still runs `desktop:release-secrets` before signing.
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
- `pnpm desktop:release-preflight` is the local operator shortcut before a
  public tag: it runs readiness checks, docs-vault freshness, desktop checker
  tests, native bridge tests, runtime doctor, `cli:mcp-verify` against the
  dogfood vault, the `dogfood:agent-setup-gate` JSON fallback/performance gate,
  static build, packaged-route smoke, app/DMG build, LaunchServices app content
  proof (`--open-app --require-window --require-owner-name="Ontology Atlas"
  --min-window-size=1040x720 --require-accessibility-text="Ontology Atlas"`),
  DMG mount/checksum smoke, and temporary install launch smoke. It does not require
  Developer ID credentials, so it is the fast local proof for an unsigned
  prototype artifact.
- `pnpm desktop:release-artifact` is the credentialed artifact path for direct
  downloads: it requires Developer ID/notary secrets, rebuilds and route-smokes
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

태그가 채널을 정한다. **semver 프리릴리스는 하이픈 뒤에 온다**, 그리고 그 한
글자가 "먼저 써볼 사람만" 과 "모두에게" 를 가른다.

| 태그 | GitHub | 받는 사람 |
|---|---|---|
| `v1.1.0` | 정식 릴리스 | 모두 — `releases/latest` 가 가리킨다 |
| `v1.1.0-rc.1` | **Pre-release** 배지 | 먼저 써보겠다고 찾아온 사람만 |

RC 를 쓰는 이유는 되돌릴 수 없기 때문이다. 태그를 밀면 곧 공개고, 받아간
사람에게서 회수할 방법은 없다. RC 는 그 사이에 **되돌릴 수 있는 한 칸**을 만든다:

```
v1.1.0-rc.1  →  문제 발견
v1.1.0-rc.2  →  고쳐서 다시
v1.1.0       →  이제 정식
```

절차는 정식과 **완전히 같다** — 별도 워크플로도, 별도 스크립트도 없다.
`package.json` · `src-tauri/tauri.conf.json` · `src-tauri/Cargo.toml` 세 곳의
버전을 `1.1.0-rc.1` 로 맞추고 같은 태그를 밀면 된다. 워크플로가 태그에서
프리릴리스 여부를 읽어 draft 단계와 발행 단계 양쪽에 적용한다
(`prerelease: ${{ contains(github.ref_name, '-') }}`). `pnpm desktop:check` 가
이 유도를 계약으로 잠근다 — 하드코딩으로 되돌리면 실패한다.

### `-rc.1` 과 CFBundleVersion — 실측 결과 (2026-07-27)

한동안 미지수로 남겨 뒀던 항목이다. **직접 재 보았고, 통과한다.**

Tauri 는 세 버전 파일의 문자열을 **변환 없이 그대로** 번들에 넣는다:

| 필드 | 값 |
|---|---|
| `CFBundleShortVersionString` | `1.0.0-rc.1` |
| `CFBundleVersion` | `1.0.0-rc.1` |

`plutil -lint` 통과, Spotlight 이 `kMDItemVersion` 으로 읽고, ad-hoc 서명 후
LaunchServices 로 띄워 창까지 확인했다.

> **다만 규격상으로는 어긋난다.** Apple 문서는 `CFBundleVersion` 을 점으로
> 구분된 정수 문자열로 규정한다. 직접 배포(우리 경로)에서 macOS 는 관대하고
> 실제로 문제가 없지만, **App Store 제출 경로로 가면 거부된다.** 우리는 직접
> 배포만 하므로 지금은 성립한다 — 앱스토어를 고려하게 되면 이 표기부터 다시 본다.

## First Public Release Runbook (v1.0.0)

The pipeline is complete; what gates the first public release is credentials
the repository cannot hold for you. Work top to bottom.

> **현재 경로: 미서명 (2026-07-27 소유자 결정 — `docs/DECISIONS.md`).** Apple
> Developer 인증서가 준비될 때까지 릴리스는 **서명 없이** 나가고, 다운로드
> 페이지가 Gatekeeper 우회 단계를 먼저 안내한다. 워크플로는 secret 5개가 다
> 채워지는 순간 **자동으로 서명 경로로 돌아간다** — 조용히 넘어가지 않고 어느
> 경로로 갔는지 요약과 릴리스 본문에 크게 적는다. 인증서가 생기면 페이지의
> 신뢰 문구도 함께 되돌린다.

**1 — Apple Developer credentials (owner-only, cannot be automated).**

1. Join the Apple Developer Program ($99/year). Approval is instant for some
   accounts and takes days for others — start here, it sets the schedule.
2. In the Apple Developer portal create a **Developer ID Application**
   certificate (not "Apple Distribution": that one is for the Mac App Store and
   will not let a downloaded DMG launch).
3. Download the certificate, open it in Keychain Access, and export it as
   `.p12` with a password.
4. Create an app-specific password at appleid.apple.com for `notarytool`.
5. Read the Team ID from the developer portal's membership page.

**2 — Register the five GitHub Secrets** (Settings → Secrets and variables →
Actions). Base64-encode the certificate first:

```bash
base64 -i DeveloperID.p12 | pbcopy   # → APPLE_CERTIFICATE_P12_BASE64
gh secret list --repo wlsdks/ontology-atlas   # verify all seven are present
```

**다섯 개다**: `APPLE_CERTIFICATE_P12_BASE64` · `APPLE_CERTIFICATE_PASSWORD` ·
`APPLE_ID` · `APPLE_APP_SPECIFIC_PASSWORD` · `APPLE_TEAM_ID` — 전부 Apple 이
실제로 발급하는 것들이다. 예전에 있던 둘은 사람이 등록할 이유가 없어 없앴다:
CI 키체인 비밀번호는 한 잡 안에서 만들어졌다 지워지므로 워크플로가 생성하고,
서명 신원은 방금 가져온 인증서에 적혀 있으므로 `security find-identity` 가
파생한다. **등록할 secret 이 적을수록 잘못 넣을 것도 적다.**

**3 — Configure the `release` environment approval.** Settings → Environments →
`release` → *Required reviewers* → add yourself. Without this the publish job
runs unattended and the draft-install check below is skipped silently. The
readiness gate asserts the workflow *declares* the environment; only the
repository settings can make it actually block.

**4 — Verify locally, then tag.**

```bash
pnpm desktop:release-github -- --tag=v1.0.0   # secrets + workflow + tag slot
pnpm desktop:release-preflight                # build, smoke, DMG, install smoke
git tag v1.0.0 && git push origin v1.0.0
```

**5 — Install the draft before it becomes public.** The workflow builds both
architectures, signs, notarizes, verifies checksums, and uploads a **draft**
release, then stops at the `release` environment gate. Download that draft DMG,
install it on a real Mac, launch it, open a vault. This is the step no CI job
can do for you — and the reason the version is not `1.0.0-rc.1`: you are
testing the exact bytes that will ship, not a rehearsal build.

**6 — Approve, then fill the download page with real facts.** Approving the
environment flips the release to stable. The `/download` page still says
"unpublished" until the generated release facts are refreshed:

```bash
pnpm download:release-facts -- --tag=v1.0.0   # reads real size + SHA-256
pnpm exec vitest run src/views/download
git commit -am "chore: v1.0.0 릴리스 자산 사실 반영" && git push
```

GitHub Pages redeploys on push, and the page switches to per-architecture
direct download buttons with the published size and checksum.

## Developer ID 자격증명 만들기 — 실행 가능한 절차

**이 절차는 5년에 한 번 한다** (Developer ID 인증서 유효기간). 그때의 사람은
지금의 사람이 아니고, 산문으로 적어 둔 절차는 그 사이에 반드시 낡는다. 그래서
경로를 스크립트로 박았다: `scripts/apple-signing-setup.mjs`. 아래는 그 스크립트가
하는 일의 설명이지 별도의 절차가 아니다 — **어긋나면 스크립트가 옳다.**

### 사람에게 남는 것은 두 순간뿐이다

둘 다 **자격증명을 다루는 순간**이라 자동화하지 않는다: Apple 로그인(비밀번호 +
2FA)과 앱 암호 발급. 나머지 — 키쌍 생성 · CSR 작성 · `.p12` 조립 · GitHub 등록 ·
검증 — 은 전부 스크립트 안에 있다.

### 왜 Keychain Access GUI 를 쓰지 않는가

흔한 안내는 키체인 접근에서 CSR 을 만들고 인증서를 설치한 뒤 `.p12` 로
내보내라고 한다. 그 경로에는 **조용한 함정**이 있다 — "나의 인증서" 가 아니라
"인증서" 카테고리에서 내보내면 **개인키가 빠지는데 파일은 멀쩡히 만들어진다.**
실패는 몇 분 뒤 CI 의 `codesign` 에서 처음 드러난다.

여기서는 개인키를 우리가 만들고 우리가 들고 있으므로 **그 실수가 구조적으로
불가능하다.** `.p12` 는 항상 키와 인증서를 함께 담는다.

### 1 — 키쌍과 CSR (자동)

```bash
node scripts/apple-signing-setup.mjs csr \
  --name="법적 실명" --email="Apple 계정 이메일"
```

`--name` 은 Apple 계정의 **법적 실명**이어야 한다. 별명이면 심사가 지연되거나
거부된다. 산출물은 `~/.ontology-atlas-signing/` 에 놓인다 — 개인키는 `0600`,
디렉토리는 `0700`, **저장소 밖**이다(작업 트리에 두면 커밋될 수 있다).

> **개인키를 잃으면 그 인증서는 못 쓴다.** 이 디렉토리를 지우지 마라. 스크립트는
> 기존 키가 있으면 덮어쓰지 않고 멈춘다.

### 2 — Apple 에서 인증서 발급 (사람)

1. https://developer.apple.com/account/resources/certificates/add
2. 종류: **Developer ID Application** — 앱스토어 제출용이 아니라 직접 배포용이다
3. 1단계가 만든 `.certSigningRequest` 업로드 → `.cer` 다운로드

### 3 — `.p12` 조립과 GitHub 등록 (자동)

```bash
node scripts/apple-signing-setup.mjs bundle --cer=~/Downloads/developerID_application.cer
```

`.cer`(DER)을 PEM 으로 바꾸고 개인키와 합쳐 `.p12` 를 만든 뒤
`APPLE_CERTIFICATE_P12_BASE64` 와 `APPLE_CERTIFICATE_PASSWORD` 를 등록한다.

**내보내기 비밀번호는 스크립트가 무작위로 만들고 아무도 보지 않는다** — 사람도,
로그도, 모델도. 그 값의 유일한 용도는 GitHub 으로 가는 동안 파일을 감싸는
것이고, 받는 쪽(CI)은 secret 으로 같은 값을 받는다. 사람이 기억할 이유가 없는
값을 사람에게 보여주는 것은 유출 경로만 늘린다. `gh` 에는 인자가 아니라
**stdin 으로** 넘긴다 — 인자로 주면 프로세스 목록에 뜬다.

### 4 — 남은 셋은 사람이 넣는다 (자격증명)

| secret | 어디서 |
|---|---|
| `APPLE_ID` | Apple 계정 이메일 |
| `APPLE_APP_SPECIFIC_PASSWORD` | https://account.apple.com → 로그인 및 보안 → 앱 암호 |
| `APPLE_TEAM_ID` | https://developer.apple.com/account → Membership details (10자리) |

```bash
gh secret set APPLE_ID --repo wlsdks/ontology-atlas
gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo wlsdks/ontology-atlas
gh secret set APPLE_TEAM_ID --repo wlsdks/ontology-atlas
```

인자 없이 실행하면 입력이 가려진 채로 값을 받는다.

### 5 — 검증

```bash
node scripts/apple-signing-setup.mjs verify
```

무엇이 남았는지, 그리고 그것을 **사람이 넣는지 스크립트가 넣는지**까지 말한다.
다 차면 다음 태그부터 워크플로가 자동으로 서명 경로로 간다 — 코드 수정은 없다.

### secret 은 어디에 사는가

GitHub Actions **repository secret** 이다. 저장소가 공개여도 노출되지 않는다:
git 에 들어가지 않고, 클론에 딸려가지 않고, **한 번 저장하면 아무도 못 읽는다**
(교체만 가능하다). 워크플로 실행 중에만 주입되고 로그에 찍히려 하면 GitHub 이
가린다. 포크에서 올린 PR 에는 전달되지 않는다.

**남는 위험은 하나다**: 저장소에 쓰기 권한이 있는 사람은 secret 을 빼내는
워크플로를 추가할 수 있다. 지금은 소유자 1인이라 성립하지만, **협업자가 생기면
이 가정이 깨진다** — 그때 다시 본다.

### 인증서가 생긴 다음에 할 일

`docs/DECISIONS.md` 의 「v1.0.0 을 미서명 DMG 로 내고, 대신 정직하게 안내한다」가
*"인증서가 생기면 이 결정은 자동으로 뒤집힌다 — 그때 페이지 문구도 함께
되돌린다"* 고 적어 두었다. 다운로드 페이지의 Gatekeeper 우회 안내를 걷어내고
신뢰 문구를 되돌린다. **자동으로 되지 않는 유일한 부분이다.**

## Release Signing and Notarization

Local development does not require Apple credentials. Public macOS downloads do,
when the app is distributed like Obsidian: the website links to a signed DMG,
the user downloads it, copies the app locally, and runs it outside the Mac App
Store. These are Developer ID direct-download signing/notarization credentials,
not App Store submission credentials. The tag workflow fails closed unless these
GitHub Secrets are all present:

**필요한 secret 은 5개다** — 그리고 5개 **전부 Apple 이 주는 값**이다.

- `APPLE_CERTIFICATE_P12_BASE64`: base64-encoded Developer ID Application
  certificate export (`.p12`).
- `APPLE_CERTIFICATE_PASSWORD`: password for that `.p12`.
- `APPLE_ID`: Apple ID for `notarytool`.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that Apple ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

한때 7개였다. 둘은 **Apple 발급물이 아니라 우리가 만들어 낸 등록 항목**이라
지웠다 — 사람이 등록할 secret 이 적을수록 실수도 적다.

- `APPLE_KEYCHAIN_PASSWORD` — 그 키체인은 잡 안에서 만들어져 잡 안에서 지워진다.
  워크플로가 `openssl rand -base64 24` 로 그때그때 만들고 `::add-mask::` 로
  가린다. 사람이 기억할 이유가 없는 값이었다.
- `APPLE_SIGNING_IDENTITY` — 방금 가져온 인증서에 그 이름이 적혀 있다.
  `security find-identity -v -p codesigning` 로 유도한다. 키체인에 Developer ID
  가 둘 이상이거나 없을 때만 환경변수로 되돌아가고, 그때는 오류 메시지가
  무엇이 없는지 정확히 말한다. 사람에게 한 번 더 타이핑시키는 것은 얻는 정보
  없이 틀릴 기회만 늘리는 일이었다.

The tag workflow verifies `${GITHUB_SHA}` with
`pnpm desktop:release-source` and `${GITHUB_REF_NAME}` with
`pnpm desktop:release-tag` before signing credentials enter the path, then runs
`pnpm desktop:release-artifact` after importing the certificate with the macOS
`base64 -D` decoder. That command checks release secrets, builds the `.app`,
signs with `pnpm desktop:sign`, packages the DMG, notarizes/staples with
`pnpm desktop:notarize`, and runs `pnpm desktop:verify-release-dmg` against the
final artifact. Each architecture lane also writes the generated DMG filename,
byte size, and SHA-256 value to the GitHub Actions step summary before uploading
artifacts, so release reviewers can inspect the signed/notarized candidate
without downloading every artifact first. If the tag was pushed from an unmerged or stale commit, the tag
version drifts from package/Tauri/Cargo metadata, or the Developer ID direct-download secrets are not
configured, blank, or structurally invalid, the workflow fails before uploading
an unsigned or wrongly sourced distribution candidate.
Before pushing the tag, run
`pnpm desktop:release-github -- --tag=v1.0.0` to catch missing GitHub secret
names or a disabled release workflow from the operator machine. In the current
repo state this is a real external gate: GitHub authentication works, the
release workflow is active on GitHub, and the `v1.0.0` tag slot is clean, but
the Developer ID direct-download secret list is still incomplete and the
`v1.0.0` GitHub Release does not exist, so a tag push would fail before signing.
Configure the Developer ID direct-download secrets before pushing the release tag.
Use `pnpm desktop:release-status -- --pr=<number> --tag=v1.0.0` as the completion
audit before calling the macOS app goal done: it accepts an already merged PR
only when that PR is the latest merged PR on the release branch, or checks
tag/package/Tauri/Cargo version alignment, PR review/merge readiness,
active macOS release workflow availability, clean local and remote same-tag Git
ref slots, required Developer ID direct-download signing/notary secret names,
public stable GitHub
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
Markdown checklist renders the Apple signing secrets under each blocked row's
missing-secret section, so handoff reviewers do not have to cross-read the JSON
payload. The default
`.tmp/desktop-goal-status` artifacts include `local_preflight=ok` only because
the goal-audit wrapper has already completed the local release preflight in the
same process chain.
`pnpm desktop:release-run -- --tag=v1.0.0` is the post-tag watcher used by that
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
and tag commands. Developer ID direct-download signing blockers additionally
expose `missingSecrets[]` for direct comparison against GitHub Secrets.
The hosted website deploy is not part of the macOS app release gate;
run `pnpm desktop:verify-hosted` after the separate GitHub Pages deploy.
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
`src-tauri/target/release/bundle/dmg/ontology-atlas_1.0.0_aarch64.dmg`, and
`src-tauri/target/release/bundle/dmg/ontology-atlas_1.0.0_aarch64.dmg.sha256`.
`.github/workflows/release-macos.yml` builds Apple Silicon (`macos-14`) and
Intel (`macos-15-intel`) artifacts on `v*` tags, requires Developer ID direct-download
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
not require any website deploy secrets; the installed app remains
local-only, and website deployment stays in `.github/workflows/deploy-pages.yml`.
Public downloads are still a
distribution-hardening slice until the Apple credentials are configured and the
tag workflow runs successfully.

## Later Distribution Work

Treat these as separate hardening slices after the prototype works:

- public release-channel policy after the first stable macOS tag release is exercised.
- updater and release-channel policy.
- whether MCP/CLI binaries are bundled as sidecars or installed separately.
- native filesystem permission UX beyond the current selected-folder bridge.
