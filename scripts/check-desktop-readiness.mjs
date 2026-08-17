#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// 검사 대상 파일이 사라지면 raw ENOENT 스택트레이스로 죽지 않고 읽을 수 있는
// 실패로 강등한다 — 크래시는 "게이트 실패"가 아니라 "게이트 부재"로 읽혀서,
// 삭제된 `VaultToolsMenu.tsx` 를 계속 읽던 이 스크립트가 여러 머지 동안 조용히
// 죽어 있었다 (opus5 검수 2026-07-25). 빈 문자열을 돌려주면 뒤따르는
// `.includes(...)` 단언이 자연스럽게 실패해 어떤 계약이 깨졌는지도 함께 나온다.
function readText(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    fail(`tracked source file is missing — ${relativePath}. Point this gate at the surface that replaced it, or drop the check.`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

/**
 * 디렉터리 아래 모든 `.md` 를 읽는다 — 볼트처럼 **파일 목록이 사람의 것이
 * 아닌** 표면을 검사할 때 쓴다. 파일명을 고정하면 볼트를 다시 지을 때마다
 * 게이트가 먼저 죽는다.
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

// 산문 문서는 80열 랩이 걸려 같은 문장이 줄바꿈으로 쪼개진다. 문구 계약을
// 검사할 때 줄바꿈·연속 공백을 한 칸으로 접어 "래핑 때문에 게이트가 깨지는"
// 가짜 실패를 없앤다 (opus5 검수 — DESKTOP-MACOS.md 의 "separate GitHub\nPages
// workflow" 가 정확히 그렇게 깨져 있었다).
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
const featuresDoc = readText("docs/FEATURES.md");
const productDirectionDoc = readText("docs/PRODUCT-DIRECTION.md");
const productDesignDoc = readText("docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md");
const architectureDoc = readText("docs/ARCHITECTURE.md");
const developmentChecksDoc = readText("docs/DEVELOPMENT-CHECKS.md");
const agentGraphWorkflowDoc = readText("docs/AGENT-GRAPH-WORKFLOW.md");
const troubleshootingDoc = readText("docs/TROUBLESHOOTING.md");
// npm 발행 계획 폐기 (docs/DECISIONS.md 2026-07-27) 로 아카이브됐다. 게이트는
// 그대로 둔다 — 이 문서가 살아 있는 한, 데스크톱 앱 경로를 지운 채 npm 경로만
// 남기는 되돌림을 막는 기록으로 계속 쓸모가 있다.
const publishNpmDoc = readText("docs/archive/PUBLISH-NPM.md");
const demoStoryboardDoc = readText("docs/launch/DEMO-GIF-STORYBOARD.md");
const redditPostsDoc = readText("docs/launch/REDDIT-POSTS.md");
/**
 * 도그푸드 볼트 **전체**. 파일명도 문장도 고정하지 않는다.
 *
 * [개정 2026-08-01] 종전에는 `capabilities/desktop-app-distribution.md` 와
 * `domains/onboarding-ux.md` **두 파일의 정확한 문장**을 핀했다. 볼트를 규격
 * 기준으로 0에서 다시 지으면서 두 파일이 모두 사라졌고, 게이트는 제품 결함이
 * 아니라 **자기 조준** 때문에 빨개졌다. 볼트는 에이전트가 자기 말로 쓰는
 * 표면이라 문장 핀은 원리적으로 유지 불가능하다 — 같은 뜻을 다른 문장으로
 * 쓰면 매번 게이트를 고쳐야 한다.
 *
 * 이 검사의 원래 목적은 「공유 온톨로지가 옛 hosted-workbench 프레이밍을
 * 보존하지 않는다」였다. 그건 **개념의 존재** 문제이지 문장의 문제가 아니므로,
 * 볼트 어딘가에 「데스크톱 앱 설치 결정」을 담은 노드가 있는지만 본다.
 */
const vaultDocTexts = readVaultMarkdown("docs/ontology");
const downloadPage = readText("src/views/download/ui/DownloadPage.tsx");
/**
 * 관문 상단 크롬 — 브랜드 이름이 실제로 그려지는 자리.
 *
 * ⚠️ 2026-07-30 이전에는 이 문자열이 `DownloadPage.tsx` 안에 있어서 아래 브랜드
 * 게이트가 그 파일 하나만 봐도 됐다. GNB 가 네 관문 주소(`/` · `/download` ·
 * `/guide` · `/changelog`)를 공유하게 되면서 `widgets/gateway-chrome` 으로
 * 내려갔고, 그 순간 게이트가 **화면에는 멀쩡히 있는 브랜드를 못 찾아** 빨개졌다.
 * 결함이 아니라 조준이 파일 경로에 묶여 있던 것이다 — 같은 날 지도 목적지
 * 게이트도 똑같은 이유로 터졌다(`map-destination-route.contract.test.ts`).
 *
 * 그래서 **둘을 합쳐서** 본다. 브랜드가 판에 있든 크롬에 있든, 방문자가 보는
 * 화면에 있으면 통과다.
 */
const gatewayChrome = readText("src/widgets/gateway-chrome/ui/GatewayNav.tsx");
const gatewaySurfaceSource = `${downloadPage}\n${gatewayChrome}`;
const downloadRoute = readText("app/[locale]/download/page.tsx");
const macosDownloadLink = readText("src/features/macos-download-link/ui/MacosDownloadLink.tsx");
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
// 문서함의 로컬 소스 컨트롤은 볼트 칩 메뉴가 이고 있다(2026-08-08 통합).
const vaultChipSurface = readText("src/views/docs-vault/ui/parts/DocsVaultVaultChip.tsx");
const topologyEmptyState = readText("src/widgets/topology-controls/ui/TopologyEmptyState.tsx");
// 구 `src/widgets/docs-vault/ui/VaultToolsMenu.tsx` 는 5164f68d7 (B2 — 문서함
// vault 도구를 설정 메뉴로 합병) 에서 삭제됐다. 에이전트 셋업 표면은 설정 시트의
// 드릴인 패널로 이사했으므로 게이트도 그쪽을 본다.
const vaultAgentSetupPanel = readText("src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx");
const appSettingsMenu = readText("src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx");
// 구 `LocalVaultPicker` 는 B2 병합 이후 어느 표면도 렌더하지 않는 고아였고
// (#72), 그 표면(최근 볼트 회수 · 경로 복사 · Finder 열기)은 설정 시트의
// [작업공간] 그룹으로 복원됐다. 게이트도 살아있는 쪽을 본다.
const ontologyStarterCta = readText("src/features/docs-vault-local/ui/OntologyStarterCta.tsx");
const localFsHandleStore = readText("src/entities/local-fs-handle/api/store.ts");
const localVaultHook = readText("src/features/docs-vault-local/model/use-local-vault.ts");
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

if (pkg.scripts?.["cli:mcp-verify"] && pkg.scripts?.["dogfood:agent-setup-gate"]) {
  pass("CLI/MCP setup gate is available for desktop handoff verification");
} else {
  fail("package.json must expose cli:mcp-verify and dogfood:agent-setup-gate for desktop handoff verification");
}

if (
  agentGraphWorkflowDoc.includes("https://developers.openai.com/codex/mcp") &&
  agentGraphWorkflowDoc.includes("https://code.claude.com/docs/en/mcp") &&
  // 이 게이트는 **경계가 어디인지**를 검사한다: Atlas 는 에이전트 루프/모델/키를
  // 소유하지 않고, 창도 내주지 않는다 — 사용자 자신의 터미널로 인계한다.
  // (같은 날 오전의 "Atlas hosts a terminal" 문장은 소유자 결정으로 번복됐고,
  //  그 이력은 AGENT-GRAPH-WORKFLOW.md 의 번복 기록 절이 보관한다.)
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
  codexBuildRunScript.includes("pnpm desktop:build:app") &&
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
  pass("Codex Run action builds, launches, and verifies the freshly built macOS app bundle");
} else {
  fail(
    "script/build_and_run.sh and .codex/environments/environment.toml must wire Codex Run to build, LaunchServices-verify, and leave running the freshly built macOS app bundle",
  );
}

if (
  codexBuildRunScript.includes('APPLICATIONS_APP_PATH="/Applications/Ontology Atlas.app"') &&
  codexBuildRunScript.includes("CFBundleIdentifier") &&
  codexBuildRunScript.includes("CFBundleExecutable") &&
  codexBuildRunScript.includes('pkill -f "$installed_executable"') &&
  codexBuildRunScript.includes('ditto "$APP_PATH" "$APPLICATIONS_APP_PATH"') &&
  codexBuildRunScript.includes('DOGFOOD_APP_PATH="$APPLICATIONS_APP_PATH"') &&
  codexBuildRunScript.indexOf("pnpm desktop:build:app") <
    codexBuildRunScript.lastIndexOf("sync_existing_applications_copy") &&
  codexBuildRunScript.lastIndexOf("sync_existing_applications_copy") <
    codexBuildRunScript.indexOf('pnpm desktop:verify-app -- "$DOGFOOD_APP_PATH"')
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
  verifyInstallScript.includes('"--kill-existing"')
) {
  pass("desktop install smoke reuses the LaunchServices app content verifier for copied DMG apps");
} else {
  fail(
    "desktop install smoke must verify copied DMG apps through scripts/verify-macos-app-launch.mjs with stale-process cleanup, LaunchServices window checks, and Accessibility text markers",
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
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/lib/macos-release-names.test.mjs")
) {
  pass("desktop checker tests cover the GitHub release operator, source, run-watch, checksum filename, and completion gates");
} else {
  fail("package.json test:desktop:check must include scripts/check-macos-release-github.test.mjs, scripts/check-macos-release-source.test.mjs, scripts/watch-macos-release-run.test.mjs, scripts/check-macos-release-status.test.mjs, scripts/generate-download-release-facts.test.mjs, scripts/lib/macos-checksum.test.mjs, and scripts/lib/macos-release-names.test.mjs so the macOS release operator, source, run-watch, checksum filename, completion, and app-vs-asset naming gates stay covered");
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
  // 기대 문구를 검증기 안에 손으로 복제하면 페이지 카피가 바뀔 때마다
  // 게이트가 조용히 빨간불이 된다(실제로 그랬다 — Pages 배포 5회 연속
  // deploy 성공 + verify 실패). 진실원은 출고되는 메시지 카탈로그다.
  hostedDownloadSurfaceScript.includes('readFileSync(path.join(REPO_ROOT, "messages", "ko.json")') &&
  // 게시 전/후 어느 release-facts 상태에서도 Windows 방문자가 자기 위치와
  // 다음 행동을 받는다. 검증기는 두 분기를 같은 배포 계약으로 다룬다.
  hostedDownloadSurfaceScript.includes("downloadCopy.windowsUnsignedWarning") &&
  hostedDownloadSurfaceScript.includes("downloadCopy.windowsDownloadCta") &&
  hostedDownloadSurfaceScript.includes("releases/latest") &&
  hostedDownloadSurfaceScript.includes("assertIncludes(download.body, downloadPath") &&
  hostedDownloadSurfaceScript.includes("deploy-pages.yml") &&
  hostedDownloadSurfaceScript.includes("gh workflow run deploy-pages.yml")
) {
  pass("hosted website verifier sources expected download copy from the message catalog and requires both platform statuses");
} else {
  fail(
    "package.json must expose desktop:verify-hosted, test:desktop:check must cover it, and scripts/check-hosted-download-surface.mjs must read expected download copy from messages/ko.json (not hand-copied strings), require the hosted /ko/download/ route with both platform statuses and a stable GitHub Releases CTA, reject releases/latest, and print the deploy-pages recovery path",
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
  // 폴백은 **태그로** 초안을 찾는다. 그리고 프리릴리스 여부로 다시 거르지
  // 않는다 — 호출자가 이름을 댔으면 무엇을 원하는지 이미 말했고, 거기서 한 번
  // 더 거르면 RC 초안을 영영 검증할 수 없다(2026-07-27 v1.0.0-rc.1 실측).
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

if (
  pkg.scripts?.["desktop:release-preflight"] ===
  "pnpm desktop:check && pnpm docs-vault:check && pnpm test:desktop:check && pnpm test:desktop:runtime && pnpm test:desktop:bridge && pnpm desktop:doctor -- --require-runtime && pnpm cli:mcp-verify docs/ontology --timeout-ms 15000 && pnpm dogfood:agent-setup-gate && pnpm build && pnpm desktop:smoke && pnpm desktop:build && pnpm desktop:perf -- --require-app && pnpm desktop:verify-app -- --kill-existing --open-app --require-window --require-owner-name=\"Ontology Atlas\" --min-window-size=1040x720 --require-accessibility-text=\"Ontology Atlas\" && pnpm desktop:verify-dmg && pnpm desktop:verify-install"
) {
  pass("desktop local release preflight runs readiness, tests, runtime doctor, MCP handoff, agent JSON setup gate, build, route smoke, performance budget, LaunchServices app content proof, DMG, and install smoke");
} else {
  fail(
    "package.json must expose desktop:release-preflight as the local pre-tag macOS release gate, including cli:mcp-verify, dogfood:agent-setup-gate, and LaunchServices app content proof against docs/ontology before release artifact checks",
  );
}

/**
 * 이 순서는 취향이 아니라 계약이다. **DMG 서명이 패키징과 공증 사이에 있어야
 * 한다.**
 *
 * 2026-07-27 v1.0.0-rc.1 실측: `.app` 만 서명하고 DMG 로 감싸면 공증까지
 * 통과하는데, Gatekeeper 는 거절한다 —
 *
 *   [desktop-notarize] notarized and stapled ...aarch64.dmg
 *   spctl --assess --type open ... : rejected
 *   source=no usable signature
 *
 * 공증 티켓은 붙었는데 감쌀 서명이 없었다. 공증 **뒤에** 서명하면 스테이플이
 * 무효가 되므로 자리도 하나뿐이다.
 *
 * **업데이터 아카이브 재포장(`desktop:repack-updater`)도 자리가 하나다 — 앱
 * 서명 바로 뒤.** `tauri build` 는 `.app.tar.gz` 를 `.app` 과 함께 내는데, 이
 * 저장소는 코드서명을 그 뒤에 따로 한다. 그래서 아카이브가 담는 것은 **서명 전의
 * 앱**이고, 갱신받은 사용자만 "손상되었습니다" 를 만난다(DMG 로 받은 사용자는
 * 멀쩡하다). 실측 2026-07-28, 깨끗한 체크아웃:
 *
 *   tar xzf "Ontology Atlas.app.tar.gz" && codesign --verify --deep --strict …
 *     → code has no resources but signature indicates they must be present
 *
 * 서명 뒤에 다시 담고 다시 minisign 서명하면 `valid on disk` 가 된다.
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
      `[desktop-check]   기대: ${RELEASE_ARTIFACT_COMMAND} + isolated 11-step pipeline\n` +
      `[desktop-check]   실제: ${pkg.scripts?.["desktop:release-artifact"] ?? "(없음)"}`,
  );
}

if (
  pkg.scripts?.["desktop:goal-audit"] === "node scripts/check-desktop-goal-audit.mjs" &&
  pkg.scripts?.["test:desktop:check"]?.includes("scripts/check-desktop-goal-audit.test.mjs") &&
  goalAuditScript.includes("--pr=NUMBER is required") &&
  goalAuditScript.includes("desktop:release-preflight") &&
  // #617 (Firebase Hosting 제거 → GitHub Pages 단일 호스트) 이후 호스팅 표면은
  // macOS 앱 릴리스 감사에서 의도적으로 분리됐다 — Pages 는 deploy-pages.yml 이
  // 따로 배포하고 `desktop:verify-hosted` 가 검증한다. 그래서 goal-audit 은
  // release-status 를 호스팅 플래그 없이 부르고, 호스팅 검증기는 별도로 존재해야
  // 한다(둘 다 없으면 호스팅이 아무 게이트에도 안 걸린다).
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

if (
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
    "hosted download CTAs must avoid a broken latest-release URL before a public macOS DMG release exists and the download page must not duplicate the release CTA as its secondary action",
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
  // 구 `desktopOnlyTooltip` 키는 #435 (문서함 웹 세션 로컬 vault 개방) 에서
  // `vaultStatus.unsupportedTooltip` 로 통합됐다. 시각 신호는 disabled,
  // 스크린리더는 aria-describedby 로 *왜* 잠겼는지 듣는다 — 둘 다 요구한다.
  //
  // ⚠️ **지키는 것은 「그 자리에 있다」가 아니라 「왜 잠겼는지 말한다」이다**
  // (2026-08-08). 종전엔 이 줄이 `docs-vault-local-unsupported-hint` 라는
  // **id 문자열 하나**를 못박고 있었다. 그 컨트롤이 화면 오른쪽 라디오에서
  // 볼트 칩 메뉴로 옮겨 가자(같은 사실을 두 곳이 말하던 것을 한 곳으로) 게이트가
  // 빨개졌는데, 정작 그때 이유 설명은 **보이는 문장 + aria-describedby** 로
  // 더 좋아져 있었다. 그릇을 못박으면 정당한 개선에 빨개지고, 다음 사람은
  // 게이트 대신 개선 쪽을 되돌린다(`design-gates.md` 「그릇과 내용물」).
  // 그래서 문자열이 아니라 **짝**을 요구한다: 잠그는 근거(`localSourceDisabled`)
  // 와 그 이유를 읽어 주는 배선(`aria-describedby` + 이유 문자열)이 둘 다
  // 있는가. 어느 화면 조각이 그것을 이고 있는지는 묻지 않는다.
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
 * 이 블록은 **문장 핀이었다** — `openLabel === "Open vault folder"` 처럼 정확한
 * 문자열 여섯 개를 고정했다. 위 README 블록이 이미 배운 교훈("표 마크업을 문자
 * 그대로 검사했더니 재작성 한 번에 통째로 stale")을 이 블록만 안 배운 것이다.
 *
 * 2026-08-03 에 그 값을 치렀다: PO 카운슬이 화면에서 「볼트/vault」를 은퇴시키자
 * (원장 참조) 이 핀이 즉시 빨개졌다. **문구가 나아졌는데 게이트가 막은 것**이고,
 * 그건 `documentation.md` 가 금지한 실패 방향이다 —
 *
 *   "도구 동작이 바뀌고 문서가 안 바뀌면 문장이 그대로라 **통과**하고,
 *    문서를 더 나은 말로 고치면 **빨개진다.**"
 *
 * 그래서 문장이 아니라 **사실**을 검사한다. 이 게이트가 실제로 지키려는 계약은
 * 하나다: **로컬 폴더 작업의 안내가 설치된 앱을 가리키고, 브라우저 File System
 * Access 를 능력처럼 광고하지 않는다.** 어떤 단어로 그러는지는 카피의 자유다.
 */
const desktopRoutingCopy = [
  enMessages.searchWidgets.shortcuts.rows.localVault,
  koMessages.searchWidgets.shortcuts.rows.localVault,
  enMessages.docsVault.vaultStatus.unsupportedTooltip,
  koMessages.docsVault.vaultStatus.unsupportedTooltip,
  enMessages.featuresMisc.localVaultPicker.unsupported,
  koMessages.featuresMisc.localVaultPicker.unsupported,
];
// 「설치된 앱」을 각 로케일이 자기 말로 가리키는가.
const namesInstalledApp = (text, locale) =>
  locale === "ko"
    ? /설치(된|해)/.test(text) && /앱/.test(text)
    : /installed|install the/i.test(text) && /app/i.test(text);
// 브라우저 FSA 를 **능력으로 광고**하면 안 된다. 정직한 강등 고지에서 이름을
// 대는 것까지 막지는 않는다 — 그래서 「할 수 있다」 쪽 문장에서만 본다.
const advertisesBrowserFsa = desktopRoutingCopy.some(
  (text) => text.includes("File System Access") && !/desktop|설치/i.test(text),
);
/**
 * ⚠️ **셋을 한 규칙으로 묶고 있었다** (2026-08-08 카운슬).
 *
 * 위 여섯 문자열은 성격이 둘이다:
 *
 * - **강등 고지 둘** (`unsupportedTooltip` · `localVaultPicker.unsupported`) —
 *   FSA 를 못 쓰는 브라우저에게 「여기서는 안 되고 앱에서 된다」고 말하는
 *   자리다. 설치된 앱을 가리키는 것이 맞고, 그대로 둔다.
 * - **단축키 설명 하나** (`shortcuts.rows.localVault`) — 팔레트의 단축키가
 *   무엇을 여는지 말하는 자리다. **그 단축키는 웹에서도 된다** — 그것이 켜는
 *   `/docs` 로컬 소스는 FSA 를 지원하면 브라우저에서 동작하고, 미지원일 때만
 *   칩이 비활성이 된다(`isDocsVaultLocalSourceDisabled`).
 *
 * 그런데 이 게이트는 셋 다에게 「설치된 앱을 대라」고 요구했고, 그 요구가
 * 단축키 설명을 **거짓말로 만들고 있었다** — `surfaces.md` 가 이름 붙인
 * 「되는 것을 안 된다고 쓰는 것」이다. 이 파일 머리말이 스스로 경고한 실패
 * 방향과 같다: *"문구를 더 나은 말로 고치면 빨개진다."*
 *
 * 그래서 요구를 **자리의 성격에 맞춘다**. 단축키 설명은 커버리지를 잃지 않고
 * 요구가 바뀔 뿐이다 — 런타임이 아니라 **여는 대상**(폴더)을 말해야 한다.
 * FSA 를 능력으로 광고하지 않는지는 여섯 문자열 **전부**가 여전히 검사받는다.
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
  // 열기 라벨은 **여는 대상**을 말해야 한다. 어느 단어를 쓰는지는 안 고정한다.
  /folder/i.test(enMessages.featuresMisc.localVaultPicker.openLabel) &&
  /폴더/.test(koMessages.featuresMisc.localVaultPicker.openLabel)
) {
  pass("강등 고지는 설치된 앱을, 단축키 설명은 여는 폴더를 말한다 — FSA 를 능력으로 광고하지 않는다");
} else {
  fail(
    "강등 고지는 설치된 앱을 가리켜야 하고, 단축키 설명은 여는 대상(폴더)을 말해야 하며, 어느 쪽도 브라우저 File System Access 를 능력으로 광고하면 안 된다",
  );
}

// 이 블록은 한때 README 의 정체성 *표 마크업* 을 문자 그대로 검사했다 — README 가
// 재작성되자 통째로 stale 이 됐고, 게이트 크래시에 가려 아무도 못 봤다. 이제
// 표 형식이 아니라 **사실**을 검사한다: 브랜드, 호스팅 URL, 데스크톱 브리지,
// 브라우저에서의 로컬 폴더 개방, 그리고 은퇴한 표면으로의 유도 금지.
const readmeFlow = flow(rootReadme);
if (
  readmeFlow.includes("# Ontology Atlas") &&
  readmeFlow.includes("https://wlsdks.github.io/ontology-atlas/") &&
  readmeFlow.includes("Tauri macOS shell") &&
  readmeFlow.includes("The desktop app uses a Tauri bridge to your selected folder") &&
  readmeFlow.includes("hosted web app can open a local folder through the File System Access API") &&
  readmeFlow.includes("github.com/wlsdks/ontology-atlas/releases") &&
  // 은퇴/이전 표면으로 사용자를 보내면 안 된다. `/ontology/edit` 빌더는
  // 2026-07-24 은퇴했고, 로컬 vault 작업을 `localhost:3000/docs` 로 몰던
  // 옛 문구도 금지다.
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

if (
  featuresDoc.includes("4 surfaces (desktop app · CLI · MCP · Website)") &&
  featuresDoc.includes("**Ontology Atlas** is the user-facing desktop app / website brand") &&
  featuresDoc.includes("daily heavy-lift ontology work happens in the installed app / CLI / MCP") &&
  featuresDoc.includes("lets you open your own local vault folder from the browser") &&
  productDirectionDoc.includes("Ontology Atlas") &&
  productDirectionDoc.includes("The Tauri bundle product name") &&
  // 2026-07-28: npm 채널 폐기(#736)로 이 문장이 "설치 앱이 MCP 서버를 싣는다"
  // 까지 말하게 바뀌었다. 옛 나열 순서를 요구하던 리터럴을 새 문장으로 옮긴다 —
  // 게이트가 지키려는 것(설치 앱 + CLI 가 일상 표면)은 그대로다.
  productDirectionDoc.includes("installed desktop app (carrying the MCP server) + CLI as the daily workbench") &&
  productDirectionDoc.includes("hosted website is the product introduction and download entry point") &&
  desktopDoc.includes("Ontology Atlas") &&
  desktopDoc.includes("current release") &&
  desktopDoc.includes("asset identity") &&
  flow(desktopDoc).includes("root package stays free of Firebase SDK, Firebase Admin, and Firebase CLI") &&
  flow(desktopDoc).includes("separate GitHub Pages workflow") &&
  desktopDoc.includes("not the local-only app package") &&
  architectureDoc.includes("Tauri macOS shell (installed local workbench)") &&
  architectureDoc.includes("The public app/website brand is **Ontology Atlas**") &&
  architectureDoc.includes("Tauri native bridge → user disk") &&
  architectureDoc.includes("AI agents and the installed app end up with the same view")
) {
  pass("product and architecture docs frame the installed app as the daily heavy-lift local workbench while the hosted root map offers its own direct local-folder open path");
} else {
  fail(
    "FEATURES, PRODUCT-DIRECTION, and ARCHITECTURE must describe the installed desktop app / CLI / MCP as the daily heavy-lift local surfaces while still describing the hosted root map's direct local-folder open path (root-first-open)",
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
  demoStoryboardDoc.includes("설치된 Ontology Atlas macOS 앱") &&
  // 2026-07-28: #736 이 npm 전제를 걷으며 이 문단을 다시 썼다. 앱이 같은 `.md`
  // 를 네이티브 브리지로 읽고 쓴다는 사실과, 웹은 소개·다운로드 입구라는 역할
  // 분담이 요구 사항이다 — 그걸 말하는 새 문장으로 옮긴다.
  redditPostsDoc.includes("reads/writes the same `.md` files through a local native") &&
  redditPostsDoc.includes("hosted website is the product intro and download")
) {
  pass("workflow, troubleshooting, publish, and launch docs route writable vault work through the desktop app");
} else {
  fail(
    "User-facing workflow/troubleshooting/publish/launch docs must not steer local vault work through the hosted web workbench",
  );
}

// 한 노드 안에서 「macOS/데스크톱 앱」과 「다운로드/설치」가 함께 나오는가.
// 개념의 존재만 본다 — 어느 파일인지, 어떤 문장인지는 볼트가 정한다.
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
  // B3 허브가 곧 지도: `/ontology` 의 트리 허브(OntologyViewPage)가 retire 되고
  // `/` 와 `/ontology` 모두 이 empty state 로 수렴했다 — 검증 대상도 하나로.
  topologyEmptyState.includes("isTauriVaultRuntime") &&
  // 목적지를 재지, **따옴표를 재지 않는다** (2026-08-03). 종전엔 큰따옴표를
  // 못박아서, 같은 링크를 작은따옴표로 쓴 리팩터에 이 게이트가 빨간불을
  // 냈다 — 목적지는 그대로인데 문자만 바뀐 자리였다. 게이트가 규격이 아니라
  // 서식을 지키면, 다음 사람은 게이트를 고치는 대신 서식을 되돌린다.
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

// 다운로드 페이지가 주장할 수 있는 것은 "실제로 게시된 릴리스가 있는가"
// 하나로 결정된다. 예전엔 크기/체크섬/대기문구가 각자 자리표시자를 들고
// 있어서 6군데가 따로 낡았고, 방문자는 지금 설치가 되는지 알 수 없었다.
// 게이트는 이제 두 가지를 지킨다: ① 릴리스 사실은 생성 모듈에서만 온다
// ② 내부 파이프라인 상태(PR review, 태그 정합, CI 점검 명령)는 공개 표면에
// 없다 — 그건 릴리스 런북(docs/DESKTOP-MACOS.md)의 소유다.
const downloadReleaseState = readText("src/views/download/lib/release-state.ts");
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
  downloadPage.includes("download-platform-macos") &&
  downloadPage.includes("download-platform-windows") &&
  downloadPage.includes("download-macos-pending") &&
  // 파일명은 버전을 따라간다 — 번역 문자열에 옛 파일명을 얼려두면 검증
  // 명령이 조용히 거짓이 된다.
  downloadPage.includes("buildDmgName('aarch64')") &&
  internalPipelineLeaks.every(
    (marker) => !downloadPage.includes(marker) && !downloadRoute.includes(marker),
  ) &&
  downloadGeneratedRelease.includes("Generated by `pnpm download:release-facts`") &&
  /published:\s*(true|false)/.test(downloadGeneratedRelease) &&
  downloadReleaseState.includes("WINDOWS_STATUS") &&
  // 게시 전에는 자리표시자 대신 "아직 없다" 한 상태만 남는다.
  /has not been published yet/.test(enMessages.download?.macosPendingBody ?? "") &&
  /게시 전/.test(koMessages.download?.macosPendingBody ?? "") &&
  !enMessages.download?.checksumValuePending &&
  !enMessages.download?.factSizeValuePending &&
  !enMessages.download?.releaseAvailabilityNote &&
  !enMessages.download?.releaseStatusTitle &&
  !koMessages.download?.releaseStatusTitle &&
  // Windows 는 침묵하지 않는다 — 빠진 게 아니라 아직 안 나왔다고 말한다.
  //
  // 2026-07-29 개정: 관문 재설계가 「준비 중」배지 + 카드를 한 줄 상태
  // (`platformStatus`)와 추적 링크(`windowsTrackCta`), 그리고 기준을 밝히는
  // 정책 문장(`windowsPolicy`)으로 바꿨다. 배지라는 **형태**가 아니라 셋이
  // 함께 만드는 **계약**을 검사한다 — 위치 · 갈 곳 · 왜 아직인지.
  /Windows/.test(enMessages.download?.platformStatus ?? "") &&
  /Windows/.test(koMessages.download?.platformStatus ?? "") &&
  (enMessages.download?.windowsTrackCta ?? "").length > 0 &&
  (koMessages.download?.windowsTrackCta ?? "").length > 0 &&
  /not code-signed/.test(enMessages.download?.windowsUnsignedWarning ?? "") &&
  /코드 서명되지 않았습니다/.test(koMessages.download?.windowsUnsignedWarning ?? "") &&
  /SmartScreen/.test(enMessages.download?.windowsUnsignedWarning ?? "") &&
  /SmartScreen/.test(koMessages.download?.windowsUnsignedWarning ?? "") &&
  // 서명 상태는 **지금 참인 것**으로 적는다 — 미래형("게이트가 요구합니다")도,
  // 아직 사실이 아닌 과거형도 금지다.
  //
  // 2026-07-27 개정: 이 게이트는 미서명 시대에 쓰여서 `trustPolicy` 가
  // "not signed or notarized" 또는 "only after Developer ID signing" 중
  // 하나이기를 **요구**하고 있었다. 그날 Developer ID 인증서가 발급되면서
  // (`docs/DECISIONS.md`) 릴리스가 서명 경로로 돌아왔는데, 그 요구 때문에
  // 페이지는 여전히 미서명 안내를 들고 있어야 했다 — 게이트가 거짓을 붙들고
  // 있었던 셈이다. 문구를 특정 문장에 못 박는 대신, **주장과 실제 릴리스
  // 체인이 일치하는지**로 판정한다.
  !/Release gate requires/.test(enMessages.download?.proofSigned ?? "") &&
  !/게이트가/.test(koMessages.download?.proofSigned ?? "") &&
  /\{file\}/.test(enMessages.download?.trustVerifyCommand ?? "") &&
  // 서명을 주장하려면 릴리스 자산 체인이 실제로 서명·공증·검증을 해야 한다.
  (!/Developer ID/.test(enMessages.download?.proofSigned ?? "") ||
    (pkg.scripts?.["desktop:release-artifact"] === RELEASE_ARTIFACT_COMMAND &&
      [
        'args: ["desktop:sign"]',
        'args: ["desktop:notarize"]',
        'args: ["desktop:verify-release-dmg"]',
      ].every((marker) => buildMacosReleaseArtifactScript.includes(marker)))) &&
  // 미서명 상태를 말하는 문구라면 우회 경로를 반드시 함께 준다 — 상태만 알리고
  // 방법을 안 주면 그건 정직이 아니라 방치다. (인증서가 만료·폐기되어 문구가
  // 미서명으로 되돌아가면 이 조건이 다시 무장한다.)
  (!/not signed or notarized/.test(JSON.stringify(enMessages.download ?? {})) ||
    (/Open Anyway/.test(JSON.stringify(enMessages.download ?? {})) &&
      /확인 없이 열기/.test(JSON.stringify(koMessages.download ?? {})))) &&
  // 등록된 적 없는 도메인을 사실처럼 쓰지 않는다.
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

// root-first-open (2026-07) 이후 `/` 는 마케팅 랜딩이 아니라 지도 허브 자체다 —
// vault 없이도 dogfood 샘플 + 첫 실행 스타터를 렌더한다. `<lg` 에서 이 바를
// 숨기면 데스크톱 nav-rail(`lg:flex`)도 없어 전역 내비가 0이 되므로, 이제
// 숨김 대상은 자체 헤더를 가진 `/download` 하나뿐이다.
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
  releaseSourceScript.includes("default-branch head") &&
  /RELEASE_SHA:\s*\$\{\{\s*needs\.admit-release\.outputs\.release_sha\s*\}\}/.test(releaseWorkflow)
) {
  pass("desktop release source gate blocks tags from unmerged or stale commits before signing");
} else {
  fail(
    "package.json and .github/workflows/release-macos.yml must run scripts/check-macos-release-source.mjs before signing so signed DMGs only publish from the default-branch head",
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
  releaseTagScript.includes("does not match macOS app versions")
) {
  pass("desktop release tag gate receives the dispatched release tag before signing");
} else {
  fail(
    "package.json and .github/workflows/release-macos.yml must pass RELEASE_TAG from workflow_dispatch to scripts/check-macos-release-tag.mjs before signing",
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

// 번들 MCP 서버는 앱 페이로드다 — Tauri 가 굽기 **전에** 컴파일돼 있어야
// `externalBin` 이 찾는다. 순서가 뒤집히면 서버 없는 앱이 조용히 출하되고,
// 사용자는 설치한 뒤에야 에이전트가 안 붙는 걸 알게 된다.
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
 * ⚠️ **라우트를 슬러그까지 못박지 않는다** (2026-08-10 에 풀었다).
 *
 * 종전에는 `--require-webview-route='/ko/topology/?p=domain%3Aviews&mode=focus'` 를
 * 문자열째로 못박고 있었다. 그런데 그 `views` 도메인은 도그푸드 볼트를 다시 만드는
 * 동안 **사라졌다** — 검증기 아홉이 없는 노드를 가리키며 조용히 실패하고 있었고,
 * 고치려 하니 **이 검사가 그 수정을 막았다.** 규격이 좋아지는 방향에서 터지는
 * 게이트는 다음 사람이 게이트 대신 규격을 되돌리게 만든다(`documentation.md`).
 *
 * 그래서 역할을 나눈다: 여기서는 **플래그의 모양**(딥링크가 있고 모드가 맞나)만 보고,
 * 「그 노드가 실재하나」는 볼트를 직접 뒤지는 계약 시험이 본다
 * (`tests/contract/script-vault-references.contract.test.ts`, CI 에서 돈다).
 */

const agentDesignGateChecks = [
  [
    "AGENTS mandatory design gate",
    agentsDoc.includes("docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md") &&
      /design gate/i.test(agentsDoc) &&
      // 마크다운 강조를 지우고 본다 — AGENTS.md 는 `Runs *after* the PO pass` 라고
      // 쓴다. 종전 정규식은 연속 문자열을 요구해 **별표 하나에 깨졌다**(2026-07-31
      // CI). 불변식(디자인 게이트가 PO 다음에 온다)은 지켜지고 있었고 검사기만
      // 취약했다 — 산문의 서식까지 고정하면 게이트가 문서를 인질로 잡는다.
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
  // GitHub Pages 는 `/ontology-atlas` base path 아래로 서빙되므로 manifest 링크는
  // base-path 인식이어야 한다(#617). 리터럴 `/manifest.webmanifest` 는 Pages 에서
  // 404 가 나므로 `withBasePath(...)` 형태를 계약으로 고정한다.
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
 * 창에 주는 권한은 **이름으로 허용**하고, 위험한 계열은 접두어로 막는다.
 *
 * 예전에는 `core:default` **하나만** 허용했다. 의도(광범위한 fs · shell · http ·
 * opener 금지)는 옳았지만 표현이 "아무것도 늘리지 마라" 였고, 업데이터처럼 좁고
 * 필요한 권한 하나를 더할 때 게이트를 지우고 싶게 만든다. 지우는 순간 이 가드는
 * 사라진다.
 *
 * 그래서 두 방향으로 다시 썼다. **허용은 이 목록에 이름이 있을 때만** —
 * 목록이 짧게 유지되는 것이 계약이다. **금지는 계열째** — 새 이름을 몰라도
 * 막힌다. 후자가 실제 보호막이다.
 */
const ALLOWED_CAPABILITY_PERMISSIONS = [
  "core:default",
  // 갱신 확인과 설치. 네트워크는 `tauri.conf.json` 의 endpoint 로 고정돼 있고
  // 사용자 입력이 닿지 않는다. 설치 전 minisign 서명 검증이 강제된다.
  "updater:default",
  // 갱신 후 재시작 하나. `process:default` 가 아니다 — 종료까지 줄 이유가 없다.
  "process:allow-restart",
];

/** 이 계열은 이름을 몰라도 막는다. 로컬-퍼스트 앱이 창에 줄 이유가 없는 것들. */
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
  capabilityPermissions.includes("core:default") &&
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
        ? `\n[desktop-check]   허용 목록에 없는 권한: ${unexpectedPermissions.join(", ")} — 필요하면 이 스크립트의 ALLOWED_CAPABILITY_PERMISSIONS 에 이유와 함께 추가하라`
        : "") +
      (forbiddenPermissions.length > 0
        ? `\n[desktop-check]   금지 계열: ${forbiddenPermissions.join(", ")}`
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

// 파일 내용만 보는 게이트는 컴포넌트가 어디에도 마운트되지 않아도 초록으로
// 남는다 — 실제로 `VaultToolsMenu` 삭제 후 `LocalVaultPicker` 가 고아가 됐는데도
// 이 스크립트는 그 파일 내용을 계속 통과시켰다. 그래서 표면 계약은 "내용 + 마운트"
// 두 가지를 함께 요구한다.
if (
  vaultAgentSetupPanel.includes("getTauriVaultRootPath") &&
  appSettingsMenu.includes("import { VaultAgentSetupPanel }") &&
  appSettingsMenu.includes("<VaultAgentSetupPanel")
) {
  pass("desktop agent setup surface derives the absolute Tauri vault path and is actually mounted by the settings sheet");
} else {
  fail(
    "the desktop agent setup surface must derive the selected absolute Tauri vault path AND be mounted by AppSettingsMenu — a file that no surface renders is not a shipped contract",
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
  // #72 — 선택한 vault 의 절대 경로 확인/복사/Finder 열기. 데스크톱에서 이
  // 경로를 못 보면 에이전트에 붙여넣을 값을 사용자가 알 방법이 없다.
  appSettingsMenu.includes("getTauriVaultRootPath(localVault.handle)") &&
  appSettingsMenu.includes("openTauriVaultInFinder(vaultRootPath)") &&
  appSettingsMenu.includes("app-settings-copy-vault-path") &&
  // 권한 재요청 중에도 최근 볼트 전환이 남아야 복구 경로가 끊기지 않는다.
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
  // #72 — 구 LocalVaultPicker 는 고아라 삭제됐다. 같은 계약(최근 볼트 회수 ·
  // 경로 복사/Finder)은 설정 시트가 담당하며 그 테스트가 덮는다.
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
