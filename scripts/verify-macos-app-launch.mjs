#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadMacosReleaseNames, resolveMacosExecutable } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName } = names;
const WEBVIEW_VERIFY_ENV = "ONTOLOGY_ATLAS_VERIFY_WEBVIEW";
const WEBVIEW_VERIFY_PREFIX = "[ontology-atlas-webview-verify] ";
const ACCESSIBILITY_WINDOW_TIMEOUT_MS = 3000;
const ACCESSIBILITY_TEXT_TIMEOUT_MS = 7000;
const ACCESSIBILITY_TEXT_MAX_DEPTH = 8;
const ACCESSIBILITY_TEXT_MAX_CHILDREN_PER_NODE = 80;
const WEBVIEW_WORKBENCH_MARKERS = [
  /온톨로지|Ontology/,
  /저장소|문서함|Source Vault|Documents/,
];

export function parseVerifyAppLaunchArgs(argv, {
  defaultAppPath,
  defaultHoldMs = 5000,
} = {}) {
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  const holdMsArg = argv.find((arg) => arg.startsWith("--hold-ms="));
  const ownerNameArg = argv.find((arg) => arg.startsWith("--require-owner-name="));
  const minWindowSizeArg = argv.find((arg) => arg.startsWith("--min-window-size="));
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
    requireWebviewContent: argv.includes("--require-webview-content") || !argv.includes("--open-app"),
    printWindowDiagnostics: argv.includes("--print-window-diagnostics"),
    requireOwnerName: ownerNameArg
      ? ownerNameArg.slice("--require-owner-name=".length)
      : null,
    minWindowSize: minWindowSizeArg
      ? parseMinWindowSize(minWindowSizeArg.slice("--min-window-size=".length))
      : null,
    requireAccessibilityText,
  };
}

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-app [path/to/${appBundleName}] [--hold-ms=5000] [--kill-existing] [--leave-running] [--open-app] [--require-window] [--require-capturable-window] [--require-accessibility-window] [--require-accessibility-text="개념 지도"] [--require-webview-content] [--print-window-diagnostics] [--require-owner-name="Ontology Atlas"] [--min-window-size=1040x720]

Launches the packaged macOS .app executable, waits long enough to catch early
startup crashes, then terminates it. This is an unsigned local runtime smoke;
release artifacts still need pnpm desktop:verify-release-dmg.

Options:
  --kill-existing   Terminate already-running copies of this app executable before launch.
  --leave-running   Keep the LaunchServices-opened app running after verification so Computer Use
                    or a human can inspect the same installed app window. Requires --open-app.
  --open-app        Launch through macOS LaunchServices (open -n) instead of spawning the executable directly.
  --require-window  Require an on-screen macOS window owned by the launched app process.
  --require-capturable-window
                    Require at least one matching CoreGraphics window to produce a local screenshot
                    artifact, first by window id and then by the current-desktop bounds region.
                    This adds capture proof; Computer Use is still the final desktop-control check.
  --require-accessibility-window
                    Require System Events to see at least one Accessibility window for the launched
                    process. This fails when macOS only exposes an app/menu tree with zero AX windows.
  --require-accessibility-text=TEXT
                    Require the Swift Accessibility probe to find TEXT in the launched app's AX tree.
                    Repeat this option to require several screen phrases. Useful with --open-app,
                    where stdout WebView markers are not available.
  --require-webview-content
                    Require the Tauri WebView to report a loaded DOM with non-empty body text.
                    This uses stdout from direct executable launch and is not compatible with --open-app.
  --print-window-diagnostics
                    Print one JSON line with launched process ids, CoreGraphics windows, and
                    System Events accessibility rows. Use when Computer Use cannot observe
                    a window that macOS itself reports as visible.
  --require-owner-name=NAME
                    Require the visible app window's macOS owner name to match NAME.
  --min-window-size=WIDTHxHEIGHT
                    Require the visible app window to be at least WIDTH by HEIGHT points.
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

export function existingProcessPatterns({ appPath, executablePath }) {
  return [
    regexEscape(executablePath),
    `${regexEscape(path.basename(appPath))}/Contents/MacOS/${regexEscape(path.basename(executablePath))}`,
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
    .find((entry) => entry.startsWith(WEBVIEW_VERIFY_PREFIX));
  if (!line) return null;

  const raw = line.slice(WEBVIEW_VERIFY_PREFIX.length).trim();
  const parsed = JSON.parse(raw);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

export function validateWebviewVerifyPayload(payload) {
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
  if (payload.title !== "Ontology Atlas") {
    return `WebView did not report the Ontology Atlas title (title=${payload.title ?? "unknown"})`;
  }
  if (!WEBVIEW_WORKBENCH_MARKERS.every((marker) => marker.test(payload.bodyText))) {
    return "WebView body text did not include Ontology Atlas workbench markers";
  }
  if (!payload.markers || typeof payload.markers !== "object") {
    return "WebView did not report structured markers";
  }
  if (payload.markers.ontologyNav !== true) {
    return "WebView did not report the ontology navigation marker";
  }
  if (payload.markers.sourceVaultNav !== true) {
    return "WebView did not report the source vault navigation marker";
  }
  if (payload.markers.agentBriefCopy !== true) {
    return "WebView did not report the agent brief copy marker";
  }
  if (payload.markers.businessDecisionQuestions !== true) {
    return "WebView did not report the business decision questions marker";
  }
  if (payload.markers.readerDecisionLens !== true) {
    return "WebView did not report the reader decision lens marker";
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

function captureWindow(target) {
  const outPath = path.join(
    "/tmp",
    `ontology-atlas-window-${process.pid}-${target.id}.png`,
  );
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

    return {
      ...target,
      ok: result.status === 0 && exists && stats && stats.size > 0,
      method,
      status: result.status,
      stderr: [windowIdError ? `window-id: ${windowIdError}` : null, result.stderr.trim() ? `${method}: ${result.stderr.trim()}` : null]
        .filter(Boolean)
        .join("; "),
      bytes: stats?.size ?? 0,
    };
  } finally {
    fs.rmSync(outPath, { force: true });
  }
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

function verifyCapturableWindow({ appPath, windows }) {
  const rows = windowCaptureTargets(windows).map(captureWindow);
  const unmetRequirement = validateCapturableWindowRows(rows);
  if (unmetRequirement) {
    fail(
      `${path.basename(appPath)} has CoreGraphics window metadata but no capturable current-desktop window: ${unmetRequirement}.`,
    );
  }
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

function printWindowDiagnostics({ executablePath }) {
  const pids = processIds(executablePath);
  const windows = pids.length > 0 ? parseOnscreenWindows(readOnscreenWindows(), pids) : [];
  const accessibilityRows = pids.length > 0
    ? parseAccessibilityWindowRows(readAccessibilityWindows(pids))
    : [];
  console.log(
    `[desktop-app-verify:window-diagnostics] ${JSON.stringify({
      pids,
      windows: windows.map((window) => ({
        windowNumber: window.kCGWindowNumber,
        ownerPid: window.kCGWindowOwnerPID,
        ownerName: window.kCGWindowOwnerName,
        name: window.kCGWindowName,
        bounds: window.kCGWindowBounds,
        layer: window.kCGWindowLayer,
        onscreen: window.kCGWindowIsOnscreen,
      })),
      accessibilityRows,
    })}`,
  );
}

async function verifyOpenAppLaunch({
  appPath,
  executablePath,
  holdMs,
  leaveRunning,
  requireWindow,
  requireCapturableWindow,
  requireAccessibilityWindow,
  requireAccessibilityText,
  printWindowDiagnostics: shouldPrintWindowDiagnostics,
  requireOwnerName,
  minWindowSize,
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
    verifyCapturableWindow({ appPath, windows });
  }

  if (requireAccessibilityWindow) {
    verifyAccessibilityWindow({ appPath, executablePath });
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
  requireWindow,
  requireCapturableWindow,
  requireAccessibilityWindow,
  requireWebviewContent,
  requireAccessibilityText,
  printWindowDiagnostics: shouldPrintWindowDiagnostics,
  requireOwnerName,
  minWindowSize,
}) {
  const child = spawn(executablePath, {
    cwd: path.dirname(executablePath),
    env: requireWebviewContent
      ? { ...process.env, [WEBVIEW_VERIFY_ENV]: "1" }
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

  if (requireCapturableWindow) {
    verifyCapturableWindow({ appPath, windows });
  }

  if (requireAccessibilityWindow) {
    verifyAccessibilityWindow({ appPath, executablePath });
  }

  if (requireAccessibilityText.length > 0) {
    verifyAccessibilityText({ appPath, executablePath, requiredText: requireAccessibilityText });
  }

  if (requireWebviewContent) {
    const payload = parseWebviewVerifyPayload(stdout);
    const webviewError = validateWebviewVerifyPayload(payload);
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
  }

  if (shouldPrintWindowDiagnostics) {
    printWindowDiagnostics({ executablePath });
  }

  await terminate(child);
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
    requireWebviewContent,
    requireAccessibilityText,
    printWindowDiagnostics,
    requireOwnerName,
    minWindowSize,
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
  if ((requireOwnerName || minWindowSize) && !requireWindow) {
    fail("--require-owner-name and --min-window-size require --require-window.");
  }
  if (requireCapturableWindow && !requireWindow) {
    fail("--require-capturable-window requires --require-window.");
  }
  if (requireWebviewContent && openApp) {
    fail("--require-webview-content is only supported for direct executable launch; omit --open-app.");
  }
  if (leaveRunning && !openApp) {
    fail("--leave-running requires --open-app so the verifier can return while the app stays open.");
  }

  if (!fs.existsSync(resolvedAppPath)) {
    fail(`missing app bundle at ${resolvedAppPath}; run pnpm desktop:build:app first.`);
  }

  if (!fs.existsSync(executablePath)) {
    fail(`missing app executable at ${executablePath}; run pnpm desktop:build:app first.`);
  }

  if (killExisting) {
    terminateExisting({ appPath: resolvedAppPath, executablePath });
    await sleep(600);
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
      requireAccessibilityText,
      printWindowDiagnostics,
      requireOwnerName,
      minWindowSize,
    });
  } else {
    await verifyExecutableLaunch({
      appPath: resolvedAppPath,
      executablePath,
      holdMs,
      requireWindow,
      requireCapturableWindow,
      requireAccessibilityWindow,
      requireWebviewContent,
      requireAccessibilityText,
      printWindowDiagnostics,
      requireOwnerName,
      minWindowSize,
    });
  }

  console.log(
    `[desktop-app-verify] launched ${resolvedAppPath} for ${holdMs}ms without early exit${
      requireWindow ? " and with an on-screen window" : ""
    }${requireCapturableWindow ? " and with a capturable current-desktop window" : ""
    }${requireAccessibilityWindow ? " and with an Accessibility-observable window" : ""
    }${requireAccessibilityText.length > 0 ? " and with required Accessibility text" : ""
    }${requireWebviewContent ? " and loaded WebView content" : ""
    }${requireOwnerName ? ` owned by ${requireOwnerName}` : ""}${
      minWindowSize ? ` at least ${minWindowSize.width}x${minWindowSize.height}` : ""
    }`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
