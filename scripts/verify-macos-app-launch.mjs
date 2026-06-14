#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadMacosReleaseNames, resolveMacosExecutable } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName } = names;
const WEBVIEW_VERIFY_ENV = "ONTOLOGY_ATLAS_VERIFY_WEBVIEW";
const WEBVIEW_VERIFY_ROUTE_ENV = "ONTOLOGY_ATLAS_VERIFY_ROUTE";
const WEBVIEW_VERIFY_TOPOLOGY_DRAG_ENV = "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_DRAG";
const WEBVIEW_VERIFY_TOPOLOGY_CREATE_NODE_ENV = "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_CREATE_NODE";
const WEBVIEW_VERIFY_WINDOW_SIZE_ENV = "ONTOLOGY_ATLAS_VERIFY_WINDOW_SIZE";
const RELATION_LABEL_COMPACT_WIDTH_TOLERANCE_PX = 2.5;
const WEBVIEW_VERIFY_PREFIX = "[ontology-atlas-webview-verify] ";
const WEBVIEW_VERIFY_TIMEOUT_MS = 7000;
const STALE_PROCESS_EXIT_TIMEOUT_MS = 6000;
const STALE_PROCESS_POLL_MS = 200;
const ACCESSIBILITY_WINDOW_TIMEOUT_MS = 3000;
const ACCESSIBILITY_TEXT_TIMEOUT_MS = 7000;
const ACCESSIBILITY_TEXT_MAX_DEPTH = 8;
const ACCESSIBILITY_TEXT_MAX_CHILDREN_PER_NODE = 80;
const VISUAL_EVIDENCE_MIN_NON_DARK_RATIO = 0.001;
const VISUAL_EVIDENCE_MIN_LUMA_SPREAD = 8;
const WEBVIEW_WORKBENCH_MARKERS = [
  /온톨로지|Ontology/,
  /Workspace|작업공간|저장소|문서함|Source Vault|Documents|Relief|Concept map|개념/,
];

function normalizeTopologySelectedParam(value) {
  if (typeof value !== "string" || value.trim().length === 0) return "";
  return value.trim();
}

const INSTALLED_APP_CANDIDATE_DIRS = [
  "/Applications",
  path.join(os.homedir(), "Applications"),
];

export function verifyLockPath(appPath) {
  const digest = crypto
    .createHash("sha256")
    .update(path.resolve(appPath))
    .digest("hex")
    .slice(0, 16);
  return path.join(os.tmpdir(), `ontology-atlas-verify-app-${digest}.lock`);
}

function pidIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockOwner(lockDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

export function createVerifyLock(lockDir, { appPath, pid = process.pid } = {}) {
  try {
    fs.mkdirSync(lockDir);
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({
        pid,
        appPath: appPath ? path.resolve(appPath) : null,
        startedAt: new Date().toISOString(),
      }),
    );
    return {
      ok: true,
      release: () => fs.rmSync(lockDir, { recursive: true, force: true }),
    };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const owner = readLockOwner(lockDir);
    if (owner && !pidIsRunning(Number(owner.pid))) {
      fs.rmSync(lockDir, { recursive: true, force: true });
      return createVerifyLock(lockDir, { appPath, pid });
    }
    const ownerLabel = owner?.pid ? `pid=${owner.pid}` : "unknown owner";
    return {
      ok: false,
      message:
        `another desktop app verification is already running for this app (${ownerLabel}); ` +
        "run desktop:verify-app commands sequentially so --kill-existing cannot terminate a sibling verifier",
      release: () => undefined,
    };
  }
}

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
  const requireAccessibilityText = argv
    .filter((arg) => arg.startsWith("--require-accessibility-text="))
    .map((arg) => arg.slice("--require-accessibility-text=".length).trim())
    .filter(Boolean);

  return {
    appPath: positional[0] ?? defaultAppPath,
    holdMs: holdMsArg ? Number(holdMsArg.slice("--hold-ms=".length)) : defaultHoldMs,
    killExisting: argv.includes("--kill-existing"),
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
    printWindowDiagnostics: argv.includes("--print-window-diagnostics"),
    verifyTopologyDrag: argv.includes("--verify-topology-drag"),
    verifyTopologyCreateNode: argv.includes("--verify-topology-create-node"),
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

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-app [path/to/${appBundleName}] [--hold-ms=5000] [--kill-existing] [--leave-running] [--open-app] [--require-window] [--require-capturable-window] [--window-screenshot=/tmp/atlas-window.png] [--try-window-screenshot=/tmp/atlas-window.png] [--webview-evidence=/tmp/atlas-webview.json] [--require-accessibility-window] [--require-frontmost] [--require-accessibility-text="개념 지도"] [--require-webview-content] [--require-webview-route=/en/topology/] [--verify-topology-drag] [--verify-topology-create-node] [--print-window-diagnostics] [--require-owner-name="Ontology Atlas"] [--min-window-size=1040x720] [--min-webview-size=1400x860] [--max-webview-size=1100x800] [--webview-window-size=1100x800]

Launches the packaged macOS .app executable, waits long enough to catch early
startup crashes, then terminates it. This is an unsigned local runtime smoke;
release artifacts still need pnpm desktop:verify-release-dmg.

Options:
  --kill-existing   Terminate already-running copies of this app bundle executable before launch,
                    including installed .app copies with the same executable name.
  --leave-running   Keep the verified app running after verification so Computer Use or a human can
                    inspect the same installed app window. Direct WebView route checks can use this
                    without --open-app so the verifier returns instead of holding the process open.
  --open-app        Launch through macOS LaunchServices (open -n) instead of spawning the executable directly.
  --verify-topology-create-node
                    On a /topology route, click the Concept action before WebView marker capture and
                    require the Add Concept composer backdrop proof.
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
  --verify-topology-drag
                    Direct executable launch only. On /topology routes, select the Views card,
                    perform a short WebView-level card drag, and require the dragged card plus a
                    companion card to settle visible, aligned, unclipped, and non-overlapping.
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

function fail(message) {
  console.error(`[desktop-app-verify] ${message}`);
  process.exit(1);
}

function sleep(ms) {
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

function normalizeAppPath(value) {
  return path.resolve(value).replace(/\/+$/, "");
}

function readBundleIdentifier(appPath) {
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(plistPath)) return null;
  const result = spawnSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleIdentifier", plistPath],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function webviewVerifyEnvPatch({
  requireWebviewRoute = null,
  verifyTopologyDrag = false,
  verifyTopologyCreateNode = false,
  webviewWindowSize = null,
} = {}) {
  return {
    [WEBVIEW_VERIFY_ENV]: "1",
    ...(requireWebviewRoute ? { [WEBVIEW_VERIFY_ROUTE_ENV]: requireWebviewRoute } : {}),
    ...(verifyTopologyDrag ? { [WEBVIEW_VERIFY_TOPOLOGY_DRAG_ENV]: "1" } : {}),
    ...(verifyTopologyCreateNode ? { [WEBVIEW_VERIFY_TOPOLOGY_CREATE_NODE_ENV]: "1" } : {}),
    ...(webviewWindowSize
      ? {
          [WEBVIEW_VERIFY_WINDOW_SIZE_ENV]: `${webviewWindowSize.width}x${webviewWindowSize.height}`,
        }
      : {}),
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function expectedRelationLabelAgentGateText(gateKind) {
  if (gateKind === "handoff-ready") return "MCP/CLI";
  if (gateKind === "preflight-first") return "check";
  return "review";
}

function installedAppBundleCandidates(appBundleName) {
  return INSTALLED_APP_CANDIDATE_DIRS
    .map((dir) => path.join(dir, appBundleName))
    .filter((appPath) => fs.existsSync(appPath));
}

export function bundlePathConflictWarnings({
  targetAppPath,
  targetBundleIdentifier,
  candidates,
}) {
  if (!targetBundleIdentifier) return [];
  const normalizedTarget = normalizeAppPath(targetAppPath);
  return candidates
    .filter(
      (candidate) =>
        candidate.bundleIdentifier === targetBundleIdentifier &&
        normalizeAppPath(candidate.appPath) !== normalizedTarget,
    )
    .map(
      (candidate) =>
        `${normalizeAppPath(candidate.appPath)} shares bundle id ${targetBundleIdentifier} with the verified app; app-name Computer Use may attach to that installed copy unless the Run script refreshed it, so use the full built app path when exact bundle provenance matters.`,
    );
}

function printBundlePathConflictWarnings({ appPath, appBundleName }) {
  const targetBundleIdentifier = readBundleIdentifier(appPath);
  const candidates = installedAppBundleCandidates(appBundleName).map((candidatePath) => ({
    appPath: candidatePath,
    bundleIdentifier: readBundleIdentifier(candidatePath),
  }));
  for (const warning of bundlePathConflictWarnings({
    targetAppPath: appPath,
    targetBundleIdentifier,
    candidates,
  })) {
    console.warn(`[desktop-app-verify] warning: ${warning}`);
  }
}

async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000).then(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function existingProcessPatterns({ executablePath }) {
  const executableName = path.basename(executablePath);
  return [
    regexEscape(executablePath),
    `\\.app/Contents/MacOS/${regexEscape(executableName)}$`,
  ];
}

function terminateExisting({ appPath, executablePath }) {
  for (const pattern of existingProcessPatterns({ appPath, executablePath })) {
    spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });
  }
}

function processExists(executablePath) {
  const result = spawnSync("pgrep", ["-f", executablePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function processIds(executablePath) {
  const result = spawnSync("pgrep", ["-f", executablePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\s+/)
    .map((pid) => Number(pid))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function processIdsForPattern(pattern) {
  const result = spawnSync("pgrep", ["-f", pattern], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\s+/)
    .map((pid) => Number(pid))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

export function existingProcessIds({ appPath, executablePath }) {
  const pids = new Set();
  for (const pattern of existingProcessPatterns({ appPath, executablePath })) {
    for (const pid of processIdsForPattern(pattern)) {
      pids.add(pid);
    }
  }
  return Array.from(pids).sort((a, b) => a - b);
}

export async function waitForExistingProcessesToExit({
  appPath,
  executablePath,
  timeoutMs = STALE_PROCESS_EXIT_TIMEOUT_MS,
  intervalMs = STALE_PROCESS_POLL_MS,
  readProcessIds = existingProcessIds,
  sleepFn = sleep,
} = {}) {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  let pids = readProcessIds({ appPath, executablePath });
  for (let attempt = 0; pids.length > 0 && attempt < attempts; attempt += 1) {
    await sleepFn(intervalMs);
    pids = readProcessIds({ appPath, executablePath });
  }
  return pids;
}

export function parseOnscreenWindows(payload, ownerPids) {
  const allowedPids = new Set(ownerPids);
  const windows = JSON.parse(payload);
  if (!Array.isArray(windows)) return [];
  return windows.filter((window) => {
    const bounds = window.kCGWindowBounds;
    return (
      allowedPids.has(window.kCGWindowOwnerPID) &&
      window.kCGWindowIsOnscreen === true &&
      window.kCGWindowLayer === 0 &&
      window.kCGWindowAlpha !== 0 &&
      bounds &&
      Number(bounds.Width) > 0 &&
      Number(bounds.Height) > 0
    );
  });
}

export function validateWindowRequirements(windows, {
  requireOwnerName = null,
  minWindowSize = null,
} = {}) {
  if (requireOwnerName) {
    const matchesOwnerName = windows.some((window) => window.kCGWindowOwnerName === requireOwnerName);
    if (!matchesOwnerName) {
      return `no visible app window has owner name "${requireOwnerName}"`;
    }
  }
  if (minWindowSize) {
    const matchesSize = windows.some((window) => {
      const bounds = window.kCGWindowBounds;
      return (
        bounds &&
        Number(bounds.Width) >= minWindowSize.width &&
        Number(bounds.Height) >= minWindowSize.height
      );
    });
    if (!matchesSize) {
      return `no visible app window is at least ${minWindowSize.width}x${minWindowSize.height}`;
    }
  }
  return null;
}

export function windowCaptureTargets(windows) {
  return windows
    .map((window) => ({
      id: Number(window.kCGWindowNumber),
      ownerPid: Number(window.kCGWindowOwnerPID),
      ownerName: window.kCGWindowOwnerName ?? null,
      name: window.kCGWindowName ?? null,
      bounds: window.kCGWindowBounds ?? null,
      alpha: window.kCGWindowAlpha ?? null,
      sharingState: window.kCGWindowSharingState ?? null,
      storeType: window.kCGWindowStoreType ?? null,
      memoryUsage: window.kCGWindowMemoryUsage ?? null,
    }))
    .filter((window) => Number.isInteger(window.id) && window.id > 0);
}

export function buildAccessibilityWindowProbeScript(pids) {
  const predicates = pids.map((pid) => `procPid = ${pid}`).join(" or ");
  return `
set output to ""
tell application "System Events" to launch
tell application "System Events"
  repeat with proc in processes
    try
      set procPid to unix id of proc
      if ${predicates || "false"} then
        set output to output & procPid & tab & name of proc & tab & frontmost of proc & tab & (count of windows of proc) & tab & (count of UI elements of proc) & linefeed
      end if
    end try
  end repeat
end tell
return output
`;
}

export function buildForegroundActivationScript({ bundleIdentifier = null, pids = [] } = {}) {
  const predicates = pids.map((pid) => `procPid = ${pid}`).join(" or ");
  const bundleActivate = bundleIdentifier
    ? `
try
  tell application id ${JSON.stringify(bundleIdentifier)} to activate
  set activatedByBundle to true
end try
`
    : "";
  return `
set activatedByBundle to false
set activatedByPid to false
${bundleActivate}
delay 0.4
tell application "System Events" to launch
tell application "System Events"
  repeat with proc in processes
    try
      set procPid to unix id of proc
      if ${predicates || "false"} then
        set frontmost of proc to true
        set activatedByPid to true
      end if
    end try
  end repeat
end tell
return "bundle=" & activatedByBundle & tab & "pid=" & activatedByPid
`;
}

function activateAppForVisualEvidence({ appPath, executablePath }) {
  const pids = processIds(executablePath);
  const bundleIdentifier = readBundleIdentifier(appPath);
  const result = spawnSync(
    "osascript",
    ["-e", buildForegroundActivationScript({ bundleIdentifier, pids })],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    },
  );
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const accessibility = spawnSync("osascript", ["-e", buildAccessibilityWindowProbeScript(pids)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: ACCESSIBILITY_WINDOW_TIMEOUT_MS,
  });
  const accessibilityRows = accessibility.status === 0
    ? parseAccessibilityWindowRows(accessibility.stdout)
    : [];
  const frontmost = accessibilityRows.some((row) => row.frontmost);
  const ok =
    result.status === 0 &&
    (/\bbundle=true\b/.test(stdout) || /\bpid=true\b/.test(stdout)) &&
    frontmost;
  return {
    ok,
    bundleIdentifier,
    pids,
    frontmost,
    status: result.status,
    stdout,
    stderr: [
      result.error?.code === "ETIMEDOUT" ? "foreground activation timed out" : null,
      stderr,
      accessibility.status !== 0
        ? `post-activation Accessibility probe failed: ${accessibility.stderr.trim()}`
        : null,
    ].filter(Boolean).join("; "),
  };
}

export function parseAccessibilityWindowRows(payload) {
  return payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, processName, frontmost, windowCount, uiElementCount] = line.split("\t");
      return {
        pid: Number(pid),
        processName,
        frontmost: frontmost === "true",
        windowCount: Number(windowCount),
        uiElementCount: uiElementCount === undefined ? 0 : Number(uiElementCount),
      };
    })
    .filter((row) => Number.isInteger(row.pid) && row.pid > 0);
}

export function validateAccessibilityWindowRows(rows) {
  if (rows.length === 0) {
    return "System Events did not find the launched process";
  }
  const visibleRows = rows.filter((row) => Number(row.windowCount) > 0);
  if (visibleRows.length === 0) {
    return `System Events found the process but reported no Accessibility windows (${rows
      .map((row) => `${row.processName || "unknown"} pid=${row.pid}`)
      .join(", ")})`;
  }
  return null;
}

export function validateFrontmostAccessibilityRows(rows) {
  if (rows.length === 0) {
    return "System Events did not find the launched process";
  }
  if (!rows.some((row) => row.frontmost)) {
    return `System Events found the process but it was not frontmost (${rows
      .map((row) => `${row.processName || "unknown"} pid=${row.pid}`)
      .join(", ")})`;
  }
  return null;
}

export function buildAccessibilityTextProbeSwift(pids, requiredText = []) {
  const pidList = JSON.stringify(pids);
  const requiredList = JSON.stringify(requiredText);
  return `
import ApplicationServices
import Foundation

let requiredPids: Set<pid_t> = ${pidList}
let requiredText = ${requiredList}
let maxDepth = ${ACCESSIBILITY_TEXT_MAX_DEPTH}
let maxChildrenPerNode = ${ACCESSIBILITY_TEXT_MAX_CHILDREN_PER_NODE}
var found = Set<String>()
var output: [String] = []

func isComplete() -> Bool {
  return !requiredText.isEmpty && requiredText.allSatisfy { found.contains($0) }
}

func copyAttribute(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
  if result != .success {
    return nil
  }
  return value
}

func appendValue(_ value: CFTypeRef?) {
  if isComplete() {
    return
  }
  guard let value else {
    return
  }
  let text = String(describing: value)
  if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
    return
  }
  if requiredText.isEmpty {
    output.append(text)
    return
  }
  for required in requiredText where !found.contains(required) && text.contains(required) {
    found.insert(required)
    output.append(text)
  }
}

func collectText(_ element: AXUIElement, depth: Int) {
  if isComplete() || depth > maxDepth {
    return
  }
  appendValue(copyAttribute(element, kAXTitleAttribute))
  appendValue(copyAttribute(element, kAXDescriptionAttribute))
  appendValue(copyAttribute(element, kAXValueAttribute))
  appendValue(copyAttribute(element, kAXRoleDescriptionAttribute))
  if isComplete() {
    return
  }
  guard let children = copyAttribute(element, kAXChildrenAttribute) as? [AXUIElement] else {
    return
  }
  for child in children.prefix(maxChildrenPerNode) {
    if isComplete() {
      break
    }
    collectText(child, depth: depth + 1)
  }
}

for pid in requiredPids {
  if isComplete() {
    break
  }
  collectText(AXUIElementCreateApplication(pid), depth: 0)
}

print(output.joined(separator: "\\n"))
`;
}

export function validateAccessibilityText(payload, requiredText) {
  if (requiredText.length === 0) return null;
  if (typeof payload !== "string" || payload.trim().length === 0) {
    return "empty Accessibility text payload";
  }
  for (const text of requiredText) {
    if (!payload.includes(text)) {
      return `missing Accessibility text "${text}"`;
    }
  }
  return null;
}

export function parseWebviewVerifyPayload(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith(WEBVIEW_VERIFY_PREFIX));
  if (!line) return null;

  const raw = line.slice(WEBVIEW_VERIFY_PREFIX.length).trim();
  const parsed = JSON.parse(raw);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

export function validateSelectedRelationLabelCompactMarkers(markers, width) {
  const relationLabelViewportInset = Math.max(
    0,
    Number(markers?.topologySelectedRelationLabelViewportInset || 0),
  );
  if (
    Number(markers?.topologySelectedRelationLabelHitLeft || 0) <
    relationLabelViewportInset - 0.5
  ) {
    return `WebView Relief selected relation label overflowed the viewport left (${markers?.topologySelectedRelationLabelHitLeft ?? "missing"}px)`;
  }
  const relationLabelRightInset =
    Number(width || 0) - Number(markers?.topologySelectedRelationLabelHitRight || 0);
  if (relationLabelRightInset < relationLabelViewportInset - 0.5) {
    return `WebView Relief selected relation label overflowed the viewport right (right inset ${Number.isFinite(relationLabelRightInset) ? relationLabelRightInset : "missing"}px)`;
  }
  if (!/^(true|false)$/.test(String(markers?.topologySelectedRelationLabelCompact || ""))) {
    return "WebView Relief selected relation label did not expose a compact-mode marker";
  }
  const relationLabelCompact =
    String(markers?.topologySelectedRelationLabelCompact) === "true";
  const relationLabelHitWidth = Number(markers?.topologySelectedRelationLabelHitWidth || 0);
  const relationLabelDesiredWidth = Number(
    markers?.topologySelectedRelationLabelDesiredWidth || 0,
  );
  const relationLabelCenteredAvailableWidth = Number(
    markers?.topologySelectedRelationLabelCenteredAvailableWidth || 0,
  );
  if (!(relationLabelDesiredWidth >= relationLabelHitWidth)) {
    return `WebView Relief selected relation label desired width was smaller than its rendered width (${relationLabelDesiredWidth || "missing"} < ${relationLabelHitWidth || "missing"})`;
  }
  if (!(relationLabelCenteredAvailableWidth >= relationLabelHitWidth)) {
    return `WebView Relief selected relation label available width was smaller than its rendered width (${relationLabelCenteredAvailableWidth || "missing"} < ${relationLabelHitWidth || "missing"})`;
  }
  const relationLabelCompactBasis = relationLabelCenteredAvailableWidth || relationLabelHitWidth;
  const relationLabelRequiresCompact =
    relationLabelCompactBasis + RELATION_LABEL_COMPACT_WIDTH_TOLERANCE_PX <
    relationLabelDesiredWidth;
  if (relationLabelRequiresCompact !== relationLabelCompact) {
    return `WebView Relief selected relation label compact marker was inconsistent with its available width (${relationLabelCompactBasis} of ${relationLabelDesiredWidth})`;
  }
  return null;
}

export function validateWebviewVerifyPayload(payload, {
  expectedPath = null,
  minWebviewSize = null,
  maxWebviewSize = null,
  requireTopologyDrag = false,
  requireTopologyCreateNode = false,
} = {}) {
  if (!payload || typeof payload !== "object") {
    return "missing WebView verification payload";
  }
  if (typeof payload.href !== "string" || !payload.href.startsWith("tauri://")) {
    return "WebView did not report a tauri:// URL";
  }
  if (payload.readyState !== "complete") {
    return `WebView document was not complete (readyState=${payload.readyState ?? "unknown"})`;
  }
  if (typeof payload.bodyText !== "string" || payload.bodyText.trim().length === 0) {
    return "WebView body text was empty";
  }
  if (
    payload.title !== "Ontology Atlas" &&
    !(typeof payload.title === "string" && payload.title.endsWith(" · ontology-atlas"))
  ) {
    return `WebView did not report an Ontology Atlas route title (title=${payload.title ?? "unknown"})`;
  }
  if (!WEBVIEW_WORKBENCH_MARKERS.every((marker) => marker.test(payload.bodyText))) {
    return "WebView body text did not include Ontology Atlas workbench markers";
  }
  if (!payload.markers || typeof payload.markers !== "object") {
    return "WebView did not report structured markers";
  }
  if (minWebviewSize) {
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < minWebviewSize.width ||
      height < minWebviewSize.height
    ) {
      return `WebView viewport was ${width || "unknown"}x${height || "unknown"}, expected at least ${minWebviewSize.width}x${minWebviewSize.height}`;
    }
  }
  if (maxWebviewSize) {
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width > maxWebviewSize.width ||
      height > maxWebviewSize.height
    ) {
      return `WebView viewport was ${width || "unknown"}x${height || "unknown"}, expected at most ${maxWebviewSize.width}x${maxWebviewSize.height}`;
    }
  }
  if (payload.markers.ontologyNav !== true) {
    return "WebView did not report the ontology navigation marker";
  }
  if (payload.markers.sourceVaultNav !== true) {
    return "WebView did not report the source vault navigation marker";
  }
  const webviewUrl = new URL(payload.href);
  const webviewPath = webviewUrl.pathname;
  if (expectedPath && webviewPath !== expectedPath) {
    return `WebView reported pathname ${webviewPath}, expected ${expectedPath}`;
  }
  const topologySelectedParam = normalizeTopologySelectedParam(
    webviewUrl.searchParams.get("p"),
  );
  const selectedNodeId =
    typeof payload.markers.topologySelectedNodeId === "string"
      ? payload.markers.topologySelectedNodeId.trim()
      : "";
  const selectedNodeKind =
    typeof payload.markers.topologySelectedNodeKind === "string"
      ? payload.markers.topologySelectedNodeKind.trim()
      : "";
  const selectedNodeTitle =
    typeof payload.markers.topologySelectedNodeTitle === "string"
      ? payload.markers.topologySelectedNodeTitle.trim()
      : "";
  const selectedNodeSummary =
    typeof payload.markers.topologySelectedNodeSummary === "string"
      ? payload.markers.topologySelectedNodeSummary.trim()
      : "";
  const selectedRelationSource =
    typeof payload.markers.topologySelectedRelationHandleStripSource === "string"
      ? payload.markers.topologySelectedRelationHandleStripSource.trim()
      : "";
  const selectedRelationTarget =
    typeof payload.markers.topologySelectedRelationHandleStripTarget === "string"
      ? payload.markers.topologySelectedRelationHandleStripTarget.trim()
      : "";
  const selectedRelationContextVisible =
    payload.markers.topologySelectedRelationClaimLensVisible === true &&
    Boolean(topologySelectedParam) &&
    (selectedRelationSource === topologySelectedParam ||
      selectedRelationTarget === topologySelectedParam);
  if (
    webviewPath.includes("/ontology/insights") &&
    payload.markers.businessDecisionQuestions !== true
  ) {
    return "WebView did not report the business decision questions marker";
  }
  if (
    webviewPath.includes("/ontology/insights") &&
    payload.markers.readerDecisionLens !== true
  ) {
    return "WebView did not report the reader decision lens marker";
  }
  if (webviewPath.includes("/topology") && payload.markers.topologyRelief !== true) {
    return "WebView did not report the Relief topology marker";
  }
  if (webviewPath.includes("/topology") && webviewPath.startsWith("/ko/")) {
    if (!String(payload.markers.topologyTopWorkspaceLabel || "").trim().includes("작업공간")) {
      return `WebView Korean Relief top workspace label was ${payload.markers.topologyTopWorkspaceLabel || "missing"}`;
    }
    const createLabel = String(payload.markers.topologyTopCreateLabel || "").trim();
    if (createLabel && createLabel !== "개념") {
      return `WebView Korean Relief top create label was ${createLabel}`;
    }
  }
  if (webviewPath.includes("/topology") && requireTopologyCreateNode && payload.markers.topologyCreateNodeOpen !== true) {
    return "WebView did not open the Add Concept composer during verification";
  }
  if (webviewPath.includes("/topology") && payload.markers.topologyCreateNodeOpen === true) {
    if (payload.markers.topologyCreateNodePanelVisible !== true) {
      return "WebView Add Concept composer was open without a visible panel";
    }
    if (payload.markers.topologyCreateNodeBackdropVisible !== true) {
      return "WebView Add Concept backdrop was missing while the composer was open";
    }
    if (payload.markers.topologyCreateNodeBackdropCoversViewport !== true) {
      return "WebView Add Concept backdrop did not cover the viewport";
    }
    if (payload.markers.topologyCreateNodeBackdropPointerEvents !== "auto") {
      return `WebView Add Concept backdrop did not intercept map interaction (${payload.markers.topologyCreateNodeBackdropPointerEvents || "missing"})`;
    }
    const backdropBackground = String(payload.markers.topologyCreateNodeBackdropBackground || "");
    const backdropAlpha = Number(
      backdropBackground.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/)?.[1] ||
      backdropBackground.match(/\/\s*([0-9.]+)\s*\)/)?.[1] ||
      "0",
    );
    if (!(backdropAlpha >= 0.35)) {
      return `WebView Add Concept backdrop dim was too weak (${backdropBackground || "missing"})`;
    }
    if (!String(payload.markers.topologyCreateNodeBackdropFilter || "").includes("blur")) {
      return `WebView Add Concept backdrop did not blur the map (${payload.markers.topologyCreateNodeBackdropFilter || "missing"})`;
    }
    if (
      Number(payload.markers.topologyCreateNodePanelTop || 0) < 110 ||
      Number(payload.markers.topologyCreateNodePanelLeft || 0) < 0 ||
      Number(payload.markers.topologyCreateNodePanelRight || 0) > Number(payload.width || 0)
    ) {
      return `WebView Add Concept panel was out of bounds (${payload.markers.topologyCreateNodePanelLeft ?? "?"}, ${payload.markers.topologyCreateNodePanelTop ?? "?"}, ${payload.markers.topologyCreateNodePanelRight ?? "?"})`;
    }
    if (webviewPath.startsWith("/ko/")) {
      const panelText = String(payload.markers.topologyCreateNodePanelText || "");
      const titlePlaceholder = String(payload.markers.topologyCreateNodeTitlePlaceholder || "");
      const domainPlaceholder = String(payload.markers.topologyCreateNodeDomainPlaceholder || "");
      const submitLabel = String(payload.markers.topologyCreateNodeSubmitLabel || "");
      const kindOptions = Array.isArray(payload.markers.topologyCreateNodeKindOptions)
        ? payload.markers.topologyCreateNodeKindOptions.map(String)
        : [];
      const localizedComposer =
        panelText.includes("개념 추가") &&
        panelText.includes("종류") &&
        titlePlaceholder === "개념 이름" &&
        domainPlaceholder.includes("도메인 slug") &&
        submitLabel.includes("만들기") &&
        ["도메인", "역량", "요소"].every((option) => kindOptions.includes(option));
      if (!localizedComposer) {
        return "WebView Korean Relief localized Add Concept composer markers were missing";
      }
    }
  }
  if (webviewPath.includes("/topology") && topologySelectedParam) {
    if (
      payload.markers.topologySelectedNodePopoverVisible !== true &&
      !selectedRelationContextVisible
    ) {
      return `WebView did not report a visible Relief selected node context for ${topologySelectedParam}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      selectedNodeId !== topologySelectedParam
    ) {
      return `WebView reported selected node ${selectedNodeId || "unknown"}, expected ${topologySelectedParam}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      (!selectedNodeKind || !selectedNodeTitle || !selectedNodeSummary.includes(selectedNodeId))
    ) {
      return `WebView reported incomplete Relief selected node context (${selectedNodeSummary || "unknown"})`;
    }
  }
  if (webviewPath.includes("/topology")) {
    const topologyDragDone =
      requireTopologyDrag &&
      payload.markers.topologyDragAttempted === true &&
      payload.markers.topologyDragReason === "done";
    if (payload.markers.topologySigmaViewportVisible === false) {
      return "WebView did not report a visible Sigma topology viewport";
    }
    if (payload.markers.topologySigmaBootError === true) {
      return "WebView reported a Sigma topology boot error";
    }
    if (payload.markers.topologySigmaReady === false) {
      return "WebView reported Relief before the Sigma renderer was ready";
    }
    if (!(Number(payload.markers.topologyStagePanClickCancelPx) >= 12)) {
      return `WebView reported an over-sensitive Relief stage pan threshold (${payload.markers.topologyStagePanClickCancelPx ?? "missing"}px)`;
    }
    if (
      payload.markers.topologySigmaReady === true &&
      payload.markers.topologyEngineLoadingVisible === true
    ) {
      return "WebView reported a visible Relief engine loading indicator after Sigma was ready";
    }
    if (
      Number.isFinite(payload.markers.topologySigmaCanvasCount) &&
      payload.markers.topologySigmaCanvasCount < 1
    ) {
      return `WebView reported no Sigma canvas (${payload.markers.topologySigmaCanvasCount ?? "unknown"} canvas element(s))`;
    }
    if (payload.markers.topologySkeletonMode === false) {
      return "WebView reported Relief without topology skeleton mode";
    }
    if (payload.markers.topologySkeletonCardsActive === false) {
      return `WebView reported Relief without active skeleton cards (${payload.markers.topologySkeletonCardModelCount ?? "unknown"} card model(s))`;
    }
    if (payload.markers.topologySkeletonLayerPresent === false) {
      return `WebView reported active skeleton cards but no skeleton layer (${payload.markers.topologySkeletonCardModelCount ?? "unknown"} card model(s))`;
    }
    if (
      Number.isFinite(payload.markers.topologySkeletonLayerModelCount) &&
      Number.isFinite(payload.markers.topologySkeletonLayerResolvedCount) &&
      payload.markers.topologySkeletonLayerModelCount > 0 &&
      payload.markers.topologySkeletonLayerResolvedCount < 1
    ) {
      return `WebView reported no resolvable Relief cards (${payload.markers.topologySkeletonLayerResolvedCount}/${payload.markers.topologySkeletonLayerModelCount})`;
    }
    if (
      Number(payload.width) >= 1400 &&
      !(Number(payload.markers.topologyUiScale) >= 1.12)
    ) {
      return `WebView Relief UI scale was ${payload.markers.topologyUiScale ?? "missing"} at ${payload.width}px viewport`;
    }
    if (!topologyDragDone && payload.markers.topologyCardsReady !== true) {
      return "WebView reported Relief cards before the skeleton overlay was ready";
    }
    const minimumTopologyCardCount = topologyDragDone ? 1 : 8;
    if (
      !Number.isFinite(payload.markers.topologyCardCount) ||
      payload.markers.topologyCardCount < minimumTopologyCardCount
    ) {
      return `WebView reported too few visible Relief cards (${payload.markers.topologyCardCount ?? "unknown"} visible, ${payload.markers.topologyCardRawCount ?? "unknown"} raw)`;
    }
    if (requireTopologyDrag && !topologyDragDone) {
      return `WebView did not attempt the Relief card drag verification (${payload.markers.topologyDragReason ?? "unknown reason"})`;
    }
    if (
      requireTopologyDrag &&
      !(Number(payload.markers.topologySelectedDockCompanionCount) >= 1)
    ) {
      return `WebView did not report selected Relief fan-out companions (${payload.markers.topologySelectedDockCompanionCount ?? "missing"} companion(s))`;
    }
    const hasVisibleSelectedFanOut =
      Number(payload.markers.topologySelectedDockVisibleCompanionCount) >= 1 ||
      Number(payload.markers.topologyDragVisibleCompanionCount) >= 1;
    if (
      requireTopologyDrag &&
      !hasVisibleSelectedFanOut
    ) {
      return `WebView did not report a visible selected Relief fan-out companion (${payload.markers.topologySelectedDockVisibleCompanionCount ?? "missing"} current, ${payload.markers.topologyDragVisibleCompanionCount ?? "missing"} captured)`;
    }
    if (
      requireTopologyDrag &&
      payload.markers.topologySelectedDockCompanionVisible !== true &&
      payload.markers.topologyDragCompanionVisible !== true
    ) {
      return "WebView reported selected Relief fan-out companions as hidden";
    }
    if (payload.markers.topologyCardOverlapCount !== 0) {
      return `WebView reported overlapping Relief cards (${payload.markers.topologyCardOverlapCount ?? "unknown"} overlap pair(s))`;
    }
    if (payload.markers.topologyCardClippedCount !== 0) {
      return `WebView reported clipped Relief cards (${payload.markers.topologyCardClippedCount ?? "unknown"} clipped card(s))`;
    }
    if (payload.markers.topologyCardFixedSurfaceOverlapCount !== 0) {
      return `WebView reported Relief cards overlapping fixed topology surfaces (${payload.markers.topologyCardFixedSurfaceOverlapCount ?? "unknown"} overlap(s))`;
    }
    if (payload.markers.topologyFixedSurfaceOverlapCount !== 0) {
      return `WebView reported overlapping Relief fixed surfaces (${payload.markers.topologyFixedSurfaceOverlapCount ?? "unknown"} overlap(s))`;
    }
    if (Number(payload.width) >= 1400) {
      if (payload.markers.topologyMinimapVisible !== true) {
        return `WebView did not report the Relief minimap at ${payload.width}px viewport`;
      }
      if (
        Number(payload.markers.topologyMinimapWidth) < 220 ||
        Number(payload.markers.topologyMinimapHeight) < 170
      ) {
        return `WebView reported a cramped Relief minimap (${payload.markers.topologyMinimapWidth ?? "unknown"}x${payload.markers.topologyMinimapHeight ?? "unknown"})`;
      }
      if (
        Number(payload.markers.topologyMinimapRight) < 12 ||
        Number(payload.markers.topologyMinimapBottom) < 12
      ) {
        return `WebView reported Relief minimap without viewport-safe inset (right=${payload.markers.topologyMinimapRight ?? "unknown"}, bottom=${payload.markers.topologyMinimapBottom ?? "unknown"})`;
      }
      if (payload.markers.topologyMinimapViewportVisible !== true) {
        return "WebView did not report a visible Relief minimap viewport frame";
      }
      if (
        payload.markers.topologyMinimapViewportFrameState !== "readable" ||
        Number(payload.markers.topologyMinimapViewportWidth) < 24 ||
        Number(payload.markers.topologyMinimapViewportHeight) < 20
      ) {
        return `WebView reported a thin Relief minimap viewport frame (${payload.markers.topologyMinimapViewportFrameState || "unknown"}, ${payload.markers.topologyMinimapViewportWidth ?? "unknown"}x${payload.markers.topologyMinimapViewportHeight ?? "unknown"})`;
      }
    }
    if (
      payload.markers.topologyRelationLensVisible === true &&
      payload.markers.topologyRelationLensPluralMismatch === true
    ) {
      return `WebView reported malformed Relief relation lens copy (${payload.markers.topologyRelationLensText ?? "unknown text"})`;
    }
    const overviewRelationQualityText =
      typeof payload.markers.topologyOverviewRelationQualityText === "string"
        ? payload.markers.topologyOverviewRelationQualityText.trim()
        : "";
    const selectedRelationQualityText =
      typeof payload.markers.topologySelectedRelationQualityLensText === "string"
        ? payload.markers.topologySelectedRelationQualityLensText.trim()
        : "";
    const legacyRelationQualityText =
      typeof payload.markers.topologyRelationQualityLensText === "string"
        ? payload.markers.topologyRelationQualityLensText.trim()
        : "";
    const relationQualityText =
      overviewRelationQualityText || selectedRelationQualityText || legacyRelationQualityText;
    const isReadableRelationQualityText = (text) =>
      /(strong|강한)[^\d]+\d+/i.test(text) &&
      /(supported|근거)[^\d]+\d+/i.test(text) &&
      /(weak|약한)[^\d]+\d+/i.test(text) &&
      /(review|검토)[^\d]+\d+/i.test(text) &&
      /[·,:]/.test(text);
    const relationQualityTextReadable = isReadableRelationQualityText(relationQualityText);
    const hasOverviewRelationQuality =
      overviewRelationQualityText.length > 0 ||
      (typeof payload.bodyText === "string" &&
        /relation quality|관계 품질/i.test(payload.bodyText) &&
        /(strong|supported|weak|review|강함|지원|약함|검토)/i.test(payload.bodyText));
    if (
      payload.markers.topologyRelationQualityLensVisible !== true &&
      !hasOverviewRelationQuality
    ) {
      return "WebView did not report the Relief relation quality marker";
    }
    if (
      payload.markers.topologyRelationQualityLensVisible === true &&
      relationQualityText.length === 0
    ) {
      return "WebView reported empty Relief relation quality lens text";
    }
    if (
      Object.hasOwn(payload.markers, "topologyOverviewRelationQualityText") &&
      overviewRelationQualityText.length === 0
    ) {
      return "WebView reported empty Relief overview relation quality text";
    }
    if (
      Object.hasOwn(payload.markers, "topologyOverviewRelationQualityText") &&
      overviewRelationQualityText.length > 0 &&
      !isReadableRelationQualityText(overviewRelationQualityText)
    ) {
      return `WebView reported unparseable Relief overview relation quality text (${overviewRelationQualityText})`;
    }
    if (
      Object.hasOwn(payload.markers, "topologySelectedRelationQualityLensText") &&
      selectedRelationQualityText.length > 0 &&
      !isReadableRelationQualityText(selectedRelationQualityText)
    ) {
      return `WebView reported unparseable Relief selected relation quality lens text (${selectedRelationQualityText})`;
    }
    if (
      payload.markers.topologyRelationQualityLensVisible === true &&
      !relationQualityTextReadable
    ) {
      return `WebView reported unparseable Relief relation quality lens text (${relationQualityText})`;
    }
    const overviewAgentReadinessText =
      typeof payload.markers.topologyOverviewAgentReadinessText === "string"
        ? payload.markers.topologyOverviewAgentReadinessText.trim()
        : "";
    const overviewAgentReadinessReadable =
      /(handoff-ready|handoff 가능)[^\d]+\d+/i.test(overviewAgentReadinessText) &&
      /preflight[^\d]+\d+/i.test(overviewAgentReadinessText) &&
      /(review|검토)[^\d]+\d+/i.test(overviewAgentReadinessText) &&
      /[·,:]/.test(overviewAgentReadinessText);
    if (
      typeof payload.markers.topologyOverviewAgentReadinessText !== "string" ||
      !overviewAgentReadinessReadable
    ) {
      return `WebView did not report the Relief overview agent readiness marker (${payload.markers.topologyOverviewAgentReadinessText ?? "unknown text"})`;
    }
    if (
      !Array.isArray(payload.markers.topologyOverviewAgentReadinessMeterSegments) ||
      !["ready", "preflight", "review"].every((kind) =>
        payload.markers.topologyOverviewAgentReadinessMeterSegments.some(
          (segment) =>
            segment &&
            segment.kind === kind &&
            typeof segment.count === "string" &&
            segment.count.trim().length > 0,
        ),
      )
    ) {
      return `WebView did not report the Relief overview agent readiness meter marker (${JSON.stringify(payload.markers.topologyOverviewAgentReadinessMeterSegments ?? null)})`;
    }
    if (Object.hasOwn(payload.markers, "topologyAnalysisPanelVisible")) {
      if (payload.markers.topologyAnalysisPanelVisible !== true) {
        return "WebView did not report a visible Relief analysis panel";
      }
      if (!(Number(payload.markers.topologyAnalysisPanelWidth) >= 360)) {
        return `WebView reported a cramped Relief analysis panel width (${payload.markers.topologyAnalysisPanelWidth ?? "unknown"})`;
      }
      if (!(Number(payload.markers.topologyAnalysisPanelHeight) >= 320)) {
        return `WebView reported a cramped Relief analysis panel height (${payload.markers.topologyAnalysisPanelHeight ?? "unknown"})`;
      }
      if (
        payload.markers.topologyCreateNodeOpen !== true &&
        (payload.markers.topologyAnalysisPanelMode === "overview" ||
          payload.markers.topologyAnalysisPanelWidthPolicy === "overview-wide")
      ) {
        if (payload.markers.topologyAnalysisPanelWidthPolicy !== "overview-wide") {
          return `WebView reported malformed Relief overview panel width policy (${payload.markers.topologyAnalysisPanelWidthPolicy ?? "unknown"})`;
        }
        const overviewPanelMinWidth = Number(payload.width) < 1280 ? 480 : 500;
        if (!(Number(payload.markers.topologyAnalysisPanelWidth) >= overviewPanelMinWidth)) {
          return `WebView reported a cramped Relief overview panel width (${payload.markers.topologyAnalysisPanelWidth ?? "unknown"})`;
        }
        if (!(Number(payload.markers.topologyAnalysisPanelHeight) >= 455)) {
          return `WebView reported a cramped Relief overview panel height (${payload.markers.topologyAnalysisPanelHeight ?? "unknown"})`;
        }
        if (payload.markers.topologyAnalysisPanelOverflowY !== "hidden") {
          return `WebView reported a scroll-prone Relief overview panel (${payload.markers.topologyAnalysisPanelOverflowY ?? "unknown"} overflow)`;
        }
        const overflowDelta =
          Number(payload.markers.topologyAnalysisPanelScrollHeight) -
          Number(payload.markers.topologyAnalysisPanelClientHeight);
        if (Number.isFinite(overflowDelta) && overflowDelta > 2) {
          return `WebView reported clipped Relief overview panel content (${overflowDelta}px overflow)`;
        }
        const overviewCopyMinWidth = Number(payload.width) < 1280 ? 440 : 460;
        if (!(Number(payload.markers.topologyOverviewPrimaryCopyWidth) >= overviewCopyMinWidth)) {
          return `WebView reported a cramped Relief overview copy action (${payload.markers.topologyOverviewPrimaryCopyWidth ?? "unknown"}px)`;
        }
        if (!(Number(payload.markers.topologyOverviewPrimaryCopyHeight) >= 34)) {
          return `WebView reported a cramped Relief overview copy action hit target (${payload.markers.topologyOverviewPrimaryCopyHeight ?? "unknown"}px)`;
        }
      }
    }
    if (requireTopologyDrag) {
      if (payload.markers.topologyDragFocusMoved !== true) {
        return `WebView Relief drag did not move the focus card (${payload.markers.topologyDragFocusDelta ?? "unknown delta"})`;
      }
      if (payload.markers.topologyDragCompanionVisible !== true) {
        return "WebView Relief drag companion card did not remain visible after release";
      }
      if (payload.markers.topologyDragCompanionAligned !== true) {
        const focusDelta = JSON.stringify(payload.markers.topologyDragFocusDelta ?? "unknown focus delta");
        const companionDelta = JSON.stringify(payload.markers.topologyDragCompanionDelta ?? "unknown companion delta");
        return `WebView Relief drag companion did not travel with the focus card (focus ${focusDelta}, companion ${companionDelta})`;
      }
      if (payload.markers.topologyDragRelationLabelClicked !== true) {
        return "WebView did not perform the Relief relation label selection during drag verification";
      }
      if (payload.markers.topologyDragNodePopoverExpandClicked !== true) {
        return "WebView did not expand the Relief selected node popover during drag verification";
      }
      if (payload.markers.topologyDragConnectorDrawable !== true) {
        return "WebView Relief drag did not report a drawable connector during drag verification";
      }
      if (!(Number(payload.markers.topologyDragClusterSize) >= 2)) {
        return `WebView Relief drag did not keep a linked card cluster (${payload.markers.topologyDragClusterSize ?? "missing"} active members)`;
      }
      if (!(Number(payload.markers.topologyDragConnectorCount) >= 1)) {
        return `WebView Relief drag did not report linked-cluster connectors (${payload.markers.topologyDragConnectorCount ?? "missing"} connectors)`;
      }
      if (!(Number(payload.markers.topologyDragConnectorClearance) >= 6)) {
        return `WebView Relief drag connector did not report a usable card clearance (${payload.markers.topologyDragConnectorClearance ?? "missing"})`;
      }
      if (payload.markers.topologySelectedRelationHaloVisible !== true) {
        return `WebView Relief relation label selection did not reveal a selected relation halo (${payload.markers.topologySelectedRelationVisibleHaloCount ?? 0}/${payload.markers.topologySelectedRelationHaloCount ?? 0} visible)`;
      }
      if (payload.markers.topologySelectedRelationLabelHitAligned !== true) {
        return "WebView Relief selected relation label hit target is not aligned with its visible badge";
      }
      if (
        Number(payload.markers.topologySelectedRelationLabelHitWidth || 0) < 90 ||
        Number(payload.markers.topologySelectedRelationLabelHitHeight || 0) < 32
      ) {
        return `WebView Relief selected relation label hit target is too small (${payload.markers.topologySelectedRelationLabelHitWidth ?? 0}x${payload.markers.topologySelectedRelationLabelHitHeight ?? 0})`;
      }
      const relationLabelCompactError = validateSelectedRelationLabelCompactMarkers(
        payload.markers,
        payload.width,
      );
      if (relationLabelCompactError) return relationLabelCompactError;
      if (
        typeof payload.markers.topologySelectedRelationLabelQuality !== "string" ||
        !/^(strong|supported|weak|review)$/.test(payload.markers.topologySelectedRelationLabelQuality)
      ) {
        return "WebView Relief selected relation label did not expose a relation quality marker";
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelQualityChipText !== "string" ||
        payload.markers.topologySelectedRelationLabelQualityChipText.trim().length === 0
      ) {
        return "WebView Relief selected relation label did not expose a visible relation quality chip";
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelEvidenceState !== "string" ||
        !/^(source-backed|authored|needs-review)$/.test(payload.markers.topologySelectedRelationLabelEvidenceState)
      ) {
        return "WebView Relief selected relation label did not expose an evidence state marker";
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelAgentGateKind !== "string" ||
        !/^(handoff-ready|preflight-first|review-first)$/.test(
          payload.markers.topologySelectedRelationLabelAgentGateKind,
        )
      ) {
        return "WebView Relief selected relation label did not expose an agent gate marker";
      }
      const expectedRelationLabelAction =
        payload.markers.topologySelectedRelationLabelAgentGateKind === "handoff-ready"
          ? "explain_relation"
          : "relation_check";
      if (payload.markers.topologySelectedRelationLabelPrimaryCopyAction !== expectedRelationLabelAction) {
        return `WebView Relief selected relation label reported ${
          payload.markers.topologySelectedRelationLabelPrimaryCopyAction || "no"
        } primary action for ${payload.markers.topologySelectedRelationLabelAgentGateKind}`;
      }
      const expectedRelationLabelCliFallbackCommand =
        expectedRelationLabelAction === "relation_check"
          ? `ontology-atlas relation-check ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)} [vault]`
          : `ontology-atlas explain ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} [vault] --type ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)}`;
      const relationLabelCliFallbackCommand =
        typeof payload.markers.topologySelectedRelationLabelCliFallbackCommand === "string"
          ? payload.markers.topologySelectedRelationLabelCliFallbackCommand.trim()
          : "";
      if (relationLabelCliFallbackCommand !== expectedRelationLabelCliFallbackCommand) {
        return `WebView Relief selected relation label CLI fallback was ${relationLabelCliFallbackCommand || "missing"}, expected ${expectedRelationLabelCliFallbackCommand}`;
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelAgentGateText !== "string" ||
        payload.markers.topologySelectedRelationLabelAgentGateText.trim().length === 0
      ) {
        return "WebView Relief selected relation label did not expose a visible agent gate chip";
      }
      const expectedRelationLabelGateText = expectedRelationLabelAgentGateText(
        payload.markers.topologySelectedRelationLabelAgentGateKind,
      );
      if (
        String(payload.markers.topologySelectedRelationLabelAgentGateText || "").trim() !==
        expectedRelationLabelGateText
      ) {
        return `WebView Relief selected relation label visible agent gate chip was ${
          payload.markers.topologySelectedRelationLabelAgentGateText || "missing"
        }, expected ${expectedRelationLabelGateText}`;
      }
      if (payload.markers.topologySelectedRelationLabelFactRoute !== "fact>evidence>gate>action") {
        return `WebView Relief selected relation label reported malformed fact route (${payload.markers.topologySelectedRelationLabelFactRoute || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteQuality !==
        payload.markers.topologySelectedRelationLabelQuality
      ) {
        return `WebView Relief selected relation label route quality mismatched the badge (${payload.markers.topologySelectedRelationLabelFactRouteQuality || "missing"} vs ${payload.markers.topologySelectedRelationLabelQuality || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteEvidence !==
        payload.markers.topologySelectedRelationLabelEvidenceState
      ) {
        return `WebView Relief selected relation label route evidence mismatched the badge (${payload.markers.topologySelectedRelationLabelFactRouteEvidence || "missing"} vs ${payload.markers.topologySelectedRelationLabelEvidenceState || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteGate !==
        payload.markers.topologySelectedRelationLabelAgentGateKind
      ) {
        return `WebView Relief selected relation label route gate mismatched the badge (${payload.markers.topologySelectedRelationLabelFactRouteGate || "missing"} vs ${payload.markers.topologySelectedRelationLabelAgentGateKind || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteAction !==
        expectedRelationLabelAction
      ) {
        return `WebView Relief selected relation label route action reported ${payload.markers.topologySelectedRelationLabelFactRouteAction || "missing"} for ${payload.markers.topologySelectedRelationLabelAgentGateKind}`;
      }
      const labelFactRouteChips = Array.isArray(
        payload.markers.topologySelectedRelationLabelFactRouteChips,
      )
        ? payload.markers.topologySelectedRelationLabelFactRouteChips
        : [];
      const labelFactRouteKinds = labelFactRouteChips.map((chip) => chip?.kind).join(">");
      if (labelFactRouteKinds !== "fact>evidence>gate>action") {
        return `WebView Relief selected relation label fact route chips were malformed (${labelFactRouteKinds || "missing"})`;
      }
      const labelFactRouteGate = labelFactRouteChips.find((chip) => chip?.kind === "gate");
      if (
        !labelFactRouteGate ||
        String(labelFactRouteGate.text || "").trim() !==
          String(payload.markers.topologySelectedRelationLabelAgentGateText || "").trim()
      ) {
        return "WebView Relief selected relation label fact route did not expose the agent gate chip";
      }
      if (payload.markers.topologyNodePopoverVisible === true) {
      if (payload.markers.topologyNodePopoverCollapsed === true) {
        return "WebView Relief selected node popover stayed collapsed after expand verification";
      }
      if (payload.markers.topologyNodePopoverSizePolicy !== "inspector-rail") {
        return `WebView Relief selected node popover used ${payload.markers.topologyNodePopoverSizePolicy || "no"} size policy`;
      }
      const nodePopoverMinWidth = Number(payload.width) >= 1400 ? 340 : 320;
      if (!(Number(payload.markers.topologyNodePopoverWidth) >= nodePopoverMinWidth)) {
        return `WebView Relief selected node popover was too narrow (${payload.markers.topologyNodePopoverWidth ?? "missing"}px)`;
      }
      if (Number(payload.markers.topologyNodePopoverLeft) < 8) {
        return `WebView Relief selected node popover overflowed the viewport left (${payload.markers.topologyNodePopoverLeft ?? "missing"}px)`;
      }
      const popoverRightInset = Number(payload.width || 0) - Number(payload.markers.topologyNodePopoverRight);
      if (popoverRightInset < (Number(payload.width) >= 1400 ? 72 : 8)) {
        return `WebView Relief selected node popover overflowed the right control rail (right inset ${Number.isFinite(popoverRightInset) ? popoverRightInset : "missing"}px)`;
      }
      if (!(Number(payload.markers.topologyNodePopoverTop) <= 130)) {
        return `WebView Relief selected node popover was placed too low (${payload.markers.topologyNodePopoverTop ?? "missing"}px)`;
      }
      if (
        Number(payload.markers.topologyNodePopoverBottom) >
        Number(payload.height || 0) - 16
      ) {
        return `WebView Relief selected node popover overflowed the viewport bottom (${payload.markers.topologyNodePopoverBottom ?? "missing"}px)`;
      }
      if (payload.markers.topologyNodePopoverRelationRowVisible !== true) {
        return "WebView Relief selected node popover did not expose a relation row";
      }
      if (
        typeof payload.markers.topologyNodePopoverRelationEvidenceState !== "string" ||
        !/^(source-backed|authored|needs-review)$/.test(
          payload.markers.topologyNodePopoverRelationEvidenceState,
        )
      ) {
        return "WebView Relief selected node popover relation row did not expose an evidence state marker";
      }
      if (
        typeof payload.markers.topologyNodePopoverRelationAgentGateKind !== "string" ||
        !/^(handoff-ready|preflight-first|review-first)$/.test(
          payload.markers.topologyNodePopoverRelationAgentGateKind,
        )
      ) {
        return "WebView Relief selected node popover relation row did not expose an agent gate marker";
      }
      const expectedNodePopoverRelationAction =
        payload.markers.topologyNodePopoverRelationAgentGateKind === "handoff-ready"
          ? "explain_relation"
          : "relation_check";
      if (
        payload.markers.topologyNodePopoverRelationPrimaryCopyAction !==
        expectedNodePopoverRelationAction
      ) {
        return `WebView Relief selected node popover relation row reported ${
          payload.markers.topologyNodePopoverRelationPrimaryCopyAction || "no"
        } primary action for ${payload.markers.topologyNodePopoverRelationAgentGateKind}`;
      }
      if (
        typeof payload.markers.topologyNodePopoverRelationAgentGateText !== "string" ||
        payload.markers.topologyNodePopoverRelationAgentGateText.trim().length === 0
      ) {
        return "WebView Relief selected node popover relation row did not expose a visible agent gate chip";
      }
      if (payload.markers.topologyNodePopoverRelationFactRoute !== "fact>evidence>gate>action") {
        return `WebView Relief selected node popover relation row reported malformed fact route (${payload.markers.topologyNodePopoverRelationFactRoute || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteQuality !==
        payload.markers.topologyNodePopoverRelationQuality
      ) {
        return `WebView Relief selected node popover relation row route quality mismatched the row (${payload.markers.topologyNodePopoverRelationFactRouteQuality || "missing"} vs ${payload.markers.topologyNodePopoverRelationQuality || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteEvidence !==
        payload.markers.topologyNodePopoverRelationEvidenceState
      ) {
        return `WebView Relief selected node popover relation row route evidence mismatched the row (${payload.markers.topologyNodePopoverRelationFactRouteEvidence || "missing"} vs ${payload.markers.topologyNodePopoverRelationEvidenceState || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteGate !==
        payload.markers.topologyNodePopoverRelationAgentGateKind
      ) {
        return `WebView Relief selected node popover relation row route gate mismatched the row (${payload.markers.topologyNodePopoverRelationFactRouteGate || "missing"} vs ${payload.markers.topologyNodePopoverRelationAgentGateKind || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteAction !==
        expectedNodePopoverRelationAction
      ) {
        return `WebView Relief selected node popover relation row route action reported ${payload.markers.topologyNodePopoverRelationFactRouteAction || "missing"} for ${payload.markers.topologyNodePopoverRelationAgentGateKind}`;
      }
      const nodePopoverRelationFactRouteChips = Array.isArray(
        payload.markers.topologyNodePopoverRelationFactRouteChips,
      )
        ? payload.markers.topologyNodePopoverRelationFactRouteChips
        : [];
      const nodePopoverRelationFactRouteKinds = nodePopoverRelationFactRouteChips
        .map((chip) => chip?.kind)
        .join(">");
      if (nodePopoverRelationFactRouteKinds !== "fact>evidence>action>payload") {
        return `WebView Relief selected node popover relation row fact route chips were malformed (${nodePopoverRelationFactRouteKinds || "missing"})`;
      }
      const nodePopoverRelationPayloadChip = nodePopoverRelationFactRouteChips.find(
        (chip) => chip?.kind === "payload",
      );
      if (nodePopoverRelationPayloadChip?.text?.trim() !== "JSON") {
        return "WebView Relief selected node popover relation row did not expose a visible JSON payload chip";
      }
      if (payload.markers.topologyNodePopoverRelationRouteState !== "compact-json-ready") {
        return `WebView Relief selected node popover relation row route rail reported ${payload.markers.topologyNodePopoverRelationRouteState || "no"} state`;
      }
      const nodePopoverRelationRouteRailWidth = Number(
        payload.markers.topologyNodePopoverRelationRouteRailWidth,
      );
      const nodePopoverRelationRouteRailScrollWidth = Number(
        payload.markers.topologyNodePopoverRelationRouteRailScrollWidth,
      );
      if (
        !(nodePopoverRelationRouteRailWidth > 0) ||
        nodePopoverRelationRouteRailScrollWidth > nodePopoverRelationRouteRailWidth + 1
      ) {
        return `WebView Relief selected node popover relation row route rail overflowed (${nodePopoverRelationRouteRailScrollWidth || "missing"} > ${nodePopoverRelationRouteRailWidth || "missing"})`;
      }
      if (
        !(Number(payload.markers.topologyNodePopoverRelationPayloadChipWidth) > 0) ||
        String(payload.markers.topologyNodePopoverRelationPayloadChipText || "").trim() !==
          "JSON"
      ) {
        return "WebView Relief selected node popover relation row JSON payload chip was not visibly measurable";
      }
      const nodePopoverRelationSourceId =
        typeof payload.markers.topologyNodePopoverRelationSourceId === "string"
          ? payload.markers.topologyNodePopoverRelationSourceId.trim()
          : "";
      const nodePopoverRelationTargetId =
        typeof payload.markers.topologyNodePopoverRelationTargetId === "string"
          ? payload.markers.topologyNodePopoverRelationTargetId.trim()
          : "";
      const nodePopoverRelationEndpointRoute =
        typeof payload.markers.topologyNodePopoverRelationEndpointRoute === "string"
          ? payload.markers.topologyNodePopoverRelationEndpointRoute.trim()
          : "";
      if (!nodePopoverRelationSourceId || !nodePopoverRelationTargetId) {
        return "WebView Relief selected node popover relation row did not expose source and target endpoint markers";
      }
      if (
        nodePopoverRelationEndpointRoute !==
        `${nodePopoverRelationSourceId}>${nodePopoverRelationTargetId}`
      ) {
        return `WebView Relief selected node popover relation row endpoint route mismatched source and target (${nodePopoverRelationEndpointRoute || "missing"})`;
      }
      if (
        selectedNodeId &&
        nodePopoverRelationSourceId !== selectedNodeId &&
        nodePopoverRelationTargetId !== selectedNodeId
      ) {
        return `WebView Relief selected node popover relation row endpoint route did not include selected node ${selectedNodeId}`;
      }
      const nodePopoverRelationEndpointChips = Array.isArray(
        payload.markers.topologyNodePopoverRelationEndpointChips,
      )
        ? payload.markers.topologyNodePopoverRelationEndpointChips
        : [];
      const nodePopoverRelationEndpointKinds = nodePopoverRelationEndpointChips
        .map((chip) => chip?.kind)
        .join(">");
      if (nodePopoverRelationEndpointKinds !== "source>target") {
        return `WebView Relief selected node popover relation row endpoint chips were malformed (${nodePopoverRelationEndpointKinds || "missing"})`;
      }
      const nodePopoverRelationHandoffSummary =
        typeof payload.markers.topologyNodePopoverRelationHandoffSummary === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffSummary.trim()
          : "";
      const nodePopoverRelationAccessibleName =
        typeof payload.markers.topologyNodePopoverRelationAccessibleName === "string"
          ? payload.markers.topologyNodePopoverRelationAccessibleName.trim()
          : "";
      if (
        !nodePopoverRelationHandoffSummary.includes(
          `${nodePopoverRelationSourceId} > ${nodePopoverRelationTargetId}`,
        ) ||
        !nodePopoverRelationHandoffSummary.includes(
          payload.markers.topologyNodePopoverRelationEvidenceState,
        ) ||
        !nodePopoverRelationHandoffSummary.includes(
          payload.markers.topologyNodePopoverRelationAgentGateKind,
        ) ||
        !nodePopoverRelationHandoffSummary.includes(expectedNodePopoverRelationAction)
      ) {
        return `WebView Relief selected node popover relation row handoff summary was incomplete (${nodePopoverRelationHandoffSummary || "missing"})`;
      }
      if (!nodePopoverRelationAccessibleName.includes(nodePopoverRelationHandoffSummary)) {
        return "WebView Relief selected node popover relation row accessible name did not include handoff summary";
      }
      const nodePopoverRelationHandoffTool =
        typeof payload.markers.topologyNodePopoverRelationHandoffTool === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffTool.trim()
          : "";
      const nodePopoverRelationHandoffOperation =
        typeof payload.markers.topologyNodePopoverRelationHandoffOperation === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffOperation.trim()
          : "";
      const nodePopoverRelationHandoffFrom =
        typeof payload.markers.topologyNodePopoverRelationHandoffFrom === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffFrom.trim()
          : "";
      const nodePopoverRelationHandoffTo =
        typeof payload.markers.topologyNodePopoverRelationHandoffTo === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffTo.trim()
          : "";
      const nodePopoverRelationHandoffType =
        typeof payload.markers.topologyNodePopoverRelationHandoffType === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffType.trim()
          : "";
      const nodePopoverRelationHandoffPayloadSummary =
        typeof payload.markers.topologyNodePopoverRelationHandoffPayloadSummary === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffPayloadSummary.trim()
          : "";
      const nodePopoverRelationHandoffPayloadJson =
        typeof payload.markers.topologyNodePopoverRelationHandoffPayloadJson === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffPayloadJson.trim()
          : "";
      if (nodePopoverRelationHandoffTool !== "query_ontology") {
        return `WebView Relief selected node popover relation row reported ${nodePopoverRelationHandoffTool || "no"} MCP handoff tool`;
      }
      if (nodePopoverRelationHandoffOperation !== expectedNodePopoverRelationAction) {
        return `WebView Relief selected node popover relation row reported ${nodePopoverRelationHandoffOperation || "no"} MCP operation`;
      }
      if (
        nodePopoverRelationHandoffFrom !== nodePopoverRelationSourceId ||
        nodePopoverRelationHandoffTo !== nodePopoverRelationTargetId
      ) {
        return "WebView Relief selected node popover relation row MCP payload endpoints did not match source and target";
      }
      if (
        !nodePopoverRelationHandoffType ||
        nodePopoverRelationHandoffType !== payload.markers.topologyNodePopoverRelationType ||
        nodePopoverRelationHandoffPayloadSummary !==
          `query_ontology · ${expectedNodePopoverRelationAction} · ${nodePopoverRelationSourceId} -> ${nodePopoverRelationTargetId} · ${nodePopoverRelationHandoffType}`
      ) {
        return `WebView Relief selected node popover relation row MCP payload summary was malformed (${nodePopoverRelationHandoffPayloadSummary || "missing"})`;
      }
      const nodePopoverRelationPayloadChipTitle =
        typeof payload.markers.topologyNodePopoverRelationPayloadChipTitle === "string"
          ? payload.markers.topologyNodePopoverRelationPayloadChipTitle.trim()
          : "";
      const nodePopoverRelationPayloadChipSummary =
        typeof payload.markers.topologyNodePopoverRelationPayloadChipSummary === "string"
          ? payload.markers.topologyNodePopoverRelationPayloadChipSummary.trim()
          : "";
      if (nodePopoverRelationPayloadChipTitle !== nodePopoverRelationHandoffPayloadSummary) {
        return "WebView Relief selected node popover relation row JSON payload chip title did not match MCP payload summary";
      }
      if (nodePopoverRelationPayloadChipSummary !== nodePopoverRelationHandoffPayloadSummary) {
        return "WebView Relief selected node popover relation row JSON payload chip summary did not match MCP payload summary";
      }
      let parsedNodePopoverRelationHandoffPayload;
      try {
        parsedNodePopoverRelationHandoffPayload = JSON.parse(
          nodePopoverRelationHandoffPayloadJson,
        );
      } catch {
        return "WebView Relief selected node popover relation row MCP payload JSON was not parseable";
      }
      if (
        parsedNodePopoverRelationHandoffPayload?.tool !== "query_ontology" ||
        parsedNodePopoverRelationHandoffPayload?.operation !==
          expectedNodePopoverRelationAction ||
        parsedNodePopoverRelationHandoffPayload?.from !== nodePopoverRelationSourceId ||
        parsedNodePopoverRelationHandoffPayload?.to !== nodePopoverRelationTargetId ||
        parsedNodePopoverRelationHandoffPayload?.type !== nodePopoverRelationHandoffType
      ) {
        return "WebView Relief selected node popover relation row MCP payload JSON mismatched the row markers";
      }
      if (payload.markers.topologyNodePopoverAgentReadinessVisible !== true) {
        return "WebView Relief selected node popover did not expose an agent readiness lens";
      }
      const nodeAgentReadinessText =
        typeof payload.markers.topologyNodePopoverAgentReadinessText === "string"
          ? payload.markers.topologyNodePopoverAgentReadinessText.trim()
          : "";
      const nodeAgentReadinessReadable =
        /(handoff-ready|handoff 가능)[^\d]+\d+/i.test(nodeAgentReadinessText) &&
        /preflight[^\d]+\d+/i.test(nodeAgentReadinessText) &&
        /(review|검토)[^\d]+\d+/i.test(nodeAgentReadinessText) &&
        /[·,:]/.test(nodeAgentReadinessText);
      if (!nodeAgentReadinessReadable) {
        return `WebView Relief selected node popover reported unparseable agent readiness lens (${nodeAgentReadinessText || "unknown"})`;
      }
      const agentReadinessChips = Array.isArray(
        payload.markers.topologyNodePopoverAgentReadinessChips,
      )
        ? payload.markers.topologyNodePopoverAgentReadinessChips
        : [];
      const agentReadinessKinds = new Set(
        agentReadinessChips.map((chip) => chip?.kind).filter(Boolean),
      );
      for (const kind of ["ready", "preflight", "review"]) {
        if (!agentReadinessKinds.has(kind)) {
          return `WebView Relief selected node popover agent readiness lens is missing ${kind}`;
        }
      }
      if (
        requireTopologyDrag &&
        Number(payload.markers.topologySelectedDockCompanionCount) >= 1 &&
        Number(payload.markers.topologySelectedDockVisibleCompanionCount) < 1
      ) {
        const mapContextText =
          typeof payload.markers.topologyNodePopoverMapContextText === "string"
            ? payload.markers.topologyNodePopoverMapContextText.trim()
            : "";
        if (payload.markers.topologyNodePopoverMapContextVisible !== true) {
          return "WebView did not report the selected node map context note";
        }
        if (!(Number(payload.markers.topologyNodePopoverMapContextCount) >= 1)) {
          return `WebView reported an empty selected node map context note (${payload.markers.topologyNodePopoverMapContextCount ?? "missing"} connection(s))`;
        }
        if (!/(map|지도).*(inspect|확인|보기|겹침|overlap)/i.test(mapContextText)) {
          return `WebView reported an unclear selected node map context note (${mapContextText || "empty"})`;
        }
      }
      } else if (!selectedRelationContextVisible) {
        return "WebView Relief selected node popover was not visible after drag verification";
      }
      if (payload.markers.topologySelectedRelationClaimLensVisible !== true) {
        return "WebView did not report the Relief selected relation claim lens marker";
      }
      if (
        payload.markers.topologySelectedRelationHaloVisible === true &&
        (typeof payload.markers.topologySelectedRelationHaloQuality !== "string" ||
          payload.markers.topologySelectedRelationHaloQuality.trim().length === 0)
      ) {
        return "WebView reported empty Relief selected relation halo quality";
      }
      if (
        typeof payload.markers.topologySelectedRelationClaimLensText !== "string" ||
        !/(typed ontology fact|타입이 있는 온톨로지 사실)/i.test(
          payload.markers.topologySelectedRelationClaimLensText,
        )
      ) {
        return `WebView reported malformed Relief selected relation claim lens copy (${payload.markers.topologySelectedRelationClaimLensText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationClaimLensQuality !== "string" ||
        !/^(strong|supported|weak|review)$/i.test(
          payload.markers.topologySelectedRelationClaimLensQuality,
        )
      ) {
        return `WebView reported malformed Relief selected relation claim lens quality marker (${payload.markers.topologySelectedRelationClaimLensQuality ?? "unknown marker"})`;
      }
      if (payload.markers.topologySelectedRelationClaimLensDotVisible !== true) {
        return "WebView did not report the Relief selected relation claim lens quality dot marker";
      }
      if (
        payload.markers.topologySelectedRelationContractKind !==
        "typed-fact-not-similarity"
      ) {
        return `WebView reported malformed Relief selected relation contract marker (${payload.markers.topologySelectedRelationContractKind ?? "unknown marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationContractText !== "string" ||
        !/(not a similarity score|유사도 점수가 아니라)/i.test(
          payload.markers.topologySelectedRelationContractText,
        ) ||
        !/(handoff confidence|handoff 신뢰도)/i.test(
          payload.markers.topologySelectedRelationContractText,
        )
      ) {
        return `WebView reported malformed Relief selected relation contract copy (${payload.markers.topologySelectedRelationContractText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationAgentGateText !== "string" ||
        !/(handoff ready|preflight first|review first|handoff 준비됨|preflight 먼저|검토 먼저)/i.test(
          payload.markers.topologySelectedRelationAgentGateText,
        )
      ) {
        return `WebView reported malformed Relief selected relation agent gate copy (${payload.markers.topologySelectedRelationAgentGateText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardQuality !== "string" ||
        !/^(strong|supported|weak|review)$/i.test(
          payload.markers.topologySelectedRelationCardQuality,
        )
      ) {
        return `WebView reported malformed Relief selected relation card quality marker (${payload.markers.topologySelectedRelationCardQuality ?? "unknown marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardEvidenceState !== "string" ||
        !/^(source-backed|authored|needs-review)$/.test(
          payload.markers.topologySelectedRelationCardEvidenceState,
        )
      ) {
        return `WebView reported malformed Relief selected relation card evidence marker (${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationClaimLensQuality !==
        payload.markers.topologySelectedRelationCardQuality
      ) {
        return `WebView reported mismatched Relief selected relation claim lens quality marker (${payload.markers.topologySelectedRelationClaimLensQuality ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardQuality ?? "unknown card marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelEvidenceState === "string" &&
        payload.markers.topologySelectedRelationLabelEvidenceState.trim().length > 0 &&
        payload.markers.topologySelectedRelationLabelEvidenceState !==
          payload.markers.topologySelectedRelationCardEvidenceState
      ) {
        return `WebView reported mismatched Relief selected relation label/card evidence marker (${payload.markers.topologySelectedRelationLabelEvidenceState ?? "unknown label marker"} vs ${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown card marker"})`;
      }
      const selectedRelationCardRect = {
        left: Number(payload.markers.topologySelectedRelationCardLeft || 0),
        top: Number(payload.markers.topologySelectedRelationCardTop || 0),
        right: Number(payload.markers.topologySelectedRelationCardRight || 0),
        bottom: Number(payload.markers.topologySelectedRelationCardBottom || 0),
        width: Number(payload.markers.topologySelectedRelationCardWidth || 0),
        height: Number(payload.markers.topologySelectedRelationCardHeight || 0),
      };
      const viewportWidth = Number(payload.width || 0);
      const viewportHeight = Number(payload.height || 0);
      const selectedRelationMinCardWidth = viewportWidth >= 1500 ? 360 : 240;
      const selectedRelationMaxCardHeight =
        viewportWidth >= 1500 && viewportHeight > 0
          ? Math.min(680, Math.max(220, viewportHeight - 120))
          : Number.POSITIVE_INFINITY;
      if (
        !Number.isFinite(selectedRelationCardRect.left) ||
        !Number.isFinite(selectedRelationCardRect.top) ||
        !Number.isFinite(selectedRelationCardRect.right) ||
        !Number.isFinite(selectedRelationCardRect.bottom) ||
        selectedRelationCardRect.width < selectedRelationMinCardWidth ||
        selectedRelationCardRect.height < 220
      ) {
        return `WebView reported undersized Relief selected relation card (${selectedRelationCardRect.width}x${selectedRelationCardRect.height})`;
      }
      if (selectedRelationCardRect.height > selectedRelationMaxCardHeight) {
        return `WebView reported oversized Relief selected relation card (${selectedRelationCardRect.width}x${selectedRelationCardRect.height})`;
      }
      if (viewportWidth >= 1500) {
        const proofBandWidth = Number(payload.markers.topologySelectedRelationProofBandWidth || 0);
        const proofBandHeight = Number(payload.markers.topologySelectedRelationProofBandHeight || 0);
        const contractRect = {
          top: Number(payload.markers.topologySelectedRelationContractTop || 0),
          width: Number(payload.markers.topologySelectedRelationContractWidth || 0),
          height: Number(payload.markers.topologySelectedRelationContractHeight || 0),
        };
        const decisionRect = {
          top: Number(payload.markers.topologySelectedRelationAgentDecisionTop || 0),
          width: Number(payload.markers.topologySelectedRelationAgentDecisionWidth || 0),
          height: Number(payload.markers.topologySelectedRelationAgentDecisionHeight || 0),
        };
        if (
          proofBandWidth < 360 ||
          proofBandHeight < 80 ||
          proofBandHeight > 180 ||
          contractRect.width < 170 ||
          decisionRect.width < 170 ||
          Math.abs(contractRect.top - decisionRect.top) > 2
        ) {
          return `WebView reported uncompressed Relief selected relation proof band (${proofBandWidth}x${proofBandHeight}, contract=${contractRect.width}x${contractRect.height}, decision=${decisionRect.width}x${decisionRect.height})`;
        }
        if (Number(payload.markers.topologySelectedRelationMetricStripHeight || 0) > 70) {
          return `WebView reported tall Relief selected relation metric strip (${payload.markers.topologySelectedRelationMetricStripWidth ?? 0}x${payload.markers.topologySelectedRelationMetricStripHeight ?? 0})`;
        }
      }
      if (
        viewportWidth > 0 &&
        viewportHeight > 0 &&
        (selectedRelationCardRect.left < 0 ||
          selectedRelationCardRect.top < 0 ||
          selectedRelationCardRect.right > viewportWidth ||
          selectedRelationCardRect.bottom > viewportHeight)
      ) {
        return `WebView reported out-of-bounds Relief selected relation card (${selectedRelationCardRect.left},${selectedRelationCardRect.top} ${selectedRelationCardRect.right}x${selectedRelationCardRect.bottom} within ${viewportWidth}x${viewportHeight})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardAgentGate !== "string" ||
        payload.markers.topologySelectedRelationCardAgentGate.trim().length === 0 ||
        payload.markers.topologySelectedRelationCardAgentGate !==
          payload.markers.topologySelectedRelationAgentGateText
      ) {
        return `WebView reported mismatched Relief selected relation card agent gate marker (${payload.markers.topologySelectedRelationCardAgentGate ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationAgentGateText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardAgentGateKind !== "string" ||
        !/^(handoff-ready|preflight-first|review-first)$/.test(
          payload.markers.topologySelectedRelationCardAgentGateKind,
        )
      ) {
        return `WebView reported malformed Relief selected relation card agent gate kind marker (${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardAgentDecision !== "string" ||
        payload.markers.topologySelectedRelationCardAgentDecision.trim().length === 0
      ) {
        return `WebView reported empty Relief selected relation card agent decision marker (${payload.markers.topologySelectedRelationCardAgentDecision ?? "unknown marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentDecisionGateKind !==
        payload.markers.topologySelectedRelationCardAgentGateKind
      ) {
        return `WebView reported mismatched Relief selected relation decision gate kind marker (${payload.markers.topologySelectedRelationAgentDecisionGateKind ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown card marker"})`;
      }
      const expectedPrimaryAction =
        payload.markers.topologySelectedRelationCardAgentGateKind === "handoff-ready"
          ? "explain_relation"
          : "relation_check";
      if (
        payload.markers.topologySelectedRelationPrimaryCopyActionKind !==
        expectedPrimaryAction
      ) {
        return `WebView reported mismatched Relief selected relation primary copy action marker (${payload.markers.topologySelectedRelationPrimaryCopyActionKind ?? "unknown marker"} vs ${expectedPrimaryAction})`;
      }
      if (payload.markers.topologySelectedRelationPrimaryCopyRecommended !== true) {
        return `WebView reported Relief selected relation primary copy action is not marked recommended (${payload.markers.topologySelectedRelationPrimaryCopyRecommended ?? "unknown marker"})`;
      }
      const primaryCopyText =
        typeof payload.markers.topologySelectedRelationPrimaryCopyActionText === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyActionText.trim()
          : "";
      const expectedCopyTextNeedle =
        expectedPrimaryAction === "explain_relation" ? "explain" : "relation";
      if (!primaryCopyText.toLowerCase().includes(expectedCopyTextNeedle)) {
        return `WebView reported malformed Relief selected relation primary copy action text (${primaryCopyText || "empty"} vs ${expectedPrimaryAction})`;
      }
      const primaryCopyBadgeText =
        typeof payload.markers.topologySelectedRelationPrimaryCopyBadgeText === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyBadgeText.trim()
          : "";
      if (!/^(best next|다음 액션)$/i.test(primaryCopyBadgeText)) {
        return `WebView reported malformed Relief selected relation primary copy badge (${primaryCopyBadgeText || "empty"})`;
      }
      if (
        Number(payload.markers.topologySelectedRelationPrimaryCopyActionWidth || 0) < 90 ||
        Number(payload.markers.topologySelectedRelationPrimaryCopyActionHeight || 0) < 32
      ) {
        return `WebView reported undersized Relief selected relation primary copy action (${payload.markers.topologySelectedRelationPrimaryCopyActionWidth ?? 0}x${payload.markers.topologySelectedRelationPrimaryCopyActionHeight ?? 0})`;
      }
      if (payload.markers.topologySelectedRelationCopyPayloadTool !== "query_ontology") {
        return `WebView reported malformed Relief selected relation copy payload tool (${payload.markers.topologySelectedRelationCopyPayloadTool ?? "unknown marker"})`;
      }
      if (payload.markers.topologySelectedRelationCopyPayloadAction !== expectedPrimaryAction) {
        return `WebView reported mismatched Relief selected relation copy payload action (${payload.markers.topologySelectedRelationCopyPayloadAction ?? "unknown marker"} vs ${expectedPrimaryAction})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyPayloadEvidence !==
        payload.markers.topologySelectedRelationCardEvidenceState
      ) {
        return `WebView reported mismatched Relief selected relation copy payload evidence (${payload.markers.topologySelectedRelationCopyPayloadEvidence ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown card marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyPayloadGate !==
        payload.markers.topologySelectedRelationCardAgentGateKind
      ) {
        return `WebView reported mismatched Relief selected relation copy payload gate (${payload.markers.topologySelectedRelationCopyPayloadGate ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown card marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCopyPayloadFrom !== "string" ||
        payload.markers.topologySelectedRelationCopyPayloadFrom.trim().length === 0 ||
        typeof payload.markers.topologySelectedRelationCopyPayloadTo !== "string" ||
        payload.markers.topologySelectedRelationCopyPayloadTo.trim().length === 0
      ) {
        return `WebView reported malformed Relief selected relation copy payload endpoints (${payload.markers.topologySelectedRelationCopyPayloadFrom ?? "unknown from"} -> ${payload.markers.topologySelectedRelationCopyPayloadTo ?? "unknown to"})`;
      }
      if (
        payload.markers.topologySelectedRelationHandleStripSource !==
          payload.markers.topologySelectedRelationCopyPayloadFrom ||
        payload.markers.topologySelectedRelationHandleStripTarget !==
          payload.markers.topologySelectedRelationCopyPayloadTo ||
        payload.markers.topologySelectedRelationHandleStripType !==
          payload.markers.topologySelectedRelationCopyPayloadType
      ) {
        return `WebView reported mismatched Relief selected relation ontology handle strip (${payload.markers.topologySelectedRelationHandleStripSource ?? "unknown source"} -> ${payload.markers.topologySelectedRelationHandleStripTarget ?? "unknown target"} · ${payload.markers.topologySelectedRelationHandleStripType ?? "unknown type"})`;
      }
      const handleSummary =
        typeof payload.markers.topologySelectedRelationHandleStripSummary === "string"
          ? payload.markers.topologySelectedRelationHandleStripSummary.trim()
          : "";
      if (
        !handleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadFrom) ||
        !handleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadTo) ||
        !handleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadType) ||
        !handleSummary.includes("→")
      ) {
        return `WebView reported malformed Relief selected relation ontology handle summary (${handleSummary || "empty"})`;
      }
      if (
        Number(payload.markers.topologySelectedRelationHandleStripWidth || 0) < 180 ||
        Number(payload.markers.topologySelectedRelationHandleStripHeight || 0) < 30
      ) {
        return `WebView reported undersized Relief selected relation ontology handle strip (${payload.markers.topologySelectedRelationHandleStripWidth ?? 0}x${payload.markers.topologySelectedRelationHandleStripHeight ?? 0})`;
      }
      const copyPayloadSummary =
        typeof payload.markers.topologySelectedRelationCopyPayloadSummary === "string"
          ? payload.markers.topologySelectedRelationCopyPayloadSummary.trim()
          : "";
      if (
        copyPayloadSummary !==
        `query_ontology · ${expectedPrimaryAction} · ${payload.markers.topologySelectedRelationCopyPayloadFrom} → ${payload.markers.topologySelectedRelationCopyPayloadTo} · ${payload.markers.topologySelectedRelationCopyPayloadType} · ${payload.markers.topologySelectedRelationCardEvidenceState} · ${payload.markers.topologySelectedRelationCardAgentGateKind}`
      ) {
        return `WebView reported malformed Relief selected relation copy payload summary (${copyPayloadSummary || "empty"})`;
      }
      const copyPayloadCall =
        typeof payload.markers.topologySelectedRelationCopyPayloadCall === "string"
          ? payload.markers.topologySelectedRelationCopyPayloadCall.trim()
          : "";
      const expectedCopyPayloadCall =
        expectedPrimaryAction === "relation_check"
          ? `query_ontology({"operation":"relation_check","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","type":"${payload.markers.topologySelectedRelationCopyPayloadType}"})`
          : `query_ontology({"operation":"explain_relation","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","direction":"undirected","maxHops":5,"limit":10})`;
      if (copyPayloadCall !== expectedCopyPayloadCall) {
        return `WebView reported malformed Relief selected relation primary copy payload call (${copyPayloadCall || "empty"})`;
      }
      const expectedCliFallbackCommand =
        expectedPrimaryAction === "relation_check"
          ? `ontology-atlas relation-check ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)} [vault]`
          : `ontology-atlas explain ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} [vault] --type ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)}`;
      const cliFallbackCommand =
        typeof payload.markers.topologySelectedRelationCliFallbackCommand === "string"
          ? payload.markers.topologySelectedRelationCliFallbackCommand.trim()
          : "";
      const cliFallbackSummary =
        typeof payload.markers.topologySelectedRelationCliFallbackSummary === "string"
          ? payload.markers.topologySelectedRelationCliFallbackSummary.trim()
          : "";
      if (cliFallbackCommand !== expectedCliFallbackCommand) {
        return `WebView reported malformed Relief selected relation CLI fallback (${cliFallbackCommand || "empty"})`;
      }
      if (cliFallbackSummary !== `CLI fallback ${expectedCliFallbackCommand}`) {
        return `WebView reported malformed Relief selected relation CLI fallback summary (${cliFallbackSummary || "empty"})`;
      }
      const primaryCopyActionCall =
        typeof payload.markers.topologySelectedRelationPrimaryCopyActionCall === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyActionCall.trim()
          : "";
      const primaryCopyActionTitle =
        typeof payload.markers.topologySelectedRelationPrimaryCopyActionTitle === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyActionTitle.trim()
          : "";
      if (primaryCopyActionCall !== copyPayloadCall) {
        return `WebView reported mismatched Relief selected relation primary button payload call (${primaryCopyActionCall || "empty"} vs ${copyPayloadCall || "empty"})`;
      }
      if (primaryCopyActionTitle !== copyPayloadCall) {
        return `WebView reported mismatched Relief selected relation primary button payload title (${primaryCopyActionTitle || "empty"} vs ${copyPayloadCall || "empty"})`;
      }
      const copyActions = Array.isArray(payload.markers.topologySelectedRelationCopyActions)
        ? payload.markers.topologySelectedRelationCopyActions
        : [];
      if (copyActions.length !== 2) {
        return `WebView reported ${copyActions.length || "no"} Relief selected relation copy actions`;
      }
      const copyActionByKind = new Map(copyActions.map((action) => [action?.kind, action]));
      const expectedRelationCheckCall = `query_ontology({"operation":"relation_check","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","type":"${payload.markers.topologySelectedRelationCopyPayloadType}"})`;
      const expectedExplainRelationCall = `query_ontology({"operation":"explain_relation","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","direction":"undirected","maxHops":5,"limit":10})`;
      for (const [kind, expectedCall] of [
        ["relation_check", expectedRelationCheckCall],
        ["explain_relation", expectedExplainRelationCall],
      ]) {
        const action = copyActionByKind.get(kind);
        if (!action) {
          return `WebView omitted Relief selected relation ${kind} copy action`;
        }
        if (action.call !== expectedCall || action.title !== expectedCall) {
          return `WebView reported malformed Relief selected relation ${kind} copy action payload`;
        }
        if (!(Number(action.width) >= 90) || !(Number(action.height) >= 32)) {
          return `WebView reported undersized Relief selected relation ${kind} copy action (${action.width ?? 0}x${action.height ?? 0})`;
        }
      }
      const recommendedActions = copyActions.filter((action) => action?.recommended);
      if (
        recommendedActions.length !== 1 ||
        recommendedActions[0]?.kind !== expectedPrimaryAction ||
        recommendedActions[0]?.priority !== "primary"
      ) {
        return `WebView reported malformed Relief selected relation recommended copy action (${recommendedActions.map((action) => action?.kind).join(",") || "missing"})`;
      }
      if (
        Number(payload.markers.topologySelectedRelationCopyPayloadWidth || 0) < 180 ||
        Number(payload.markers.topologySelectedRelationCopyPayloadHeight || 0) < 36
      ) {
        return `WebView reported undersized Relief selected relation copy payload strip (${payload.markers.topologySelectedRelationCopyPayloadWidth ?? 0}x${payload.markers.topologySelectedRelationCopyPayloadHeight ?? 0})`;
      }
      const agentRouteSteps = Array.isArray(
        payload.markers.topologySelectedRelationAgentRouteSteps,
      )
        ? payload.markers.topologySelectedRelationAgentRouteSteps
        : [];
      const agentRouteKinds = agentRouteSteps.map((step) => step?.kind).join(">");
      if (agentRouteKinds !== "fact>evidence>gate>action") {
        return `WebView reported malformed Relief selected relation agent route steps (${agentRouteKinds || "missing"})`;
      }
      const agentRouteEvidenceStep = agentRouteSteps.find((step) => step?.kind === "evidence");
      if (
        typeof agentRouteEvidenceStep?.value !== "string" ||
        agentRouteEvidenceStep.value.trim().length === 0 ||
        !/(source|authored|review|출처|작성자|검토)/i.test(agentRouteEvidenceStep.value)
      ) {
        return `WebView reported malformed Relief selected relation agent route evidence step (${agentRouteEvidenceStep?.value ?? "missing"})`;
      }
      const narrowRouteStep = agentRouteSteps.find((step) => Number(step?.width || 0) < 100);
      if (narrowRouteStep) {
        return `WebView reported cramped Relief selected relation agent route step (${narrowRouteStep.kind || "unknown"} ${narrowRouteStep.width ?? 0}x${narrowRouteStep.height ?? 0})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRouteGateKind !==
        payload.markers.topologySelectedRelationCardAgentGateKind
      ) {
        return `WebView reported mismatched Relief selected relation route gate marker (${payload.markers.topologySelectedRelationAgentRouteGateKind ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown card marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRouteEvidenceState !==
        payload.markers.topologySelectedRelationCardEvidenceState
      ) {
        return `WebView reported mismatched Relief selected relation route evidence marker (${payload.markers.topologySelectedRelationAgentRouteEvidenceState ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown card marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRoutePrimaryAction !==
        expectedPrimaryAction
      ) {
        return `WebView reported mismatched Relief selected relation route action marker (${payload.markers.topologySelectedRelationAgentRoutePrimaryAction ?? "unknown marker"} vs ${expectedPrimaryAction})`;
      }
      const routeActionStep = agentRouteSteps.find((step) => step?.kind === "action");
      if (
        typeof routeActionStep?.value !== "string" ||
        routeActionStep.value.trim() !== expectedPrimaryAction
      ) {
        return `WebView reported malformed Relief selected relation route action copy (${routeActionStep?.value ?? "unknown"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationAgentDecisionText !== "string" ||
        !/(agent handoff|relation_check|agent-ready|관계 근거|handoff)/i.test(
          payload.markers.topologySelectedRelationAgentDecisionText,
        )
      ) {
        return `WebView reported malformed Relief selected relation agent decision copy (${payload.markers.topologySelectedRelationAgentDecisionText ?? "unknown text"})`;
      }
    }
  }
  if (
    !Number.isFinite(payload.width) ||
    !Number.isFinite(payload.height) ||
    payload.width <= 0 ||
    payload.height <= 0
  ) {
    return "WebView viewport dimensions were empty";
  }
  return null;
}

export async function waitForWebviewVerifyPayload(readStdout, {
  timeoutMs = WEBVIEW_VERIFY_TIMEOUT_MS,
  intervalMs = 100,
  validatePayload = () => null,
} = {}) {
  const started = Date.now();
  let payload = parseWebviewVerifyPayload(readStdout());
  let validationError = payload ? validatePayload(payload) : "missing WebView verification payload";
  while ((!payload || validationError) && Date.now() - started < timeoutMs) {
    await sleep(intervalMs);
    payload = parseWebviewVerifyPayload(readStdout());
    validationError = payload ? validatePayload(payload) : "missing WebView verification payload";
  }
  return { payload, validationError };
}

function readOnscreenWindows() {
  const swift = `
import CoreGraphics
import Foundation

let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
let windows = (CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]]) ?? []
let data = try JSONSerialization.data(withJSONObject: windows, options: [])
print(String(data: data, encoding: .utf8)!)
`;
  const result = spawnSync("swift", ["-e", swift], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(
      [
        "failed to inspect macOS windows with CoreGraphics",
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

function readAccessibilityWindows(pids) {
  const result = spawnSync("osascript", ["-e", buildAccessibilityWindowProbeScript(pids)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: ACCESSIBILITY_WINDOW_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    fail(
      [
        "failed to inspect macOS Accessibility windows with System Events",
        "grant Terminal/Codex Accessibility permission or rerun without --require-accessibility-window if only CG window proof is needed",
        result.error?.code === "ETIMEDOUT"
          ? `System Events did not respond within ${ACCESSIBILITY_WINDOW_TIMEOUT_MS}ms`
          : null,
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

function readAccessibilityText(pids, requiredText) {
  const result = spawnSync("swift", ["-e", buildAccessibilityTextProbeSwift(pids, requiredText)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: ACCESSIBILITY_TEXT_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    fail(
      [
        "failed to inspect macOS Accessibility text with the Swift AX probe",
        "grant Terminal/Codex Accessibility permission or rerun without --require-accessibility-text if only window proof is needed",
        result.error?.code === "ETIMEDOUT"
          ? `Swift AX probe did not respond within ${ACCESSIBILITY_TEXT_TIMEOUT_MS}ms`
          : null,
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

function captureRegion(target, outPath) {
  const bounds = target.bounds;
  const x = Number(bounds?.X);
  const y = Number(bounds?.Y);
  const width = Number(bounds?.Width);
  const height = Number(bounds?.Height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  return spawnSync(
    "screencapture",
    ["-x", "-R", `${Math.round(x)},${Math.round(y)},${Math.round(width)},${Math.round(height)}`, outPath],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    },
  );
}

function buildImageVisualStatsSwift(imagePath) {
  const pathLiteral = JSON.stringify(imagePath);
  return `
import AppKit
import Foundation

let path = ${pathLiteral}
guard let image = NSImage(contentsOfFile: path),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  fputs("cannot decode image\\n", stderr)
  exit(2)
}
let width = cgImage.width
let height = cgImage.height
let side = 64
let bytesPerPixel = 4
let bytesPerRow = side * bytesPerPixel
var pixels = [UInt8](repeating: 0, count: side * side * bytesPerPixel)
let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(
  data: &pixels,
  width: side,
  height: side,
  bitsPerComponent: 8,
  bytesPerRow: bytesPerRow,
  space: colorSpace,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
  fputs("cannot create bitmap context\\n", stderr)
  exit(3)
}
context.interpolationQuality = .none
context.draw(cgImage, in: CGRect(x: 0, y: 0, width: side, height: side))
var minLuma = 255.0
var maxLuma = 0.0
var nonDark = 0
for i in stride(from: 0, to: pixels.count, by: 4) {
  let r = Double(pixels[i])
  let g = Double(pixels[i + 1])
  let b = Double(pixels[i + 2])
  let a = Double(pixels[i + 3])
  let luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) * (a / 255.0)
  minLuma = min(minLuma, luma)
  maxLuma = max(maxLuma, luma)
  if luma > 8.0 { nonDark += 1 }
}
let sampleCount = side * side
let json = String(
  format: "{\\"width\\":%d,\\"height\\":%d,\\"sampleCount\\":%d,\\"nonDarkRatio\\":%.6f,\\"lumaSpread\\":%.3f}",
  width,
  height,
  sampleCount,
  Double(nonDark) / Double(sampleCount),
  maxLuma - minLuma
)
print(json)
`;
}

function readImageVisualStats(imagePath) {
  const result = spawnSync("swift", ["-e", buildImageVisualStatsSwift(imagePath)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 7000,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: [
        result.error?.code === "ETIMEDOUT" ? "Swift image probe timed out" : null,
        result.stderr.trim(),
      ].filter(Boolean).join("; ") || "Swift image probe failed",
    };
  }
  try {
    return { ok: true, stats: JSON.parse(result.stdout.trim()) };
  } catch {
    return { ok: false, error: "Swift image probe returned invalid JSON" };
  }
}

export function validateVisualEvidenceStats(stats) {
  if (!stats || typeof stats !== "object") {
    return "image visual stats unavailable";
  }
  if (!Number.isFinite(stats.width) || !Number.isFinite(stats.height) || stats.width <= 0 || stats.height <= 0) {
    return "image visual stats have invalid dimensions";
  }
  if (
    !Number.isFinite(stats.nonDarkRatio) ||
    stats.nonDarkRatio < VISUAL_EVIDENCE_MIN_NON_DARK_RATIO
  ) {
    return `image appears blank or black (nonDarkRatio ${stats.nonDarkRatio ?? "unknown"})`;
  }
  if (
    !Number.isFinite(stats.lumaSpread) ||
    stats.lumaSpread < VISUAL_EVIDENCE_MIN_LUMA_SPREAD
  ) {
    return `image has too little visible contrast (lumaSpread ${stats.lumaSpread ?? "unknown"})`;
  }
  return null;
}

function visualEvidenceFailure(outPath, exists, stats) {
  if (!exists || !stats || stats.size <= 0) return null;
  const visual = readImageVisualStats(outPath);
  if (!visual.ok) return `image visual stats unavailable: ${visual.error}`;
  return validateVisualEvidenceStats(visual.stats);
}

function captureWindow(target, { keepPath = null } = {}) {
  const outPath = keepPath ?? path.join(
    "/tmp",
    `ontology-atlas-window-${process.pid}-${target.id}.png`,
  );
  if (keepPath) {
    fs.mkdirSync(path.dirname(keepPath), { recursive: true });
    fs.rmSync(keepPath, { force: true });
  }
  try {
    let method = "window-id";
    let result = spawnSync("screencapture", ["-x", "-l", String(target.id), outPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    let exists = fs.existsSync(outPath);
    let stats = exists ? fs.statSync(outPath) : null;
    const windowIdError = result.stderr.trim();

    if (!(result.status === 0 && exists && stats && stats.size > 0)) {
      fs.rmSync(outPath, { force: true });
      const regionResult = captureRegion(target, outPath);
      if (regionResult) {
        method = "bounds-region";
        result = regionResult;
        exists = fs.existsSync(outPath);
        stats = exists ? fs.statSync(outPath) : null;
      }
    }

    const visualFailure = result.status === 0
      ? visualEvidenceFailure(outPath, exists, stats)
      : null;
    const ok = result.status === 0 && exists && stats && stats.size > 0 && !visualFailure;

    return {
      ...target,
      ok,
      method,
      status: result.status,
      stderr: [windowIdError ? `window-id: ${windowIdError}` : null, result.stderr.trim() ? `${method}: ${result.stderr.trim()}` : null, visualFailure ? `${method}: ${visualFailure}` : null]
        .filter(Boolean)
        .join("; "),
      bytes: stats?.size ?? 0,
      artifactPath: ok && keepPath
        ? keepPath
        : null,
    };
  } finally {
    if (!keepPath) {
      fs.rmSync(outPath, { force: true });
    }
  }
}

function captureScreenEvidence(outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.rmSync(outPath, { force: true });
  const result = spawnSync("screencapture", ["-x", outPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  });
  const exists = fs.existsSync(outPath);
  const stats = exists ? fs.statSync(outPath) : null;
  const visualFailure = result.status === 0
    ? visualEvidenceFailure(outPath, exists, stats)
    : null;
  const ok = result.status === 0 && exists && stats && stats.size > 0 && !visualFailure;
  return {
    id: null,
    ownerPid: null,
    ownerName: "desktop",
    name: "full screen",
    bounds: null,
    alpha: null,
    sharingState: null,
    storeType: null,
    memoryUsage: null,
    ok,
    method: "full-screen",
    status: result.status,
    stderr: [
      result.stderr.trim() ? `full-screen: ${result.stderr.trim()}` : null,
      visualFailure ? `full-screen: ${visualFailure}` : null,
    ].filter(Boolean).join("; "),
    bytes: stats?.size ?? 0,
    artifactPath: ok ? outPath : null,
  };
}

export function validateCapturableWindowRows(rows) {
  if (rows.length === 0) {
    return "no CoreGraphics window ids were available for capture";
  }
  if (!rows.some((row) => row.ok)) {
    return `no matching CoreGraphics window could be captured (${rows
      .map((row) => {
        const label = `${row.ownerName || "unknown"} window=${row.id}`;
        return row.stderr ? `${label}: ${row.stderr}` : label;
      })
      .join("; ")})`;
  }
  return null;
}

export function classifyVisualEvidenceBlocker({ activation = null, captureRows = [] } = {}) {
  if (captureRows.some((row) => row.ok && row.artifactPath)) {
    return "captured";
  }
  if (activation && activation.frontmost === false) {
    return "foreground-activation-unconfirmed";
  }
  if (
    captureRows.some((row) =>
      typeof row.stderr === "string" &&
      /blank|black|nonDarkRatio|too little visible contrast/i.test(row.stderr),
    )
  ) {
    return "screen-capture-returned-blank-image";
  }
  if (captureRows.some((row) => typeof row.stderr === "string" && row.stderr.trim().length > 0)) {
    return "screen-capture-command-failed";
  }
  return "screen-capture-unavailable";
}

function verifyOnscreenWindow({
  appPath,
  executablePath,
  requireOwnerName,
  minWindowSize,
}) {
  const pids = processIds(executablePath);
  if (pids.length === 0) {
    fail(`${path.basename(appPath)} has no running process for ${executablePath}.`);
  }

  const windows = parseOnscreenWindows(readOnscreenWindows(), pids);
  if (windows.length === 0) {
    fail(
      `${path.basename(appPath)} is running but has no on-screen macOS window for PID(s) ${pids.join(", ")}.`,
    );
  }
  const unmetRequirement = validateWindowRequirements(windows, {
    requireOwnerName,
    minWindowSize,
  });
  if (unmetRequirement) {
    fail(
      `${path.basename(appPath)} has ${windows.length} visible window(s), but ${unmetRequirement}.`,
    );
  }
  return windows;
}

function verifyCapturableWindow({
  appPath,
  executablePath,
  windows,
  windowScreenshotPath = null,
  printDiagnosticsOnFailure = false,
}) {
  let savedCapture = false;
  const rows = windowCaptureTargets(windows).map((target) => {
    const row = captureWindow(target, {
      keepPath: windowScreenshotPath && !savedCapture ? windowScreenshotPath : null,
    });
    if (row.ok && row.artifactPath) {
      savedCapture = true;
    }
    return row;
  });
  const unmetRequirement = validateCapturableWindowRows(rows);
  if (unmetRequirement) {
    if (windowScreenshotPath) {
      fs.rmSync(windowScreenshotPath, { force: true });
    }
    if (printDiagnosticsOnFailure) {
      printWindowDiagnostics({ executablePath, windows, captureRows: rows });
    }
    fail(
      `${path.basename(appPath)} has CoreGraphics window metadata but no capturable current-desktop window: ${unmetRequirement}.`,
    );
  }
}

function tryCaptureWindowEvidence({
  appPath,
  executablePath,
  windows,
  windowScreenshotPath,
}) {
  if (!windowScreenshotPath || windows.length === 0) {
    return null;
  }
  const activation = activateAppForVisualEvidence({ appPath, executablePath });
  const activationDetail = [
    activation.bundleIdentifier ? `bundleId=${activation.bundleIdentifier}` : null,
    activation.pids.length > 0 ? `pids=${activation.pids.join(",")}` : "pids=none",
    `frontmost=${activation.frontmost}`,
    activation.stdout ? `stdout=${activation.stdout}` : null,
    activation.stderr ? `stderr=${activation.stderr}` : null,
  ].filter(Boolean).join(" ");
  console.log(
    `[desktop-app-verify:visual-evidence] foreground activation ${activation.ok ? "ok" : "unconfirmed"} ${activationDetail}`,
  );
  let savedCapture = false;
  const rows = windowCaptureTargets(windows).map((target) => {
    const row = captureWindow(target, {
      keepPath: !savedCapture ? windowScreenshotPath : null,
    });
    if (row.ok && row.artifactPath) {
      savedCapture = true;
    }
    return row;
  });
  const savedRow = rows.find((row) => row.ok && row.artifactPath);
  if (savedRow) {
    console.log(
      `[desktop-app-verify:visual-evidence] saved ${path.resolve(savedRow.artifactPath)} (${savedRow.bytes} bytes, ${savedRow.method})`,
    );
    return savedRow;
  }
  fs.rmSync(windowScreenshotPath, { force: true });
  const fallbackRow = captureScreenEvidence(windowScreenshotPath);
  const allRows = [...rows, fallbackRow];
  if (fallbackRow.ok && fallbackRow.artifactPath) {
    console.log(
      `[desktop-app-verify:visual-evidence] saved ${path.resolve(fallbackRow.artifactPath)} (${fallbackRow.bytes} bytes, ${fallbackRow.method} fallback)`,
    );
    return fallbackRow;
  }
  fs.rmSync(windowScreenshotPath, { force: true });
  const diagnostics = collectWindowDiagnostics({ executablePath, windows, captureRows: allRows });
  const diagnosticsPath = `${windowScreenshotPath}.diagnostics.json`;
  fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
  fs.writeFileSync(
    diagnosticsPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        visualEvidence: {
          requestedPath: path.resolve(windowScreenshotPath),
          saved: false,
          blocker: classifyVisualEvidenceBlocker({ activation, captureRows: allRows }),
          activation: {
            ok: activation.ok,
            frontmost: activation.frontmost,
            stdout: activation.stdout,
            stderr: activation.stderr,
          },
        },
        diagnostics,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `[desktop-app-verify:visual-evidence] diagnostics saved ${path.resolve(diagnosticsPath)}`,
  );
  console.log(`[desktop-app-verify:window-diagnostics] ${JSON.stringify(diagnostics)}`);
  console.log(
    `[desktop-app-verify:visual-evidence] screenshot unavailable for ${path.resolve(windowScreenshotPath)}`,
  );
  return null;
}

function verifyAccessibilityWindow({ appPath, executablePath }) {
  const pids = processIds(executablePath);
  if (pids.length === 0) {
    fail(`${path.basename(appPath)} has no running process for ${executablePath}.`);
  }

  const rows = parseAccessibilityWindowRows(readAccessibilityWindows(pids));
  const unmetRequirement = validateAccessibilityWindowRows(rows);
  if (unmetRequirement) {
    fail(
      `${path.basename(appPath)} is running but is not Accessibility-window observable for PID(s) ${pids.join(", ")}: ${unmetRequirement}.`,
    );
  }
}

function verifyFrontmostWindow({ appPath, executablePath, printDiagnosticsOnFailure = false }) {
  const pids = processIds(executablePath);
  if (pids.length === 0) {
    fail(`${path.basename(appPath)} has no running process for ${executablePath}.`);
  }

  const rows = parseAccessibilityWindowRows(readAccessibilityWindows(pids));
  const unmetRequirement = validateFrontmostAccessibilityRows(rows);
  if (unmetRequirement) {
    if (printDiagnosticsOnFailure) {
      printWindowDiagnostics({ executablePath });
    }
    fail(
      `${path.basename(appPath)} is running but is not the foreground macOS app for PID(s) ${pids.join(", ")}: ${unmetRequirement}.`,
    );
  }
}

function verifyAccessibilityText({ appPath, executablePath, requiredText }) {
  const pids = processIds(executablePath);
  if (pids.length === 0) {
    fail(`${path.basename(appPath)} has no running process for ${executablePath}.`);
  }

  const payload = readAccessibilityText(pids, requiredText);
  const unmetRequirement = validateAccessibilityText(payload, requiredText);
  if (unmetRequirement) {
    fail(
      `${path.basename(appPath)} is running but its Accessibility tree did not prove the required app content: ${unmetRequirement}.`,
    );
  }
}

export function formatWindowDiagnosticsPayload({
  pids,
  windows,
  accessibilityRows,
  captureRows = [],
}) {
  return {
    pids,
    windows: windows.map((window) => ({
      windowNumber: window.kCGWindowNumber,
      ownerPid: window.kCGWindowOwnerPID,
      ownerName: window.kCGWindowOwnerName,
      name: window.kCGWindowName,
      bounds: window.kCGWindowBounds,
      layer: window.kCGWindowLayer,
      onscreen: window.kCGWindowIsOnscreen,
      alpha: window.kCGWindowAlpha ?? null,
      sharingState: window.kCGWindowSharingState ?? null,
      storeType: window.kCGWindowStoreType ?? null,
      memoryUsage: window.kCGWindowMemoryUsage ?? null,
    })),
    accessibilityRows,
    captureRows: captureRows.map((row) => ({
      windowNumber: row.id,
      ownerName: row.ownerName,
      sharingState: row.sharingState ?? null,
      alpha: row.alpha ?? null,
      ok: row.ok,
      method: row.method,
      stderr: row.stderr,
      bytes: row.bytes,
      artifactPath: row.artifactPath ?? null,
    })),
  };
}

function collectWindowDiagnostics({ executablePath, windows = null, captureRows = [] }) {
  const pids = processIds(executablePath);
  const resolvedWindows = windows ?? (pids.length > 0 ? parseOnscreenWindows(readOnscreenWindows(), pids) : []);
  const accessibilityRows = pids.length > 0
    ? parseAccessibilityWindowRows(readAccessibilityWindows(pids))
    : [];
  return formatWindowDiagnosticsPayload({
    pids,
    windows: resolvedWindows,
    accessibilityRows,
    captureRows,
  });
}

function printWindowDiagnostics({ executablePath, windows = null, captureRows = [] }) {
  console.log(
    `[desktop-app-verify:window-diagnostics] ${JSON.stringify(
      collectWindowDiagnostics({ executablePath, windows, captureRows }),
    )}`,
  );
}

function writeWebviewEvidence(payload, outPath) {
  if (!outPath) return;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        payload,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[desktop-app-verify:webview-evidence] saved ${path.resolve(outPath)}`);
}

async function verifyOpenAppLaunch({
  appPath,
  executablePath,
  holdMs,
  leaveRunning,
  requireWindow,
  requireCapturableWindow,
  requireAccessibilityWindow,
  requireFrontmost,
  requireAccessibilityText,
  printWindowDiagnostics: shouldPrintWindowDiagnostics,
  requireOwnerName,
  minWindowSize,
  minWebviewSize,
  maxWebviewSize,
  windowScreenshotPath,
  tryWindowScreenshotPath,
}) {
  const open = spawn("open", ["-n", appPath], {
    cwd: path.dirname(appPath),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  open.stdout.setEncoding("utf8");
  open.stderr.setEncoding("utf8");
  open.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  open.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const openExit = await new Promise((resolve) => {
    open.once("exit", (code, signal) => resolve({ code, signal }));
  });

  if (openExit.code !== 0) {
    fail(
      [
        `open failed for ${appPath} (code=${openExit.code}, signal=${openExit.signal})`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
        stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  await sleep(holdMs);

  if (!processExists(executablePath)) {
    fail(`${path.basename(appPath)} was not running after LaunchServices hold (${holdMs}ms).`);
  }

  let windows = [];
  if (requireWindow) {
    windows = verifyOnscreenWindow({
      appPath,
      executablePath,
      requireOwnerName,
      minWindowSize,
    });
  }

  if (requireCapturableWindow) {
    verifyCapturableWindow({
      appPath,
      executablePath,
      windows,
      windowScreenshotPath,
      printDiagnosticsOnFailure: shouldPrintWindowDiagnostics,
    });
  }
  if (tryWindowScreenshotPath) {
    tryCaptureWindowEvidence({
      appPath,
      executablePath,
      windows,
      windowScreenshotPath: tryWindowScreenshotPath,
    });
  }

  if (requireAccessibilityWindow) {
    verifyAccessibilityWindow({ appPath, executablePath });
  }

  if (requireFrontmost) {
    verifyFrontmostWindow({
      appPath,
      executablePath,
      printDiagnosticsOnFailure: shouldPrintWindowDiagnostics,
    });
  }

  if (requireAccessibilityText.length > 0) {
    verifyAccessibilityText({ appPath, executablePath, requiredText: requireAccessibilityText });
  }

  if (shouldPrintWindowDiagnostics) {
    printWindowDiagnostics({ executablePath });
  }

  if (!leaveRunning) {
    terminateExisting({ appPath, executablePath });
  }
}

async function verifyExecutableLaunch({
  appPath,
  executablePath,
  holdMs,
  leaveRunning,
  requireWindow,
  requireCapturableWindow,
  requireAccessibilityWindow,
  requireFrontmost,
  requireWebviewContent,
  requireWebviewRoute,
  verifyTopologyDrag,
  verifyTopologyCreateNode,
  requireAccessibilityText,
  printWindowDiagnostics: shouldPrintWindowDiagnostics,
  requireOwnerName,
  minWindowSize,
  minWebviewSize,
  maxWebviewSize,
  webviewWindowSize,
  windowScreenshotPath,
  tryWindowScreenshotPath,
  webviewEvidencePath,
}) {
  const child = spawn(executablePath, {
    cwd: path.dirname(executablePath),
    env: requireWebviewContent
      ? {
          ...process.env,
          ...webviewVerifyEnvPatch({
            requireWebviewRoute,
            verifyTopologyDrag,
            verifyTopologyCreateNode,
            webviewWindowSize,
          }),
        }
      : process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let earlyExit = null;
  child.once("exit", (code, signal) => {
    earlyExit = { code, signal };
  });

  await sleep(holdMs);

  if (earlyExit) {
    fail(
      [
        `${appBundleName} exited before ${holdMs}ms (code=${earlyExit.code}, signal=${earlyExit.signal})`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
        stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  let windows = [];
  if (requireWindow) {
    windows = verifyOnscreenWindow({
      appPath,
      executablePath,
      requireOwnerName,
      minWindowSize,
    });
  }

  if (requireWebviewContent) {
    const validationOptions = {
      expectedPath: requireWebviewRoute,
      minWebviewSize,
      maxWebviewSize,
      requireTopologyDrag: verifyTopologyDrag,
      requireTopologyCreateNode: verifyTopologyCreateNode,
    };
    const { payload, validationError: webviewError } = await waitForWebviewVerifyPayload(
      () => stdout,
      {
        validatePayload: (candidate) => validateWebviewVerifyPayload(candidate, validationOptions),
      },
    );
    if (webviewError) {
      fail(
        [
          `${appBundleName} WebView content verification failed: ${webviewError}`,
          stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
          stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
    writeWebviewEvidence(payload, webviewEvidencePath);
  }

  if (requireCapturableWindow) {
    verifyCapturableWindow({
      appPath,
      executablePath,
      windows,
      windowScreenshotPath,
      printDiagnosticsOnFailure: shouldPrintWindowDiagnostics,
    });
  }
  if (tryWindowScreenshotPath) {
    tryCaptureWindowEvidence({
      appPath,
      executablePath,
      windows,
      windowScreenshotPath: tryWindowScreenshotPath,
    });
  }

  if (requireAccessibilityWindow) {
    verifyAccessibilityWindow({ appPath, executablePath });
  }

  if (requireFrontmost) {
    verifyFrontmostWindow({
      appPath,
      executablePath,
      printDiagnosticsOnFailure: shouldPrintWindowDiagnostics,
    });
  }

  if (requireAccessibilityText.length > 0) {
    verifyAccessibilityText({ appPath, executablePath, requiredText: requireAccessibilityText });
  }

  if (shouldPrintWindowDiagnostics) {
    printWindowDiagnostics({ executablePath });
  }

  if (!leaveRunning) {
    await terminate(child);
  } else {
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (process.platform !== "darwin") {
    fail("macOS .app launch verification requires darwin.");
  }

  const {
    appPath,
    holdMs,
    killExisting,
    leaveRunning,
    openApp,
    requireWindow,
    requireCapturableWindow,
    requireAccessibilityWindow,
    requireFrontmost,
    requireWebviewContent,
    requireWebviewRoute,
    verifyTopologyDrag,
    verifyTopologyCreateNode,
    requireAccessibilityText,
    printWindowDiagnostics,
    requireOwnerName,
    minWindowSize,
    minWebviewSize,
    maxWebviewSize,
    webviewWindowSize,
    windowScreenshotPath,
    tryWindowScreenshotPath,
    webviewEvidencePath,
  } = parseVerifyAppLaunchArgs(process.argv.slice(2), {
    defaultAppPath: path.join(
      root,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "macos",
      appBundleName,
    ),
  });
  const resolvedAppPath = path.resolve(appPath);
  const executablePath = resolveMacosExecutable(resolvedAppPath, names);

  if (!Number.isFinite(holdMs) || holdMs < 1000) {
    fail("--hold-ms must be a number >= 1000.");
  }
  if (process.argv.some((arg) => arg.startsWith("--min-window-size=")) && !minWindowSize) {
    fail("--min-window-size must use WIDTHxHEIGHT, e.g. 1040x720.");
  }
  if (process.argv.some((arg) => arg.startsWith("--min-webview-size=")) && !minWebviewSize) {
    fail("--min-webview-size must use WIDTHxHEIGHT, e.g. 1400x860.");
  }
  if (process.argv.some((arg) => arg.startsWith("--max-webview-size=")) && !maxWebviewSize) {
    fail("--max-webview-size must use WIDTHxHEIGHT, e.g. 1100x800.");
  }
  if (process.argv.some((arg) => arg.startsWith("--webview-window-size=")) && !webviewWindowSize) {
    fail("--webview-window-size must use WIDTHxHEIGHT, e.g. 1100x800.");
  }
  if ((requireOwnerName || minWindowSize) && !requireWindow) {
    fail("--require-owner-name and --min-window-size require --require-window.");
  }
  if (requireCapturableWindow && !requireWindow) {
    fail("--require-capturable-window requires --require-window.");
  }
  if (windowScreenshotPath && !requireCapturableWindow) {
    fail("--window-screenshot requires --require-capturable-window.");
  }
  if (tryWindowScreenshotPath && !requireWindow) {
    fail("--try-window-screenshot requires --require-window.");
  }
  if (webviewEvidencePath && !requireWebviewContent) {
    fail("--webview-evidence requires --require-webview-content.");
  }
  if (requireWebviewContent && openApp) {
    fail("--require-webview-content is only supported for direct executable launch; omit --open-app.");
  }
  if (requireWebviewRoute && openApp) {
    fail("--require-webview-route is only supported for direct executable launch; omit --open-app.");
  }
  if (webviewEvidencePath && openApp) {
    fail("--webview-evidence is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologyDrag && openApp) {
    fail("--verify-topology-drag is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologyCreateNode && openApp) {
    fail("--verify-topology-create-node is only supported for direct executable launch; omit --open-app.");
  }
  if (webviewWindowSize && openApp) {
    fail("--webview-window-size is only supported for direct executable launch; omit --open-app.");
  }
  const normalizedWebviewRoute = requireWebviewRoute
    ? normalizeWebviewRoute(requireWebviewRoute)
    : null;
  if (requireWebviewRoute && !normalizedWebviewRoute) {
    fail("--require-webview-route must be an absolute app path such as /en/topology/.");
  }
  if (verifyTopologyDrag && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-drag requires --require-webview-route pointing at a /topology route.");
  }
  if (verifyTopologyCreateNode && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-create-node requires --require-webview-route pointing at a /topology route.");
  }
  if (!fs.existsSync(resolvedAppPath)) {
    fail(`missing app bundle at ${resolvedAppPath}; run pnpm desktop:build:app first.`);
  }

  if (!fs.existsSync(executablePath)) {
    fail(`missing app executable at ${executablePath}; run pnpm desktop:build:app first.`);
  }

  printBundlePathConflictWarnings({
    appPath: resolvedAppPath,
    appBundleName,
  });

  const verifyLock = createVerifyLock(verifyLockPath(resolvedAppPath), {
    appPath: resolvedAppPath,
  });
  if (!verifyLock.ok) {
    fail(verifyLock.message);
  }

  try {
    if (killExisting) {
      terminateExisting({ appPath: resolvedAppPath, executablePath });
      const remainingPids = await waitForExistingProcessesToExit({
        appPath: resolvedAppPath,
        executablePath,
      });
      if (remainingPids.length > 0) {
        fail(
          `${appBundleName} still had stale process(es) after --kill-existing: ${remainingPids.join(", ")}`,
        );
      }
    }

    if (openApp) {
      await verifyOpenAppLaunch({
        appPath: resolvedAppPath,
        executablePath,
        holdMs,
        leaveRunning,
        requireWindow,
        requireCapturableWindow,
        requireAccessibilityWindow,
        requireFrontmost,
        requireAccessibilityText,
        printWindowDiagnostics,
        requireOwnerName,
        minWindowSize,
        minWebviewSize,
        maxWebviewSize,
        webviewWindowSize,
        windowScreenshotPath,
        tryWindowScreenshotPath,
      });
    } else {
      await verifyExecutableLaunch({
        appPath: resolvedAppPath,
        executablePath,
        holdMs,
        leaveRunning,
        requireWindow,
        requireCapturableWindow,
        requireAccessibilityWindow,
        requireFrontmost,
        requireWebviewContent,
        requireWebviewRoute: normalizedWebviewRoute,
        verifyTopologyDrag,
        verifyTopologyCreateNode,
        requireAccessibilityText,
        printWindowDiagnostics,
        requireOwnerName,
        minWindowSize,
        minWebviewSize,
        maxWebviewSize,
        webviewWindowSize,
        windowScreenshotPath,
        tryWindowScreenshotPath,
        webviewEvidencePath,
      });
    }
  } finally {
    verifyLock.release();
  }

  console.log(
    `[desktop-app-verify] launched ${resolvedAppPath} for ${holdMs}ms without early exit${
      requireWindow ? " and with an on-screen window" : ""
    }${requireCapturableWindow ? " and with a capturable current-desktop window" : ""
    }${requireAccessibilityWindow ? " and with an Accessibility-observable window" : ""
    }${requireAccessibilityText.length > 0 ? " and with required Accessibility text" : ""
    }${requireWebviewContent ? " and loaded WebView content" : ""
    }${windowScreenshotPath ? ` and saved a window screenshot to ${path.resolve(windowScreenshotPath)}` : ""
    }${tryWindowScreenshotPath ? ` and attempted visual evidence at ${path.resolve(tryWindowScreenshotPath)}` : ""
    }${webviewEvidencePath ? ` and saved WebView evidence to ${path.resolve(webviewEvidencePath)}` : ""
    }${requireOwnerName ? ` owned by ${requireOwnerName}` : ""}${
      minWindowSize ? ` at least ${minWindowSize.width}x${minWindowSize.height}` : ""
    }`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
