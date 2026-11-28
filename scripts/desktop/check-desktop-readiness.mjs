#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { evaluateDesktopReleasePreflight } from "../lib/desktop/release-script-contract.mjs";
import { inspectCodexRunContract } from "../lib/desktop/codex-run-contract.mjs";
import { connectSrcIsExact, DESKTOP_CONNECT_SRC_TOKENS } from "../lib/desktop/desktop-csp.mjs";
import { matches } from "../lib/i18n/locale-vocabulary.mjs";
import { blankComments } from "../quality/source-language/inventory.mjs";
import { APP_FOLDER } from "../lib/web/built-folders.mjs";
import { APP_VERSION_FILE_LIST, readAppVersions, versionMismatches } from "../lib/release-versions.mjs";

const root = process.cwd();

// A missing target file becomes a readable failure (an empty string fails the following `.includes(...)`
// and names the contract), not a raw ENOENT trace.
// Every check reads code: comments in .ts/.tsx/.mjs, .rs, .yml, .toml, .sh and .gitignore are blanked, so
// a comment can neither turn a check red nor satisfy it. .json, .md, .plist and .webmanifest are read unchanged.
function readText(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    fail(`tracked source file is missing — ${relativePath}. Point this gate at the surface that replaced it, or drop the check.`);
    return "";
  }
  return blankComments(relativePath, fs.readFileSync(absolute, "utf8").replace(/\r\n?/g, "\n"));
}

// A script that is an entry plus a folder of modules: the `.includes(...)` gates check the combined
// surface, so read the entry and every non-test module of the folder.
function readEntryWithModules(entryPath, moduleDirectory) {
  const entry = readText(entryPath);
  const absoluteDirectory = path.join(root, moduleDirectory);
  const moduleFiles = fs.existsSync(absoluteDirectory)
    ? fs.readdirSync(absoluteDirectory).filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs")).sort()
    : [];
  const moduleText = moduleFiles
    .map((name) => readText(path.join(moduleDirectory, name)))
    .join("\n");
  return `${entry}\n${moduleText}`;
}

function readTypeScriptFolder(directory) {
  const absoluteDirectory = path.join(root, directory);
  const names = fs.existsSync(absoluteDirectory)
    ? fs.readdirSync(absoluteDirectory).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).sort()
    : [];
  if (names.length === 0) fail(`tracked source folder is empty or missing — ${directory}.`);
  return names.map((name) => readText(path.join(directory, name))).join("\n");
}

function fail(message) {
  console.error(`[desktop-check] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`✓ ${message}`);
}

function workflowJob(source, name) {
  return source.match(
    new RegExp(`^  ${name}:\\s*\\n[\\s\\S]*?(?=^  [A-Za-z0-9_-]+:\\s*$|(?![\\s\\S]))`, "m"),
  )?.[0] ?? "";
}

function hasAdmittedCheckout(jobSource) {
  return /uses:\s*actions\/checkout@/.test(jobSource) &&
    /ref:\s*\$\{\{\s*needs\.admit-release\.outputs\.release_sha\s*\}\}/.test(jobSource);
}

function needsAdmission(jobSource) {
  return /needs:\s*(?:\[[^\]]*\badmit-release\b[^\]]*\]|admit-release\b)/.test(jobSource);
}

const viteConfig = readText("vite.config.ts");
const tsConfig = JSON.parse(readText("tsconfig.json"));
const pkg = JSON.parse(readText("package.json"));
// Every Corepack line in the workflows must activate the pnpm that `packageManager` pins.
const pinnedPnpm = String(pkg.packageManager ?? "pnpm@missing");
const corepackPrepare = new RegExp(`corepack prepare ${pinnedPnpm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} --activate`, "g");
const enMessages = JSON.parse(readText("messages/en.json"));
const koMessages = JSON.parse(readText("messages/ko.json"));
// The document every page shares carries the site entity (`siteEntityGraph`); each screen's head spreads the site metadata (`siteMetadata()`).
const siteDocument = readText("src/app/document/SiteDocument.tsx");
const screenMetadataSource = readText("src/app/routes/-site/screen-metadata.ts");
const siteMetadataSource = readText("src/shared/lib/public-pages/site-metadata.ts");
// The site Organization and WebSite JSON-LD the document renders (`siteEntityGraph`).
const siteEntity = readText("src/shared/config/site/site-entity.ts");
const webManifest = JSON.parse(readText("public/manifest.webmanifest"));
const cargoToml = readText("src-tauri/Cargo.toml");
const rootReadme = readText("README.md");
/** The page and the parts it is built from: the hero and the release controls own the claims this gate reads. */
const downloadPage = [
  "src/views/download/ui/DownloadPage.tsx",
  "src/views/download/ui/hero/HeroSection.tsx",
  "src/views/download/ui/ClosingSection.tsx",
  "src/views/download/ui/release/DownloadActions.tsx",
  "src/views/download/ui/release/FactsStrip.tsx",
  "src/views/download/ui/release/TrustLine.tsx",
]
  .map(readText)
  .join("\n");
/** The gateway's top chrome, where the brand name is drawn. The brand gate reads page and chrome together, so it does not pin the brand to one file path. */
const gatewayChrome = readText("src/widgets/gateway-chrome/ui/GatewayNav.tsx");
const gatewaySurfaceSource = `${downloadPage}\n${gatewayChrome}`;
const downloadRoute = readText("src/app/routes/$locale/_site/download.tsx");
const tauriLib = readText("src-tauri/src/lib.rs");
const tauriVaultScope = readText("src-tauri/src/vault/scope.rs");
const tauriShim = readTypeScriptFolder("src/shared/lib/vault-folder/native-vault");
const tauriRuntimeShim = readText("src/shared/lib/vault-folder/native-vault/tauri-vault-runtime.ts");
const tauriHandleShim = readText("src/shared/lib/vault-folder/native-vault/tauri-vault-handle.ts");
const tauriInfoPlist = readText("src-tauri/Info.plist");
const packageMacosDmgScript = readText("scripts/desktop/package-macos-dmg.mjs");
const cleanTauriMacosAppsScript = readText("scripts/desktop/clean-tauri-macos-apps.mjs");
const desktopPerformanceScript = readText("scripts/desktop/check-desktop-performance.mjs");
const verifyDmgScript = readText("scripts/verify-macos/verify-macos-dmg.mjs");
const verifyAppScript = readEntryWithModules("scripts/verify-macos/verify-macos-app-launch.mjs", "scripts/lib/verify-macos");
const verifyInstallScript = readText("scripts/verify-macos/verify-macos-install-smoke.mjs");
const deployMacosAppLocalScript = readText("scripts/desktop/deploy-macos-app-local.mjs");
const codexBuildRunScript = readText("script/build_and_run.sh");
const codexRunContract = inspectCodexRunContract(codexBuildRunScript);
const codexEnvironmentConfig = readText(".codex/environments/environment.toml");
const signMacosScript = readText("scripts/desktop/sign-macos-app.mjs");
const notarizeMacosDmgScript = readText("scripts/desktop-release/notarize-macos-dmg.mjs");
const buildMacosReleaseArtifactScript = readText("scripts/desktop-release/build-macos-release-artifact.mjs");
const releaseSourceScript = readText("scripts/desktop-release/check-macos-release-source.mjs");
const releaseSecretsScript = readText("scripts/desktop-release/check-macos-release-secrets.mjs");
const notaryCredentialsHelper = readText("scripts/lib/desktop-release/notary-credentials.mjs");
const releaseTagScript = readText("scripts/desktop-release/check-macos-release-tag.mjs");
const releaseSlotScript = readText("scripts/desktop-release/check-macos-release-slot.mjs");
const releaseGithubScript = readText("scripts/desktop-release/check-macos-release-github.mjs");
const releaseRunScript = readText("scripts/desktop-release/watch-macos-release-run.mjs");
const releaseStatusScript = readEntryWithModules("scripts/desktop-release/check-macos-release-status.mjs", "scripts/desktop-release/release-status");
const goalAuditScript = readText("scripts/desktop-release/check-desktop-goal-audit.mjs");
const macosReleaseNamesHelper = readText("scripts/lib/macos-release-names.mjs");
const hostedDownloadSurfaceScript = readText("scripts/download/check-hosted-download-surface.mjs");
const forbiddenFirebasePackages = ["firebase", "firebase-admin", "firebase-tools"];
const rootEntryPage = readText("src/views/root-entry/ui/RootEntryPage.tsx");
const bootScript = readText("src/i18n/boot-script.ts");
const docsVaultPageFiles = [
  "src/views/docs-vault/ui/DocsVaultPage.tsx",
  "src/views/docs-vault/ui/DocsVaultHeader.tsx",
  "src/views/docs-vault/ui/DocsVaultDocumentPane.tsx",
  "src/views/docs-vault/ui/DocsVaultSidebar.tsx",
  ...fs
    .readdirSync(path.join(root, "src/views/docs-vault/model"))
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .sort()
    .map((name) => `src/views/docs-vault/model/${name}`),
];
const docsVaultPage = docsVaultPageFiles.map(readText).join("\n");
const topologyEmptyState = readText("src/widgets/topology-controls/ui/TopologyEmptyState.tsx");
const vaultAgentSetupPanel = readText("src/widgets/app-settings-menu/ui/agent-setup/VaultAgentSetupPanel.tsx");
const vaultAgentSetupCopySources = [
  "src/widgets/app-settings-menu/model/agent-setup/agent-setup-packets.ts",
  "src/widgets/app-settings-menu/ui/agent-setup/AgentSetupTroubleshooting.tsx",
]
  .map(readText)
  .join("\n");
const appSettingsMenu = readText("src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx");
const workspacePane = readText("src/widgets/app-settings-menu/ui/panes/WorkspacePane.tsx");
// The settings sheet's workspace group carries recent-vault recovery, copy path and open in Finder.
const ontologyStarterCta = readText("src/features/docs-vault-local/ui/OntologyStarterCta.tsx");
const localFsHandleStore = readText("src/entities/local-fs-handle/api/store.ts");
const vaultChoiceHook = readText("src/entities/vault-session/model/local-vault/use-vault-choice.ts");
const vaultSidecars = readText("src/entities/vault-session/model/local-vault/vault-sidecars.ts");
const releaseWorkflow = readText(".github/workflows/release-macos.yml");
const pagesDeployWorkflow = readText(".github/workflows/deploy-pages.yml");
const downloadReleaseVerifier = readText("scripts/download/check-macos-download-release.mjs");
const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauriCapabilityPath = path.join(root, "src-tauri", "capabilities", "default.json");
const tauriConfig = fs.existsSync(tauriConfigPath)
  ? JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"))
  : null;
const tauriCapability = fs.existsSync(tauriCapabilityPath)
  ? JSON.parse(fs.readFileSync(tauriCapabilityPath, "utf8"))
  : null;

console.log("[desktop-check] macOS desktop Tauri-shell readiness");

const cargoPackageName = cargoToml.match(/\[package\][\s\S]*?\nname\s*=\s*"([^"]+)"/)?.[1];
// mcp/ and cli/ are separate install roots; without the same pin they run whatever pnpm is
// installed globally, and an older one ignores their supply-chain settings.
const unpinnedInstallRoots = ["mcp", "cli"].filter(
  (directory) => JSON.parse(readText(`${directory}/package.json`)).packageManager !== pinnedPnpm,
);
if (unpinnedInstallRoots.length === 0) {
  pass(`mcp/ and cli/ pin the same pnpm as the root (${pinnedPnpm})`);
} else {
  fail(`${unpinnedInstallRoots.join(", ")} package.json must set packageManager to ${pinnedPnpm}, as the root does`);
}

// What the installed app's WebView can load: its policy answers 'self' alone, so no asset may become an inline
// data address, and every asset is a file of the folder Tauri embeds.
if (/assetsInlineLimit\s*:\s*0\b/.test(viteConfig)) {
  pass("Vite writes every asset as a file the WebView's 'self' policy covers, none as an inline data address");
} else {
  fail("vite.config.ts must keep build.assetsInlineLimit: 0, so the installed app's policy covers every asset");
}

const buildScript = "node scripts/web/build-app-and-site.mjs";
if (pkg.scripts?.build === buildScript && pkg.scripts?.["build:app"] === `${buildScript} --only=app`) {
  pass("build writes the app folder and the site folder together, and build:app the app folder alone, through one script");
} else {
  fail(`package.json must set build to "${buildScript}" and build:app to "${buildScript} --only=app"`);
}

const devServer = "vite --host 127.0.0.1 --port 3000 --strictPort";
if (pkg.scripts?.dev === devServer && tauriConfig?.build?.devUrl === "http://127.0.0.1:3000") {
  pass("pnpm dev serves the address Tauri's devUrl waits for");
} else {
  fail(`package.json dev must be "${devServer}" and src-tauri/tauri.conf.json devUrl "http://127.0.0.1:3000", the address that script serves`);
}

if (tsConfig?.exclude?.includes("src-tauri/target")) {
  pass("TypeScript excludes Tauri target artifacts, the app folder among them, from type checks");
} else {
  fail(
    "tsconfig.json must exclude src-tauri/target so Tauri codegen artifacts and the built app folder cannot break type checks",
  );
}

const appVersionMismatches = versionMismatches(readAppVersions(root), pkg.version);
if (typeof pkg.version === "string" && appVersionMismatches.length === 0) {
  pass("desktop package, Tauri, Rust crate and MCP server versions stay aligned for release tags");
} else {
  fail(
    `${APP_VERSION_FILE_LIST} versions must match before macOS release packaging (expected ${pkg.version ?? "missing"}: ${appVersionMismatches.join(", ")})`,
  );
}

if (cargoPackageName === "ontology-atlas") {
  pass("Tauri Rust package builds a ontology-atlas executable, not an ontology-atlas app binary");
} else {
  fail(
    `src-tauri/Cargo.toml package name must be ontology-atlas so the installed macOS app executable is not ontology-atlas (found ${cargoPackageName ?? "missing"})`,
  );
}

if (pkg.scripts?.["docs-vault:check"]) {
  pass("docs-vault freshness check is available before desktop packaging");
} else {
  fail("package.json must expose docs-vault:check before desktop packaging");
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

if (pkg.scripts?.["dogfood:verify"]?.startsWith("node mcp/scripts/verify.mjs ")) {
  pass("MCP verify gate runs the server's own verifier over the dogfood vault");
} else {
  fail("package.json must expose dogfood:verify as node mcp/scripts/verify.mjs over docs/ontology");
}

if (pkg.scripts?.["desktop:doctor"] === "node scripts/desktop/desktop-doctor.mjs") {
  pass("desktop runtime doctor is available before .app build attempts");
} else {
  fail("package.json must expose desktop:doctor as node scripts/desktop/desktop-doctor.mjs");
}

if (pkg.scripts?.["desktop:smoke"] === "node scripts/desktop/desktop-smoke.mjs") {
  pass("desktop packaged-route smoke is available after static build");
} else {
  fail("package.json must expose desktop:smoke as node scripts/desktop/desktop-smoke.mjs");
}

if (
  pkg.scripts?.["desktop:perf"] === "node scripts/desktop/check-desktop-performance.mjs" &&
  desktopPerformanceScript.includes("DESKTOP_PERFORMANCE_BUDGETS") &&
  desktopPerformanceScript.includes("maxStaticAssetBytes") &&
  desktopPerformanceScript.includes("bundleBytes") &&
  desktopPerformanceScript.includes("DESKTOP_PERFORMANCE_EVIDENCE_BOUNDARY") &&
  desktopPerformanceScript.includes("desktop:verify-app") &&
  desktopPerformanceScript.includes("dogfood:verify") &&
  pkg.scripts?.["desktop:release-preflight"]?.includes("pnpm desktop:perf -- --require-app")
) {
  pass("desktop performance gate keeps static asset hard limits, report-only artifact totals, and explicit runtime/MCP evidence boundaries");
} else {
  fail(
    "package.json must expose desktop:perf and include `pnpm desktop:perf -- --require-app` in desktop:release-preflight; the script must hard-gate the app folder's bundled asset and chunk sizes while reporting total artifact sizes and naming desktop:verify-app plus dogfood:verify as separate startup evidence",
  );
}

if (
  pkg.scripts?.["desktop:verify-app"] === "node scripts/verify-macos/verify-macos-app-launch.mjs" &&
  verifyAppScript.includes('requireWebviewContent: argv.includes("--require-webview-content") || !argv.includes("--open-app")') &&
  verifyAppScript.includes("--require-accessibility-text") &&
  verifyAppScript.includes("validateAccessibilityText") &&
  verifyAppScript.includes("createVerifyLock") &&
  verifyAppScript.includes("verifyLockPath")
) {
  pass("desktop app launch verifier requires packaged WebView content, optional Accessibility text, and a single-run lock after .app builds");
} else {
  fail(
    "package.json must expose desktop:verify-app as node scripts/verify-macos/verify-macos-app-launch.mjs, make direct executable verification require packaged WebView content by default, support --require-accessibility-text for LaunchServices app-content proof, and lock concurrent app verification runs before --kill-existing",
  );
}


if (
  verifyAppScript.includes("export function buildWebviewEvidencePayload") &&
  verifyAppScript.includes("composerBlockingProof") &&
  verifyAppScript.includes("topology-add-concept-composer-blocking") &&
  verifyAppScript.includes("treat-add-concept-composer-as-current-work-surface") &&
  verifyAppScript.includes("mapState: \"dimmed-and-interaction-blocked\"") &&
  verifyAppScript.includes("blockedUntil: \"create-or-cancel\"") &&
  verifyAppScript.includes("complete-create-node-form") &&
  verifyAppScript.includes("cancel-composer") &&
  verifyAppScript.includes("visualSeparation") &&
  verifyAppScript.includes("blocking-composer-over-dimmed-map") &&
  verifyAppScript.includes("14-inch-fullscreen-safe") &&
  verifyAppScript.includes("function normalizeVisualEvidenceReference") &&
  verifyAppScript.includes("screenshotPath: path.resolve(screenshotPath)") &&
  verifyAppScript.includes("screenshotStatus: \"saved\"") &&
  verifyAppScript.includes("screenshotStatus: \"unavailable\"") &&
  verifyAppScript.includes("screenshotStatus: \"requested\"") &&
  verifyAppScript.includes("reference.diagnosticsPath = path.resolve(visualEvidence.diagnosticsPath)") &&
  verifyAppScript.includes("visualEvidencePath: tryWindowScreenshotPath ?? windowScreenshotPath") &&
  verifyAppScript.includes("const requiredVisualEvidence = verifyCapturableWindow({") &&
  verifyAppScript.includes("!tryWindowScreenshotPath && webviewPayload && webviewEvidencePath && requiredVisualEvidence") &&
  verifyAppScript.includes("visualEvidence: requiredVisualEvidence") &&
  verifyAppScript.includes("writeWebviewEvidence(webviewPayload, webviewEvidencePath, {") &&
  verifyAppScript.includes("visualEvidence,") &&
  verifyAppScript.includes("buildWebviewEvidencePayload(payload, options)")
) {
  pass("desktop app launch verifier writes Add Concept composer blocking proof and saved/unavailable screenshot handoff into WebView evidence for agents");
} else {
  fail(
    "scripts/verify-macos/verify-macos-app-launch.mjs must enrich --webview-evidence with a composerBlockingProof object plus saved/unavailable screenshot handoff so installed-app Add Concept blocking proof is machine-readable for agents",
  );
}

if (
  codexRunContract.exactLocalBuild &&
  codexBuildRunScript.includes("src-tauri/target/release/bundle/macos/Ontology Atlas.app") &&
  codexBuildRunScript.includes('DOGFOOD_APP_PATH="$APP_PATH"') &&
  codexBuildRunScript.includes('pnpm desktop:verify-app -- "$DOGFOOD_APP_PATH"') &&
  codexBuildRunScript.includes("--kill-existing") &&
  codexBuildRunScript.includes("--open-app") &&
  codexBuildRunScript.includes("--require-window") &&
  codexBuildRunScript.includes("--leave-running") &&
  codexEnvironmentConfig.includes("[actions.Run]") &&
  codexEnvironmentConfig.includes('command = "./script/build_and_run.sh"')
) {
  pass("Codex Run action builds without updater signing, launches, and verifies the freshly built macOS app bundle");
} else {
  fail(
    "script/build_and_run.sh and .codex/environments/environment.toml must wire Codex Run to the updater-disabled local build, LaunchServices verification, and the freshly built macOS app bundle",
  );
}

if (
  codexBuildRunScript.includes('APPLICATIONS_APP_PATH="/Applications/Ontology Atlas.app"') &&
  codexBuildRunScript.includes("CFBundleIdentifier") &&
  codexBuildRunScript.includes("CFBundleExecutable") &&
  codexBuildRunScript.includes('pkill -f "$installed_executable"') &&
  codexBuildRunScript.includes('ditto "$APP_PATH" "$APPLICATIONS_APP_PATH"') &&
  codexBuildRunScript.includes('DOGFOOD_APP_PATH="$APPLICATIONS_APP_PATH"') &&
  codexRunContract.ordered
) {
  pass("Codex Run action syncs an existing Applications copy before Computer Use dogfood");
} else {
  fail(
    "script/build_and_run.sh must refresh an existing /Applications/Ontology Atlas.app with the freshly built bundle before verification so Computer Use app-name dogfood cannot attach to a stale installed copy",
  );
}

if (
  codexBuildRunScript.includes('DOGFOOD_DESKTOP_SCREENSHOT="$ROOT_DIR/.tmp/ontology-atlas-dogfood-desktop.png"') &&
  codexBuildRunScript.includes('mkdir -p "$ROOT_DIR/.tmp"') &&
  codexBuildRunScript.includes("--print-window-diagnostics") &&
  codexBuildRunScript.includes('screencapture -x "$DOGFOOD_DESKTOP_SCREENSHOT"')
) {
  pass("Codex Run action captures a desktop dogfood window artifact for visual fallback proof");
} else {
  fail(
    "script/build_and_run.sh must print macOS window diagnostics and write .tmp/ontology-atlas-dogfood-desktop.png so desktop dogfood keeps visual evidence when Computer Use cannot attach",
  );
}

if (
  verifyAppScript.includes("cwd: path.dirname(executablePath)") &&
  verifyInstallScript.includes("buildInstalledAppVerifyArgs") &&
  verifyInstallScript.includes('"--open-app"') &&
  verifyInstallScript.includes('"--require-window"') &&
  verifyInstallScript.includes('"--require-owner-name=Ontology Atlas"') &&
  verifyInstallScript.includes('"--require-accessibility-text=Ontology Atlas"') &&
  verifyInstallScript.includes('"--kill-existing"') &&
  verifyInstallScript.includes("installedMcpBinaryPath") &&
  verifyInstallScript.includes("verifyMcpBinary")
) {
  pass("desktop install smoke proves the copied DMG app and its installed MCP sidecar both run");
} else {
  fail(
    "desktop install smoke must verify copied DMG apps through scripts/verify-macos/verify-macos-app-launch.mjs and execute Contents/MacOS/ontology-atlas-mcp through verifyMcpBinary before removing the temporary install",
  );
}

/*
 * The sidecar build is part of this script: `tauri.conf.json` names
 * `src-tauri/binaries/ontology-atlas-mcp-<triple>`, which `.gitignore` excludes, so a fresh
 * checkout's `cargo test` dies in the build script on a missing resource. It takes 2.6 s when current.
 */
if (
  pkg.scripts?.["test:desktop:bridge"] ===
  "pnpm exec vitest run src/shared/lib/vault-folder/native-vault src/entities/local-fs-handle/api/store.test.ts src/entities/vault-session/model/local-vault/agent-config-status.test.ts && pnpm mcp:build-binary && cargo test --manifest-path src-tauri/Cargo.toml --workspace && node scripts/perf/vault-rows-equality.mjs"
) {
  pass(
    "desktop native vault bridge tests build the sidecar, then cover WebView handle shim, agent config validation, Rust path guard, and a manifest from cached rows equal to one from files",
  );
} else {
  fail(
    "package.json must expose test:desktop:bridge for the Tauri vault bridge contract, building the MCP sidecar before cargo test so a fresh worktree does not fail on the missing resource",
  );
}

if (
  pkg.scripts?.["test:desktop:runtime"] ===
  "pnpm exec vitest run src/views/docs-vault/lib/persistence.test.ts src/views/root-entry/ui/RootEntryPage.test.tsx src/widgets/app-settings-menu/ui/AppSettingsMenu.test.tsx"
) {
  pass("desktop runtime split tests cover local intent, first-run routing, and hosted download routing");
} else {
  fail(
    "package.json must expose test:desktop:runtime for the hosted-vs-installed runtime split: DocsVault persistence, RootEntryPage first-run routing, and AppSettingsMenu hosted download routing",
  );
}

if (
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/desktop-release/check-macos-release-github.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/desktop-release/check-macos-release-source.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/desktop-release/check-macos-release-status.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/desktop-release/watch-macos-release-run.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/download/generate-download-release-facts.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/lib/macos-artifact/macos-checksum.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/lib/macos-release-names.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/lib/desktop/release-script-contract.test.mjs")
) {
  pass("desktop checker tests cover the GitHub release operator, source, run-watch, checksum filename, and completion gates");
} else {
  fail("package.json test:desktop:check must include scripts/desktop-release/check-macos-release-github.test.mjs, scripts/desktop-release/check-macos-release-source.test.mjs, scripts/desktop-release/watch-macos-release-run.test.mjs, scripts/desktop-release/check-macos-release-status.test.mjs, scripts/download/generate-download-release-facts.test.mjs, scripts/lib/macos-artifact/macos-checksum.test.mjs, and scripts/lib/macos-release-names.test.mjs so the macOS release operator, source, run-watch, checksum filename, completion, and app-vs-asset naming gates stay covered");
}

// This suite owns 52 loopback-server call sites; Node 24 on all cores fails them with EADDRNOTAVAIL
// from the connection burst. Four workers keep the bound in the command the release preflight runs.
if (pkg.scripts?.["test:desktop:check"]?.startsWith("node --test --test-concurrency=4 ")) {
  pass("desktop checker tests bound loopback-heavy Node test concurrency to 4");
} else {
  fail("package.json test:desktop:check must run node --test with --test-concurrency=4 so loopback-heavy release tests do not exhaust local connections");
}

if (
  tauriVaultScope.includes("ensure_inside_canonical") &&
  tauriVaultScope.includes("resolve_write_target_inside") &&
  tauriVaultScope.includes("resolve_directory_target_inside") &&
  tauriVaultScope.includes("vault_commands_reject_symlink_escapes") &&
  tauriVaultScope.includes('"linked-dir/new/created-outside.md"') &&
  tauriVaultScope.includes("assert!(!outside.join(\"new\").exists())")
) {
  pass("desktop native vault bridge rejects symlink escapes without outside-vault side effects");
} else {
  fail("src-tauri/src/vault/scope.rs must reject symlink escapes for vault read/write/remove/mkdir paths without creating outside-vault directories");
}

if (
  pkg.scripts?.["desktop:verify-dmg"] === "node scripts/verify-macos/verify-macos-dmg.mjs" &&
  verifyDmgScript.includes("parseSha256Checksum") &&
  verifyDmgScript.includes("expectedFilename: path.basename(dmgPath)")
) {
  pass("desktop DMG verifier is available after packaging and checks the checksum filename");
} else {
  fail("package.json must expose desktop:verify-dmg as node scripts/verify-macos/verify-macos-dmg.mjs, and scripts/verify-macos/verify-macos-dmg.mjs must verify the .sha256 line names the DMG basename");
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
  pass("desktop DMG packager puts the Ontology Atlas app bundle into ontology-atlas release assets");
} else {
  fail(
    "scripts/desktop/package-macos-dmg.mjs must source appBundleName, name the DMG with releaseAssetName_version_arch, use the appName volume label, and write a checksum for the DMG basename",
  );
}

if (
  pkg.scripts?.["desktop:verify-install"] ===
  "node scripts/verify-macos/verify-macos-install-smoke.mjs" &&
  verifyInstallScript.includes("parseSha256Checksum") &&
  verifyInstallScript.includes("expectedFilename: path.basename(dmgPath)")
) {
  pass("desktop install verifier checks the checksum filename, copies the DMG app, and launch-smokes the installed copy");
} else {
  fail(
    "package.json must expose desktop:verify-install as node scripts/verify-macos/verify-macos-install-smoke.mjs, and scripts/verify-macos/verify-macos-install-smoke.mjs must verify the .sha256 line names the DMG basename",
  );
}

if (
  pkg.scripts?.["desktop:verify-release-dmg"] ===
  "node scripts/verify-macos/verify-macos-dmg.mjs --require-signed --require-notarized"
) {
  pass("desktop release DMG verifier requires signing and notarization");
} else {
  fail(
    "package.json must expose desktop:verify-release-dmg as node scripts/verify-macos/verify-macos-dmg.mjs --require-signed --require-notarized",
  );
}

if (
  verifyDmgScript.includes('const requireSigned = process.argv.includes("--require-signed") || requireNotarized') &&
  verifyDmgScript.includes('"codesign"') &&
  verifyDmgScript.includes('"--deep"') &&
  verifyDmgScript.includes('"--strict"')
) {
  pass("desktop release DMG verifier treats notarization as requiring strict app signing");
} else {
  fail(
    "scripts/verify-macos/verify-macos-dmg.mjs must make --require-notarized imply strict codesign --verify --deep --strict for the contained app",
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
  fail("scripts/verify-macos/verify-macos-dmg.mjs must run spctl assessment for release app execution and DMG opening");
}

if (
  pkg.scripts?.["desktop:verify-download"] ===
  "node scripts/download/check-macos-download-release.mjs"
) {
  pass("desktop public download verifier is available after release publishing");
} else {
  fail(
    "package.json must expose desktop:verify-download as node scripts/download/check-macos-download-release.mjs",
  );
}

if (
  pkg.scripts?.["desktop:verify-hosted"] ===
  "node scripts/download/check-hosted-download-surface.mjs" &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/download/check-hosted-download-surface.test.mjs") &&
  hostedDownloadSurfaceScript.includes("/ko/download/") &&
  hostedDownloadSurfaceScript.includes("https://github.com/wlsdks/ontology-atlas/releases") &&
  // The expected wording comes from the shipped message catalogue: copying it by hand makes the
  // gate go red on every copy change.
  hostedDownloadSurfaceScript.includes('readFileSync(path.join(REPO_ROOT, "messages", "ko.json")') &&
  // In either release-facts state the visitor gets something to decide on (a file, or the browser map),
  // and the verifier treats both as one deployment contract. The hero trust line is required because it
  // carries the Apple check and the Windows unsigned fact; the no-backend fact is `faq.items.privacy.a`.
  hostedDownloadSurfaceScript.includes("downloadCopy.trustLine") &&
  hostedDownloadSurfaceScript.includes("downloadCopy.faq?.items?.privacy?.a") &&
  hostedDownloadSurfaceScript.includes("downloadCopy.primaryCtaPublished") &&
  hostedDownloadSurfaceScript.includes("downloadCopy.webCta") &&
  hostedDownloadSurfaceScript.includes("releases/latest") &&
  hostedDownloadSurfaceScript.includes("assertIncludes(download.body, downloadPath") &&
  hostedDownloadSurfaceScript.includes("deploy-pages.yml") &&
  hostedDownloadSurfaceScript.includes("gh workflow run deploy-pages.yml")
) {
  pass("hosted website verifier sources expected download copy from the message catalog and requires the trust line plus both release-state CTAs");
} else {
  fail(
    "package.json must expose desktop:verify-hosted, test:desktop:check must cover it, and scripts/download/check-hosted-download-surface.mjs must read expected download copy from messages/ko.json (not hand-copied strings), require the hosted /ko/download/ route with the hero trust line, both release-state CTAs, and a stable GitHub Releases CTA, reject releases/latest, and print the deploy-pages recovery path",
  );
}

if (
  /release:\s*\n\s+types:\s*\[published\]/.test(pagesDeployWorkflow) &&
  /push:\s*\n\s+branches:\s*\[main\]/.test(pagesDeployWorkflow) &&
  /workflow_dispatch:/.test(pagesDeployWorkflow) &&
  /PAGES_BASE_URL:\s*https:\/\/ontologyatlas\.com/.test(pagesDeployWorkflow) &&
  !/ATLAS_PUBLIC_BASE_PATH:\s*\/ontology-atlas/.test(pagesDeployWorkflow) &&
  /uses:\s*actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38\b/.test(pagesDeployWorkflow) &&
  /node-version:\s*24/.test(pagesDeployWorkflow) &&
  /corepack enable/.test(pagesDeployWorkflow) &&
  (pagesDeployWorkflow.match(corepackPrepare)?.length ?? 0) >= 1 &&
  /pnpm --version/.test(pagesDeployWorkflow) &&
  !/uses:\s*pnpm\/action-setup@/.test(pagesDeployWorkflow) &&
  /^\s*(?:-\s+)?run:\s*pnpm build:site\s*$/m.test(pagesDeployWorkflow) &&
  /actions\/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9\b/.test(pagesDeployWorkflow) &&
  /actions\/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e\b/.test(pagesDeployWorkflow) &&
  /pnpm desktop:verify-hosted -- --base-url="\$PAGES_BASE_URL"/.test(pagesDeployWorkflow) &&
  /pnpm desktop:verify-download -- --tag="\$PUBLISHED_RELEASE_TAG"/.test(pagesDeployWorkflow) &&
  !/FIREBASE|firebase-tools|deploy --only hosting/.test(pagesDeployWorkflow)
) {
  pass("GitHub Pages workflow builds the custom-domain root export, deploys the sole hosted download site on push/release, and verifies the hosted download route");
} else {
  fail(
    `.github/workflows/deploy-pages.yml must deploy GitHub Pages on push to main / release publication / manual dispatch, build at the ontologyatlas.com root without the retired /ontology-atlas base path, use Node 24 with Corepack ${pinnedPnpm} without pnpm/action-setup, upload+deploy the Pages artifact, verify the hosted download route at the canonical URL, verify published release assets on release, and never depend on Firebase`,
  );
}

if (
  downloadReleaseVerifier.includes("releaseVersionFromTag") &&
  downloadReleaseVerifier.includes("do not match the tag version") &&
  downloadReleaseVerifier.includes("allowDraft") &&
  downloadReleaseVerifier.includes("per_page=20&page=${page}") &&
  downloadReleaseVerifier.includes("page <= 5") &&
  downloadReleaseVerifier.includes("export function isRequestedDraft") &&
  downloadReleaseVerifier.includes("release?.tag_name === tag && release?.draft === true") &&
  downloadReleaseVerifier.includes("if (release.prerelease) {") &&
  !downloadReleaseVerifier.includes("allowPrerelease") &&
  downloadReleaseVerifier.includes("unsupported macOS DMG asset names") &&
  downloadReleaseVerifier.includes("function isAnyDmgAsset") &&
  downloadReleaseVerifier.includes('asset.name.endsWith(".dmg")') &&
  downloadReleaseVerifier.includes("REQUIRED_MACOS_ARCHES = [\"aarch64\"]") &&
  downloadReleaseVerifier.includes("Expected ontology-atlas_<version>_<aarch64|x64>.dmg") &&
  !downloadReleaseVerifier.includes("aarch64|x64|universal") &&
  downloadReleaseVerifier.includes("duplicate macOS DMG assets") &&
  downloadReleaseVerifier.includes("Keep exactly one DMG per architecture") &&
  downloadReleaseVerifier.includes("WINDOWS_NAME_PATTERN") &&
  downloadReleaseVerifier.includes("exactly one ontology-atlas_<version>_windows_x64-setup.exe") &&
  downloadReleaseVerifier.includes("verifyArtifactHash(windowsInstaller") &&
  downloadReleaseVerifier.includes("requestSha256") &&
  downloadReleaseVerifier.includes("does not match checksum")
) {
  pass("desktop download verifier re-downloads and hashes the required macOS and Windows installers");
} else {
  fail(
    "scripts/download/check-macos-download-release.mjs must require exactly one aarch64 ontology-atlas DMG (Intel is no longer required) plus exactly one Windows x64 setup executable, reject unsupported or duplicate DMGs, verify artifact filename versions match the release tag, re-download macOS and Windows bytes to match their checksums, and let --allow-draft find tagged draft pre-publish assets, and refuse any release GitHub marks as a pre-release",
  );
}

const desktopPreflightContract = evaluateDesktopReleasePreflight(
  pkg.scripts?.["desktop:release-preflight"],
);
if (desktopPreflightContract.ok) {
  pass("desktop local release preflight validates shipped vault data, builds the MCP sidecar before bridge tests, and proves app, DMG, and install artifacts without source dogfood state");
} else {
  fail(
    "desktop:release-preflight contract failed: " +
      desktopPreflightContract.errors.join("; "),
  );
}

/**
 * This order is a contract: DMG signing sits between packaging and notarisation (Gatekeeper evaluates
 * the DMG container, and signing after notarisation invalidates the staple), and the updater archive
 * (`desktop:repack-updater`) comes immediately after app signing, because packed earlier it carries
 * the pre-signature app, which updated users meet as "damaged".
 */
const RELEASE_ARTIFACT_COMMAND = "node scripts/desktop-release/build-macos-release-artifact.mjs";
const RELEASE_ARTIFACT_STEP_MARKERS = [
  'args: ["desktop:release-secrets"]',
  'args: ["build"]',
  'args: ["desktop:smoke"]',
  'args: ["desktop:build:app:prebuilt"]',
  'args: ["desktop:sign"]',
  'args: ["desktop:repack-updater"]',
  'args: ["scripts/desktop/package-macos-dmg.mjs"]',
  'args: ["desktop:sign:dmg"]',
  'args: ["desktop:notarize"]',
  'args: ["desktop:verify-release-dmg"]',
  'args: ["desktop:verify-install"]',
];

if (
  pkg.scripts?.["desktop:release-artifact"] === RELEASE_ARTIFACT_COMMAND &&
  RELEASE_ARTIFACT_STEP_MARKERS.every((marker) => buildMacosReleaseArtifactScript.includes(marker)) &&
  buildMacosReleaseArtifactScript.includes("releaseChildEnv") &&
  buildMacosReleaseArtifactScript.includes("withNotaryApiKeyFile")
) {
  pass("desktop release artifact command signs the app, packages, signs the DMG container, notarizes, and verifies the direct-download DMG");
} else {
  fail(
    "package.json must expose desktop:release-artifact as the credentialed direct-download artifact path: release secret check, build/smoke, app build, app sign, DMG package, **DMG container sign**, notarize, verify-release-dmg, and install smoke\n" +
      `[desktop-check]   expected: ${RELEASE_ARTIFACT_COMMAND} + isolated 11-step pipeline\n` +
      `[desktop-check]   actual: ${pkg.scripts?.["desktop:release-artifact"] ?? "(none)"}`,
  );
}

if (
  pkg.scripts?.["desktop:goal-audit"] === "node scripts/desktop-release/check-desktop-goal-audit.mjs" &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/desktop-release/check-desktop-goal-audit.test.mjs") &&
  goalAuditScript.includes("--pr=NUMBER is required") &&
  goalAuditScript.includes("desktop:release-preflight") &&
  // Hosting is separate from the macOS release audit: Pages is deployed by deploy-pages.yml and verified
  // by `desktop:verify-hosted`, so goal-audit calls release-status without hosting flags and the hosting
  // verifier must exist separately.
  !goalAuditScript.includes("--include-hosted-surface") &&
  releaseStatusScript.includes("use pnpm desktop:verify-hosted to check the deployed website") &&
  pkg.scripts?.["desktop:verify-hosted"] === "node scripts/download/check-hosted-download-surface.mjs" &&
  goalAuditScript.includes(".tmp/desktop-goal-status.json") &&
  goalAuditScript.includes(".tmp/desktop-goal-status.md") &&
  goalAuditScript.includes("--json-file=${options.jsonFile}") &&
  goalAuditScript.includes("--markdown-file=${options.markdownFile}") &&
  readText(".gitignore").includes(".tmp/")
) {
  pass("desktop goal audit requires PR and tag evidence before chaining local preflight with public release and hosted download blockers while writing default JSON and markdown evidence");
} else {
  fail(
    "package.json must expose desktop:goal-audit through scripts/desktop-release/check-desktop-goal-audit.mjs, cover it in test:desktop:check, require --pr and --tag before preflight, then run desktop:release-preflight and desktop:release-status while writing default .tmp JSON and markdown evidence ignored by git; the hosted website stays out of the app release audit (#617) and must keep its own desktop:verify-hosted gate",
  );
}

// The download page is the website's: it must send nobody into the workbench, which only the app opens.
if (!downloadPage.includes('/docs/?intent=local')) {
  pass("the hosted download page does not route into the workbench");
} else {
  fail("the hosted download page must stay promo/download-first and never link into the workbench: only the app opens a folder");
}

/*
 * Checks facts, not sentences: a sentence pin goes red when the copy improves, the failure direction
 * .claude/rules/documentation.md forbids. The one contract kept: the shortcut description and the
 * open label name the folder they open, and neither advertises browser File System Access as a
 * capability.
 */
const desktopRoutingCopy = [
  enMessages.searchWidgets.shortcuts.rows.localVault,
  koMessages.searchWidgets.shortcuts.rows.localVault,
  enMessages.featuresMisc.localVaultPicker.openLabel,
  koMessages.featuresMisc.localVaultPicker.openLabel,
];
const advertisesBrowserFsa = desktopRoutingCopy.some((text) => text.includes("File System Access"));
const namesTheFolder = (text, locale) => matches("folderWord", locale, text);

if (
  namesTheFolder(enMessages.searchWidgets.shortcuts.rows.localVault, "en") &&
  namesTheFolder(koMessages.searchWidgets.shortcuts.rows.localVault, "ko") &&
  !advertisesBrowserFsa &&
  // An open label must name **what it opens**. Which word it uses is not pinned.
  namesTheFolder(enMessages.featuresMisc.localVaultPicker.openLabel, "en") &&
  namesTheFolder(koMessages.featuresMisc.localVaultPicker.openLabel, "ko")
) {
  pass("the shortcut and open-label copy name the folder they open — neither advertises FSA as a capability");
} else {
  fail(
    "the shortcut copy and the open label must name what they open (the folder), and neither may advertise browser File System Access as a capability",
  );
}

// README prose is editable; its download and release references follow runtime config.
const configuredSite = readText("src/shared/config/site/site.ts")
  .match(/export const SITE_URL = ["']([^"']+)["']/)?.[1];
const configuredRepository = readText("src/shared/config/site/social-links.ts")
  .match(/export const GITHUB_REPO_URL = ["']([^"']+)["']/)?.[1];
const readmeLinks = [...rootReadme.matchAll(/(?:href=["']|\]\()(https?:\/\/[^"')\s>]+)/g)]
  .flatMap((match) => {
    try { return [new URL(match[1])]; } catch { return []; }
  });
if (
  configuredSite && configuredRepository && readmeLinks.length > 0 &&
  readmeLinks.some((url) => url.origin === configuredSite && /\/download\/?$/.test(url.pathname)) &&
  readmeLinks.some((url) => `${url.origin}${url.pathname.replace(/\/$/, "")}` === `${configuredRepository}/releases`)
) {
  pass("root README links to the configured download and release destinations");
} else {
  fail("README.md must link to the configured hosted download route and repository releases; check src/shared/config/site/site.ts and social-links.ts");
}

/*
 * Human prose is not a runtime contract: derive the routing fact from the component that owns it;
 * docs prose is protected by generated-surface and referential-integrity checks.
 */
if (
  // The map and first-run views arrive as one fetched chunk (`views`) once a folder is on its way.
  rootEntryPage.includes("const vaultOpen = Boolean(vault.manifest || vault.partialTotal)") &&
  rootEntryPage.includes("if (views) return <views.HomePage search={search} />") &&
  rootEntryPage.includes("isDesktopShell()") &&
  rootEntryPage.includes("return vault.restoreAttempted && views ? <views.FirstRunPage /> : <DesktopVaultRedirect />") &&
  // The first-run branch is also reached when the launch stops for the person to choose between known
  // folders (`FirstRunPage` is the launch chooser): check that the runtime test is still there and that
  // the choosing state reaches the same screen.
  rootEntryPage.includes("vault.awaitingVaultChoice") &&
  // The page is the installed app's alone: a plain browser is sent to the download page from the
  // document head (`src/i18n/boot-script.ts`) before any of it loads, so no gateway page renders here.
  !rootEntryPage.includes("GatewayLandingPage") &&
  bootScript.includes("location.replace") &&
  bootScript.includes("window.isTauri")
) {
  pass("root entry derives the loaded-vault map, desktop first run and the launch chooser from runtime state, and hands a plain browser to the download page");
} else {
  fail(
    "src/views/root-entry/ui/RootEntryPage.tsx must route a loaded vault to HomePage and an empty desktop shell to FirstRunPage, and src/i18n/boot-script.ts must send a browser (no window.isTauri) to /download",
  );
}

if (
  // The hub is the map: both `/` and `/ontology` converge on this empty state.
  // Measure the destination, not the formatting.
  /['"]\/docs\/['"]/.test(topologyEmptyState) &&
  !topologyEmptyState.includes("/download")
) {
  pass("the topology empty state sends folder work to /docs/ and never offers the app's own download");
} else {
  fail(
    "The topology empty state must route local folder work to /docs/ and must not link /download: the installed app never offers its own download",
  );
}

// What the download page may claim is decided by whether a release is published. Two properties are
// kept: release facts come only from the generated module, and internal pipeline state (PR review,
// tag consistency, CI commands) is absent from the public surface (docs/DESKTOP-MACOS.md).
const downloadGeneratedRelease = readText(
  "src/views/download/model/macos-release.generated.ts",
);
const internalPipelineLeaks = [
  "releaseStatusTitle",
  "releaseStatusPr",
  "releaseStatusSecrets",
  "desktop:release-status",
];

if (
  downloadPage.includes("isMacosReleasePublished") &&
  downloadPage.includes("macosAssetFor") &&
  downloadPage.includes("formatAssetSize") &&
  // The page reads release facts from the generated module: the hero reads the Windows asset
  // (`windowsAsset`) and names the in-development version when nothing is published
  // (`displayReleaseTag`).
  downloadPage.includes("windowsAsset") &&
  downloadPage.includes("displayReleaseTag") &&
  downloadPage.includes("gateway-hero-windows") &&
  internalPipelineLeaks.every(
    (marker) => !downloadPage.includes(marker) && !downloadRoute.includes(marker),
  ) &&
  /^export const MACOS_RELEASE: MacosRelease = \{\n\s+published: (?:true|false),/m.test(downloadGeneratedRelease) &&
  // Before publication only one state remains, "not yet", instead of placeholders.
  /not published yet/.test(enMessages.download?.factUnpublished ?? "") &&
  /게시 전/.test(koMessages.download?.factUnpublished ?? "") &&
  !enMessages.download?.checksumValuePending &&
  !enMessages.download?.factSizeValuePending &&
  !enMessages.download?.releaseAvailabilityNote &&
  !enMessages.download?.releaseStatusTitle &&
  !koMessages.download?.releaseStatusTitle &&
  // Windows is named, and its unsigned status is stated with the warning a visitor will meet.
  /Windows/.test(enMessages.download?.heroWindowsCta ?? "") &&
  /Windows/.test(koMessages.download?.heroWindowsCta ?? "") &&
  /Unsigned/.test(enMessages.download?.trustLineWindows ?? "") &&
  /미서명/.test(koMessages.download?.trustLineWindows ?? "") &&
  /SmartScreen/.test(enMessages.download?.trustLineWindows ?? "") &&
  /SmartScreen/.test(koMessages.download?.trustLineWindows ?? "") &&
  /\{file\}/.test(enMessages.download?.factShaLink ?? "") &&
  readText("docs/guide/trust.md").includes("shasum -a 256 <file>") &&
  readText("docs/guide/trust.md").includes("Get-FileHash <file> -Algorithm SHA256") &&
  // Claiming signing requires the release asset chain to actually sign, notarise,
  // and verify.
  (!/notarized|Checked by Apple/.test(enMessages.download?.trustLine ?? "") ||
    (pkg.scripts?.["desktop:release-artifact"] === RELEASE_ARTIFACT_COMMAND &&
      [
        'args: ["desktop:sign"]',
        'args: ["desktop:notarize"]',
        'args: ["desktop:verify-release-dmg"]',
      ].every((marker) => buildMacosReleaseArtifactScript.includes(marker)))) &&
  // Copy that states an unsigned status must also give the workaround — announcing
  // the state without a way through is neglect, not honesty. (If the certificate
  // expires or is revoked and the copy reverts to unsigned, this condition rearms.)
  (!/not signed or notarized/.test(JSON.stringify(enMessages.download ?? {})) ||
    (/Open Anyway/.test(JSON.stringify(enMessages.download ?? {})) &&
      /확인 없이 열기/.test(JSON.stringify(koMessages.download ?? {})))) &&
  // Never state a never-registered domain as fact.
  !/ontology-atlas\.dev/.test(JSON.stringify(enMessages.download ?? {})) &&
  !/ontology-atlas\.dev/.test(JSON.stringify(koMessages.download ?? {}))
) {
  pass(
    "hosted download page states per-platform installability from the generated release state and keeps release-pipeline status internal",
  );
} else {
  fail(
    "the /download surface must derive size/checksum/download links from src/views/download/model/macos-release.generated.ts, say plainly that macOS is unpublished instead of showing placeholders, state the Windows build's unsigned status, state signing/notarization as facts about published builds, and carry no operator-only release-pipeline status",
  );
}

if (
  (releaseWorkflow.match(/uses:\s*actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803\b/g)?.length ?? 0) >= 4 &&
  (releaseWorkflow.match(/uses:\s*actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38\b/g)?.length ?? 0) >= 4 &&
  (releaseWorkflow.match(/corepack enable/g)?.length ?? 0) >= 4 &&
  (releaseWorkflow.match(corepackPrepare)?.length ?? 0) >= 4 &&
  (releaseWorkflow.match(/pnpm --version/g)?.length ?? 0) >= 4 &&
  /uses:\s*actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a\b/.test(releaseWorkflow) &&
  /uses:\s*actions\/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131\b/.test(releaseWorkflow) &&
  /uses:\s*softprops\/action-gh-release@c12583777ecdfd3be55c69cf75464299dc01057e\b/.test(releaseWorkflow) &&
  !/uses:\s*pnpm\/action-setup@/.test(releaseWorkflow)
) {
  pass("macOS release workflow uses Node 24 action majors and Corepack pnpm without pnpm/action-setup");
} else {
  fail(
    `.github/workflows/release-macos.yml must use Node 24-compatible action majors plus Corepack ${pinnedPnpm} without pnpm/action-setup`,
  );
}

const admitReleaseJob = workflowJob(releaseWorkflow, "admit-release");
const buildMacosJob = workflowJob(releaseWorkflow, "build-macos");
const signMacosJob = workflowJob(releaseWorkflow, "sign-macos");
const buildWindowsJob = workflowJob(releaseWorkflow, "build-windows");
const stageReleaseJob = workflowJob(releaseWorkflow, "stage-macos");
const publishReleaseJob = workflowJob(releaseWorkflow, "publish-macos");
const releaseOnSection = releaseWorkflow.match(/^on:\n([\s\S]*?)(?=^permissions:)/m)?.[1] ?? "";
const releaseTriggers = releaseOnSection.match(/^  [A-Za-z0-9_-]+:\s*$/gm) ?? [];
const releaseHasOnlyDispatchTag =
  releaseTriggers.length === 1 &&
  /^  workflow_dispatch:\s*$/.test(releaseTriggers[0]) &&
  /^on:\n  workflow_dispatch:\n    inputs:\n      tag:\n[\s\S]*?required:\s*true[\s\S]*?type:\s*string/m.test(releaseWorkflow);

if (
  releaseHasOnlyDispatchTag &&
  /^run-name:\s*.*(?:inputs\.tag|RELEASE_TAG)/m.test(releaseWorkflow) &&
  !/GITHUB_REF_NAME|github\.ref_name|tags:\s*\[|tags:\s*\n/.test(releaseWorkflow)
) {
  pass("protected release trigger accepts only a dispatched tag input and names that tag in the run");
} else {
  fail("release-macos.yml must have only workflow_dispatch with required string tag input, a tag-bearing run-name, and no tag-push or GITHUB_REF_NAME assumptions");
}

if (
  admitReleaseJob &&
  !/^\s+environment:/m.test(admitReleaseJob) &&
  /github\.event_name/.test(admitReleaseJob) &&
  /github\.ref\s*\}\}/.test(admitReleaseJob) &&
  /github\.ref_type/.test(admitReleaseJob) &&
  /github\.workflow_sha/.test(admitReleaseJob) &&
  /github\.sha/.test(admitReleaseJob) &&
  /workflow_dispatch/.test(admitReleaseJob) &&
  /refs\/heads\/main/.test(admitReleaseJob) &&
  /branch/.test(admitReleaseJob) &&
  /\$WORKFLOW_SHA"\s*==\s*"\$DISPATCH_SHA/.test(admitReleaseJob) &&
  /uses:\s*actions\/checkout@/.test(admitReleaseJob) &&
  /ref:\s*\$\{\{\s*github\.sha\s*\}\}/.test(admitReleaseJob)
) {
  pass("unprivileged release admission binds a protected branch dispatch to its trusted workflow commit");
} else {
  fail("admit-release must be unprivileged and explicitly require workflow_dispatch, refs/heads/main, branch ref type, github.workflow_sha == github.sha, and checkout github.sha");
}

if (
  [signMacosJob, buildWindowsJob].every((job) =>
    needsAdmission(job) && /environment:\s*release-signing/.test(job) && hasAdmittedCheckout(job),
  ) &&
  needsAdmission(buildMacosJob) &&
  hasAdmittedCheckout(buildMacosJob) &&
  !/environment:/.test(buildMacosJob) &&
  !/\$\{\{\s*secrets\./.test(buildMacosJob)
) {
  pass("macOS signing and the Windows build consume the admitted commit from release-signing, and the macOS build holds no secret");
} else {
  fail("sign-macos and build-windows must need admit-release, use release-signing, and checkout needs.admit-release.outputs.release_sha; build-macos must do the same outside any environment and reference no secret");
}

if (
  [stageReleaseJob, publishReleaseJob].every((job) =>
    needsAdmission(job) && hasAdmittedCheckout(job) && /(?:inputs\.tag|RELEASE_TAG)/.test(job),
  )
) {
  pass("staging and publication use the admitted commit and requested release tag");
} else {
  fail("stage-macos and publish-macos must need admit-release, checkout its release_sha, and use the workflow_dispatch tag rather than a ref-derived tag");
}

if (buildWindowsJob.includes("pnpm desktop:build:windows") && !/\$\{\{\s*secrets\./.test(buildWindowsJob)) {
  pass("Windows builds its installer with no signing secret in the job");
} else {
  fail("build-windows must run desktop:build:windows and reference no secret; the Windows beta publishes no updater signature");
}

if (
  pkg.scripts?.["desktop:release-source"] === "node scripts/desktop-release/check-macos-release-source.mjs" &&
  releaseWorkflow.includes('pnpm desktop:release-source -- --mode=pin --tag="${RELEASE_TAG}" --sha="${RELEASE_SHA}"') &&
  buildWindowsJob.includes('pnpm desktop:release-source -- --mode=pin --tag="$env:RELEASE_TAG" --sha="$env:RELEASE_SHA"') &&
  !buildWindowsJob.includes('--tag="${RELEASE_TAG}"') &&
  !buildWindowsJob.includes('--sha="${RELEASE_SHA}"') &&
  releaseSourceScript.includes("default-branch head") &&
  /RELEASE_SHA:\s*\$\{\{\s*needs\.admit-release\.outputs\.release_sha\s*\}\}/.test(releaseWorkflow)
) {
  pass("desktop release source gate blocks tags from unmerged or stale commits before signing on Bash and PowerShell runners");
} else {
  fail(
    "package.json and .github/workflows/release-macos.yml must run scripts/desktop-release/check-macos-release-source.mjs with shell-native environment expansion before signing so release artifacts only publish from the default-branch head",
  );
}

if (
  pkg.scripts?.["desktop:release-secrets"] === "node scripts/desktop-release/check-macos-release-secrets.mjs" &&
  releaseSecretsScript.includes("decodedPkcs12Secret") &&
  releaseSecretsScript.includes("hasDerSequenceEnvelope") &&
  releaseSecretsScript.includes("firstLengthByte < 0x80") &&
  releaseSecretsScript.includes("PKCS#12 DER sequence with a valid length envelope") &&
  releaseSecretsScript.includes("cannot import its signing certificate") &&
  releaseSecretsScript.includes("decodeNotaryApiKeySecret") &&
  notaryCredentialsHelper.includes("must decode to an App Store Connect .p8 private key")
) {
  pass("desktop release secret gate blocks unsigned releases and malformed PKCS#12 or App Store Connect .p8 credentials");
} else {
  fail(
    "package.json must expose desktop:release-secrets as node scripts/desktop-release/check-macos-release-secrets.mjs, and the release credential helpers must reject missing values, malformed base64, non-PKCS#12 certificate payloads, and malformed App Store Connect .p8 keys before signing",
  );
}

if (
  pkg.scripts?.["desktop:release-github"] === "node scripts/desktop-release/check-macos-release-github.mjs" &&
  typeof pkg.scripts?.["desktop:release-preflight"] === "string" &&
  /^  workflow_dispatch:/m.test(releaseWorkflow) &&
  /^\s+environment: release-signing$/m.test(releaseWorkflow) &&
  releaseGithubScript.includes('"--env"') &&
  releaseGithubScript.includes("release-signing")
) {
  pass("desktop release workflow and preflight route signing setup through the release-signing environment");
} else {
  fail("release-macos.yml must be dispatchable (workflow_dispatch) and sign under the release-signing environment; desktop:release-preflight and desktop:release-github must exist");
}

if (
  pkg.scripts?.["desktop:release-tag"] === "node scripts/desktop-release/check-macos-release-tag.mjs" &&
  releaseWorkflow.includes('pnpm desktop:release-tag -- --tag="${RELEASE_TAG}"') &&
  buildWindowsJob.includes('pnpm desktop:release-tag -- --tag="$env:RELEASE_TAG"') &&
  !buildWindowsJob.includes('pnpm desktop:release-tag -- --tag="${RELEASE_TAG}"') &&
  releaseTagScript.includes("does not match macOS app versions")
) {
  pass("desktop release tag gate receives the dispatched release tag before signing on Bash and PowerShell runners");
} else {
  fail(
    "package.json and .github/workflows/release-macos.yml must pass RELEASE_TAG from workflow_dispatch with shell-native environment expansion before signing",
  );
}

if (
  pkg.scripts?.["desktop:release-slot"] === "node scripts/desktop-release/check-macos-release-slot.mjs" &&
  releaseWorkflow.includes('pnpm desktop:release-slot -- --tag="${RELEASE_TAG}"') &&
  releaseSlotScript.includes("already exists") &&
  releaseSlotScript.includes("Delete the existing")
) {
  pass("desktop release slot gate blocks stale same-tag GitHub Release assets before upload");
} else {
  fail(
    "package.json and .github/workflows/release-macos.yml must run scripts/desktop-release/check-macos-release-slot.mjs before uploading DMGs so same-tag stale release assets cannot be reused",
  );
}

if (
  pkg.scripts?.["desktop:release-github"] === "node scripts/desktop-release/check-macos-release-github.mjs" &&
  releaseGithubScript.includes('"secret"') &&
  releaseGithubScript.includes('"list"') &&
  releaseGithubScript.includes("APPLE_CERTIFICATE_P12_BASE64") &&
  releaseGithubScript.includes("release-macos.yml") &&
  releaseGithubScript.includes("hosted website deploy is intentionally excluded") &&
  releaseGithubScript.includes("workflow_dispatch") &&
  releaseGithubScript.includes("deployment-branch-policies") &&
  releaseGithubScript.includes('"branch"') &&
  releaseGithubScript.includes("release-signing")
) {
  pass("desktop GitHub release readiness gate checks the protected workflow and release-signing secret scope before dispatch");
} else {
  fail(
    "package.json must expose desktop:release-github and scripts/desktop-release/check-macos-release-github.mjs must check the protected workflow, branch-only release-signing environment, and required signing secret names before dispatch",
  );
}

if (
  pkg.scripts?.["desktop:release-run"] === "node scripts/desktop-release/watch-macos-release-run.mjs" &&
  releaseRunScript.includes('"run"') &&
  releaseRunScript.includes('"list"') &&
  releaseRunScript.includes("--event") &&
  releaseRunScript.includes("workflow_dispatch") &&
  releaseRunScript.includes('"workflow"') &&
  releaseRunScript.includes('"--ref"') &&
  releaseRunScript.includes("--commit") &&
  releaseRunScript.includes("git") &&
  releaseRunScript.includes("rev-list") &&
  releaseRunScript.includes('"watch"') &&
  releaseRunScript.includes("--exit-status") &&
  releaseRunScript.includes("attempts") &&
  releaseRunScript.includes("interval-ms") &&
  releaseStatusScript.includes("desktop:release-run")
) {
  pass("desktop release run watcher dispatches the protected ref and watches its workflow_dispatch run");
} else {
  fail(
    "package.json must expose desktop:release-run, scripts/desktop-release/watch-macos-release-run.mjs must dispatch the protected ref then poll for that workflow_dispatch run before gh run watch, and desktop:release-status must route operators through that watcher",
  );
}

if (
  pkg.scripts?.["desktop:release-status"] === "node scripts/desktop-release/check-macos-release-status.mjs" &&
  releaseStatusScript.includes('"pr"') &&
  releaseStatusScript.includes('"secret"') &&
  releaseStatusScript.includes('"release"') &&
  releaseStatusScript.includes("check-macos-release-tag.mjs") &&
  releaseStatusScript.includes("check-macos-download-release.mjs") &&
  releaseStatusScript.includes('"--json"') &&
  releaseStatusScript.includes('"--json-file="') &&
  releaseStatusScript.includes('"--markdown-file="') &&
  releaseStatusScript.includes("schemaVersion") &&
  releaseStatusScript.includes("generatedAt") &&
  releaseStatusScript.includes("readyAt") &&
  releaseStatusScript.includes("blockedAt") &&
  releaseStatusScript.includes("release_workflow") &&
  releaseStatusScript.includes("actions/workflows/release-macos.yml") &&
  releaseStatusScript.includes("workflowUnavailableMessage") &&
  !releaseStatusScript.includes("deploy-hosting.yml") &&
  !releaseStatusScript.includes("FIREBASE_SERVICE_ACCOUNT_JSON") &&
  !releaseStatusScript.includes("--include-hosted-surface") &&
  releaseStatusScript.includes("apple_release_secrets") &&
  releaseStatusScript.includes("release_tag_slot") &&
  releaseStatusScript.includes("runGitStatus") &&
  releaseStatusScript.includes("runGhStatus") &&
  releaseStatusScript.includes("refs/tags/") &&
  releaseStatusScript.includes("download_assets") &&
  releaseStatusScript.includes("blockerCount") &&
  releaseStatusScript.includes("blockerIds") &&
  releaseStatusScript.includes("localBlockerIds") &&
  releaseStatusScript.includes("externalBlockerIds") &&
  releaseStatusScript.includes("blockersByOwner") &&
  releaseStatusScript.includes("CHECK_OWNERS") &&
  releaseStatusScript.includes("missingSecrets") &&
  releaseStatusScript.includes("nextActions") &&
  releaseStatusScript.includes("commands") &&
  releaseStatusScript.includes("gh pr view") &&
  releaseStatusScript.includes("desktop:release-github") &&
  releaseStatusScript.includes("desktop:release-source") &&
  releaseStatusScript.includes("git push origin") &&
  releaseStatusScript.includes("desktop:release-run") &&
  releaseStatusScript.includes("desktop:verify-download") &&
  releaseStatusScript.includes("renderMarkdownChecklist") &&
  releaseStatusScript.includes("fs.writeFileSync") &&
  releaseStatusScript.includes("OATLAS_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY")
) {
  pass("desktop release status gate audits version alignment, PR readiness, release workflow availability, tag slots, Developer ID direct-download secrets, public release state, and download assets in JSON blocker snapshots and markdown operator checklists, with no Firebase Hosting dependency");
} else {
  fail(
    "package.json must expose desktop:release-status and scripts/desktop-release/check-macos-release-status.mjs must audit version alignment, PR readiness, release workflow availability, local/remote Git tag slots, Developer ID direct-download secret names, public release state, and public download assets in JSON blocker snapshots and markdown operator checklists, with no Firebase Hosting dependency",
  );
}

if (
  pkg.scripts?.["desktop:sign"] === "node scripts/desktop/sign-macos-app.mjs" &&
  signMacosScript.includes('"--deep"') &&
  signMacosScript.includes('"--options"') &&
  signMacosScript.includes('"runtime"') &&
  signMacosScript.includes('"--timestamp"') &&
  signMacosScript.includes('["--verify", "--deep", "--strict", "--verbose=2", appPath]')
) {
  pass("desktop signing script deeply signs the release app with hardened runtime and strict verification");
} else {
  fail("package.json must expose desktop:sign as node scripts/desktop/sign-macos-app.mjs, and scripts/desktop/sign-macos-app.mjs must deeply sign the app with hardened runtime, timestamping, and strict deep verification");
}

if (pkg.scripts?.["desktop:notarize"] === "node scripts/desktop-release/notarize-macos-dmg.mjs") {
  pass("desktop notarization script is available for release builds");
} else {
  fail("package.json must expose desktop:notarize as node scripts/desktop-release/notarize-macos-dmg.mjs");
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

// The bundled MCP server is app payload — it must be compiled **before** Tauri
// bakes, or `externalBin` cannot find it. Reverse the order and an app ships
// silently without the server, and the user only learns the agent will not attach
// after installing.
if (
  pkg.scripts?.["desktop:build:app"] ===
    "node scripts/desktop/clean-tauri-macos-apps.mjs && pnpm mcp:build-binary && pnpm tauri build --bundles app" &&
  pkg.scripts?.["mcp:build-binary"] === "node scripts/packaging/build-mcp-binary.mjs" &&
  tauriConfig.bundle?.externalBin?.includes("binaries/ontology-atlas-mcp") &&
  cleanTauriMacosAppsScript.includes('"bundle"') &&
  cleanTauriMacosAppsScript.includes('"macos"') &&
  cleanTauriMacosAppsScript.includes('entry.endsWith(".app")') &&
  cleanTauriMacosAppsScript.includes("fs.rmSync(appPath, { recursive: true, force: true })")
) {
  pass(
    "desktop app-only build compiles the bundled MCP server and cleans stale macOS app bundles before Tauri rebuilds",
  );
} else {
  fail(
    "package.json must expose desktop:build:app as node scripts/desktop/clean-tauri-macos-apps.mjs && pnpm mcp:build-binary && pnpm tauri build --bundles app, mcp:build-binary as node scripts/packaging/build-mcp-binary.mjs, tauri.conf.json bundle.externalBin must carry binaries/ontology-atlas-mcp, and the cleaner must remove stale macOS .app bundles before Tauri rebuilds",
  );
}

if (
  pkg.scripts?.["desktop:deploy:app"] === "node scripts/desktop/deploy-macos-app-local.mjs" &&
  pkg.scripts?.["desktop:build:app:local"] ===
    "node scripts/desktop/clean-tauri-macos-apps.mjs && pnpm mcp:build-binary && pnpm tauri build --bundles app --config '{\"bundle\":{\"createUpdaterArtifacts\":false}}'" &&
  deployMacosAppLocalScript.includes("desktop:build:app:local") &&
  deployMacosAppLocalScript.includes('path.join("/Applications", names.appBundleName)') &&
  deployMacosAppLocalScript.includes("ditto") &&
  deployMacosAppLocalScript.includes('const DEFAULT_ROUTE = "/en/topology/"') &&
  deployMacosAppLocalScript.includes("--require-webview-route=${options.route}") &&
  deployMacosAppLocalScript.includes("requireScreenshot: argv.includes(\"--require-screenshot\")") &&
  deployMacosAppLocalScript.includes("visualEvidence: !argv.includes(\"--no-visual-evidence\")") &&
  deployMacosAppLocalScript.includes("--try-window-screenshot=${options.screenshotPath}") &&
  deployMacosAppLocalScript.includes('const DEFAULT_MIN_WINDOW_SIZE = "1360x840"') &&
  deployMacosAppLocalScript.includes('const DEFAULT_MIN_WEBVIEW_SIZE = "1400x860"') &&
  deployMacosAppLocalScript.includes("--min-webview-size=${options.minWebviewSize}") &&
  deployMacosAppLocalScript.includes("ontology-atlas-deployed-map.webview.json") &&
  deployMacosAppLocalScript.includes("--webview-evidence=${options.webviewEvidencePath}") &&
  verifyAppScript.includes("writeWebviewEvidence(webviewPayload, webviewEvidencePath, {") &&
  verifyAppScript.includes("visualEvidencePath: tryWindowScreenshotPath ?? windowScreenshotPath") &&
  deployMacosAppLocalScript.includes("--require-capturable-window") &&
  deployMacosAppLocalScript.includes("ontology-atlas-deployed-map.png") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/desktop/deploy-macos-app-local.test.mjs")
) {
  pass("desktop local deploy command builds without release updater signing, installs, and verifies map health from /Applications with default best-effort visual and WebView evidence");
} else {
  fail(
    "package.json must expose desktop:deploy:app plus desktop:build:app:local with updater artifacts disabled, cover scripts/desktop/deploy-macos-app-local.test.mjs, and the deploy script must build without release updater signing, ditto the app to /Applications, verify /en/topology/ map health plus drag dogfood, keep screenshot proof available as an opt-in, attempt 14-inch-compatible best-effort visual evidence by default, and save deterministic WebView evidence",
  );
}


if (
  pkg.scripts?.["desktop:build"] ===
  "pnpm desktop:build:app:local && pnpm desktop:sign:adhoc && node scripts/desktop/package-macos-dmg.mjs"
) {
  pass("desktop local build ad-hoc signs macOS .app before packaging without updater credentials");
} else {
  fail(
    "package.json must expose desktop:build as pnpm desktop:build:app:local && pnpm desktop:sign:adhoc && node scripts/desktop/package-macos-dmg.mjs so the local pre-tag gate needs neither updater credentials nor a damaged app bundle",
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

if (tauriConfig) {
  pass("Tauri scaffold exists");
} else {
  fail("src-tauri/tauri.conf.json must exist before desktop prototype work continues");
}

// The 14-inch MacBook Pro reference is 1512x982 logical points including menu bar and notch; Tauri's
// height is the inner content size, so 982 asks for 982 + 28pt of title bar inside a 945pt visible
// frame and AppKit constrains it. This gate keeps the shipped first viewport and the swept 1512x900
// viewport from drifting apart.
const REFERENCE_14_INCH_LOGICAL = { width: 1512, height: 982 };
const MACOS_MENU_BAR_RESERVE_PT = 37;
const MACOS_TITLE_BAR_PT = 28;
// Read out of app_shell/window.rs rather than copied: a second literal would let the Rust constant
// drift while this gate stays green.
const mainWindowMinSource = readText("src-tauri/src/app_shell/window.rs").match(
  /const MAIN_WINDOW_MIN_LOGICAL: \(f64, f64\) = \(([\d.]+), ([\d.]+)\);/,
);
const MAIN_WINDOW_MIN_LOGICAL = mainWindowMinSource
  ? { width: Number(mainWindowMinSource[1]), height: Number(mainWindowMinSource[2]) }
  : null;
if (!MAIN_WINDOW_MIN_LOGICAL) {
  fail(
    "src-tauri/src/app_shell/window.rs must declare `const MAIN_WINDOW_MIN_LOGICAL: (f64, f64) = (w, h);` so the window gate can bind the config floor to the Rust constant instead of duplicating it",
  );
}

const mainWindowConfig = tauriConfig?.app?.windows?.find((window) => window.label === "main");
const visibleFrameHeight = REFERENCE_14_INCH_LOGICAL.height - MACOS_MENU_BAR_RESERVE_PT;
if (
  mainWindowConfig &&
  mainWindowConfig.width <= REFERENCE_14_INCH_LOGICAL.width &&
  mainWindowConfig.height + MACOS_TITLE_BAR_PT <= visibleFrameHeight &&
  MAIN_WINDOW_MIN_LOGICAL &&
  mainWindowConfig.minWidth === MAIN_WINDOW_MIN_LOGICAL.width &&
  mainWindowConfig.minHeight === MAIN_WINDOW_MIN_LOGICAL.height
) {
  pass(
    `Tauri main window opens at a size the 14-inch reference panel can actually hold (${mainWindowConfig.width}x${mainWindowConfig.height} content, ${mainWindowConfig.height + MACOS_TITLE_BAR_PT} outer <= ${visibleFrameHeight} visible)`,
  );
} else {
  fail(
    `src-tauri/tauri.conf.json main window must fit the 14-inch reference panel: width <= ${REFERENCE_14_INCH_LOGICAL.width}, height + ${MACOS_TITLE_BAR_PT}pt title bar <= ${visibleFrameHeight}pt visible frame, and minWidth/minHeight must equal MAIN_WINDOW_MIN_LOGICAL in src-tauri/src/app_shell/window.rs (${MAIN_WINDOW_MIN_LOGICAL ? `${MAIN_WINDOW_MIN_LOGICAL.width}x${MAIN_WINDOW_MIN_LOGICAL.height}` : "unreadable"}); got ${mainWindowConfig ? `${mainWindowConfig.width}x${mainWindowConfig.height}, min ${mainWindowConfig.minWidth}x${mainWindowConfig.minHeight}` : "no window labelled main"}`,
  );
}

if (tauriConfig?.build?.frontendDist === path.posix.relative("src-tauri", APP_FOLDER)) {
  pass("Tauri embeds the app folder the build writes");
} else {
  fail(`src-tauri/tauri.conf.json must set build.frontendDist to ${path.posix.relative("src-tauri", APP_FOLDER)}, the app folder (scripts/lib/web/built-folders.mjs) that pnpm build:app writes`);
}

if (tauriConfig?.build?.beforeBuildCommand === "pnpm build:app") {
  pass("Tauri build refreshes the app folder through pnpm build:app");
} else {
  fail("src-tauri/tauri.conf.json must set build.beforeBuildCommand to pnpm build:app");
}

if (tauriConfig?.bundle?.targets?.includes("app")) {
  pass("Tauri bundle target includes macOS .app");
} else {
  fail("src-tauri/tauri.conf.json must include bundle target app");
}

const requiredTauriBundleIcons = [
  "icons/32x32.png",
  "icons/128x128.png",
  "icons/128x128@2x.png",
  "icons/icon.icns",
  "icons/icon.ico",
];
const configuredBundleIcons = Array.isArray(tauriConfig?.bundle?.icon)
  ? tauriConfig.bundle.icon
  : [];
const missingBundleIcons = requiredTauriBundleIcons.filter(
  (iconPath) => !configuredBundleIcons.includes(iconPath),
);
if (missingBundleIcons.length === 0) {
  pass("Tauri bundle config wires the Ontology Atlas app icons into .app builds");
} else {
  fail(
    `src-tauri/tauri.conf.json must include bundle.icon entries for app packaging; missing ${missingBundleIcons.join(", ")}`,
  );
}

if (
  screenMetadataSource.includes("siteMetadata()") &&
  siteMetadataSource.includes("title: SITE_NAME") &&
  siteEntity.includes("SITE_NAME = 'Ontology Atlas'") &&
  // Forks that deploy beneath a base path need the manifest helper.
  siteMetadataSource.includes("manifest: withBasePath('/manifest.webmanifest')") &&
  siteDocument.includes("siteEntityGraph(") &&
  siteEntity.includes("alternateName: 'ontology-atlas'") &&
  webManifest.name === "Ontology Atlas" &&
  webManifest.short_name === "Ontology Atlas" &&
  enMessages.metadata.siteName === "Ontology Atlas" &&
  koMessages.metadata.siteName === "Ontology Atlas" &&
  gatewaySurfaceSource.includes("Ontology Atlas")
) {
  pass("user-facing web and app metadata use Ontology Atlas while preserving ontology-atlas as the project alias");
} else {
  fail(
    "Root metadata, PWA manifest, localized metadata, and the hosted download page must expose Ontology Atlas as the user-facing brand while keeping ontology-atlas as the project alias",
  );
}

if (
  tauriConfig?.productName === "Ontology Atlas" &&
  tauriConfig?.identifier === "dev.jinan.ontology-atlas" &&
  cargoPackageName === "ontology-atlas" &&
  tauriConfig?.app?.windows?.some(
    (windowConfig) =>
      windowConfig?.title === "Ontology Atlas" &&
      windowConfig?.label === "main" &&
      windowConfig?.center === true,
  ) &&
  macosReleaseNamesHelper.includes('const releaseAssetName = "ontology-atlas"') &&
  macosReleaseNamesHelper.includes('const bundleIdentifier = tauriConfig.identifier ?? "dev.jinan.ontology-atlas"') &&
  verifyDmgScript.includes("releaseAssetName") &&
  verifyInstallScript.includes("releaseAssetName") &&
  verifyInstallScript.includes("appBundleName") &&
  verifyInstallScript.includes("buildInstalledAppVerifyArgs") &&
  verifyAppScript.includes("appBundleName") &&
  verifyAppScript.includes("resolveMacosExecutable") &&
  signMacosScript.includes("appBundleName") &&
  notarizeMacosDmgScript.includes("releaseAssetName")
) {
  pass("Tauri presents Ontology Atlas with a Ontology Atlas bundle id, app bundle, executable, and DMG basename");
} else {
  fail(
    "src-tauri/tauri.conf.json must use Ontology Atlas as the app productName/window title, center the main window, use the dev.jinan.ontology-atlas bundle identifier, src-tauri/Cargo.toml must build the ontology-atlas executable, and release scripts must route through appBundleName vs releaseAssetName so GitHub DMG assets stay ontology-atlas_*",
  );
}

if (
  tauriConfig?.bundle?.category === "DeveloperTool" &&
  tauriConfig?.bundle?.shortDescription?.includes("Local-first codebase ontology workbench") &&
  tauriConfig?.bundle?.shortDescription?.includes("Ontology Atlas") &&
  tauriConfig?.bundle?.longDescription?.includes("Ontology Atlas") &&
  tauriConfig?.bundle?.longDescription?.includes("ontology-atlas project name") &&
  tauriConfig?.bundle?.longDescription?.includes("markdown ontology vault") &&
  tauriConfig?.bundle?.longDescription?.includes("without a backend or login") &&
  tauriConfig?.bundle?.copyright?.includes("ontology-atlas contributors")
) {
  pass("Tauri bundle metadata identifies Ontology Atlas as the local-first app while preserving the ontology-atlas project identity");
} else {
  fail(
    "src-tauri/tauri.conf.json must set macOS bundle category, Ontology Atlas descriptions, and ontology-atlas copyright/project identity so the installed app is not a generic wrapper",
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
    !tauriInfoPlist.includes("Ontology Atlas opens") ||
    !tauriInfoPlist.includes("markdown ontology vault folder you choose"),
);
if (missingFolderUsageKeys.length === 0) {
  pass("macOS Info.plist explains selected vault-folder access for protected locations");
} else {
  fail(
    `src-tauri/Info.plist must explain selected vault folder access for protected macOS locations: missing ${missingFolderUsageKeys.join(", ")}`,
  );
}

/** The `connect-src` list and why `'self'` is on it live in `scripts/lib/desktop/desktop-csp.mjs`. */
const tauriCsp = tauriConfig?.app?.security?.csp;
if (
  tauriCsp &&
  typeof tauriCsp === "object" &&
  tauriCsp["default-src"]?.includes("'self'") &&
  connectSrcIsExact(tauriCsp["connect-src"]) &&
  tauriCsp["img-src"]?.includes("data:") &&
  tauriCsp["style-src"]?.includes("'self'") &&
  !JSON.stringify(tauriCsp).includes("https://")
) {
  pass(
    "Tauri CSP is enabled for local app assets, images, styles, own-origin files, and IPC only",
  );
} else {
  fail(
    "src-tauri/tauri.conf.json must enable a scoped CSP for local app assets, data/blob images, " +
      `styles, and Tauri IPC, with connect-src exactly ${DESKTOP_CONNECT_SRC_TOKENS.join(" ")} — ` +
      "without 'self' the app cannot fetch its own bundled files",
  );
}

/**
 * Window permissions are allowed by name and dangerous families blocked by prefix: keep the allow
 * list short, and block whole families so a new name is blocked without anyone knowing it.
 */
const ALLOWED_CAPABILITY_PERMISSIONS = [
  // `core:default` is allowed by name but unused here: it expands to nine sets, four of which
  // (`core:image`, `core:resources`, `core:menu`, `core:tray`) the webview never calls.
  "core:default",
  // `listen`, the frontend's only event-plugin call.
  "core:event:default",
  // `getVersion()` in `AppUpdateSettings.tsx` — the app's own version shown beside the update
  // control. Not the version in the first log line: that one comes from Rust `package_info()`,
  // which the permission system does not gate at all.
  "core:app:default",
  "core:webview:allow-print",
  // Check for and install updates. The network target is fixed by the endpoint in
  // `tauri.conf.json` and no user input reaches it. minisign signature verification
  // is enforced before install.
  "updater:default",
  // Restart after update, and only that. Not `process:default` — there is no reason
  // to grant exit as well.
  "process:allow-restart",
];

/**
 * The core baseline this window needs: `core:event` carries `listen`, `core:app` carries
 * `getVersion` for the update control, and Question Desk invokes `window.print()` through
 * `core:webview:allow-print`. Capabilities gate JS-to-Rust IPC only; the window is resized from Rust.
 * The `core:default` umbrella is still accepted so the gate judges what is granted, not the spelling.
 */
const REQUIRED_CORE_PERMISSIONS = ["core:event:default", "core:app:default"];

/** These families are blocked without knowing the individual names — nothing a local-first app has reason to grant a window. */
const FORBIDDEN_CAPABILITY_PREFIXES = ["fs:", "shell:", "http:", "opener:"];

const capabilityPermissions = Array.isArray(tauriCapability?.permissions)
  ? tauriCapability.permissions
  : [];
const unexpectedPermissions = capabilityPermissions.filter(
  (permission) => !ALLOWED_CAPABILITY_PERMISSIONS.includes(permission),
);
const forbiddenPermissions = capabilityPermissions.filter((permission) =>
  FORBIDDEN_CAPABILITY_PREFIXES.some((prefix) => String(permission).startsWith(prefix)),
);

if (
  Array.isArray(tauriCapability?.windows) &&
  tauriCapability.windows.length === 1 &&
  tauriCapability.windows[0] === "main" &&
  (capabilityPermissions.includes("core:default") ||
    REQUIRED_CORE_PERMISSIONS.every((permission) =>
      capabilityPermissions.includes(permission),
    )) &&
  unexpectedPermissions.length === 0 &&
  forbiddenPermissions.length === 0
) {
  pass(
    `Tauri capability grants only reviewed permissions to the main local workbench window (${capabilityPermissions.join(", ")})`,
  );
} else {
  fail(
    "src-tauri/capabilities/default.json must not grant broad fs, shell, http, or opener permissions" +
      (unexpectedPermissions.length > 0
        ? `\n[desktop-check]   permissions outside the allowlist: ${unexpectedPermissions.join(", ")} — add them to ALLOWED_CAPABILITY_PERMISSIONS in this script with a reason if they are needed`
        : "") +
      (forbiddenPermissions.length > 0
        ? `\n[desktop-check]   forbidden families: ${forbiddenPermissions.join(", ")}`
        : ""),
  );
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
  tauriRuntimeShim.includes("from '@tauri-apps/api/core'") &&
  tauriRuntimeShim.includes("isTauri()") &&
  tauriRuntimeShim.includes("tauriInvoke(command, args)") &&
  !tauriShim.includes("__TAURI_INTERNALS__")
) {
  pass("Tauri vault bridge uses the supported JavaScript invoke API");
} else {
  fail("src/shared/lib/vault-folder/native-vault/tauri-vault-runtime.ts must use @tauri-apps/api/core invoke/isTauri instead of private Tauri internals");
}

if (
  tauriHandleShim.includes("options.create") &&
  tauriHandleShim.includes("'vault_path_exists'") &&
  tauriHandleShim.includes("if (!exists)") &&
  tauriHandleShim.includes("'write_vault_text_file'")
) {
  pass("Tauri getFileHandle create semantics avoid truncating existing vault files");
} else {
  fail(
    "src/shared/lib/vault-folder/native-vault/tauri-vault-handle.ts must match File System Access create semantics: create missing files without truncating existing ones",
  );
}

if (
  rootEntryPage.includes("isDesktopShell()") &&
  rootEntryPage.includes("restoreAttempted") &&
  rootEntryPage.includes("vault.manifest") &&
  rootEntryPage.includes("DesktopVaultRedirect") &&
  rootEntryPage.includes("<views.FirstRunPage />")
) {
  pass("desktop root entry renders the first-run surface for first launch and stale restored vaults without rendering marketing");
} else {
  fail("src/views/root-entry/ui/RootEntryPage.tsx must render FirstRunPage in the desktop shell when no manifest loaded (first launch or stale restored handle), without rendering the hosted landing page");
}

if (
  docsVaultPage.includes("DesktopVaultWelcome") &&
  docsVaultPage.includes("shouldShowDesktopVaultWelcome") &&
  docsVaultPage.includes("openLocalVault()")
) {
  pass("the app's docs screen shows a vault setup welcome while no folder is open, and opens the native picker only after an explicit press");
} else {
  fail("src/views/docs-vault/ui/DocsVaultPage.tsx must show the vault setup welcome (DesktopVaultWelcome, gated by shouldShowDesktopVaultWelcome) while no folder is open, and call openLocalVault() only from an explicit press");
}

if (
  docsVaultPage.includes("OntologyStarterCta") &&
  docsVaultPage.includes("handleScaffoldOntologyStarter") &&
  docsVaultPage.includes("scopedDocs.length === 0") &&
  docsVaultPage.includes("return `/docs/${suffix ?") &&
  docsVaultPage.includes("router.push(generalDocsHref('README'))") &&
  docsVaultPage.includes("dialog.ontologyStarterDone")
) {
  pass("desktop zero-ontology workspace surfaces the ontology starter and opens the exact README in Document context after creation");
} else {
  fail(
    "src/views/docs-vault/ui/DocsVaultPage.tsx must show the ontology starter for a loaded local vault with zero scoped ontology documents and route the exact README.md into the Document compatibility reader after creation",
  );
}

if (
  ontologyStarterCta.includes("vaultPath") &&
  docsVaultPage.includes("vaultPath={") &&
  docsVaultPage.includes("getTauriVaultRootPath(localVault.handle)") &&
  vaultAgentSetupPanel.includes("getTauriVaultRootPath(localVault.handle)")
) {
  pass("desktop ontology starter passes the selected Tauri vault path to the agent verification prompt");
} else {
  fail(
    "OntologyStarterCta must build its agent verification prompt against the selected Tauri vault path when the installed app knows it",
  );
}

if (
  vaultAgentSetupPanel.includes("useAgentSetupCopy(vaultNameForConfig, vaultRootPath)") &&
  vaultAgentSetupCopySources.includes("buildAgentSetupPacket(vaultName, vaultRootPath)") &&
  vaultAgentSetupCopySources.includes("buildAgentFirstContactProofPacket(vaultName, vaultRootPath)") &&
  vaultAgentSetupCopySources.includes("buildOntologyStarterAgentVerifyPrompt(vaultRootPath)")
) {
  pass("desktop agent setup panel copies path-aware setup and first-contact packets and the verification prompt");
} else {
  fail(
    "VaultAgentSetupPanel must copy setup packets, first-contact proof, and verification prompts against the selected Tauri vault path when available",
  );
}

// Content alone stays green for a component mounted nowhere, so this checks the
// chain: the panel derives an absolute path, AgentSetupSection renders the panel,
// and the Agents MCP tab (McpPage) renders AgentSetupSection.
const agentSetupSection = readText("src/widgets/app-settings-menu/ui/agent-setup/AgentSetupSection.tsx");
const mcpPage = readText("src/views/mcp/ui/McpPage.tsx");

if (
  vaultAgentSetupPanel.includes("getTauriVaultRootPath") &&
  agentSetupSection.includes("import { VaultAgentSetupPanel }") &&
  agentSetupSection.includes("<VaultAgentSetupPanel") &&
  mcpPage.includes("AgentSetupSection") &&
  mcpPage.includes("<AgentSetupSection")
) {
  pass("desktop agent setup surface derives the absolute Tauri vault path and is actually mounted by the MCP destination");
} else {
  fail(
    "the desktop agent setup surface must derive the selected absolute Tauri vault path AND be mounted through AgentSetupSection into the MCP destination — a file that no surface renders is not a shipped contract",
  );
}

if (
  localFsHandleStore.includes("listRecentLocalFsHandles") &&
  localFsHandleStore.includes("forgetRecentLocalFsHandle") &&
  vaultChoiceHook.includes("recentVaults") &&
  vaultSidecars.includes("mcpJsonValid: looksLikeOmotMcpJson(mcpJsonText, { expectedVault: '.' })") &&
  vaultSidecars.includes("codexConfigValid: looksLikeOmotCodexToml(codexConfigText, { expectedVault: '.' })") &&
  vaultChoiceHook.includes("openRecent") &&
  vaultChoiceHook.includes("forgetRecent") &&
  appSettingsMenu.includes("<WorkspacePane") &&
  workspacePane.includes("localVault.recentVaults") &&
  workspacePane.includes("localVault.openRecent(record)") &&
  workspacePane.includes("localVault.forgetRecent(record)") &&
  workspacePane.includes("record.desktopRootPath") &&
  // See, copy and open in Finder the selected vault's absolute path, the value a user pastes into an agent.
  workspacePane.includes("getTauriVaultRootPath(loadedHandle)") &&
  workspacePane.includes("openTauriVaultInFinder(vaultRootPath)") &&
  workspacePane.includes("app-settings-copy-vault-path") &&
  // Recent-vault switching must survive a permission re-request, or the recovery
  // path is cut.
  workspacePane.includes("!isLoaded &&")
) {
  pass("desktop workspace settings expose recent vault recall, absolute vault path copy/reveal, stale-path cleanup, and vault-local agent config validation");
} else {
  fail(
    "the desktop workspace settings group must expose recent vault recall, keep recent switching available during permission reauth, expose the selected vault's absolute path with copy + Finder reveal, and reject stale vault-local agent configs that do not use OATLAS_VAULT=.",
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
  "src/shared/lib/vault-folder/native-vault/tauri-vault-handle.test.ts",
  // The settings sheet carries recent-vault recovery and copy path / Finder, covered by its test.
  "src/widgets/app-settings-menu/ui/AppSettingsMenu.test.tsx",
  "src/views/root-entry/ui/RootEntryPage.test.tsx",
  "scripts/desktop/package-macos-dmg.mjs",
  "scripts/verify-macos/verify-macos-app-launch.mjs",
  "scripts/verify-macos/verify-macos-dmg.mjs",
  "scripts/verify-macos/verify-macos-install-smoke.mjs",
  "scripts/download/check-macos-download-release.mjs",
  "scripts/desktop-release/check-macos-release-secrets.mjs",
  "scripts/desktop-release/check-macos-release-source.mjs",
  "scripts/desktop-release/check-macos-release-tag.mjs",
  "scripts/desktop-release/check-macos-release-github.mjs",
  "scripts/desktop/sign-macos-app.mjs",
  "scripts/desktop-release/notarize-macos-dmg.mjs",
  "src/shared/lib/vault-folder/native-vault/tauri-vault-runtime.ts",
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
