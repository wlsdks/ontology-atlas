#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  evaluateAgentSetupGate,
  evaluateDesktopReleasePreflight,
} from "./lib/release-script-contract.mjs";
import { inspectCodexRunContract } from "./lib/codex-run-contract.mjs";

const root = process.cwd();

// A missing target file is downgraded to a readable failure rather than a raw
// ENOENT stack trace: a crash reads as "no gate" instead of "gate failed", and
// this script — still reading the deleted `VaultToolsMenu.tsx` — sat silently
// dead across several merges (review 2026-07-25). Returning an empty string lets
// the following `.includes(...)` assertion fail naturally, which also names which
// contract broke.
function readText(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    fail(`tracked source file is missing — ${relativePath}. Point this gate at the surface that replaced it, or drop the check.`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8").replace(/\r\n?/g, "\n");
}

/**
 * Reads every `.md` under a directory — for surfaces like the vault where **the
 * file list is not a human's to fix**. Pinning filenames means the gate dies
 * first every time the vault is rebuilt.
 */
function readVaultMarkdown(relativeDir) {
  const absolute = path.join(root, relativeDir);
  if (!fs.existsSync(absolute)) {
    fail(`vault directory is missing — ${relativeDir}.`);
    return [];
  }
  return fs
    .readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => fs.readFileSync(path.join(entry.parentPath ?? entry.path, entry.name), "utf8"));
}

// scripts/verify-macos-app-launch.mjs was decomposed (refactor: cohesive-seam
// module split) into a thin orchestrator plus scripts/lib/verify-macos/*.mjs
// helper modules. The content-based `.includes(...)` gates below still check
// the combined "verify app launch" surface, so read the orchestrator plus
// every extracted module and concatenate them for those checks.
function readVerifyMacosAppLaunchScript() {
  const entry = readText("scripts/verify-macos-app-launch.mjs");
  const libDir = path.join(root, "scripts/lib/verify-macos");
  const libFiles = fs.existsSync(libDir)
    ? fs.readdirSync(libDir).filter((name) => name.endsWith(".mjs")).sort()
    : [];
  const libText = libFiles
    .map((name) => readText(path.join("scripts/lib/verify-macos", name)))
    .join("\n");
  return `${entry}\n${libText}`;
}

function fail(message) {
  console.error(`[desktop-check] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`✓ ${message}`);
}

// Prose documents wrap at 80 columns, so one sentence is split across lines.
// Folding newlines and runs of whitespace into a single space removes the false
// "the gate broke because of wrapping" failure (review — DESKTOP-MACOS.md's
// "separate GitHub\nPages workflow" was broken in exactly that way).
function flow(text) {
  return text.replace(/\s+/g, " ");
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

const nextConfig = readText("next.config.ts");
const tsConfig = JSON.parse(readText("tsconfig.json"));
const pkg = JSON.parse(readText("package.json"));
const enMessages = JSON.parse(readText("messages/en.json"));
const koMessages = JSON.parse(readText("messages/ko.json"));
const rootLayout = readText("app/layout.tsx");
const webManifest = JSON.parse(readText("public/manifest.webmanifest"));
const cargoToml = readText("src-tauri/Cargo.toml");
const desktopDoc = readText("docs/DESKTOP-MACOS.md");
const agentsDoc = readText("AGENTS.md");
const rootReadme = readText("README.md");
const productDesignDoc = readText("docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md");
const developmentChecksDoc = readText("docs/DEVELOPMENT-CHECKS.md");
const agentGraphWorkflowDoc = readText("docs/AGENT-GRAPH-WORKFLOW.md");
const troubleshootingDoc = readText("docs/TROUBLESHOOTING.md");
// Archived when the npm publishing plan was dropped (docs/DECISIONS.md
// 2026-07-27). The gate stays: while this document lives it remains the record
// that blocks a revert which deletes the desktop-app path and keeps only npm.
const publishNpmDoc = readText("docs/archive/PUBLISH-NPM.md");
const demoStoryboardDoc = readText("docs/launch/DEMO-GIF-STORYBOARD.md");
const redditPostsDoc = readText("docs/launch/REDDIT-POSTS.md");
/**
 * The **whole** dogfood vault. Neither filenames nor sentences are pinned.
 *
 * [revised 2026-08-01] This used to pin **the exact sentences of two files**,
 * `capabilities/desktop-app-distribution.md` and `domains/onboarding-ux.md`.
 * Rebuilding the vault from zero against the spec removed both, and the gate went
 * red because of **its own aim**, not a product defect. The vault is a surface
 * agents write in their own words, so sentence pins are unmaintainable in
 * principle — the same meaning in a different sentence means fixing the gate every
 * time.
 *
 * The check's real purpose was "the shared ontology does not preserve the old
 * hosted-workbench framing". That is a question of **whether a concept exists**,
 * not of wording, so it only looks for a node somewhere in the vault carrying the
 * desktop-app installation decision.
 */
const vaultDocTexts = readVaultMarkdown("docs/ontology");
const downloadPage = readText("src/views/download/ui/DownloadPage.tsx");
/**
 * The gateway's top chrome — where the brand name is actually drawn.
 *
 * ⚠️ Before 2026-07-30 this string lived in `DownloadPage.tsx`, so the brand gate
 * below only had to read that one file. When the global nav started sharing four
 * gateway addresses (`/` · `/download` · `/guide` · `/changelog`) it moved down
 * into `widgets/gateway-chrome`, and the gate immediately went red **unable to
 * find a brand that was plainly on screen**. Not a defect — the aim was tied to a
 * file path. The map destination gate broke the same day for the same reason
 * (`map-destination-route.contract.test.ts`).
 *
 * So **both are read together**. Whether the brand sits in the page or in the
 * chrome, being on the visitor's screen is a pass.
 */
const gatewayChrome = readText("src/widgets/gateway-chrome/ui/GatewayNav.tsx");
const gatewaySurfaceSource = `${downloadPage}\n${gatewayChrome}`;
const downloadRoute = readText("app/[locale]/download/page.tsx");
const bottomTabBar = readText("src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx");
const bottomTabBarPolicy = readText("src/widgets/bottom-tab-bar/lib/is-tab-active.ts");
const tauriLib = readText("src-tauri/src/lib.rs");
const tauriShim = readText("src/shared/lib/tauri-vault-fs.ts");
const tauriInfoPlist = readText("src-tauri/Info.plist");
const packageMacosDmgScript = readText("scripts/package-macos-dmg.mjs");
const cleanTauriMacosAppsScript = readText("scripts/clean-tauri-macos-apps.mjs");
const desktopPerformanceScript = readText("scripts/check-desktop-performance.mjs");
const verifyDmgScript = readText("scripts/verify-macos-dmg.mjs");
const verifyAppScript = readVerifyMacosAppLaunchScript();
const verifyInstallScript = readText("scripts/verify-macos-install-smoke.mjs");
const deployMacosAppLocalScript = readText("scripts/deploy-macos-app-local.mjs");
const codexBuildRunScript = readText("script/build_and_run.sh");
const codexRunContract = inspectCodexRunContract(codexBuildRunScript);
const codexEnvironmentConfig = readText(".codex/environments/environment.toml");
const signMacosScript = readText("scripts/sign-macos-app.mjs");
const notarizeMacosDmgScript = readText("scripts/notarize-macos-dmg.mjs");
const buildMacosReleaseArtifactScript = readText("scripts/build-macos-release-artifact.mjs");
const releaseSourceScript = readText("scripts/check-macos-release-source.mjs");
const releaseSecretsScript = readText("scripts/check-macos-release-secrets.mjs");
const notaryCredentialsHelper = readText("scripts/lib/notary-credentials.mjs");
const releaseTagScript = readText("scripts/check-macos-release-tag.mjs");
const releaseSlotScript = readText("scripts/check-macos-release-slot.mjs");
const releaseGithubScript = readText("scripts/check-macos-release-github.mjs");
const releaseRunScript = readText("scripts/watch-macos-release-run.mjs");
const releaseStatusScript = readText("scripts/check-macos-release-status.mjs");
const goalAuditScript = readText("scripts/check-desktop-goal-audit.mjs");
const macosReleaseNamesHelper = readText("scripts/lib/macos-release-names.mjs");
const hostedDownloadSurfaceScript = readText("scripts/check-hosted-download-surface.mjs");
const forbiddenFirebasePackages = ["firebase", "firebase-admin", "firebase-tools"];
const rootEntryPage = readText("src/views/root-entry/ui/RootEntryPage.tsx");
const docsVaultPage = readText("src/views/docs-vault/ui/DocsVaultPage.tsx");
// The docs surface's local-source control is carried by the vault chip menu
// (merged 2026-08-08).
const vaultChipSurface = readText("src/views/docs-vault/ui/parts/DocsVaultVaultChip.tsx");
const topologyEmptyState = readText("src/widgets/topology-controls/ui/TopologyEmptyState.tsx");
// The old `src/widgets/docs-vault/ui/VaultToolsMenu.tsx` was deleted in 5164f68d7
// (docs vault tools merged into the settings menu). The agent setup surface moved
// to the settings sheet's drill-in panel, so the gate looks there.
const vaultAgentSetupPanel = readText("src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx");
const appSettingsMenu = readText("src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx");
// After that merge the old `LocalVaultPicker` was an orphan no surface rendered
// (#72); its features (recent-vault recovery, copy path, open in Finder) were
// restored into the settings sheet's workspace group. The gate looks at the live
// one.
const ontologyStarterCta = readText("src/features/docs-vault-local/ui/OntologyStarterCta.tsx");
const localFsHandleStore = readText("src/entities/local-fs-handle/api/store.ts");
const localVaultHook = readText("src/entities/vault-session/model/use-local-vault.ts");
const releaseWorkflow = readText(".github/workflows/release-macos.yml");
const pagesDeployWorkflow = readText(".github/workflows/deploy-pages.yml");
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
const cargoPackageName = cargoToml.match(/\[package\][\s\S]*?\nname\s*=\s*"([^"]+)"/)?.[1];
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

if (tsConfig?.exclude?.includes("src-tauri/target")) {
  pass("TypeScript excludes Tauri target artifacts from Next.js type checks");
} else {
  fail(
    "tsconfig.json must exclude src-tauri/target so Tauri codegen artifacts cannot break Next.js type checks",
  );
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

const agentSetupGateContract = evaluateAgentSetupGate(
  pkg.scripts?.["dogfood:agent-setup-gate"],
);
if (pkg.scripts?.["cli:mcp-verify"] && agentSetupGateContract.ok) {
  pass("CLI/MCP setup gate executes fallbacks while keeping advisory readiness in JSON");
} else {
  fail(
    "package.json must expose cli:mcp-verify and an automation-safe dogfood:agent-setup-gate: " +
      agentSetupGateContract.errors.join("; "),
  );
}

if (
  agentGraphWorkflowDoc.includes("https://developers.openai.com/codex/mcp") &&
  agentGraphWorkflowDoc.includes("https://code.claude.com/docs/en/mcp") &&
  // This gate checks **where the boundary is**: Atlas does not own the agent loop,
  // the model, or the keys, and does not host a window — it hands off to the user's
  // own terminal. (That morning's "Atlas hosts a terminal" wording was reversed by
  // owner decision; the history is kept in AGENT-GRAPH-WORKFLOW.md's reversal
  // section.)
  agentGraphWorkflowDoc.includes("does not reimplement Claude Code, Codex, or Cursor chat") &&
  agentGraphWorkflowDoc.includes("Atlas does not host a terminal; it hands off to yours") &&
  agentGraphWorkflowDoc.includes("Nothing runs on its own") &&
  agentGraphWorkflowDoc.includes("codex mcp list") &&
  agentGraphWorkflowDoc.includes("claude mcp list")
) {
  pass("agent workflow guide cites official Claude Code and Codex MCP client contracts");
} else {
  fail(
    "docs/AGENT-GRAPH-WORKFLOW.md must cite official Claude Code and Codex MCP docs and state that Ontology Atlas connects agents through MCP setup, not embedded chat",
  );
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

if (
  pkg.scripts?.["desktop:perf"] === "node scripts/check-desktop-performance.mjs" &&
  desktopPerformanceScript.includes("DESKTOP_PERFORMANCE_BUDGETS") &&
  desktopPerformanceScript.includes("maxStaticAssetBytes") &&
  desktopPerformanceScript.includes("nextStaticBytes") &&
  desktopPerformanceScript.includes("DESKTOP_PERFORMANCE_EVIDENCE_BOUNDARY") &&
  desktopPerformanceScript.includes("desktop:verify-app") &&
  desktopPerformanceScript.includes("cli:mcp-verify") &&
  pkg.scripts?.["desktop:release-preflight"]?.includes("pnpm desktop:perf -- --require-app")
) {
  pass("desktop performance gate keeps static asset hard limits, report-only artifact totals, and explicit runtime/MCP evidence boundaries");
} else {
  fail(
    "package.json must expose desktop:perf and include `pnpm desktop:perf -- --require-app` in desktop:release-preflight; the script must hard-gate Next static/chunk sizes while reporting total artifact sizes and naming desktop:verify-app plus cli:mcp-verify as separate startup evidence",
  );
}

if (
  pkg.scripts?.["desktop:verify-app"] === "node scripts/verify-macos-app-launch.mjs" &&
  verifyAppScript.includes('requireWebviewContent: argv.includes("--require-webview-content") || !argv.includes("--open-app")') &&
  verifyAppScript.includes("--require-accessibility-text") &&
  verifyAppScript.includes("validateAccessibilityText") &&
  verifyAppScript.includes("createVerifyLock") &&
  verifyAppScript.includes("verifyLockPath")
) {
  pass("desktop app launch verifier requires packaged WebView content, optional Accessibility text, and a single-run lock after .app builds");
} else {
  fail(
    "package.json must expose desktop:verify-app as node scripts/verify-macos-app-launch.mjs, make direct executable verification require packaged WebView content by default, support --require-accessibility-text for LaunchServices app-content proof, and lock concurrent app verification runs before --kill-existing",
  );
}


if (
  verifyAppScript.includes("export function buildWebviewEvidencePayload") &&
  verifyAppScript.includes("composerBlockingProof") &&
  verifyAppScript.includes("topology-add-concept-composer-blocking") &&
  verifyAppScript.includes("treat-add-concept-composer-as-current-work-surface") &&
  verifyAppScript.includes("dismissedSurfaceKinds") &&
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
    "scripts/verify-macos-app-launch.mjs must enrich --webview-evidence with a composerBlockingProof object plus saved/unavailable screenshot handoff so installed-app Add Concept blocking proof is machine-readable for agents",
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
    "desktop install smoke must verify copied DMG apps through scripts/verify-macos-app-launch.mjs and execute Contents/MacOS/ontology-atlas-mcp through verifyMcpBinary before removing the temporary install",
  );
}

if (
  pkg.scripts?.["test:desktop:bridge"] ===
  "pnpm exec vitest run src/shared/lib/tauri-vault-fs.test.ts src/entities/local-fs-handle/api/store.test.ts src/entities/vault-session/model/agent-config-status.test.ts && cargo test --manifest-path src-tauri/Cargo.toml"
) {
  pass("desktop native vault bridge tests cover WebView handle shim, agent config validation, and Rust path guard");
} else {
  fail("package.json must expose test:desktop:bridge for the Tauri vault bridge contract");
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
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/check-macos-release-github.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/check-macos-release-source.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/check-macos-release-status.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/watch-macos-release-run.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/generate-download-release-facts.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/lib/macos-checksum.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/lib/macos-release-names.test.mjs") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/lib/release-script-contract.test.mjs")
) {
  pass("desktop checker tests cover the GitHub release operator, source, run-watch, checksum filename, and completion gates");
} else {
  fail("package.json test:desktop:check must include scripts/check-macos-release-github.test.mjs, scripts/check-macos-release-source.test.mjs, scripts/watch-macos-release-run.test.mjs, scripts/check-macos-release-status.test.mjs, scripts/generate-download-release-facts.test.mjs, scripts/lib/macos-checksum.test.mjs, and scripts/lib/macos-release-names.test.mjs so the macOS release operator, source, run-watch, checksum filename, completion, and app-vs-asset naming gates stay covered");
}

// This suite owns 52 loopback-server call sites. Node 24 otherwise uses all 12
// available cores on this machine, and the resulting subprocess connection burst
// was observed failing as EADDRNOTAVAIL across unrelated server-backed tests.
// Four workers completed the same 387-test suite in 35.4 seconds without losing
// coverage, so keep the resource bound in the command the release preflight runs.
if (pkg.scripts?.["test:desktop:check"]?.startsWith("node --test --test-concurrency=4 ")) {
  pass("desktop checker tests bound loopback-heavy Node test concurrency to 4");
} else {
  fail("package.json test:desktop:check must run node --test with --test-concurrency=4 so loopback-heavy release tests do not exhaust local connections");
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

if (
  pkg.scripts?.["desktop:verify-dmg"] === "node scripts/verify-macos-dmg.mjs" &&
  verifyDmgScript.includes("parseSha256Checksum") &&
  verifyDmgScript.includes("expectedFilename: path.basename(dmgPath)")
) {
  pass("desktop DMG verifier is available after packaging and checks the checksum filename");
} else {
  fail("package.json must expose desktop:verify-dmg as node scripts/verify-macos-dmg.mjs, and scripts/verify-macos-dmg.mjs must verify the .sha256 line names the DMG basename");
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
    "scripts/package-macos-dmg.mjs must source appBundleName, name the DMG with releaseAssetName_version_arch, use the appName volume label, and write a checksum for the DMG basename",
  );
}

if (
  pkg.scripts?.["desktop:verify-install"] ===
  "node scripts/verify-macos-install-smoke.mjs" &&
  verifyInstallScript.includes("parseSha256Checksum") &&
  verifyInstallScript.includes("expectedFilename: path.basename(dmgPath)")
) {
  pass("desktop install verifier checks the checksum filename, copies the DMG app, and launch-smokes the installed copy");
} else {
  fail(
    "package.json must expose desktop:verify-install as node scripts/verify-macos-install-smoke.mjs, and scripts/verify-macos-install-smoke.mjs must verify the .sha256 line names the DMG basename",
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
  verifyDmgScript.includes('const requireSigned = process.argv.includes("--require-signed") || requireNotarized') &&
  verifyDmgScript.includes('"codesign"') &&
  verifyDmgScript.includes('"--deep"') &&
  verifyDmgScript.includes('"--strict"')
) {
  pass("desktop release DMG verifier treats notarization as requiring strict app signing");
} else {
  fail(
    "scripts/verify-macos-dmg.mjs must make --require-notarized imply strict codesign --verify --deep --strict for the contained app",
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
  hostedDownloadSurfaceScript.includes("/ko/download/") &&
  hostedDownloadSurfaceScript.includes("https://github.com/wlsdks/ontology-atlas/releases") &&
  // Copying the expected wording by hand into the verifier makes the gate go
  // quietly red on every copy change — it did: five consecutive Pages deployments
  // succeeded while verify failed. The source of truth is the shipped message
  // catalogue.
  hostedDownloadSurfaceScript.includes('readFileSync(path.join(REPO_ROOT, "messages", "ko.json")') &&
  // In either release-facts state, published or not, the visitor gets something to
  // decide on — a file if there is one to download, otherwise the browser map that
  // works today. The verifier treats both branches as the same deployment contract.
  //
  // 2026-08-19: the old needle pair (Windows unsigned warning, Windows download)
  // left the page when the install section was deleted. The hero trust line is
  // promoted to a required needle because it is **the last place the honesty facts
  // live** — if that one line drops out of a deployment, signing, notarisation, and
  // "nothing is sent to a server" appear nowhere on the page.
  hostedDownloadSurfaceScript.includes("downloadCopy.trustLine") &&
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
    "package.json must expose desktop:verify-hosted, test:desktop:check must cover it, and scripts/check-hosted-download-surface.mjs must read expected download copy from messages/ko.json (not hand-copied strings), require the hosted /ko/download/ route with the hero trust line, both release-state CTAs, and a stable GitHub Releases CTA, reject releases/latest, and print the deploy-pages recovery path",
  );
}

if (
  /release:\s*\n\s+types:\s*\[published\]/.test(pagesDeployWorkflow) &&
  /push:\s*\n\s+branches:\s*\[main\]/.test(pagesDeployWorkflow) &&
  /workflow_dispatch:/.test(pagesDeployWorkflow) &&
  /PAGES_BASE_URL:\s*https:\/\/wlsdks\.github\.io\/ontology-atlas/.test(pagesDeployWorkflow) &&
  /NEXT_PUBLIC_BASE_PATH:\s*\/ontology-atlas/.test(pagesDeployWorkflow) &&
  /uses:\s*actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38\s+# v6/.test(pagesDeployWorkflow) &&
  /node-version:\s*24/.test(pagesDeployWorkflow) &&
  /corepack enable/.test(pagesDeployWorkflow) &&
  /corepack prepare pnpm@10\.18\.0 --activate/.test(pagesDeployWorkflow) &&
  /pnpm --version/.test(pagesDeployWorkflow) &&
  !/uses:\s*pnpm\/action-setup@/.test(pagesDeployWorkflow) &&
  /pnpm build/.test(pagesDeployWorkflow) &&
  /actions\/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa\s+# v3/.test(pagesDeployWorkflow) &&
  /actions\/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e\s+# v4/.test(pagesDeployWorkflow) &&
  /pnpm desktop:verify-hosted -- --base-url="\$PAGES_BASE_URL"/.test(pagesDeployWorkflow) &&
  /pnpm desktop:verify-download -- --tag="\$PUBLISHED_RELEASE_TAG"/.test(pagesDeployWorkflow) &&
  !/FIREBASE|firebase-tools|deploy --only hosting/.test(pagesDeployWorkflow)
) {
  pass("GitHub Pages workflow builds the base-path static export, deploys the sole hosted download site on push/release, and verifies the hosted download route");
} else {
  fail(
    ".github/workflows/deploy-pages.yml must deploy GitHub Pages on push to main / release publication / manual dispatch, build with the /ontology-atlas base path, use Node 24 with Corepack pnpm@10.18.0 without pnpm/action-setup, upload+deploy the Pages artifact, verify the hosted download route at the Pages URL, verify published release assets on release, and never depend on Firebase",
  );
}

if (
  downloadReleaseVerifier.includes("releaseVersionFromTag") &&
  downloadReleaseVerifier.includes("do not match the tag version") &&
  downloadReleaseVerifier.includes("allowDraft") &&
  downloadReleaseVerifier.includes("per_page=100") &&
  // The fallback finds the draft **by tag**, and does not filter again on
  // prerelease status — a caller who named the tag has already said what it wants,
  // and filtering once more makes an RC draft impossible to verify (measured on
  // v1.0.0-rc.1, 2026-07-27).
  downloadReleaseVerifier.includes("export function isRequestedDraft") &&
  downloadReleaseVerifier.includes("release?.tag_name === tag && release?.draft === true") &&
  downloadReleaseVerifier.includes("if (!options.tag && release.prerelease && !options.allowPrerelease)") &&
  downloadReleaseVerifier.includes("unsupported macOS DMG asset names") &&
  downloadReleaseVerifier.includes("function isAnyDmgAsset") &&
  downloadReleaseVerifier.includes('asset.name.endsWith(".dmg")') &&
  downloadReleaseVerifier.includes("REQUIRED_MACOS_ARCHES = [\"aarch64\", \"x64\"]") &&
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
    "scripts/check-macos-download-release.mjs must require explicit one-per-architecture aarch64 and x64 ontology-atlas DMGs plus exactly one Windows x64 setup executable, reject unsupported or duplicate DMGs, verify artifact filename versions match the release tag, re-download macOS and Windows bytes to match their checksums, and let --allow-draft find tagged draft pre-publish assets",
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
 * This order is a contract, not a preference. **DMG signing must sit between
 * packaging and notarisation.**
 *
 * Measured on v1.0.0-rc.1, 2026-07-27: signing only the `.app` and wrapping it in
 * a DMG passes notarisation, but Gatekeeper rejects it —
 *
 *   [desktop-notarize] notarized and stapled ...aarch64.dmg
 *   spctl --assess --type open ... : rejected
 *   source=no usable signature
 *
 * The notarisation ticket attached but the wrapper had no signature. Signing
 * **after** notarisation invalidates the staple, so there is exactly one slot.
 *
 * **Repacking the updater archive (`desktop:repack-updater`) also has exactly one
 * slot — immediately after app signing.** `tauri build` emits `.app.tar.gz`
 * alongside the `.app`, and this repository code-signs separately afterwards. So
 * the archive carries the **pre-signature app**, and only users who updated meet
 * "the app is damaged" (users who took the DMG are fine). Measured 2026-07-28 on a
 * clean checkout:
 *
 *   tar xzf "Ontology Atlas.app.tar.gz" && codesign --verify --deep --strict …
 *     → code has no resources but signature indicates they must be present
 *
 * Repacking after signing and re-signing with minisign yields `valid on disk`.
 */
const RELEASE_ARTIFACT_COMMAND = "node scripts/build-macos-release-artifact.mjs";
const RELEASE_ARTIFACT_STEP_MARKERS = [
  'args: ["desktop:release-secrets"]',
  'args: ["build"]',
  'args: ["desktop:smoke"]',
  'args: ["desktop:build:app"]',
  'args: ["desktop:sign"]',
  'args: ["desktop:repack-updater"]',
  'args: ["scripts/package-macos-dmg.mjs"]',
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
  pkg.scripts?.["desktop:goal-audit"] === "node scripts/check-desktop-goal-audit.mjs" &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/check-desktop-goal-audit.test.mjs") &&
  goalAuditScript.includes("--pr=NUMBER is required") &&
  goalAuditScript.includes("desktop:release-preflight") &&
  // Since #617 (Firebase Hosting removed, GitHub Pages as the single host) the
  // hosting surface is deliberately separated from the macOS release audit — Pages
  // is deployed by deploy-pages.yml and verified by `desktop:verify-hosted`. So
  // goal-audit calls release-status without hosting flags, and the hosting verifier
  // must exist separately; with neither, hosting would be behind no gate at all.
  !goalAuditScript.includes("--include-hosted-surface") &&
  releaseStatusScript.includes("use pnpm desktop:verify-hosted to check the deployed website") &&
  pkg.scripts?.["desktop:verify-hosted"] === "node scripts/check-hosted-download-surface.mjs" &&
  goalAuditScript.includes(".tmp/desktop-goal-status.json") &&
  goalAuditScript.includes(".tmp/desktop-goal-status.md") &&
  goalAuditScript.includes("--json-file=${options.jsonFile}") &&
  goalAuditScript.includes("--markdown-file=${options.markdownFile}") &&
  readText(".gitignore").includes(".tmp/")
) {
  pass("desktop goal audit requires PR and tag evidence before chaining local preflight with public release and hosted download blockers while writing default JSON and markdown evidence");
} else {
  fail(
    "package.json must expose desktop:goal-audit through scripts/check-desktop-goal-audit.mjs, cover it in test:desktop:check, require --pr and --tag before preflight, then run desktop:release-preflight and desktop:release-status while writing default .tmp JSON and markdown evidence ignored by git; the hosted website stays out of the app release audit (#617) and must keep its own desktop:verify-hosted gate",
  );
}

// root-first-open (2026-07) retired the marketing `src/views/landing`
// surface — `/` now renders the topology map directly (no vault-not-selected
// promo/download-only landing), and its hero copy moved into `/download`'s
// intro section. Local vault work on the web root (FirstRunStarterModule,
// inside HomePage's INDEX panel) calls `useLocalVault().open()` directly and
// deliberately bypasses `/docs` — so this check only still asserts that
// `/docs` itself keeps its OWN local-source tab desktop-gated, which this
// change did not touch.
if (
  !downloadPage.includes('/docs/?intent=local') &&
  docsVaultPage.includes("shouldHonorLocalIntent(intent, isDesktopRuntime)") &&
  docsVaultPage.includes("isDocsVaultLocalSourceDisabled") &&
  // The old `desktopOnlyTooltip` key was merged into
  // `vaultStatus.unsupportedTooltip` in #435. The visual signal is `disabled`; a
  // screen reader hears *why* it is locked via aria-describedby — both are
  // required.
  //
  // ⚠️ **What is guarded is "it says why it is locked", not "it is in that spot"**
  // (2026-08-08). This line used to pin **one id string**,
  // `docs-vault-local-unsupported-hint`. When that control moved from the right-hand
  // radio into the vault chip menu (two places saying the same fact folded into
  // one), the gate went red — while the explanation had actually *improved*, into a
  // **visible sentence + aria-describedby**. Pinning the container turns a
  // legitimate improvement red, and the next person reverts the improvement instead
  // of the gate (see .claude/rules/design-gates.md).
  // So the requirement is a **pair**, not a string: the reason it is locked
  // (`localSourceDisabled`) and the wiring that reads that reason out
  // (`aria-describedby` + the reason string). Which piece of UI carries it is not
  // asked.
  docsVaultPage.includes("vaultStatus.unsupportedTooltip") &&
  docsVaultPage.includes("localSourceDisabled") &&
  vaultChipSurface.includes("aria-describedby") &&
  vaultChipSurface.includes("localDisabledReason")
) {
  pass("the hosted download page does not route into the browser workbench, and /docs's own local-source tab stays desktop-only");
} else {
  fail(
    "the hosted download page must stay promo/download-first, and src/views/docs-vault/ui/DocsVaultPage.tsx must only honor ?intent=local / local vault work in the Tauri desktop runtime",
  );
}

/*
 * This block used to be a **sentence pin** — six exact strings such as
 * `openLabel === "Open vault folder"`. It was the one block that had not learned
 * the lesson the README block above already had ("checking table markup literally
 * went wholly stale on one rewrite").
 *
 * The bill came due on 2026-08-03: when the PO council retired the word
 * "vault" from the screen (see the decision ledger) this pin went red
 * immediately. **The copy got better and the gate blocked it** — the failure
 * direction .claude/rules/documentation.md forbids:
 *
 *   "if the tool's behaviour changes and the doc does not, the sentence is
 *    unchanged so it **passes**; rewrite the doc in better words and it turns
 *    **red**."
 *
 * So it checks **facts**, not sentences. The one contract this gate really keeps:
 * **guidance for local-folder work points at the installed app, and browser File
 * System Access is not advertised as a capability.** Which words do that is the
 * copy's business.
 */
const desktopRoutingCopy = [
  enMessages.searchWidgets.shortcuts.rows.localVault,
  koMessages.searchWidgets.shortcuts.rows.localVault,
  enMessages.docsVault.vaultStatus.unsupportedTooltip,
  koMessages.docsVault.vaultStatus.unsupportedTooltip,
  enMessages.featuresMisc.localVaultPicker.unsupported,
  koMessages.featuresMisc.localVaultPicker.unsupported,
];
// Does each locale point at "the installed app" in its own words?
const namesInstalledApp = (text, locale) =>
  locale === "ko"
    ? /설치(된|해)/.test(text) && /앱/.test(text)
    : /installed|install the/i.test(text) && /app/i.test(text);
// Browser FSA must not be **advertised as a capability**. Naming it in an honest
// degradation notice is fine, so only "you can do X" sentences are checked.
const advertisesBrowserFsa = desktopRoutingCopy.some(
  (text) => text.includes("File System Access") && !/desktop|설치/i.test(text),
);
/**
 * ⚠️ **Three different things were bound to one rule** (council, 2026-08-08).
 *
 * The six strings above are of two kinds:
 *
 * - **Two degradation notices** (`unsupportedTooltip` ·
 *   `localVaultPicker.unsupported`) — they tell a browser without FSA "not here,
 *   but it works in the app". Pointing at the installed app is correct; unchanged.
 * - **One shortcut description** (`shortcuts.rows.localVault`) — it says what the
 *   palette's shortcut opens. **That shortcut works on the web too**: the `/docs`
 *   local source it turns on runs in the browser when FSA is supported, and only
 *   when it is not does the chip go inactive (`isDocsVaultLocalSourceDisabled`).
 *
 * The gate required all three to name the installed app, and that requirement was
 * **making the shortcut description a lie** — what .claude/rules/surfaces.md calls
 * writing that something does not work when it does. The same failure direction
 * this file's own preamble warns about: *"rewrite it in better words and it turns
 * red."*
 *
 * So the requirement now **matches the nature of each place**. The shortcut
 * description loses no coverage; only its requirement changes — it must name **what
 * it opens** (a folder) rather than a runtime. Whether FSA is advertised as a
 * capability is still checked across **all six** strings.
 */
const namesTheFolder = (text) => /folder/i.test(text) || /폴더/.test(text);

if (
  namesTheFolder(enMessages.searchWidgets.shortcuts.rows.localVault) &&
  namesTheFolder(koMessages.searchWidgets.shortcuts.rows.localVault) &&
  namesInstalledApp(enMessages.docsVault.vaultStatus.unsupportedTooltip, "en") &&
  namesInstalledApp(koMessages.docsVault.vaultStatus.unsupportedTooltip, "ko") &&
  namesInstalledApp(enMessages.featuresMisc.localVaultPicker.unsupported, "en") &&
  namesInstalledApp(koMessages.featuresMisc.localVaultPicker.unsupported, "ko") &&
  !advertisesBrowserFsa &&
  // An open label must name **what it opens**. Which word it uses is not pinned.
  /folder/i.test(enMessages.featuresMisc.localVaultPicker.openLabel) &&
  /폴더/.test(koMessages.featuresMisc.localVaultPicker.openLabel)
) {
  pass("the demotion notice names the installed app and the shortcut copy names the folder it opens — neither advertises FSA as a capability");
} else {
  fail(
    "the demotion notice must point at the installed app, the shortcut copy must name what it opens (the folder), and neither may advertise browser File System Access as a capability",
  );
}

// This block once checked the README's identity *table markup* literally. One
// README rewrite made it wholly stale, and a gate crash hid that from everyone.
// It now checks **facts** rather than table formatting: brand, hosting URL,
// desktop bridge, opening a local folder in the browser, and no steering toward
// retired surfaces.
const readmeFlow = flow(rootReadme);
if (
  readmeFlow.includes("# Ontology Atlas") &&
  readmeFlow.includes("https://wlsdks.github.io/ontology-atlas/") &&
  readmeFlow.includes("Tauri macOS shell") &&
  readmeFlow.includes("The desktop app uses a Tauri bridge to your selected folder") &&
  readmeFlow.includes("hosted web app can open a local folder through the File System Access API") &&
  readmeFlow.includes("github.com/wlsdks/ontology-atlas/releases") &&
  // Users must not be sent to retired or relocated surfaces. The `/ontology/edit`
  // builder was retired 2026-07-24, and the old wording that funnelled local vault
  // work to `localhost:3000/docs` is forbidden too.
  !rootReadme.includes("/ontology/edit") &&
  !rootReadme.includes("| **Web workbench** |") &&
  !rootReadme.includes("Open `http://localhost:3000`, go to `/docs`")
) {
  pass("root README states the brand, hosted demo, desktop Tauri bridge, and browser local-folder path without routing users to retired surfaces");
} else {
  fail(
    "README.md must name the Ontology Atlas brand, the hosted demo URL, the desktop Tauri vault bridge, and the browser local-folder open path — and must not link the retired /ontology/edit builder or the old localhost /docs local-vault flow",
  );
}

/*
 * Human prose is not a runtime contract. This used to pin sentences across
 * FEATURES, PRODUCT-DIRECTION, DESKTOP, and ARCHITECTURE, so correcting the
 * retired root-map story made CI red while the shipped branch was right.
 * Derive the routing fact from the component that owns it instead; docs prose
 * remains protected by generated-surface and referential-integrity checks.
 */
if (
  rootEntryPage.includes("if (vault.manifest) return <HomePage />") &&
  rootEntryPage.includes("if (isDesktopShell())") &&
  rootEntryPage.includes("return vault.restoreAttempted ? <FirstRunPage /> : <DesktopVaultRedirect />") &&
  rootEntryPage.includes("return <GatewayLandingPage />")
) {
  pass("root entry derives the loaded-vault map, desktop first run, and hosted gateway from runtime state");
} else {
  fail(
    "src/views/root-entry/ui/RootEntryPage.tsx must route a loaded vault to HomePage, an empty desktop shell to FirstRunPage, and an empty hosted web session to GatewayLandingPage",
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
  demoStoryboardDoc.includes("Installed macOS desktop app") &&
  // 2026-07-28: #736 rewrote this paragraph when it removed the npm premise. The
  // requirement is the fact that the app reads and writes the same `.md` through a
  // native bridge, plus the split where the web is the intro and download entry —
  // moved to the new sentence that says it.
  redditPostsDoc.includes("reads/writes the same `.md` files through a local native") &&
  redditPostsDoc.includes("hosted website is the product intro and download")
) {
  pass("workflow, troubleshooting, publish, and launch docs route writable vault work through the desktop app");
} else {
  fail(
    "User-facing workflow/troubleshooting/publish/launch docs must not steer local vault work through the hosted web workbench",
  );
}

// Does a single node mention both the macOS/desktop app and download/install?
// Only the concept's existence is checked — which file and which sentence is the
// vault's business.
if (
  vaultDocTexts.some(
    (text) => /macos|맥\s*os|desktop|데스크톱/i.test(text) && /download|install|다운로드|설치/i.test(text),
  )
) {
  pass("dogfood ontology carries the desktop-app install decision");
} else {
  fail(
    "docs/ontology must carry a node for the desktop-app install decision so the shared ontology does not fall back to the old hosted-workbench framing",
  );
}

if (
  // The hub is the map: `/ontology`'s tree hub (OntologyViewPage) was retired and
  // both `/` and `/ontology` converged on this empty state, so the check converges
  // too.
  topologyEmptyState.includes("isTauriVaultRuntime") &&
  // Measure the destination, **not the quote character** (2026-08-03). This used
  // to pin double quotes, so a refactor that wrote the same link with single quotes
  // turned the gate red — the destination was unchanged and only the character
  // differed. A gate that guards formatting instead of the spec makes the next
  // person revert the formatting rather than fix the gate.
  /["']\/download\/["']/.test(topologyEmptyState) &&
  /["']\/docs\/\?intent=local["']/.test(topologyEmptyState) &&
  /Install the desktop app/i.test(enMessages.topology?.empty?.bodyNoProjectsDownload ?? "")
) {
  pass("the topology empty state routes hosted users to the app download while preserving desktop vault picking");
} else {
  fail(
    "The hosted static topology empty state must route writable local work to /download/, while Tauri desktop keeps /docs/?intent=local",
  );
}

// What the download page may claim is decided by one thing: whether a release is
// actually published. Size, checksum, and waiting copy each used to carry their
// own placeholder, so six places went stale independently and a visitor could not
// tell whether installing worked today. The gate now keeps two properties:
// ① release facts come only from the generated module ② internal pipeline state
// (PR review, tag consistency, CI check commands) is absent from the public
// surface — that belongs to the release runbook (docs/DESKTOP-MACOS.md).
const downloadGeneratedRelease = readText(
  "src/views/download/model/macos-release.generated.ts",
);
const internalPipelineLeaks = [
  "releaseStatusTitle",
  "releaseStatusPr",
  "releaseStatusSecrets",
  "desktop:release-status",
  "NEXT_PUBLIC_OATLAS_FIRST_RELEASE_PENDING",
];

if (
  downloadPage.includes("isMacosReleasePublished") &&
  downloadPage.includes("macosAssetFor") &&
  downloadPage.includes("formatAssetSize") &&
  // 2026-08-19: the four old markers (`download-platform-macos` ·
  // `download-platform-windows` · `download-macos-pending` ·
  // `buildDmgName('aarch64')`) all lived inside the install section, and the owner
  // removed that section entirely (*"the last section is probably unnecessary, it is all at the top
  // anyway"* — the last section is probably unnecessary, it is all at the top
  // anyway). The remaining property is the same — **the page reads release facts
  // from the generated module** — and today the hero carries it: it really reads the
  // Windows asset (`windowsAsset`) and names the in-development version honestly
  // when nothing is published (`resolveDisplayReleaseTag`).
  downloadPage.includes("windowsAsset") &&
  downloadPage.includes("resolveDisplayReleaseTag") &&
  downloadPage.includes("gateway-hero-windows") &&
  internalPipelineLeaks.every(
    (marker) => !downloadPage.includes(marker) && !downloadRoute.includes(marker),
  ) &&
  downloadGeneratedRelease.includes("Generated by `pnpm download:release-facts`") &&
  /published:\s*(true|false)/.test(downloadGeneratedRelease) &&
  // Before publication only one state remains, "not yet", instead of placeholders.
  /has not been published yet/.test(enMessages.download?.macosPendingBody ?? "") &&
  /게시 전/.test(koMessages.download?.macosPendingBody ?? "") &&
  !enMessages.download?.checksumValuePending &&
  !enMessages.download?.factSizeValuePending &&
  !enMessages.download?.releaseAvailabilityNote &&
  !enMessages.download?.releaseStatusTitle &&
  !koMessages.download?.releaseStatusTitle &&
  // Windows is not silent — the page says it is not out yet, not that it is missing.
  //
  // Revised 2026-07-29: the gateway redesign replaced the "coming soon" badge and
  // card with a one-line status (`platformStatus`), a tracking link
  // (`windowsTrackCta`), and a policy sentence stating the criteria
  // (`windowsPolicy`). The check is on the **contract** the three make together —
  // where it is, where it goes, why it is not out — not on the badge **form**.
  /Windows/.test(enMessages.download?.platformStatus ?? "") &&
  /Windows/.test(koMessages.download?.platformStatus ?? "") &&
  (enMessages.download?.windowsTrackCta ?? "").length > 0 &&
  (koMessages.download?.windowsTrackCta ?? "").length > 0 &&
  /not code-signed/.test(enMessages.download?.windowsUnsignedWarning ?? "") &&
  /코드 서명되지 않았습니다/.test(koMessages.download?.windowsUnsignedWarning ?? "") &&
  /SmartScreen/.test(enMessages.download?.windowsUnsignedWarning ?? "") &&
  /SmartScreen/.test(koMessages.download?.windowsUnsignedWarning ?? "") &&
  // Signing status is written as **what is true now** — no future tense ("the gate
  // will require") and no past tense that is not yet fact.
  //
  // Revised 2026-07-27: this gate was written in the unsigned era and **required**
  // `trustPolicy` to be either "not signed or notarized" or "only after Developer ID
  // signing". When the Developer ID certificate was issued that day
  // (`docs/DECISIONS.md`) the release moved onto the signed path, but the
  // requirement forced the page to keep showing the unsigned notice — the gate was
  // holding a falsehood in place. Instead of pinning specific wording, it now
  // decides on **whether the claim matches the actual release chain**.
  !/Release gate requires/.test(enMessages.download?.proofSigned ?? "") &&
  !/게이트가/.test(koMessages.download?.proofSigned ?? "") &&
  /\{file\}/.test(enMessages.download?.trustVerifyCommand ?? "") &&
  // Claiming signing requires the release asset chain to actually sign, notarise,
  // and verify.
  (!/Developer ID/.test(enMessages.download?.proofSigned ?? "") ||
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
    "the /download surface must derive size/checksum/download links from src/views/download/model/macos-release.generated.ts, say plainly that macOS is unpublished instead of showing placeholders, show a Windows in-preparation card, state signing/notarization as facts about published builds, and carry no operator-only release-pipeline status",
  );
}

// Since root-first-open (2026-07), `/` is the map hub itself rather than a
// marketing gateway — with no vault it still renders the dogfood sample plus the
// first-run starter. Hiding this bar below `lg` would leave no global nav at all
// (the desktop nav rail is `lg:flex`), so the only thing hidden now is
// `/download`, which has its own header.
if (
  bottomTabBar.includes("shouldHideBottomTabBar(pathname") &&
  /normalized === ['"]\/download['"]/.test(bottomTabBarPolicy) &&
  /root-first-open/.test(bottomTabBarPolicy) &&
  !/normalized === ['"]\/['"] &&\s*!hasLoadedVault/.test(bottomTabBarPolicy)
) {
  pass("mobile bottom navigation hides only on the standalone download page, keeping global nav on the root map");
} else {
  fail(
    "BottomTabBar must hide on /download only — root-first-open made `/` the topology hub, and hiding the bar there strands <lg first-run visitors with no global nav",
  );
}

if (
  (releaseWorkflow.match(/uses:\s*actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803\s+# v6/g)?.length ?? 0) >= 4 &&
  (releaseWorkflow.match(/uses:\s*actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38\s+# v6/g)?.length ?? 0) >= 4 &&
  (releaseWorkflow.match(/corepack enable/g)?.length ?? 0) >= 4 &&
  (releaseWorkflow.match(/corepack prepare pnpm@10\.18\.0 --activate/g)?.length ?? 0) >= 4 &&
  (releaseWorkflow.match(/pnpm --version/g)?.length ?? 0) >= 4 &&
  /uses:\s*actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a\s+# v7/.test(releaseWorkflow) &&
  /uses:\s*actions\/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131\s+# v7/.test(releaseWorkflow) &&
  /uses:\s*softprops\/action-gh-release@c12583777ecdfd3be55c69cf75464299dc01057e\s+# v3/.test(releaseWorkflow) &&
  !/uses:\s*pnpm\/action-setup@/.test(releaseWorkflow)
) {
  pass("macOS release workflow uses Node 24 action majors and Corepack pnpm without pnpm/action-setup");
} else {
  fail(
    ".github/workflows/release-macos.yml must use Node 24-compatible action majors plus Corepack pnpm@10.18.0 without pnpm/action-setup",
  );
}

const admitReleaseJob = workflowJob(releaseWorkflow, "admit-release");
const buildMacosJob = workflowJob(releaseWorkflow, "build-macos");
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
  [buildMacosJob, buildWindowsJob].every((job) =>
    needsAdmission(job) && /environment:\s*release-signing/.test(job) && hasAdmittedCheckout(job),
  )
) {
  pass("macOS and Windows signing builds consume the admitted commit from release-signing");
} else {
  fail("build-macos and build-windows must need admit-release, use release-signing, and checkout needs.admit-release.outputs.release_sha");
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

const updaterGateIndex = buildWindowsJob.indexOf("pnpm desktop:release-secrets -- --updater-only");
const windowsBuildIndex = buildWindowsJob.indexOf("pnpm desktop:build:windows");
if (
  updaterGateIndex >= 0 &&
  updaterGateIndex < windowsBuildIndex &&
  /TAURI_SIGNING_PRIVATE_KEY:\s*\$\{\{\s*secrets\.TAURI_SIGNING_PRIVATE_KEY\s*\}\}/.test(buildWindowsJob.slice(0, windowsBuildIndex)) &&
  !/APPLE_[A-Z_]+:\s*\$\{\{\s*secrets\./.test(buildWindowsJob)
) {
  pass("Windows checks updater-only signing credentials before its installer build");
} else {
  fail("build-windows must run desktop:release-secrets -- --updater-only with only updater secrets before desktop:build:windows");
}

if (
  pkg.scripts?.["desktop:release-source"] === "node scripts/check-macos-release-source.mjs" &&
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
    "package.json and .github/workflows/release-macos.yml must run scripts/check-macos-release-source.mjs with shell-native environment expansion before signing so release artifacts only publish from the default-branch head",
  );
}

if (
  pkg.scripts?.["desktop:release-secrets"] === "node scripts/check-macos-release-secrets.mjs" &&
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
    "package.json must expose desktop:release-secrets as node scripts/check-macos-release-secrets.mjs, and the release credential helpers must reject missing values, malformed base64, non-PKCS#12 certificate payloads, and malformed App Store Connect .p8 keys before signing",
  );
}

if (
  pkg.scripts?.["desktop:release-github"] === "node scripts/check-macos-release-github.mjs" &&
  typeof pkg.scripts?.["desktop:release-preflight"] === "string" &&
  desktopDoc.includes("release-signing") &&
  desktopDoc.includes("--env release-signing") &&
  desktopDoc.includes("workflow_dispatch") &&
  releaseGithubScript.includes('"--env"') &&
  releaseGithubScript.includes("release-signing")
) {
  pass("desktop release docs and preflight route signing setup through the release-signing environment");
} else {
  fail("docs/DESKTOP-MACOS.md, desktop:release-preflight, and desktop:release-github must describe release-signing environment setup and workflow_dispatch release operation");
}

if (
  pkg.scripts?.["desktop:release-tag"] === "node scripts/check-macos-release-tag.mjs" &&
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
  pkg.scripts?.["desktop:release-slot"] === "node scripts/check-macos-release-slot.mjs" &&
  releaseWorkflow.includes('pnpm desktop:release-slot -- --tag="${RELEASE_TAG}"') &&
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
  releaseGithubScript.includes("hosted website deploy is intentionally excluded") &&
  releaseGithubScript.includes("workflow_dispatch") &&
  releaseGithubScript.includes("deployment-branch-policies") &&
  releaseGithubScript.includes('"branch"') &&
  releaseGithubScript.includes("release-signing")
) {
  pass("desktop GitHub release readiness gate checks the protected workflow and release-signing secret scope before dispatch");
} else {
  fail(
    "package.json must expose desktop:release-github and scripts/check-macos-release-github.mjs must check the protected workflow, branch-only release-signing environment, and required signing secret names before dispatch",
  );
}

if (
  pkg.scripts?.["desktop:release-run"] === "node scripts/watch-macos-release-run.mjs" &&
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
    "package.json must expose desktop:release-run, scripts/watch-macos-release-run.mjs must dispatch the protected ref then poll for that workflow_dispatch run before gh run watch, and desktop:release-status must route operators through that watcher",
  );
}

if (
  pkg.scripts?.["desktop:release-status"] === "node scripts/check-macos-release-status.mjs" &&
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
    "package.json must expose desktop:release-status and scripts/check-macos-release-status.mjs must audit version alignment, PR readiness, release workflow availability, local/remote Git tag slots, Developer ID direct-download secret names, public release state, and public download assets in JSON blocker snapshots and markdown operator checklists, with no Firebase Hosting dependency",
  );
}

if (
  pkg.scripts?.["desktop:sign"] === "node scripts/sign-macos-app.mjs" &&
  signMacosScript.includes('"--deep"') &&
  signMacosScript.includes('"--options"') &&
  signMacosScript.includes('"runtime"') &&
  signMacosScript.includes('"--timestamp"') &&
  signMacosScript.includes('["--verify", "--deep", "--strict", "--verbose=2", appPath]')
) {
  pass("desktop signing script deeply signs the release app with hardened runtime and strict verification");
} else {
  fail("package.json must expose desktop:sign as node scripts/sign-macos-app.mjs, and scripts/sign-macos-app.mjs must deeply sign the app with hardened runtime, timestamping, and strict deep verification");
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

// The bundled MCP server is app payload — it must be compiled **before** Tauri
// bakes, or `externalBin` cannot find it. Reverse the order and an app ships
// silently without the server, and the user only learns the agent will not attach
// after installing.
if (
  pkg.scripts?.["desktop:build:app"] ===
    "node scripts/clean-tauri-macos-apps.mjs && pnpm mcp:build-binary && pnpm tauri build --bundles app" &&
  pkg.scripts?.["mcp:build-binary"] === "node scripts/build-mcp-binary.mjs" &&
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
    "package.json must expose desktop:build:app as node scripts/clean-tauri-macos-apps.mjs && pnpm mcp:build-binary && pnpm tauri build --bundles app, mcp:build-binary as node scripts/build-mcp-binary.mjs, tauri.conf.json bundle.externalBin must carry binaries/ontology-atlas-mcp, and the cleaner must remove stale macOS .app bundles before Tauri rebuilds",
  );
}

if (
  pkg.scripts?.["desktop:deploy:app"] === "node scripts/deploy-macos-app-local.mjs" &&
  pkg.scripts?.["desktop:build:app:local"] ===
    "node scripts/clean-tauri-macos-apps.mjs && pnpm mcp:build-binary && pnpm tauri build --bundles app --config '{\"bundle\":{\"createUpdaterArtifacts\":false}}'" &&
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
  deployMacosAppLocalScript.includes("ontology-atlas-deployed-relief.webview.json") &&
  deployMacosAppLocalScript.includes("--webview-evidence=${options.webviewEvidencePath}") &&
  verifyAppScript.includes("writeWebviewEvidence(webviewPayload, webviewEvidencePath, {") &&
  verifyAppScript.includes("visualEvidencePath: tryWindowScreenshotPath ?? windowScreenshotPath") &&
  deployMacosAppLocalScript.includes("--require-capturable-window") &&
  deployMacosAppLocalScript.includes("ontology-atlas-deployed-relief.png") &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/deploy-macos-app-local.test.mjs")
) {
  pass("desktop local deploy command builds without release updater signing, installs, and verifies Relief health from /Applications with default best-effort visual and WebView evidence");
} else {
  fail(
    "package.json must expose desktop:deploy:app plus desktop:build:app:local with updater artifacts disabled, cover scripts/deploy-macos-app-local.test.mjs, and the deploy script must build without release updater signing, ditto the app to /Applications, verify /en/topology/ Relief health plus drag dogfood, keep screenshot proof available as an opt-in, attempt 14-inch-compatible best-effort visual evidence by default, and save deterministic WebView evidence",
  );
}

/*
 * ⚠️ **Routes are not pinned down to the slug** (relaxed 2026-08-10).
 *
 * This used to pin the whole string
 * `--require-webview-route='/ko/topology/?p=domain%3Aviews&mode=focus'`. That
 * `views` domain **disappeared** while the dogfood vault was rebuilt — nine
 * verifiers were quietly failing against a node that did not exist, and when
 * someone went to fix it **this check blocked the fix**. A gate that breaks in the
 * direction of a better spec makes the next person revert the spec instead
 * (.claude/rules/documentation.md).
 *
 * So the roles are split: here only the **shape of the flag** is checked (a deep
 * link is present and the mode is right), while "does that node exist" is checked
 * by a contract test that reads the vault directly
 * (`tests/contract/script-vault-references.contract.test.ts`, runs in CI).
 */

const agentDesignGateChecks = [
  [
    "AGENTS mandatory design gate",
    agentsDoc.includes("docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md") &&
      /design gate/i.test(agentsDoc) &&
      // Strip markdown emphasis before matching — AGENTS.md writes `Runs *after* the PO
      // pass`. The old regex required a contiguous string and **broke on a single
      // asterisk** (CI, 2026-07-31). The invariant (the design gate comes after the PO
      // pass) was intact; only the gate was brittle. Pinning prose formatting makes the
      // gate hold the document hostage.
      /after\s+the PO pass/i.test(agentsDoc.replace(/[*_`]/g, "")),
  ],
  [
    "design council",
    /Design Council/.test(productDesignDoc) &&
      /No-Human-Designer Working Mode/.test(productDesignDoc) &&
      /Lead Product Designer/.test(productDesignDoc),
  ],
  [
    "allowed reference policy",
    /Reference Permission Test/.test(productDesignDoc) &&
      /Do not copy/.test(productDesignDoc) &&
      /Public/.test(productDesignDoc) &&
      /Principle/.test(productDesignDoc),
  ],
  [
    "live reference review loop",
    /Live Reference Review Loop/.test(productDesignDoc) &&
      /Reference source packet/.test(productDesignDoc) &&
      /Source -> Atlas rule -> verifier/.test(productDesignDoc),
  ],
  [
    "graph engine fit gate",
    /Relief\/Topology Graph Engine Fit Gate/.test(productDesignDoc) &&
      /Sigma\.js/.test(productDesignDoc) &&
      /Graphology/.test(productDesignDoc) &&
      /nodeReducer/.test(productDesignDoc) &&
      /edgeReducer/.test(productDesignDoc) &&
      /Force Graph-style products/.test(productDesignDoc) &&
      /Cytoscape\.js/.test(productDesignDoc) &&
      /Reject renderer shopping/.test(productDesignDoc),
  ],
  [
    "installed app proof",
    /installed macOS app proof/i.test(productDesignDoc) &&
      /WebView marker/.test(productDesignDoc) &&
      /Computer Use/.test(productDesignDoc),
  ],
  [
    "Relief surface rules",
    /Composer blocks the map/.test(productDesignDoc) &&
      /Click focus must be durable/.test(productDesignDoc) &&
      /Drag is editing, not discovery/.test(productDesignDoc),
  ],
];
const missingAgentDesignGate = agentDesignGateChecks
  .filter(([, ok]) => !ok)
  .map(([label]) => label);

if (missingAgentDesignGate.length === 0) {
  pass("agent guide requires the Product Design gate, design council, graph engine fit gate, allowed reference policy, and installed-app proof for Relief work");
} else {
  fail(
    `AGENTS.md and docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md must keep the Relief design gate enforceable: missing ${missingAgentDesignGate.join(", ")}`,
  );
}

if (
  pkg.scripts?.["desktop:build"] ===
  "pnpm desktop:build:app:local && pnpm desktop:sign:adhoc && node scripts/package-macos-dmg.mjs"
) {
  pass("desktop local build ad-hoc signs macOS .app before packaging without updater credentials");
} else {
  fail(
    "package.json must expose desktop:build as pnpm desktop:build:app:local && pnpm desktop:sign:adhoc && node scripts/package-macos-dmg.mjs so the local pre-tag gate needs neither updater credentials nor a damaged app bundle",
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
  ["/ontology/insights", /\/ontology\/insights/],
];

const missingPrototypeRoutes = prototypeRouteChecks
  .filter(([, pattern]) => !pattern.test(desktopDoc))
  .map(([route]) => route);

if (missingPrototypeRoutes.length === 0) {
  pass("desktop prototype smoke names download, docs, ontology, topology, builder, and insights routes");
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

// The 14-inch MacBook Pro reference panel is 1512x982 logical points — that is the whole display,
// menu bar and notch included. Tauri's width/height are the *inner* content size, so a declared
// height of 982 asked for 982 + 28pt of title bar inside a 945pt visible frame: AppKit silently
// constrained it on every launch and the shipped default was never once observed as a window
// (the ledger measured 1512x949 outer and 1512x917 content). The measurement scripts, meanwhile,
// have always swept 1512x900. This gate exists so the shipped first viewport and the swept first
// viewport cannot drift apart again.
const REFERENCE_14_INCH_LOGICAL = { width: 1512, height: 982 };
const MACOS_MENU_BAR_RESERVE_PT = 37;
const MACOS_TITLE_BAR_PT = 28;
// Read out of src-tauri/src/lib.rs rather than copied. A second literal here would let the Rust
// constant drift while this gate stayed green, which is the failure the comment on both sides was
// written to prevent — and a comment is not a gate.
const mainWindowMinSource = readText("src-tauri/src/lib.rs").match(
  /const MAIN_WINDOW_MIN_LOGICAL: \(f64, f64\) = \(([\d.]+), ([\d.]+)\);/,
);
const MAIN_WINDOW_MIN_LOGICAL = mainWindowMinSource
  ? { width: Number(mainWindowMinSource[1]), height: Number(mainWindowMinSource[2]) }
  : null;
if (!MAIN_WINDOW_MIN_LOGICAL) {
  fail(
    "src-tauri/src/lib.rs must declare `const MAIN_WINDOW_MIN_LOGICAL: (f64, f64) = (w, h);` so the window gate can bind the config floor to the Rust constant instead of duplicating it",
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
    `src-tauri/tauri.conf.json main window must fit the 14-inch reference panel: width <= ${REFERENCE_14_INCH_LOGICAL.width}, height + ${MACOS_TITLE_BAR_PT}pt title bar <= ${visibleFrameHeight}pt visible frame, and minWidth/minHeight must equal MAIN_WINDOW_MIN_LOGICAL in src-tauri/src/lib.rs (${MAIN_WINDOW_MIN_LOGICAL ? `${MAIN_WINDOW_MIN_LOGICAL.width}x${MAIN_WINDOW_MIN_LOGICAL.height}` : "unreadable"}); got ${mainWindowConfig ? `${mainWindowConfig.width}x${mainWindowConfig.height}, min ${mainWindowConfig.minWidth}x${mainWindowConfig.minHeight}` : "no window labelled main"}`,
  );
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
  rootLayout.includes("title: 'Ontology Atlas'") &&
  // GitHub Pages serves under the `/ontology-atlas` base path, so the manifest link
  // must be base-path aware (#617). A literal `/manifest.webmanifest` 404s on Pages,
  // so the `withBasePath(...)` form is pinned as the contract.
  rootLayout.includes("manifest: withBasePath('/manifest.webmanifest')") &&
  rootLayout.includes("alternateName: 'ontology-atlas'") &&
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

/**
 * Window permissions are **allowed by name**, and dangerous families are blocked
 * by prefix.
 *
 * This used to allow `core:default` **only**. The intent (no broad fs, shell, http,
 * or opener) was right, but the expression was "never add anything", which makes
 * you want to delete the gate the moment you need one narrow permission such as the
 * updater — and deleting it is the end of the gate.
 *
 * So it was rewritten in two directions. **Allow only what is named in this list**
 * — keeping the list short is the contract. **Block whole families** — a new name
 * is blocked without anyone knowing it. The latter is the real shield.
 */
const ALLOWED_CAPABILITY_PERMISSIONS = [
  // `core:default` is still allowed by name, but this window no longer uses it. It expands to nine
  // sets, and four of them — `core:image`, `core:resources`, `core:menu`, `core:tray` — were granted
  // to a webview that never called them: the frontend reaches Rust through app-defined commands
  // (which capabilities do not gate) plus one `listen`. Enumerating is what makes that visible.
  "core:default",
  // `listen`, the frontend's only event-plugin call — `vault-changed`, `acp://*`.
  "core:event:default",
  // `getVersion()` in `AppUpdateSettings.tsx` — the app's own version shown beside the update
  // control. Not the version in the first log line: that one comes from Rust `package_info()`,
  // which the permission system does not gate at all.
  "core:app:default",
  // Check for and install updates. The network target is fixed by the endpoint in
  // `tauri.conf.json` and no user input reaches it. minisign signature verification
  // is enforced before install.
  "updater:default",
  // Restart after update, and only that. Not `process:default` — there is no reason
  // to grant exit as well.
  "process:allow-restart",
];

/**
 * The core baseline this window genuinely needs, measured rather than assumed (2026-08-24).
 *
 * `core:event` carries `listen`, the frontend's only event-plugin call. `core:app` carries
 * `getVersion`, shown beside the update control. Nothing in `src/` or `app/` imports
 * `@tauri-apps/api/path`, `/window`, `/webview`, `/menu`, `/tray` or `/image`, and the modules that
 * are imported invoke only the `event`, `app` and `resources` plugins. Removing `core:path`,
 * `core:window` and `core:webview` was then verified on a packaged build: it launches, loads a real
 * vault, renders, and logs no permission denial.
 *
 * Capabilities gate JS-to-Rust IPC only. This app resizes and positions its window from Rust, which
 * is why dropping `core:window` changes nothing a user can see.
 *
 * The `core:default` umbrella is still accepted so the gate judges *what is granted* rather than the
 * spelling, but a capability granting neither shape has lost the baseline and must fail.
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
  rootEntryPage.includes("isDesktopShell()") &&
  rootEntryPage.includes("restoreAttempted") &&
  rootEntryPage.includes("vault.manifest") &&
  rootEntryPage.includes("DesktopVaultRedirect") &&
  rootEntryPage.includes("<FirstRunPage />")
) {
  pass("desktop root entry renders the first-run surface for first launch and stale restored vaults without rendering marketing");
} else {
  fail("src/views/root-entry/ui/RootEntryPage.tsx must render FirstRunPage in the desktop shell when no manifest loaded (first launch or stale restored handle), without rendering the hosted landing page");
}

if (
  docsVaultPage.includes("DesktopVaultWelcome") &&
  docsVaultPage.includes("shouldShowDesktopVaultWelcome") &&
  docsVaultPage.includes("isTauriVaultRuntime()") &&
  docsVaultPage.includes("openLocalVault()")
) {
  pass("desktop docs intent shows a vault setup welcome before opening the native picker");
} else {
  fail("src/views/docs-vault/ui/DocsVaultPage.tsx must show an app-style vault setup welcome for Tauri ?intent=local and open the native picker only after an explicit user action");
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
  ontologyStarterCta.includes("buildOntologyStarterCliVerifyCommands") &&
  ontologyStarterCta.includes("buildOntologyStarterJsonGateCommand") &&
  ontologyStarterCta.includes("shellQuotePath") &&
  ontologyStarterCta.includes("vaultPath") &&
  docsVaultPage.includes("vaultPath={") &&
  docsVaultPage.includes("getTauriVaultRootPath(localVault.handle)") &&
  vaultAgentSetupPanel.includes("getTauriVaultRootPath(localVault.handle)")
) {
  pass("desktop ontology starter copies path-aware CLI and JSON agent gates");
} else {
  fail(
    "OntologyStarterCta must copy CLI proof and JSON agent gate commands against the selected Tauri vault path when the installed app knows it",
  );
}

if (
  vaultAgentSetupPanel.includes("buildAgentVerifyCliCommand") &&
  vaultAgentSetupPanel.includes("buildAgentSetupCliCommand") &&
  vaultAgentSetupPanel.includes("buildAgentSetupPacket(localVault.handle?.name ?? 'vault', vaultRootPath)") &&
  vaultAgentSetupPanel.includes("buildAgentFirstContactProofPacket(localVault.handle?.name ?? 'vault', vaultRootPath)") &&
  vaultAgentSetupPanel.includes("buildOntologyStarterAgentVerifyPrompt(vaultRootPath)") &&
  vaultAgentSetupPanel.includes("buildOntologyStarterJsonGateCommand(vaultRootPath)") &&
  vaultAgentSetupPanel.includes("agentJsonGatePreview") &&
  vaultAgentSetupPanel.includes("hubs ${target} --plan")
) {
  pass("desktop agent setup panel copies path-aware setup packets, CLI runbooks, and JSON gates");
} else {
  fail(
    "VaultAgentSetupPanel must copy setup packets, first-contact proof, CLI runbooks, verification prompts, and JSON gates against the selected Tauri vault path when available",
  );
}

// A gate that only reads file contents stays green even when the component is
// mounted nowhere — after `VaultToolsMenu` was deleted, `LocalVaultPicker` became
// an orphan and this script kept passing its contents. So the surface contract
// requires both content and mount.
//
// ⚠️ **The mount point changed on 2026-08-21** (decision ledger 90). This panel
// left the settings sheet for the agents destination (`/agents/`), with
// `AgentSetupSection` as the glue between them. The check was still looking at
// `AppSettingsMenu`, so it **went red here right after the move** — exactly what
// this gate is for.
//
// So instead of pinning which file renders it, the check measures **whether the
// chain holds**: the panel produces an absolute path → the glue renders the panel
// → the destination renders the glue. If the location moves again it passes as
// long as the chain is intact, and breaks when it is not.
const agentSetupSection = readText("src/widgets/app-settings-menu/ui/AgentSetupSection.tsx");
const agentsPage = readText("src/views/agents/ui/AgentsPage.tsx");

if (
  vaultAgentSetupPanel.includes("getTauriVaultRootPath") &&
  agentSetupSection.includes("import { VaultAgentSetupPanel }") &&
  agentSetupSection.includes("<VaultAgentSetupPanel") &&
  agentsPage.includes("AgentSetupSection") &&
  agentsPage.includes("<AgentSetupSection")
) {
  pass("desktop agent setup surface derives the absolute Tauri vault path and is actually mounted by the Agents destination");
} else {
  fail(
    "the desktop agent setup surface must derive the selected absolute Tauri vault path AND be mounted through AgentSetupSection into the Agents destination — a file that no surface renders is not a shipped contract",
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
  appSettingsMenu.includes("localVault.recentVaults") &&
  appSettingsMenu.includes("localVault.openRecent(record)") &&
  appSettingsMenu.includes("localVault.forgetRecent(record)") &&
  appSettingsMenu.includes("record.desktopRootPath") &&
  // #72 — see, copy, and open in Finder the selected vault's absolute path. Without
  // that path on the desktop the user has no way to know the value to paste into an
  // agent.
  appSettingsMenu.includes("getTauriVaultRootPath(localVault.handle)") &&
  appSettingsMenu.includes("openTauriVaultInFinder(vaultRootPath)") &&
  appSettingsMenu.includes("app-settings-copy-vault-path") &&
  // Recent-vault switching must survive a permission re-request, or the recovery
  // path is cut.
  appSettingsMenu.includes("!isLocalVaultLoaded &&")
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
  "src/shared/lib/tauri-vault-fs.test.ts",
  // #72 — the old LocalVaultPicker was an orphan and was deleted. The same contract
  // (recent-vault recovery, copy path / Finder) is carried by the settings sheet and
  // covered by its test.
  "src/widgets/app-settings-menu/ui/AppSettingsMenu.test.tsx",
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
