#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  console.error(`[desktop-check] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`✓ ${message}`);
}

function orderedIndexes(text, needles) {
  return needles.map((needle) => text.indexOf(needle));
}

function hasStrictOrder(indexes) {
  return indexes.every((index) => index >= 0) &&
    indexes.every((index, position) => position === 0 || indexes[position - 1] < index);
}

const nextConfig = readText("next.config.ts");
const pkg = JSON.parse(readText("package.json"));
const cargoToml = readText("src-tauri/Cargo.toml");
const desktopDoc = readText("docs/DESKTOP-MACOS.md");
const landingPage = readText("src/views/landing/ui/LandingPage.tsx");
const downloadPage = readText("src/views/download/ui/DownloadPage.tsx");
const macosDownloadLink = readText("src/features/macos-download-link/ui/MacosDownloadLink.tsx");
const bottomTabBar = readText("src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx");
const bottomTabBarPolicy = readText("src/widgets/bottom-tab-bar/lib/is-tab-active.ts");
const tauriLib = readText("src-tauri/src/lib.rs");
const tauriShim = readText("src/shared/lib/tauri-vault-fs.ts");
const verifyDmgScript = readText("scripts/verify-macos-dmg.mjs");
const verifyAppScript = readText("scripts/verify-macos-app-launch.mjs");
const verifyInstallScript = readText("scripts/verify-macos-install-smoke.mjs");
const releaseTagScript = readText("scripts/check-macos-release-tag.mjs");
const releaseGithubScript = readText("scripts/check-macos-release-github.mjs");
const rootEntryPage = readText("src/views/root-entry/ui/RootEntryPage.tsx");
const docsVaultPage = readText("src/views/docs-vault/ui/DocsVaultPage.tsx");
const vaultToolsMenu = readText("src/widgets/docs-vault/ui/VaultToolsMenu.tsx");
const localVaultPicker = readText("src/features/docs-vault-local/ui/LocalVaultPicker.tsx");
const localFsHandleStore = readText("src/entities/local-fs-handle/api/store.ts");
const localVaultHook = readText("src/features/docs-vault-local/model/use-local-vault.ts");
const releaseWorkflow = readText(".github/workflows/release-macos.yml");
const downloadReleaseVerifier = readText("scripts/check-macos-download-release.mjs");
const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauriCapabilityPath = path.join(root, "src-tauri", "capabilities", "default.json");
const tauriConfig = fs.existsSync(tauriConfigPath)
  ? JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"))
  : null;
const tauriCapability = fs.existsSync(tauriCapabilityPath)
  ? JSON.parse(fs.readFileSync(tauriCapabilityPath, "utf8"))
  : null;

console.log("[desktop-check] macOS desktop Tauri-shell readiness");

const cargoPackageVersion = cargoToml.match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1];
const releaseBuildOrder = orderedIndexes(releaseWorkflow, [
  "name: Verify release tag version",
  "name: Require Apple release signing secrets",
  "name: Build macOS app",
  "name: Sign macOS app",
  "name: Package macOS DMG",
  "name: Notarize and staple DMG",
  "name: Verify DMG",
  "name: Verify temporary install",
  "name: Upload workflow artifact",
]);
const releasePublishOrder = orderedIndexes(releaseWorkflow, [
  "name: Upload draft GitHub Release assets",
  "name: Verify draft release assets",
  "name: Publish verified stable release",
  "name: Verify public download assets",
]);

if (/output\s*:\s*['"]export['"]/.test(nextConfig)) {
  pass("Next.js uses static export output");
} else {
  fail("next.config.ts must keep output: 'export' before a Tauri shell can load out/");
}

if (/images\s*:\s*{[\s\S]*unoptimized\s*:\s*true[\s\S]*}/.test(nextConfig)) {
  pass("Next.js image optimization is disabled for static export");
} else {
  fail("next.config.ts must keep images.unoptimized: true for static export packaging");
}

if (/trailingSlash\s*:\s*true/.test(nextConfig)) {
  pass("Next.js emits trailing-slash routes for file-backed desktop navigation");
} else {
  fail("next.config.ts must keep trailingSlash: true for static out/ routes");
}

if (pkg.scripts?.build === "pnpm docs-vault:build && next build") {
  pass("build script refreshes docs-vault before next build");
} else {
  fail("package.json build script must refresh docs-vault before next build");
}

if (
  typeof pkg.version === "string" &&
  tauriConfig?.version === pkg.version &&
  cargoPackageVersion === pkg.version
) {
  pass("desktop package, Tauri, and Rust crate versions stay aligned for release tags");
} else {
  fail(
    `package.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml versions must match before macOS release packaging (package=${pkg.version ?? "missing"}, tauri=${tauriConfig?.version ?? "missing"}, cargo=${cargoPackageVersion ?? "missing"})`,
  );
}

if (pkg.scripts?.["docs-vault:check"]) {
  pass("docs-vault freshness check is available before desktop packaging");
} else {
  fail("package.json must expose docs-vault:check before desktop packaging");
}

if (pkg.scripts?.["cli:mcp-verify"]) {
  pass("CLI/MCP setup gate is available for desktop handoff verification");
} else {
  fail("package.json must expose cli:mcp-verify for desktop handoff verification");
}

if (pkg.scripts?.["desktop:doctor"] === "node scripts/desktop-doctor.mjs") {
  pass("desktop runtime doctor is available before .app build attempts");
} else {
  fail("package.json must expose desktop:doctor as node scripts/desktop-doctor.mjs");
}

if (pkg.scripts?.["desktop:smoke"] === "node scripts/desktop-smoke.mjs") {
  pass("desktop packaged-route smoke is available after static build");
} else {
  fail("package.json must expose desktop:smoke as node scripts/desktop-smoke.mjs");
}

if (pkg.scripts?.["desktop:verify-app"] === "node scripts/verify-macos-app-launch.mjs") {
  pass("desktop app launch verifier is available after .app builds");
} else {
  fail(
    "package.json must expose desktop:verify-app as node scripts/verify-macos-app-launch.mjs",
  );
}

if (
  verifyAppScript.includes("cwd: path.dirname(executablePath)") &&
  verifyInstallScript.includes("cwd: path.dirname(executablePath)")
) {
  pass("desktop app launch smokes run from the installed app executable directory");
} else {
  fail(
    "desktop app launch smokes must not use the repo root as cwd; run from the app executable directory",
  );
}

if (
  pkg.scripts?.["test:desktop:bridge"] ===
  "pnpm exec vitest run src/shared/lib/tauri-vault-fs.test.ts src/entities/local-fs-handle/api/store.test.ts && cargo test --manifest-path src-tauri/Cargo.toml"
) {
  pass("desktop native vault bridge tests cover WebView handle shim and Rust path guard");
} else {
  fail("package.json must expose test:desktop:bridge for the Tauri vault bridge contract");
}

if (
  tauriLib.includes("ensure_inside_canonical") &&
  tauriLib.includes("resolve_write_target_inside") &&
  tauriLib.includes("resolve_directory_target_inside") &&
  tauriLib.includes("vault_commands_reject_symlink_escapes") &&
  tauriLib.includes('"linked-dir/new/created-outside.md"') &&
  tauriLib.includes("assert!(!outside.join(\"new\").exists())")
) {
  pass("desktop native vault bridge rejects symlink escapes without outside-vault side effects");
} else {
  fail("src-tauri/src/lib.rs must reject symlink escapes for vault read/write/remove/mkdir paths without creating outside-vault directories");
}

if (pkg.scripts?.["desktop:verify-dmg"] === "node scripts/verify-macos-dmg.mjs") {
  pass("desktop DMG verifier is available after packaging");
} else {
  fail("package.json must expose desktop:verify-dmg as node scripts/verify-macos-dmg.mjs");
}

if (
  pkg.scripts?.["desktop:verify-install"] ===
  "node scripts/verify-macos-install-smoke.mjs"
) {
  pass("desktop install verifier copies the DMG app and launch-smokes the installed copy");
} else {
  fail(
    "package.json must expose desktop:verify-install as node scripts/verify-macos-install-smoke.mjs",
  );
}

if (
  pkg.scripts?.["desktop:verify-release-dmg"] ===
  "node scripts/verify-macos-dmg.mjs --require-signed --require-notarized"
) {
  pass("desktop release DMG verifier requires signing and notarization");
} else {
  fail(
    "package.json must expose desktop:verify-release-dmg as node scripts/verify-macos-dmg.mjs --require-signed --require-notarized",
  );
}

if (
  verifyDmgScript.includes('"spctl"') &&
  /"--type",\s*"execute"/.test(verifyDmgScript) &&
  /"--type",\s*"open"/.test(verifyDmgScript) &&
  verifyDmgScript.includes("context:primary-signature")
) {
  pass("desktop release DMG verifier runs Gatekeeper assessment for the app and DMG");
} else {
  fail("scripts/verify-macos-dmg.mjs must run spctl assessment for release app execution and DMG opening");
}

if (
  pkg.scripts?.["desktop:verify-download"] ===
  "node scripts/check-macos-download-release.mjs"
) {
  pass("desktop public download verifier is available after release publishing");
} else {
  fail(
    "package.json must expose desktop:verify-download as node scripts/check-macos-download-release.mjs",
  );
}

if (
  downloadReleaseVerifier.includes("releaseVersionFromTag") &&
  downloadReleaseVerifier.includes("do not match the tag version") &&
  downloadReleaseVerifier.includes("allowDraft") &&
  downloadReleaseVerifier.includes("unsupported macOS DMG asset names") &&
  downloadReleaseVerifier.includes("requestSha256") &&
  downloadReleaseVerifier.includes("does not match checksum")
) {
  pass("desktop download verifier rejects stale DMG versions, unsupported DMG names, and checksum mismatches, including draft pre-publish assets");
} else {
  fail(
    "scripts/check-macos-download-release.mjs must verify supported DMG naming, DMG filename versions match the release tag, and downloaded bytes match the checksum, including draft pre-publish assets",
  );
}

if (
  pkg.scripts?.["desktop:release-preflight"] ===
  "pnpm desktop:check && pnpm docs-vault:check && pnpm test:desktop:check && pnpm test:desktop:bridge && pnpm desktop:doctor -- --require-runtime && pnpm build && pnpm desktop:smoke && pnpm desktop:build && pnpm desktop:verify-app && pnpm desktop:verify-dmg && pnpm desktop:verify-install"
) {
  pass("desktop local release preflight runs readiness, tests, runtime doctor, build, route smoke, DMG, and install smoke");
} else {
  fail(
    "package.json must expose desktop:release-preflight as the local pre-tag macOS release gate",
  );
}

if (
  landingPage.includes("MacosDownloadLink") &&
  downloadPage.includes("MacosDownloadLink") &&
  macosDownloadLink.includes("GITHUB_RELEASES_URL") &&
  !macosDownloadLink.includes("releases/latest") &&
  !macosDownloadLink.includes("api.github.com")
) {
  pass("hosted download CTAs open GitHub Releases without a broken latest-release dependency");
} else {
  fail(
    "hosted landing/download CTAs must avoid a broken latest-release URL before a public macOS DMG release exists",
  );
}

if (landingPage.includes('href="/download/"')) {
  pass("hosted landing secondary CTA points to the app installation guide, not the web workbench");
} else {
  fail(
    "src/views/landing/ui/LandingPage.tsx must send the secondary hosted CTA to /download/ so the web surface stays promo/download-first",
  );
}

if (
  !landingPage.includes('/docs/?intent=local') &&
  !downloadPage.includes('/docs/?intent=local')
) {
  pass("hosted landing and download pages do not route users into the browser workbench");
} else {
  fail(
    "hosted landing/download pages must stay promo/download-first and must not link to /docs/?intent=local",
  );
}

if (
  bottomTabBar.includes("shouldHideBottomTabBar(pathname") &&
  /normalized === ['"]\/download['"]/.test(bottomTabBarPolicy) &&
  /normalized === ['"]\/['"] && !hasLoadedVault/.test(bottomTabBarPolicy)
) {
  pass("mobile bottom navigation is hidden on public marketing and download surfaces");
} else {
  fail("BottomTabBar must hide on /download and on the public landing page until a local vault is loaded");
}

if (
  /draft:\s*true/.test(releaseWorkflow) &&
  /Verify draft release assets/.test(releaseWorkflow) &&
  /--allow-draft/.test(releaseWorkflow) &&
  /gh release edit "\$\{GITHUB_REF_NAME\}" --draft=false --prerelease=false/.test(releaseWorkflow) &&
  /prerelease:\s*false/.test(releaseWorkflow) &&
  /pnpm docs-vault:check/.test(releaseWorkflow) &&
  /pnpm test:desktop:check/.test(releaseWorkflow) &&
  /pnpm test:desktop:bridge/.test(releaseWorkflow) &&
  /pnpm build/.test(releaseWorkflow) &&
  /pnpm desktop:smoke/.test(releaseWorkflow) &&
  /pnpm desktop:verify-release-dmg/.test(releaseWorkflow) &&
  /pnpm desktop:verify-install/.test(releaseWorkflow) &&
  /arch:\s*aarch64/.test(releaseWorkflow) &&
  /runner:\s*macos-14/.test(releaseWorkflow) &&
  /arch:\s*x64/.test(releaseWorkflow) &&
  /runner:\s*macos-15-intel/.test(releaseWorkflow) &&
  /release-assets\/\*\.sha256/.test(releaseWorkflow) &&
  /pnpm desktop:verify-download -- --tag="\$\{GITHUB_REF_NAME\}"/.test(releaseWorkflow) &&
  hasStrictOrder(releaseBuildOrder) &&
  hasStrictOrder(releasePublishOrder)
) {
  pass("tag release workflow builds Apple Silicon and Intel DMGs, verifies draft assets, then publishes and re-verifies public stable assets");
} else {
  fail(
    ".github/workflows/release-macos.yml must build Apple Silicon and Intel DMGs, test the desktop checker/native bridge, smoke the static desktop payload, verify the tag and secrets before signing, sign/notarize before upload, upload checksum assets as a draft release, verify draft assets, publish the release as stable, install-smoke each DMG, then run desktop:verify-download for the tag",
  );
}

if (pkg.scripts?.["desktop:release-secrets"] === "node scripts/check-macos-release-secrets.mjs") {
  pass("desktop release secret gate blocks unsigned public releases");
} else {
  fail(
    "package.json must expose desktop:release-secrets as node scripts/check-macos-release-secrets.mjs",
  );
}

if (
  pkg.scripts?.["desktop:release-tag"] === "node scripts/check-macos-release-tag.mjs" &&
  releaseWorkflow.includes('pnpm desktop:release-tag -- --tag="${GITHUB_REF_NAME}"') &&
  releaseTagScript.includes("does not match macOS app versions")
) {
  pass("desktop release tag gate fails before signing when the v-prefixed tag differs from app versions");
} else {
  fail(
    "package.json and .github/workflows/release-macos.yml must run scripts/check-macos-release-tag.mjs before signing so release tags match package, Tauri, and Cargo versions",
  );
}

if (
  pkg.scripts?.["desktop:release-github"] === "node scripts/check-macos-release-github.mjs" &&
  releaseGithubScript.includes('"secret"') &&
  releaseGithubScript.includes('"list"') &&
  releaseGithubScript.includes("APPLE_CERTIFICATE_P12_BASE64") &&
  releaseGithubScript.includes("actions/workflows/release-macos.yml")
) {
  pass("desktop GitHub release readiness gate checks workflow and Apple secret names before tag push");
} else {
  fail(
    "package.json must expose desktop:release-github and scripts/check-macos-release-github.mjs must check the release workflow plus required Apple GitHub secret names",
  );
}

if (pkg.scripts?.["desktop:sign"] === "node scripts/sign-macos-app.mjs") {
  pass("desktop signing script is available for release builds");
} else {
  fail("package.json must expose desktop:sign as node scripts/sign-macos-app.mjs");
}

if (pkg.scripts?.["desktop:notarize"] === "node scripts/notarize-macos-dmg.mjs") {
  pass("desktop notarization script is available for release builds");
} else {
  fail("package.json must expose desktop:notarize as node scripts/notarize-macos-dmg.mjs");
}

if (pkg.scripts?.tauri === "tauri") {
  pass("Tauri CLI alias is available through pnpm tauri");
} else {
  fail("package.json must expose tauri as the Tauri CLI alias");
}

if (pkg.scripts?.["desktop:dev"] === "pnpm tauri dev") {
  pass("desktop dev script launches the Tauri shell");
} else {
  fail("package.json must expose desktop:dev as pnpm tauri dev");
}

if (pkg.scripts?.["desktop:build:app"] === "pnpm tauri build --bundles app") {
  pass("desktop app-only build script is available before release signing");
} else {
  fail("package.json must expose desktop:build:app as pnpm tauri build --bundles app");
}

if (pkg.scripts?.["desktop:build"] === "pnpm desktop:build:app && node scripts/package-macos-dmg.mjs") {
  pass("desktop build script targets macOS .app and .dmg artifacts");
} else {
  fail(
    "package.json must expose desktop:build as pnpm desktop:build:app && node scripts/package-macos-dmg.mjs",
  );
}

if (pkg.devDependencies?.["@tauri-apps/cli"]) {
  pass("Tauri CLI dependency is installed for desktop scripts");
} else {
  fail("package.json must include @tauri-apps/cli as a devDependency");
}

if (pkg.dependencies?.["@tauri-apps/api"]) {
  pass("Tauri JavaScript API dependency is installed for the WebView bridge");
} else {
  fail("package.json must include @tauri-apps/api so the WebView bridge uses the supported Tauri invoke API");
}

const qualityBarChecks = [
  ["native .app launch path", /stable `\.app` launch path|stable native `\.app`/i],
  ["vault-folder permission UX", /permission prompts|permission UX/i],
  ["recent vault recall", /recent vault recall/i],
  ["local data location clarity", /where data is\s+stored|local data location/i],
  ["agent setup visibility", /CLI, and MCP handoff|agent confidence|MCP verification/i],
  ["offline packaged routes", /offline usefulness|remain usable from the packaged app/i],
  ["doctor local ontology handoff", /dogfood `docs\/ontology` vault|dogfood vault/i],
];

const missingQualityBar = qualityBarChecks
  .filter(([, pattern]) => !pattern.test(desktopDoc))
  .map(([label]) => label);

if (missingQualityBar.length === 0) {
  pass("desktop quality bar names native launch, vault permissions, recent vaults, local data, agent setup, offline routes, and local ontology handoff");
} else {
  fail(
    `docs/DESKTOP-MACOS.md must keep the desktop quality bar explicit: missing ${missingQualityBar.join(", ")}`,
  );
}

const prototypeRouteChecks = [
  ["/download", /\/download/],
  ["/docs", /\/docs/],
  ["/ontology", /\/ontology/],
  ["/topology", /\/topology/],
  ["/ontology/edit", /\/ontology\/edit/],
];

const missingPrototypeRoutes = prototypeRouteChecks
  .filter(([, pattern]) => !pattern.test(desktopDoc))
  .map(([route]) => route);

if (missingPrototypeRoutes.length === 0) {
  pass("desktop prototype smoke names download, docs, ontology, topology, and builder routes");
} else {
  fail(
    `docs/DESKTOP-MACOS.md must keep the first desktop smoke routes explicit: missing ${missingPrototypeRoutes.join(", ")}`,
  );
}

if (tauriConfig) {
  pass("Tauri scaffold exists");
} else {
  fail("src-tauri/tauri.conf.json must exist before desktop prototype work continues");
}

if (tauriConfig?.build?.frontendDist === "../out") {
  pass("Tauri loads the Next.js static export from out/");
} else {
  fail("src-tauri/tauri.conf.json must set build.frontendDist to ../out");
}

if (tauriConfig?.build?.beforeBuildCommand === "pnpm build") {
  pass("Tauri build refreshes the static frontend through pnpm build");
} else {
  fail("src-tauri/tauri.conf.json must set build.beforeBuildCommand to pnpm build");
}

if (tauriConfig?.bundle?.targets?.includes("app")) {
  pass("Tauri bundle target includes macOS .app");
} else {
  fail("src-tauri/tauri.conf.json must include bundle target app");
}

if (
  tauriConfig?.bundle?.category === "DeveloperTool" &&
  tauriConfig?.bundle?.shortDescription?.includes("Local-first codebase ontology workbench") &&
  tauriConfig?.bundle?.longDescription?.includes("markdown ontology vault") &&
  tauriConfig?.bundle?.longDescription?.includes("without a backend or login") &&
  tauriConfig?.bundle?.copyright?.includes("oh-my-ontology contributors")
) {
  pass("Tauri bundle metadata identifies the installed app as a local-first developer tool");
} else {
  fail(
    "src-tauri/tauri.conf.json must set macOS bundle category, descriptions, and copyright so the installed app is not a generic wrapper",
  );
}

const tauriCsp = tauriConfig?.app?.security?.csp;
if (
  tauriCsp &&
  typeof tauriCsp === "object" &&
  tauriCsp["default-src"]?.includes("'self'") &&
  tauriCsp["connect-src"] === "ipc: http://ipc.localhost" &&
  tauriCsp["img-src"]?.includes("data:") &&
  tauriCsp["style-src"]?.includes("'self'") &&
  !JSON.stringify(tauriCsp).includes("https://")
) {
  pass("Tauri CSP is enabled for local app assets, images, styles, and IPC only");
} else {
  fail(
    "src-tauri/tauri.conf.json must enable a scoped CSP for local app assets, data/blob images, styles, and Tauri IPC",
  );
}

if (
  Array.isArray(tauriCapability?.windows) &&
  tauriCapability.windows.length === 1 &&
  tauriCapability.windows[0] === "main" &&
  Array.isArray(tauriCapability?.permissions) &&
  tauriCapability.permissions.length === 1 &&
  tauriCapability.permissions[0] === "core:default"
) {
  pass("Tauri capability grants only core defaults to the main local workbench window");
} else {
  fail("src-tauri/capabilities/default.json must not grant broad fs, shell, http, or opener permissions");
}

const tauriCommandChecks = [
  "pick_vault_directory",
  "list_vault_directory",
  "read_vault_text_file",
  "read_vault_binary_file",
  "write_vault_text_file",
  "remove_vault_entry",
  "ensure_vault_directory",
  "vault_path_exists",
  "open_vault_in_finder",
];
const missingTauriCommands = tauriCommandChecks.filter(
  (command) => !tauriLib.includes(command) || !tauriShim.includes(command),
);

if (missingTauriCommands.length === 0) {
  pass("Tauri native vault commands and browser handle shim are wired, including file and directory removal");
} else {
  fail(`Tauri native vault command bridge is incomplete: missing ${missingTauriCommands.join(", ")}`);
}

if (
  tauriShim.includes("from '@tauri-apps/api/core'") &&
  tauriShim.includes("isTauri()") &&
  tauriShim.includes("tauriInvoke(command, args)") &&
  !tauriShim.includes("__TAURI_INTERNALS__")
) {
  pass("Tauri vault bridge uses the supported JavaScript invoke API");
} else {
  fail("src/shared/lib/tauri-vault-fs.ts must use @tauri-apps/api/core invoke/isTauri instead of private Tauri internals");
}

if (
  tauriShim.includes("options.create") &&
  tauriShim.includes("'vault_path_exists'") &&
  tauriShim.includes("if (!exists)") &&
  tauriShim.includes("'write_vault_text_file'")
) {
  pass("Tauri getFileHandle create semantics avoid truncating existing vault files");
} else {
  fail(
    "src/shared/lib/tauri-vault-fs.ts must match File System Access create semantics: create missing files without truncating existing ones",
  );
}

if (
  rootEntryPage.includes("isTauriVaultRuntime()") &&
  rootEntryPage.includes("restoreAttempted") &&
  rootEntryPage.includes("DesktopVaultRedirect") &&
  rootEntryPage.includes("'/docs/?intent=local'")
) {
  pass("desktop root entry routes first launch into the local vault picker flow without rendering marketing");
} else {
  fail("src/views/root-entry/ui/RootEntryPage.tsx must route Tauri first launch to /docs/?intent=local after restore without rendering the hosted landing page");
}

if (
  docsVaultPage.includes("desktopIntentPickerOpenedRef") &&
  docsVaultPage.includes("isTauriVaultRuntime()") &&
  docsVaultPage.includes("openLocalVault()")
) {
  pass("desktop docs intent opens the native vault picker once");
} else {
  fail("src/views/docs-vault/ui/DocsVaultPage.tsx must open the native picker once for Tauri ?intent=local");
}

if (
  vaultToolsMenu.includes("getTauriVaultRootPath") &&
  vaultToolsMenu.includes("openTauriVaultInFinder") &&
  localVaultPicker.includes("rootPath") &&
  localVaultPicker.includes("copyPathAriaLabel") &&
  localVaultPicker.includes("copyText(rootPath)") &&
  localVaultPicker.includes("revealPathAriaLabel")
) {
  pass("desktop local vault tools expose, copy, and reveal the selected absolute vault path");
} else {
  fail(
    "desktop local vault tools must expose the selected absolute Tauri vault path with copy and Finder reveal actions",
  );
}

if (
  localFsHandleStore.includes("listRecentLocalFsHandles") &&
  localFsHandleStore.includes("forgetRecentLocalFsHandle") &&
  localVaultHook.includes("recentVaults") &&
  localVaultHook.includes("openRecent") &&
  localVaultHook.includes("forgetRecent") &&
  localVaultPicker.includes("recentVaults") &&
  localVaultPicker.includes("recentOpenAriaLabel") &&
  localVaultPicker.includes("recentForgetAriaLabel")
) {
  pass("desktop local vault picker exposes recent vault recall and stale-path cleanup from persisted Tauri paths");
} else {
  fail(
    "desktop local vault picker must expose recent vault recall and stale-path cleanup from persisted Tauri paths",
  );
}

const tauriScaffoldFiles = [
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/src/main.rs",
  "src-tauri/src/lib.rs",
  "src-tauri/capabilities/default.json",
  "src-tauri/icons/icon.png",
  "src-tauri/icons/icon.icns",
  "src/shared/lib/tauri-vault-fs.test.ts",
  "src/features/docs-vault-local/ui/LocalVaultPicker.test.tsx",
  "src/views/root-entry/ui/RootEntryPage.test.tsx",
  "scripts/package-macos-dmg.mjs",
  "scripts/verify-macos-app-launch.mjs",
  "scripts/verify-macos-dmg.mjs",
  "scripts/verify-macos-install-smoke.mjs",
  "scripts/check-macos-download-release.mjs",
  "scripts/check-macos-release-secrets.mjs",
  "scripts/check-macos-release-tag.mjs",
  "scripts/check-macos-release-github.mjs",
  "scripts/sign-macos-app.mjs",
  "scripts/notarize-macos-dmg.mjs",
  "src/shared/lib/tauri-vault-fs.ts",
];
const missingTauriFiles = tauriScaffoldFiles.filter(
  (relativePath) => !fs.existsSync(path.join(root, relativePath)),
);

if (missingTauriFiles.length === 0) {
  pass("Tauri Rust entrypoint, default capability files, app icons, and release packagers exist");
} else {
  fail(`Tauri scaffold is incomplete: missing ${missingTauriFiles.join(", ")}`);
}

if (!process.exitCode) {
  console.log("[desktop-check] ready: Tauri scaffold can wrap the static frontend for a macOS prototype");
}
