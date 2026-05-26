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
const enMessages = JSON.parse(readText("messages/en.json"));
const koMessages = JSON.parse(readText("messages/ko.json"));
const rootLayout = readText("app/layout.tsx");
const webManifest = readText("app/manifest.ts");
const cargoToml = readText("src-tauri/Cargo.toml");
const desktopDoc = readText("docs/DESKTOP-MACOS.md");
const rootReadme = readText("README.md");
const featuresDoc = readText("docs/FEATURES.md");
const productDirectionDoc = readText("docs/PRODUCT-DIRECTION.md");
const architectureDoc = readText("docs/ARCHITECTURE.md");
const developmentChecksDoc = readText("docs/DEVELOPMENT-CHECKS.md");
const agentGraphWorkflowDoc = readText("docs/AGENT-GRAPH-WORKFLOW.md");
const troubleshootingDoc = readText("docs/TROUBLESHOOTING.md");
const publishNpmDoc = readText("docs/PUBLISH-NPM.md");
const demoStoryboardDoc = readText("docs/launch/DEMO-GIF-STORYBOARD.md");
const redditPostsDoc = readText("docs/launch/REDDIT-POSTS.md");
const desktopOntologyDoc = readText("docs/ontology/capabilities/desktop-app-distribution.md");
const onboardingOntologyDoc = readText("docs/ontology/domains/onboarding-ux.md");
const firebaseDeployOntologyDoc = readText("docs/ontology/capabilities/firebase-deploy-skill.md");
const landingPage = readText("src/views/landing/ui/LandingPage.tsx");
const downloadPage = readText("src/views/download/ui/DownloadPage.tsx");
const downloadRoute = readText("app/[locale]/download/page.tsx");
const macosDownloadLink = readText("src/features/macos-download-link/ui/MacosDownloadLink.tsx");
const bottomTabBar = readText("src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx");
const bottomTabBarPolicy = readText("src/widgets/bottom-tab-bar/lib/is-tab-active.ts");
const tauriLib = readText("src-tauri/src/lib.rs");
const tauriShim = readText("src/shared/lib/tauri-vault-fs.ts");
const tauriInfoPlist = readText("src-tauri/Info.plist");
const packageMacosDmgScript = readText("scripts/package-macos-dmg.mjs");
const bundleCheckScript = readText("scripts/check-bundle.mjs");
const verifyDmgScript = readText("scripts/verify-macos-dmg.mjs");
const verifyAppScript = readText("scripts/verify-macos-app-launch.mjs");
const verifyInstallScript = readText("scripts/verify-macos-install-smoke.mjs");
const signMacosScript = readText("scripts/sign-macos-app.mjs");
const notarizeMacosDmgScript = readText("scripts/notarize-macos-dmg.mjs");
const releaseSourceScript = readText("scripts/check-macos-release-source.mjs");
const releaseTagScript = readText("scripts/check-macos-release-tag.mjs");
const releaseSlotScript = readText("scripts/check-macos-release-slot.mjs");
const releaseGithubScript = readText("scripts/check-macos-release-github.mjs");
const releaseStatusScript = readText("scripts/check-macos-release-status.mjs");
const macosReleaseNamesHelper = readText("scripts/lib/macos-release-names.mjs");
const hostedDownloadSurfaceScript = readText("scripts/check-hosted-download-surface.mjs");
const firebaseDeployEnvScript = readText("scripts/check-firebase-hosting-deploy-env.mjs");
const requiredAppleSecretNames = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_KEYCHAIN_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];
const forbiddenFirebasePackages = ["firebase", "firebase-admin", "firebase-tools"];
const rootEntryPage = readText("src/views/root-entry/ui/RootEntryPage.tsx");
const docsVaultPage = readText("src/views/docs-vault/ui/DocsVaultPage.tsx");
const ontologyViewPage = readText("src/views/ontology-view/ui/OntologyViewPage.tsx");
const topologyEmptyState = readText("src/widgets/topology-map-sigma/ui/TopologyEmptyState.tsx");
const vaultToolsMenu = readText("src/widgets/docs-vault/ui/VaultToolsMenu.tsx");
const localVaultPicker = readText("src/features/docs-vault-local/ui/LocalVaultPicker.tsx");
const localFsHandleStore = readText("src/entities/local-fs-handle/api/store.ts");
const localVaultHook = readText("src/features/docs-vault-local/model/use-local-vault.ts");
const ciWorkflow = readText(".github/workflows/ci.yml");
const releaseWorkflow = readText(".github/workflows/release-macos.yml");
const hostingDeployWorkflow = readText(".github/workflows/deploy-hosting.yml");
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
  "name: Verify release source commit",
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
  "name: Require clean GitHub Release slot",
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

if (
  pkg.scripts?.["bundle:check"] === "node scripts/check-bundle.mjs" &&
  bundleCheckScript.includes("const LOCAL_FIRST_BASE_ROUTES") &&
  bundleCheckScript.includes("'download'") &&
  bundleCheckScript.includes("'docs'") &&
  bundleCheckScript.includes("'ontology'") &&
  bundleCheckScript.includes("'topology'") &&
  bundleCheckScript.includes("'projects'")
) {
  pass("bundle guard covers the hosted download and local-first app routes");
} else {
  fail(
    "scripts/check-bundle.mjs must include /download plus docs/ontology/topology/projects in LOCAL_FIRST_BASE_ROUTES so Firebase chunks cannot re-enter public app/download surfaces",
  );
}

const firebaseDependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const firebaseDependencyMatches = firebaseDependencyFields.flatMap((field) =>
  forbiddenFirebasePackages
    .filter((packageName) => Object.hasOwn(pkg[field] ?? {}, packageName))
    .map((packageName) => `${field}.${packageName}`),
);
if (firebaseDependencyMatches.length === 0) {
  pass("root package dependencies stay Firebase SDK and Firebase CLI free for the local-only app");
} else {
  fail(
    `package.json must not depend on Firebase SDK/Admin/CLI packages in the local-only app package; found ${firebaseDependencyMatches.join(", ")}`,
  );
}

if (pkg.scripts?.["cli:mcp-verify"] && pkg.scripts?.["dogfood:agent-setup-gate"]) {
  pass("CLI/MCP setup gate is available for desktop handoff verification");
} else {
  fail("package.json must expose cli:mcp-verify and dogfood:agent-setup-gate for desktop handoff verification");
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
  "pnpm exec vitest run src/shared/lib/tauri-vault-fs.test.ts src/entities/local-fs-handle/api/store.test.ts src/features/docs-vault-local/model/agent-config-status.test.ts && cargo test --manifest-path src-tauri/Cargo.toml"
) {
  pass("desktop native vault bridge tests cover WebView handle shim, agent config validation, and Rust path guard");
} else {
  fail("package.json must expose test:desktop:bridge for the Tauri vault bridge contract");
}

if (
  pkg.scripts?.["test:desktop:runtime"] ===
  "pnpm exec vitest run src/views/docs-vault/lib/persistence.test.ts src/views/root-entry/ui/RootEntryPage.test.tsx src/widgets/operations-nav/ui/OperationsNav.test.tsx"
) {
  pass("desktop runtime split tests cover local intent, first-run routing, and hosted download routing");
} else {
  fail(
    "package.json must expose test:desktop:runtime for the hosted-vs-installed runtime split: DocsVault persistence, RootEntryPage first-run routing, and OperationsNav hosted download routing",
  );
}

if (
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/check-macos-release-github.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/check-macos-release-source.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/check-macos-release-status.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/lib/macos-release-names.test.mjs")
) {
  pass("desktop checker tests cover the GitHub release operator, source, and completion gates");
} else {
  fail("package.json test:desktop:check must include scripts/check-macos-release-github.test.mjs, scripts/check-macos-release-source.test.mjs, scripts/check-macos-release-status.test.mjs, and scripts/lib/macos-release-names.test.mjs so the macOS release operator, source, completion, and app-vs-asset naming gates stay covered");
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
  packageMacosDmgScript.includes("appBundleName") &&
  packageMacosDmgScript.includes("releaseAssetName") &&
  packageMacosDmgScript.includes("const appPath = path.join(bundleRoot, \"macos\", appBundleName)") &&
  packageMacosDmgScript.includes("`${releaseAssetName}_${version}_${arch}.dmg`") &&
  packageMacosDmgScript.includes("\"-volname\"") &&
  packageMacosDmgScript.includes("appName") &&
  packageMacosDmgScript.includes("path.basename(dmgPath)")
) {
  pass("desktop DMG packager puts the Context Atlas app bundle into oh-my-ontology release assets");
} else {
  fail(
    "scripts/package-macos-dmg.mjs must source appBundleName, name the DMG with releaseAssetName_version_arch, use the appName volume label, and write a checksum for the DMG basename",
  );
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
  pkg.scripts?.["desktop:verify-hosted"] ===
  "node scripts/check-hosted-download-surface.mjs" &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/check-hosted-download-surface.test.mjs") &&
  hostedDownloadSurfaceScript.includes("내 마크다운 폴더 열기") &&
  hostedDownloadSurfaceScript.includes("/ko/download/") &&
  hostedDownloadSurfaceScript.includes("https://github.com/wlsdks/oh-my-ontology/releases")
) {
  pass("hosted website verifier catches stale browser-vault CTAs and missing download routes");
} else {
  fail(
    "package.json must expose desktop:verify-hosted, test:desktop:check must cover it, and scripts/check-hosted-download-surface.mjs must reject stale browser-vault CTAs while requiring the hosted /ko/download/ route",
  );
}

if (
  pkg.scripts?.["firebase:deploy-check"] ===
  "node scripts/check-firebase-hosting-deploy-env.mjs" &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/check-firebase-hosting-deploy-env.test.mjs") &&
  firebaseDeployEnvScript.includes(".env.prod is missing") &&
  firebaseDeployEnvScript.includes("FIREBASE_PROJECT_ID") &&
  firebaseDeployEnvScript.includes("Hosting-only") &&
  firebaseDeployEnvScript.includes(".firebaseignore")
) {
  pass("Firebase Hosting deploy preflight checks env, project alignment, static-only config, and credential ignores");
} else {
  fail(
    "package.json must expose firebase:deploy-check, test:desktop:check must cover it, and scripts/check-firebase-hosting-deploy-env.mjs must validate .env.prod, project alignment, static-only Hosting config, and credential ignores",
  );
}

if (
  /release:\s*\n\s+types:\s*\[published\]/.test(hostingDeployWorkflow) &&
  /workflow_dispatch:/.test(hostingDeployWorkflow) &&
  /FIREBASE_SERVICE_ACCOUNT_JSON/.test(hostingDeployWorkflow) &&
  /NEXT_PUBLIC_OMOT_FIRST_RELEASE_PENDING:\s*["']0["']/.test(hostingDeployWorkflow) &&
  /FIREBASE_PROJECT_ID:\s*\$\{\{\s*vars\.FIREBASE_PROJECT_ID/.test(hostingDeployWorkflow) &&
  /uses:\s*actions\/setup-node@v6/.test(hostingDeployWorkflow) &&
  /node-version:\s*24/.test(hostingDeployWorkflow) &&
  /corepack enable/.test(hostingDeployWorkflow) &&
  /corepack prepare pnpm@10\.18\.0 --activate/.test(hostingDeployWorkflow) &&
  /pnpm --version/.test(hostingDeployWorkflow) &&
  !/uses:\s*pnpm\/action-setup@/.test(hostingDeployWorkflow) &&
  /pnpm firebase:deploy-check/.test(hostingDeployWorkflow) &&
  /pnpm test:mcp:docs/.test(hostingDeployWorkflow) &&
  /pnpm build/.test(hostingDeployWorkflow) &&
  /pnpm bundle:check/.test(hostingDeployWorkflow) &&
  /firebase-tools@15\.17\.0 deploy --only hosting/.test(hostingDeployWorkflow) &&
  /pnpm desktop:verify-hosted -- --base-url="\$FIREBASE_HOSTING_URL"/.test(hostingDeployWorkflow)
) {
  pass("Firebase Hosting fallback workflow deploys the promo/download site after public macOS releases and verifies the live download route");
} else {
  fail(
    ".github/workflows/deploy-hosting.yml must deploy Hosting on release publication/manual dispatch, require FIREBASE_SERVICE_ACCOUNT_JSON, hide the first-release checklist, use Node 24 with Corepack pnpm@10.18.0 without pnpm/action-setup, run the static deploy gates, deploy only Hosting, and verify the hosted download route",
  );
}

if (
  downloadReleaseVerifier.includes("releaseVersionFromTag") &&
  downloadReleaseVerifier.includes("do not match the tag version") &&
  downloadReleaseVerifier.includes("allowDraft") &&
  downloadReleaseVerifier.includes("per_page=100") &&
  downloadReleaseVerifier.includes("release?.tag_name !== options.tag") &&
  downloadReleaseVerifier.includes("unsupported macOS DMG asset names") &&
  downloadReleaseVerifier.includes("function isAnyDmgAsset") &&
  downloadReleaseVerifier.includes('asset.name.endsWith(".dmg")') &&
  downloadReleaseVerifier.includes("REQUIRED_MACOS_ARCHES = [\"aarch64\", \"x64\"]") &&
  downloadReleaseVerifier.includes("Expected oh-my-ontology_<version>_<aarch64|x64>.dmg") &&
  !downloadReleaseVerifier.includes("aarch64|x64|universal") &&
  downloadReleaseVerifier.includes("requestSha256") &&
  downloadReleaseVerifier.includes("does not match checksum")
) {
  pass("desktop download verifier requires explicit Apple Silicon and Intel DMGs with checksum byte verification");
} else {
  fail(
    "scripts/check-macos-download-release.mjs must require explicit aarch64 and x64 oh-my-ontology DMG assets, reject unsupported names such as universal/arm64/Context Atlas .dmg files, verify DMG filename versions match the release tag, verify downloaded bytes match checksums, and let --allow-draft find tagged draft pre-publish assets",
  );
}

if (
  pkg.scripts?.["desktop:release-preflight"] ===
  "pnpm desktop:check && pnpm docs-vault:check && pnpm test:desktop:check && pnpm test:desktop:runtime && pnpm test:desktop:bridge && pnpm desktop:doctor -- --require-runtime && pnpm cli:mcp-verify docs/ontology --timeout-ms 15000 && pnpm dogfood:agent-setup-gate && pnpm build && pnpm desktop:smoke && pnpm desktop:build && pnpm desktop:verify-app && pnpm desktop:verify-dmg && pnpm desktop:verify-install"
) {
  pass("desktop local release preflight runs readiness, tests, runtime doctor, MCP handoff, agent JSON setup gate, build, route smoke, DMG, and install smoke");
} else {
  fail(
    "package.json must expose desktop:release-preflight as the local pre-tag macOS release gate, including cli:mcp-verify and dogfood:agent-setup-gate against docs/ontology before building",
  );
}

if (
  landingPage.includes("MacosDownloadLink") &&
  downloadPage.includes("MacosDownloadLink") &&
  downloadPage.includes("GITHUB_REPOSITORY_URL") &&
  downloadPage.includes("sourceCta") &&
  macosDownloadLink.includes("GITHUB_RELEASES_URL") &&
  !macosDownloadLink.includes("releases/latest") &&
  !macosDownloadLink.includes("api.github.com")
) {
  pass("hosted download CTAs separate the GitHub Releases download path from the source-code link without a broken latest-release dependency");
} else {
  fail(
    "hosted landing/download CTAs must avoid a broken latest-release URL before a public macOS DMG release exists and the download page must not duplicate the release CTA as its secondary action",
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
  !downloadPage.includes('/docs/?intent=local') &&
  docsVaultPage.includes("shouldHonorLocalIntent(intent, isDesktopRuntime)") &&
  docsVaultPage.includes("isDocsVaultLocalSourceDisabled") &&
  docsVaultPage.includes("desktopOnlyTooltip")
) {
  pass("hosted pages do not route users into the browser workbench, and /docs local vault work is desktop-only");
} else {
  fail(
    "hosted landing/download pages must stay promo/download-first, and src/views/docs-vault/ui/DocsVaultPage.tsx must only honor ?intent=local / local vault work in the Tauri desktop runtime",
  );
}

if (
  enMessages.searchWidgets.shortcuts.rows.localVault ===
    "Open a local vault folder in the installed app" &&
  koMessages.searchWidgets.shortcuts.rows.localVault ===
    "설치된 앱에서 로컬 vault 폴더 열기" &&
  enMessages.docsVault.vaultStatus.unsupportedTooltip ===
    "Local vault editing is available in the installed macOS app." &&
  koMessages.docsVault.vaultStatus.unsupportedTooltip ===
    "로컬 vault 편집은 설치된 macOS 앱에서 사용할 수 있습니다." &&
  enMessages.featuresMisc.localVaultPicker.openLabel === "Open vault folder" &&
  koMessages.featuresMisc.localVaultPicker.openLabel === "vault 폴더 열기" &&
  enMessages.featuresMisc.localVaultPicker.unsupported.includes("Install the macOS app") &&
  koMessages.featuresMisc.localVaultPicker.unsupported.includes("macOS 앱을 설치") &&
  !enMessages.searchWidgets.shortcuts.rows.localVault.includes("File System Access") &&
  !koMessages.searchWidgets.shortcuts.rows.localVault.includes("File System Access") &&
  !enMessages.featuresMisc.localVaultPicker.openLabel.includes("markdown folder")
) {
  pass("local vault picker and shortcut copy describe the installed app path, not browser File System Access");
} else {
  fail(
    "Local vault picker and shortcut copy must route users toward the installed macOS app instead of preserving browser/File System Access wording",
  );
}

if (
  rootReadme.includes("| **App brand** | **Context Atlas**") &&
  rootReadme.includes("| **Website / downloads** | **https://oh-my-ontology.web.app** |") &&
  rootReadme.includes("| **macOS app** | Install once, pick a local vault folder") &&
  rootReadme.includes("Context Atlas") &&
  rootReadme.includes("release-artifact identity") &&
  rootReadme.includes("| **Website** | Explain the product, show a read-only demo") &&
  rootReadme.includes("The public website is a static promo/download site with a read-only demo.") &&
  rootReadme.includes("Tauri macOS shell") &&
  rootReadme.includes("Tauri native vault bridge") &&
  !rootReadme.includes("| **Web workbench** |") &&
  !rootReadme.includes("Open `http://localhost:3000`, go to `/docs`")
) {
  pass("root README presents the hosted site as promo/download and the macOS app as the local workbench");
} else {
  fail(
    "README.md must not present the hosted Firebase site as the writable web workbench; it should route real local visual work to the installed macOS app",
  );
}

if (
  featuresDoc.includes("4 surfaces (macOS app · CLI · MCP · Website)") &&
  featuresDoc.includes("**Context Atlas** is the user-facing macOS app / website brand") &&
  featuresDoc.includes("real ontology work happens in the installed app / CLI / MCP") &&
  featuresDoc.includes("Hosted pages do not open or edit local vault folders.") &&
  productDirectionDoc.includes("Context Atlas") &&
  productDirectionDoc.includes("The Tauri bundle product name") &&
  productDirectionDoc.includes("CLI · installed macOS app") &&
  productDirectionDoc.includes("hosted website is the product introduction and download entry point") &&
  desktopDoc.includes("Context Atlas") &&
  desktopDoc.includes("current release") &&
  desktopDoc.includes("asset identity") &&
  desktopDoc.includes("root package stays free of Firebase SDK, Firebase Admin, and Firebase CLI") &&
  desktopDoc.includes("separate website workflow") &&
  desktopDoc.includes("not the local-only app package") &&
  architectureDoc.includes("Tauri macOS shell (installed local workbench)") &&
  architectureDoc.includes("The public app/website brand is **Context Atlas**") &&
  architectureDoc.includes("Tauri native bridge → user disk") &&
  architectureDoc.includes("AI agents and the installed app end up with the same view")
) {
  pass("product and architecture docs frame the installed app as the writable local workbench");
} else {
  fail(
    "FEATURES, PRODUCT-DIRECTION, and ARCHITECTURE must describe macOS app / CLI / MCP as the writable local surfaces and hosted web as promo/download/read-only",
  );
}

if (
  agentGraphWorkflowDoc.includes("Install the macOS app and open the local vault folder there.") &&
  troubleshootingDoc.includes("desktop app `/docs` button") &&
  troubleshootingDoc.includes("Desktop app scaffold button stays grayed out") &&
  publishNpmDoc.includes("installed macOS app's `/docs` page") &&
  publishNpmDoc.includes("Start a user vault (desktop app path)") &&
  developmentChecksDoc.includes("Firebase SDK, Firebase Admin, and Firebase CLI dependencies") &&
  developmentChecksDoc.includes("separate Hosting deploy toolchain") &&
  demoStoryboardDoc.includes("설치된 Context Atlas macOS 앱") &&
  redditPostsDoc.includes("macOS desktop app that wraps the same Next.js static") &&
  redditPostsDoc.includes("hosted website is only the product intro and download entry point")
) {
  pass("workflow, troubleshooting, publish, and launch docs route writable vault work through the desktop app");
} else {
  fail(
    "User-facing workflow/troubleshooting/publish/launch docs must not steer local vault work through the hosted web workbench",
  );
}

if (
  desktopOntologyDoc.includes("hosted empty states and demo badges route users to") &&
  onboardingOntologyDoc.includes("설치된 macOS 앱의 starter") &&
  onboardingOntologyDoc.includes("CLI/app starter README") &&
  firebaseDeployOntologyDoc.includes("static promo/download website") &&
  firebaseDeployOntologyDoc.includes("real local vault work is routed to the installed macOS app")
) {
  pass("dogfood ontology docs mirror the desktop-app and hosted-download split");
} else {
  fail(
    "docs/ontology must mirror the desktop-app distribution model so the shared ontology does not preserve the old hosted-workbench framing",
  );
}

if (
  ontologyViewPage.includes("isTauriVaultRuntime") &&
  ontologyViewPage.includes('"/download/"') &&
  ontologyViewPage.includes('"/docs/?intent=local"') &&
  topologyEmptyState.includes("isTauriVaultRuntime") &&
  topologyEmptyState.includes('"/download/"') &&
  topologyEmptyState.includes('"/docs/?intent=local"') &&
  /hosted browser is read-only/i.test(enMessages.ontologyView?.getStarted?.stepStaticVaultDescDownload ?? "") &&
  /Install the macOS app/i.test(enMessages.topology?.empty?.bodyNoProjectsDownload ?? "") &&
  /macOS 앱/.test(koMessages.ontologyView?.getStarted?.stepStaticVaultDescDownload ?? "")
) {
  pass("static ontology and topology empty states route hosted users to the app download while preserving desktop vault picking");
} else {
  fail(
    "Hosted static ontology/topology empty states must route writable local work to /download/, while Tauri desktop keeps /docs/?intent=local",
  );
}

if (
  downloadPage.includes("releaseAvailabilityNote") &&
  downloadPage.includes("releaseStatusTitle") &&
  downloadPage.includes("releaseStatusPr") &&
  downloadPage.includes("releaseStatusVersion") &&
  downloadPage.includes("releaseStatusSecrets") &&
  downloadPage.includes("releaseStatusRelease") &&
  downloadPage.includes("releaseStatusHosted") &&
  downloadPage.includes("showFirstReleaseChecklist") &&
  downloadRoute.includes("NEXT_PUBLIC_OMOT_FIRST_RELEASE_PENDING") &&
  downloadRoute.includes("!== '0'") &&
  downloadRoute.includes("showFirstReleaseChecklist={showFirstReleaseChecklist}") &&
  /app release is still waiting on PR review, version alignment, Apple signing, or the v0\.1\.0 GitHub Release/.test(
    enMessages.download?.releaseAvailabilityNote ?? "",
  ) &&
  !/Firebase Hosting/.test(enMessages.download?.releaseAvailabilityNote ?? "") &&
  /Before the first release is fully available/.test(enMessages.download?.releaseStatusTitle ?? "") &&
  /PR #274/.test(enMessages.download?.releaseStatusPr ?? "") &&
  /before v0\.1\.0 can ship/.test(enMessages.download?.releaseStatusPr ?? "") &&
  /v0\.1\.0 tag/.test(enMessages.download?.releaseStatusVersion ?? "") &&
  /package\.json, Tauri, and Cargo metadata/.test(
    enMessages.download?.releaseStatusVersion ?? "",
  ) &&
  !/Firebase Hosting/.test(enMessages.download?.releaseStatusVersion ?? "") &&
  /Apple Developer ID signing\/notarization secrets/.test(
    enMessages.download?.releaseStatusSecrets ?? "",
  ) &&
  !/Firebase Hosting/.test(enMessages.download?.releaseStatusSecrets ?? "") &&
  /before the macOS app release/.test(enMessages.download?.releaseStatusSecrets ?? "") &&
  /v0\.1\.0 GitHub Release/.test(enMessages.download?.releaseStatusRelease ?? "") &&
  /source of truth/.test(enMessages.download?.releaseStatusRelease ?? "") &&
  /Separately, Firebase Hosting must deploy the promo\/download site/.test(
    enMessages.download?.releaseStatusHosted ?? "",
  ) &&
  /\/ko\/download\//.test(enMessages.download?.releaseStatusHosted ?? "") &&
  /앱 릴리스가 PR review, version alignment, Apple signing, v0\.1\.0 GitHub Release/.test(
    koMessages.download?.releaseAvailabilityNote ?? "",
  ) &&
  !/Firebase Hosting/.test(koMessages.download?.releaseAvailabilityNote ?? "") &&
  /첫 릴리스가 완전히 열리기 전 체크리스트/.test(koMessages.download?.releaseStatusTitle ?? "") &&
  /PR #274/.test(koMessages.download?.releaseStatusPr ?? "") &&
  /v0\.1\.0 배포 전/.test(koMessages.download?.releaseStatusPr ?? "") &&
  /v0\.1\.0 tag/.test(koMessages.download?.releaseStatusVersion ?? "") &&
  /package\.json, Tauri, Cargo metadata/.test(
    koMessages.download?.releaseStatusVersion ?? "",
  ) &&
  !/Firebase Hosting/.test(koMessages.download?.releaseStatusVersion ?? "") &&
  /Apple Developer ID/.test(koMessages.download?.releaseStatusSecrets ?? "") &&
  !/Firebase Hosting/.test(koMessages.download?.releaseStatusSecrets ?? "") &&
  /macOS 앱 릴리스 전/.test(koMessages.download?.releaseStatusSecrets ?? "") &&
  /v0\.1\.0 GitHub Release/.test(koMessages.download?.releaseStatusRelease ?? "") &&
  /진실원/.test(koMessages.download?.releaseStatusRelease ?? "") &&
  /별도로/.test(koMessages.download?.releaseStatusHosted ?? "") &&
  /Firebase Hosting/.test(koMessages.download?.releaseStatusHosted ?? "") &&
  /\/ko\/download\//.test(koMessages.download?.releaseStatusHosted ?? "")
) {
  pass("hosted download page separates macOS app release blockers from the Firebase website deploy gate");
} else {
  fail(
    "hosted download copy must separate macOS app blockers (PR review, version alignment, Apple signing, v0.1.0 Release) from the separate Firebase Hosting /ko/download/ deploy gate, and NEXT_PUBLIC_OMOT_FIRST_RELEASE_PENDING=0 must hide the pre-release checklist",
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
  /uses:\s*actions\/checkout@v6/.test(ciWorkflow) &&
  /uses:\s*actions\/setup-node@v6/.test(ciWorkflow) &&
  /node-version:\s*24/.test(ciWorkflow) &&
  /corepack enable/.test(ciWorkflow) &&
  /corepack prepare pnpm@10\.18\.0 --activate/.test(ciWorkflow) &&
  /pnpm --version/.test(ciWorkflow) &&
  !/uses:\s*pnpm\/action-setup@/.test(ciWorkflow)
) {
  pass("pull request CI uses Node 24 setup-node and Corepack pnpm without pnpm/action-setup");
} else {
  fail(
    ".github/workflows/ci.yml must use actions/checkout@v6, actions/setup-node@v6, node-version 24, and Corepack pnpm@10.18.0 without pnpm/action-setup",
  );
}

if (
  releaseWorkflow.match(/uses:\s*actions\/checkout@v6/g)?.length === 2 &&
  releaseWorkflow.match(/uses:\s*actions\/setup-node@v6/g)?.length === 2 &&
  releaseWorkflow.match(/corepack enable/g)?.length === 2 &&
  releaseWorkflow.match(/corepack prepare pnpm@10\.18\.0 --activate/g)?.length === 2 &&
  releaseWorkflow.match(/pnpm --version/g)?.length === 2 &&
  /uses:\s*actions\/upload-artifact@v7/.test(releaseWorkflow) &&
  /uses:\s*actions\/download-artifact@v7/.test(releaseWorkflow) &&
  /uses:\s*softprops\/action-gh-release@v3/.test(releaseWorkflow) &&
  !/uses:\s*pnpm\/action-setup@/.test(releaseWorkflow)
) {
  pass("macOS release workflow uses Node 24 action majors and Corepack pnpm without pnpm/action-setup");
} else {
  fail(
    ".github/workflows/release-macos.yml must use Node 24-compatible action majors plus Corepack pnpm@10.18.0 without pnpm/action-setup",
  );
}

if (
  /draft:\s*true/.test(releaseWorkflow) &&
  /pnpm desktop:release-slot -- --tag="\$\{GITHUB_REF_NAME\}"/.test(releaseWorkflow) &&
  /Verify draft release assets/.test(releaseWorkflow) &&
  /--allow-draft/.test(releaseWorkflow) &&
  /gh release edit "\$\{GITHUB_REF_NAME\}" --draft=false --prerelease=false/.test(releaseWorkflow) &&
  /prerelease:\s*false/.test(releaseWorkflow) &&
  /pnpm docs-vault:check/.test(releaseWorkflow) &&
  /pnpm test:desktop:check/.test(releaseWorkflow) &&
  /pnpm test:desktop:runtime/.test(releaseWorkflow) &&
  /pnpm test:desktop:bridge/.test(releaseWorkflow) &&
  /pnpm build/.test(releaseWorkflow) &&
  /pnpm desktop:smoke/.test(releaseWorkflow) &&
  /pnpm desktop:release-source -- --sha="\$\{GITHUB_SHA\}"/.test(releaseWorkflow) &&
  /pnpm desktop:verify-release-dmg/.test(releaseWorkflow) &&
  /pnpm desktop:verify-install/.test(releaseWorkflow) &&
  releaseWorkflow.match(/node-version:\s*24/g)?.length === 2 &&
  /arch:\s*aarch64/.test(releaseWorkflow) &&
  /runner:\s*macos-14/.test(releaseWorkflow) &&
  /arch:\s*x64/.test(releaseWorkflow) &&
  /runner:\s*macos-15-intel/.test(releaseWorkflow) &&
  /release-assets\/\*\.sha256/.test(releaseWorkflow) &&
  /pnpm desktop:verify-download -- --tag="\$\{GITHUB_REF_NAME\}"/.test(releaseWorkflow) &&
  !/FIREBASE_SERVICE_ACCOUNT_JSON|firebase-tools|Deploy Hosting|desktop:verify-hosted/.test(releaseWorkflow) &&
  hasStrictOrder(releaseBuildOrder) &&
  hasStrictOrder(releasePublishOrder)
) {
  pass("tag release workflow builds Apple Silicon and Intel DMGs on Node 24 and publishes verified public assets without Firebase Hosting dependencies");
} else {
  fail(
    ".github/workflows/release-macos.yml must build Apple Silicon and Intel DMGs on Node 24, test the desktop checker/native bridge, smoke the static desktop payload, verify the tag commit is the default-branch head, verify the tag and secrets before signing, sign/notarize before upload, require a clean GitHub Release slot, upload checksum assets as a draft release, verify draft assets, publish the release as stable, and verify public downloads without requiring Firebase Hosting secrets or deploy steps",
  );
}

if (
  pkg.scripts?.["desktop:release-source"] === "node scripts/check-macos-release-source.mjs" &&
  releaseWorkflow.includes('pnpm desktop:release-source -- --sha="${GITHUB_SHA}"') &&
  releaseSourceScript.includes("default-branch head") &&
  releaseSourceScript.includes("Merge the desktop PR and tag the default-branch head")
) {
  pass("desktop release source gate blocks tags from unmerged or stale commits before signing");
} else {
  fail(
    "package.json and .github/workflows/release-macos.yml must run scripts/check-macos-release-source.mjs before signing so signed DMGs only publish from the default-branch head",
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
  requiredAppleSecretNames.every((name) =>
    desktopDoc.includes(`gh secret set ${name} --repo wlsdks/oh-my-ontology < /path/to/${name}`),
  ) &&
  desktopDoc.includes("Firebase Hosting is not part of the macOS app release gate")
) {
  pass("desktop release docs include Apple signing secret commands and exclude Firebase from the app gate");
} else {
  fail(
    "docs/DESKTOP-MACOS.md must show a gh secret set command for every Apple signing/notary secret and state that Firebase Hosting is separate from the macOS app release gate",
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
  pkg.scripts?.["desktop:release-slot"] === "node scripts/check-macos-release-slot.mjs" &&
  releaseWorkflow.includes('pnpm desktop:release-slot -- --tag="${GITHUB_REF_NAME}"') &&
  releaseSlotScript.includes("already exists") &&
  releaseSlotScript.includes("Delete the existing")
) {
  pass("desktop release slot gate blocks stale same-tag GitHub Release assets before upload");
} else {
  fail(
    "package.json and .github/workflows/release-macos.yml must run scripts/check-macos-release-slot.mjs before uploading DMGs so same-tag stale release assets cannot be reused",
  );
}

if (
  pkg.scripts?.["desktop:release-github"] === "node scripts/check-macos-release-github.mjs" &&
  releaseGithubScript.includes('"secret"') &&
  releaseGithubScript.includes('"list"') &&
  releaseGithubScript.includes("APPLE_CERTIFICATE_P12_BASE64") &&
  releaseGithubScript.includes("release-macos.yml") &&
  releaseGithubScript.includes("Firebase Hosting is intentionally excluded") &&
  releaseGithubScript.includes("check-macos-release-slot.mjs")
) {
  pass("desktop GitHub release readiness gate checks the release workflow, Apple secret names, and release slot before tag push");
} else {
  fail(
    "package.json must expose desktop:release-github and scripts/check-macos-release-github.mjs must check the release workflow, required Apple GitHub secret names, and same-tag release slot without requiring Firebase Hosting",
  );
}

if (
  pkg.scripts?.["desktop:release-status"] === "node scripts/check-macos-release-status.mjs" &&
  releaseStatusScript.includes('"pr"') &&
  releaseStatusScript.includes('"secret"') &&
  releaseStatusScript.includes('"release"') &&
  releaseStatusScript.includes("check-macos-release-tag.mjs") &&
  releaseStatusScript.includes("check-macos-download-release.mjs") &&
  releaseStatusScript.includes("Firebase Hosting is intentionally excluded") &&
  releaseStatusScript.includes("OMOT_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY") &&
  !releaseStatusScript.includes("OMOT_RELEASE_STATUS_SKIP_HOSTED_VERIFY")
) {
  pass("desktop release status gate audits version alignment, PR readiness, Apple secrets, public release state, and download assets without Firebase Hosting dependencies");
} else {
  fail(
    "package.json must expose desktop:release-status and scripts/check-macos-release-status.mjs must audit version alignment, PR readiness, Apple secret names, public release state, and public download assets without requiring Firebase Hosting",
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
  rootLayout.includes("title: 'Context Atlas'") &&
  rootLayout.includes("alternateName: 'oh-my-ontology'") &&
  webManifest.includes("name: 'Context Atlas'") &&
  enMessages.metadata.siteName === "Context Atlas" &&
  koMessages.metadata.siteName === "Context Atlas" &&
  landingPage.includes("Context Atlas")
) {
  pass("user-facing web and app metadata use Context Atlas while preserving oh-my-ontology as the project alias");
} else {
  fail(
    "Root metadata, PWA manifest, localized metadata, and landing header must expose Context Atlas as the user-facing brand while keeping oh-my-ontology as the project alias",
  );
}

if (
  tauriConfig?.productName === "Context Atlas" &&
  tauriConfig?.identifier === "dev.jinan.oh-my-ontology" &&
  tauriConfig?.app?.windows?.some((windowConfig) => windowConfig?.title === "Context Atlas") &&
  macosReleaseNamesHelper.includes("const releaseAssetName = pkg.name") &&
  verifyDmgScript.includes("releaseAssetName") &&
  verifyInstallScript.includes("releaseAssetName") &&
  verifyAppScript.includes("appBundleName") &&
  verifyAppScript.includes("resolveMacosExecutable") &&
  verifyInstallScript.includes("resolveMacosExecutable") &&
  signMacosScript.includes("appBundleName") &&
  notarizeMacosDmgScript.includes("releaseAssetName")
) {
  pass("Tauri presents Context Atlas as the app bundle while release scripts keep oh-my-ontology DMG assets");
} else {
  fail(
    "src-tauri/tauri.conf.json must use Context Atlas as the app productName/window title, keep the oh-my-ontology bundle identifier, and route release scripts through appBundleName vs releaseAssetName so GitHub DMG assets stay oh-my-ontology_*",
  );
}

if (
  tauriConfig?.bundle?.category === "DeveloperTool" &&
  tauriConfig?.bundle?.shortDescription?.includes("Local-first codebase ontology workbench") &&
  tauriConfig?.bundle?.shortDescription?.includes("Context Atlas") &&
  tauriConfig?.bundle?.longDescription?.includes("Context Atlas") &&
  tauriConfig?.bundle?.longDescription?.includes("oh-my-ontology project name") &&
  tauriConfig?.bundle?.longDescription?.includes("markdown ontology vault") &&
  tauriConfig?.bundle?.longDescription?.includes("without a backend or login") &&
  tauriConfig?.bundle?.copyright?.includes("oh-my-ontology contributors")
) {
  pass("Tauri bundle metadata identifies Context Atlas as the local-first app while preserving the oh-my-ontology project identity");
} else {
  fail(
    "src-tauri/tauri.conf.json must set macOS bundle category, Context Atlas descriptions, and oh-my-ontology copyright/project identity so the installed app is not a generic wrapper",
  );
}

const macosFolderUsageKeys = [
  "NSDocumentsFolderUsageDescription",
  "NSDownloadsFolderUsageDescription",
  "NSDesktopFolderUsageDescription",
  "NSNetworkVolumesUsageDescription",
  "NSRemovableVolumesUsageDescription",
];
const missingFolderUsageKeys = macosFolderUsageKeys.filter(
  (key) =>
    !tauriInfoPlist.includes(`<key>${key}</key>`) ||
    !tauriInfoPlist.includes("Context Atlas opens") ||
    !tauriInfoPlist.includes("markdown ontology vault folder you choose"),
);
if (missingFolderUsageKeys.length === 0) {
  pass("macOS Info.plist explains selected vault-folder access for protected locations");
} else {
  fail(
    `src-tauri/Info.plist must explain selected vault folder access for protected macOS locations: missing ${missingFolderUsageKeys.join(", ")}`,
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
  rootEntryPage.includes("vault.manifest") &&
  rootEntryPage.includes("DesktopVaultRedirect") &&
  rootEntryPage.includes("'/docs/?intent=local'")
) {
  pass("desktop root entry routes first launch and stale restored vaults into the local picker flow without rendering marketing");
} else {
  fail("src/views/root-entry/ui/RootEntryPage.tsx must route Tauri first launch or stale restored handles to /docs/?intent=local unless a manifest loaded, without rendering the hosted landing page");
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
  docsVaultPage.includes("OntologyStarterCta") &&
  docsVaultPage.includes("handleScaffoldOntologyStarter") &&
  docsVaultPage.includes("manifest.docs.length === 0") &&
  docsVaultPage.includes("setSelectedSlug('README')") &&
  docsVaultPage.includes("dialog.ontologyStarterDone")
) {
  pass("desktop empty-vault workspace surfaces the ontology starter in the main pane and opens README after creation");
} else {
  fail(
    "src/views/docs-vault/ui/DocsVaultPage.tsx must show the ontology starter directly in the main pane for a loaded empty local vault and open README.md after starter creation",
  );
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
  localFsHandleStore.includes("canUseStoredRecord") &&
  localFsHandleStore.includes("!record.desktopRootPath || isTauriVaultRuntime()") &&
  localFsHandleStore.includes(".filter((record): record is LocalFsHandleRecord => Boolean(record))") &&
  localVaultHook.includes("recentVaults") &&
  localVaultHook.includes("mcpJsonValid: looksLikeOmotMcpJson(mcpJsonText, { expectedVault: '.' })") &&
  localVaultHook.includes("codexConfigValid: looksLikeOmotCodexToml(codexConfigText, { expectedVault: '.' })") &&
  localVaultHook.includes("openRecent") &&
  localVaultHook.includes("forgetRecent") &&
  localVaultPicker.includes("recentVaults") &&
  localVaultPicker.includes("recentOpenAriaLabel") &&
  localVaultPicker.includes("recentOpenedSuffix") &&
  localVaultPicker.includes("record.lastAccessedAt") &&
  localVaultPicker.includes("recentForgetAriaLabel")
) {
  pass("desktop local vault picker exposes recent vault recall, stale-path cleanup, hosted/runtime filtering, and vault-local agent config validation");
} else {
  fail(
    "desktop local vault picker must expose recent vault recall, stale-path cleanup, hide Tauri desktop path records outside the Tauri runtime, and reject stale vault-local agent configs that do not use OMOT_VAULT=.",
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
  "scripts/check-macos-release-source.mjs",
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
