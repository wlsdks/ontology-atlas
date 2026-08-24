import path from "node:path";
import { appBundleName } from "./context.mjs";
import { AI_SETTINGS_DEFAULT_BASE_URL } from "./ai-settings-contract.mjs";

export function parseVerifyAppLaunchArgs(argv, {
  defaultAppPath,
  defaultHoldMs = 5000,
} = {}) {
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  const holdMsArg = argv.find((arg) => arg.startsWith("--hold-ms="));
  const ownerNameArg = argv.find((arg) => arg.startsWith("--require-owner-name="));
  const minWindowSizeArg = argv.find((arg) => arg.startsWith("--min-window-size="));
  const minWebviewSizeArg = argv.find((arg) => arg.startsWith("--min-webview-size="));
  const maxWebviewSizeArg = argv.find((arg) => arg.startsWith("--max-webview-size="));
  const webviewWindowSizeArg = argv.find((arg) => arg.startsWith("--webview-window-size="));
  const windowScreenshotArg = argv.find((arg) => arg.startsWith("--window-screenshot="));
  const tryWindowScreenshotArg = argv.find((arg) => arg.startsWith("--try-window-screenshot="));
  const webviewEvidenceArg = argv.find((arg) => arg.startsWith("--webview-evidence="));
  const webviewRouteArg = argv.find((arg) => arg.startsWith("--require-webview-route="));
  const webviewFixtureVaultArg = argv.find((arg) =>
    arg.startsWith("--webview-fixture-vault="),
  );
  const webviewFixtureVaultValue = webviewFixtureVaultArg
    ? webviewFixtureVaultArg.slice("--webview-fixture-vault=".length).trim() || null
    : null;
  const aiSettingsBaseUrlArg = argv.find((arg) => arg.startsWith("--ai-settings-base-url="));
  const requireAccessibilityText = argv
    .filter((arg) => arg.startsWith("--require-accessibility-text="))
    .map((arg) => arg.slice("--require-accessibility-text=".length).trim())
    .filter(Boolean);

  return {
    appPath: positional[0] ?? defaultAppPath,
    holdMs: holdMsArg ? Number(holdMsArg.slice("--hold-ms=".length)) : defaultHoldMs,
    killExisting: argv.includes("--kill-existing"),
    // The release preflight asserts a claim about the *default* window, so it must run without the
    // owner's saved geometry. Without this the `--min-window-size` verdict would be decided by
    // whatever size a developer last dragged the window to.
    resetWindowState: argv.includes("--reset-window-state"),
    leaveRunning: argv.includes("--leave-running"),
    openApp: argv.includes("--open-app"),
    requireWindow: argv.includes("--require-window"),
    requireCapturableWindow: argv.includes("--require-capturable-window"),
    requireAccessibilityWindow: argv.includes("--require-accessibility-window"),
    requireFrontmost: argv.includes("--require-frontmost"),
    requireWebviewContent: argv.includes("--require-webview-content") || !argv.includes("--open-app"),
    requireWebviewRoute: webviewRouteArg
      ? webviewRouteArg.slice("--require-webview-route=".length).trim() || null
      : null,
    webviewFixtureVaultPath: webviewFixtureVaultValue
      ? normalizeAppPath(webviewFixtureVaultValue)
      : null,
    printWindowDiagnostics: argv.includes("--print-window-diagnostics"),
    verifyAiSettings: argv.includes("--verify-ai-settings"),
    // Defaults are filled in here: the verifier, not the app, must decide the
    // address, otherwise "this value reached the field" is not a comparison.
    aiSettingsBaseUrl: aiSettingsBaseUrlArg
      ? aiSettingsBaseUrlArg.slice("--ai-settings-base-url=".length).trim() || null
      : AI_SETTINGS_DEFAULT_BASE_URL,
    requireWebviewReducedMotion: argv.includes("--require-webview-reduced-motion"),
    requireOwnerName: ownerNameArg
      ? ownerNameArg.slice("--require-owner-name=".length)
      : null,
    minWindowSize: minWindowSizeArg
      ? parseMinWindowSize(minWindowSizeArg.slice("--min-window-size=".length))
      : null,
    minWebviewSize: minWebviewSizeArg
      ? parseMinWindowSize(minWebviewSizeArg.slice("--min-webview-size=".length))
      : null,
    maxWebviewSize: maxWebviewSizeArg
      ? parseMinWindowSize(maxWebviewSizeArg.slice("--max-webview-size=".length))
      : null,
    webviewWindowSize: webviewWindowSizeArg
      ? parseMinWindowSize(webviewWindowSizeArg.slice("--webview-window-size=".length))
      : null,
    windowScreenshotPath: windowScreenshotArg
      ? windowScreenshotArg.slice("--window-screenshot=".length).trim() || null
      : null,
    tryWindowScreenshotPath: tryWindowScreenshotArg
      ? tryWindowScreenshotArg.slice("--try-window-screenshot=".length).trim() || null
      : null,
    webviewEvidencePath: webviewEvidenceArg
      ? webviewEvidenceArg.slice("--webview-evidence=".length).trim() || null
      : null,
    requireAccessibilityText,
  };
}


/**
 * `--leave-running` keeps the app alive after the harness returns, and the window-state plugin
 * writes geometry when that app eventually quits — directly over the owner's file the harness
 * just restored in its `finally` block. No ordering makes both flags honest at once, so the pair
 * is refused before anything launches. Mirrors `staleInstanceFailure`: a pure message so the
 * refusal itself is testable without a process exit.
 *
 * Returns the failure message, or `null` when the flags can coexist.
 */
export function windowStateFlagConflict({ resetWindowState, leaveRunning } = {}) {
  if (!resetWindowState || !leaveRunning) {
    return null;
  }
  return (
    "--reset-window-state is not compatible with --leave-running; the app left running writes " +
    "its window geometry on quit and would overwrite the restored file. Omit --leave-running."
  );
}


export function printHelp() {
  console.log(`Usage: pnpm desktop:verify-app [path/to/${appBundleName}] [--hold-ms=5000] [--kill-existing] [--reset-window-state] [--leave-running] [--open-app] [--require-window] [--require-capturable-window] [--window-screenshot=/tmp/atlas-window.png] [--try-window-screenshot=/tmp/atlas-window.png] [--webview-evidence=/tmp/atlas-webview.json] [--require-accessibility-window] [--require-frontmost] [--require-accessibility-text="개념 지도"] [--require-webview-content] [--require-webview-route=/en/topology/] [--webview-fixture-vault=docs/ontology] [--require-webview-reduced-motion] [--verify-ai-settings] [--ai-settings-base-url=http://localhost:11434] [--print-window-diagnostics] [--require-owner-name="Ontology Atlas"] [--min-window-size=1040x720] [--min-webview-size=1400x860] [--max-webview-size=1100x800] [--webview-window-size=1100x800]

Launches the packaged macOS .app executable, waits long enough to catch early
startup crashes, then terminates it. This is an unsigned local runtime smoke;
release artifacts still need pnpm desktop:verify-release-dmg.

⚠️  --require-webview-route 는 **주소만** 보장한다. 화면은 아닐 수 있다.
    앱은 실제 내비게이션이 아니라 history.replaceState + popstate 로 주소를
    갈아끼운다(볼트 픽스처를 심은 IndexedDB 상태를 지키려고 — 근거는
    src-tauri/src/lib.rs 의 build_webview_verify_route_script 주석).
    그래서 **소프트 내비게이션을 스스로 듣는 표면**(지도 · 공방)만 실제로
    화면이 바뀌고, 그 밖의 평범한 Next 라우트는 주소만 바뀐 채 루트(지도)가
    남는다.
    2026-07-29 실측: /ko/download/ 를 요구했더니 주소는 통과하는데 화면은
    지도였다 — 그걸 앱 결함으로 두 번 오진했다.
    → 라우트 도달을 정말 확인하려면 그 화면에만 있는 문자열을
      --require-webview-content 로 **함께** 걸어라. URL 일치는 도달의 증거가
      아니다.

Options:
  --kill-existing   Terminate already-running copies of this app bundle executable before launch,
                    including installed .app copies with the same executable name.
  --reset-window-state
                    Move the owner's saved window geometry aside for this run and restore it after
                    the verified app has fully exited, so default-window claims such as
                    --min-window-size are not decided by a previously dragged size. Not compatible
                    with --leave-running: a still-running app writes geometry back on quit.
  --leave-running   Keep the verified app running after verification so Computer Use or a human can
                    inspect the same installed app window. Direct WebView route checks can use this
                    without --open-app so the verifier returns instead of holding the process open.
  --open-app        Launch through macOS LaunchServices (open -n) instead of spawning the executable directly.
  --verify-ai-settings
                    Direct executable launch only. Open the settings sheet, walk into AI connection,
                    choose the local/address branch, type the base URL, press the connection check,
                    and require a live model list plus a chosen model. Needs --webview-fixture-vault
                    because the check refuses to send anything it cannot log inside a vault; the
                    verifier also reads that vault's .ontology-atlas/llm-audit.jsonl and requires a
                    fresh local verify entry pointed at the same host. A local runner that is not
                    running fails loudly with the on-screen failure sentence.
  --ai-settings-base-url=URL
                    Base URL typed into the local/address field (default http://localhost:11434).
  --require-window  Require an on-screen macOS window owned by the launched app process.
  --require-capturable-window
                    Require at least one matching CoreGraphics window to produce a local screenshot
                    artifact, first by window id and then by the current-desktop bounds region.
                    This adds capture proof; Computer Use is still the final desktop-control check.
  --window-screenshot=PATH
                    Save the first successful matching window capture to PATH for human review.
                    Requires --require-capturable-window.
  --try-window-screenshot=PATH
                    Best-effort visual evidence. If an on-screen window is available and macOS
                    allows capture, save a screenshot to PATH; capture failure does not fail the
                    verifier. Use --window-screenshot with --require-capturable-window for a hard gate.
  --webview-evidence=PATH
                    Save the validated WebView marker payload to PATH. Direct executable launch only.
                    This gives deterministic installed-app route evidence when macOS screen capture
                    or Computer Use observation is unavailable.
  --require-webview-reduced-motion
                    Require the installed WebView to report the macOS reduced-motion preference.
                    Use after enabling Reduce Motion in System Settings; direct executable launch only.
  --require-accessibility-window
                    Require System Events to see at least one Accessibility window for the launched
                    process. This fails when macOS only exposes an app/menu tree with zero AX windows.
  --require-frontmost
                    Require System Events to report the launched process as frontmost. Use this when
                    diagnosing whether LaunchServices opened a foreground app for Computer Use.
  --require-accessibility-text=TEXT
                    Require the Swift Accessibility probe to find TEXT in the launched app's AX tree.
                    Repeat this option to require several screen phrases. Useful with --open-app,
                    where stdout WebView markers are not available.
  --require-webview-content
                    Require the Tauri WebView to report a loaded DOM with non-empty body text.
                    This uses stdout from direct executable launch and is not compatible with --open-app.
  --require-webview-route=PATH
                    Direct executable launch only. Navigate the packaged WebView to PATH before
                    reading the DOM and require the reported tauri:// pathname to match. Useful
                    for proving installed-app routes such as /en/topology/ without UI clicks.
  --webview-fixture-vault=PATH
                    Direct executable launch only. Open PATH inside the verifier's incognito
                    WebView storage before route checks. The user's persisted vault remains
                    untouched, while the evidence payload records the exact fixture path.
  --print-window-diagnostics
                    Print one JSON line with launched process ids, CoreGraphics windows, and
                    System Events accessibility rows. Use when Computer Use cannot observe
                    a window that macOS itself reports as visible.
  --require-owner-name=NAME
                    Require the visible app window's macOS owner name to match NAME.
  --min-window-size=WIDTHxHEIGHT
                    Require the visible app window to be at least WIDTH by HEIGHT points.
  --min-webview-size=WIDTHxHEIGHT
                    Require the direct-launch WebView DOM viewport to be at least WIDTH by
                    HEIGHT CSS pixels. Use this for deterministic fullscreen/large-screen
                    Relief checks even when macOS screen capture is unavailable.
  --max-webview-size=WIDTHxHEIGHT
                    Require the direct-launch WebView DOM viewport to be no larger than
                    WIDTH by HEIGHT CSS pixels. Use this to prove a compact Relief smoke is
                    actually exercising a compact installed-app viewport instead of the
                    default desktop window.
  --webview-window-size=WIDTHxHEIGHT
                    Request a verification-only Tauri main-window size before the WebView
                    evidence probe runs. This is direct executable launch only; pair it with
                    --max-webview-size to prove compact Relief behavior in the installed app.
`);
}


export function fail(message) {
  console.error(`[desktop-app-verify] ${message}`);
  process.exit(1);
}


export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export function parseMinWindowSize(value) {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}


export function normalizeWebviewRoute(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const route = value.trim();
  if (!route.startsWith("/") || route.startsWith("//") || route.includes("://")) {
    return null;
  }
  if (/[\s"'<>\\]/.test(route)) return null;
  return route;
}


export function normalizeAppPath(value) {
  return path.resolve(value).replace(/\/+$/, "");
}
