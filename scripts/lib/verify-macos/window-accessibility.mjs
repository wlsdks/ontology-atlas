import path from "node:path";
import { spawnSync } from "node:child_process";
import { fail } from "./cli-args.mjs";
import { processIds, readBundleIdentifier } from "./process-lock.mjs";
import { printWindowDiagnostics } from "./visual-evidence.mjs";
import { ACCESSIBILITY_TEXT_MAX_CHILDREN_PER_NODE, ACCESSIBILITY_TEXT_MAX_DEPTH, ACCESSIBILITY_TEXT_TIMEOUT_MS, ACCESSIBILITY_WINDOW_TIMEOUT_MS } from "./webview-env.mjs";

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
        set output to output & procPid & tab & name of proc & tab & frontmost of proc & tab & (count of windows of proc) & linefeed
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


export function runForegroundActivationWithRetry({
  runAttempt,
  maxAttempts = 2,
}) {
  const boundedAttempts =
    Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : 1;
  const records = [];

  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    const record = runAttempt(attempt);
    records.push(record);
    if (record.ok) break;
  }

  const finalRecord = records.at(-1);
  return {
    ...finalRecord,
    attempts: records.length,
    recovered: Boolean(finalRecord?.ok && records.length > 1),
    attemptErrors: records
      .map((record, index) =>
        record.ok
          ? null
          : `attempt ${index + 1}: ${
              record.stderr || "foreground state not confirmed"
            }`,
      )
      .filter(Boolean),
  };
}


export function activateAppForVisualEvidence({
  appPath,
  executablePath,
  maxAttempts = 2,
}) {
  const pids = processIds(executablePath);
  const bundleIdentifier = readBundleIdentifier(appPath);
  const activation = runForegroundActivationWithRetry({
    maxAttempts,
    runAttempt: () => {
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
      const accessibility = spawnSync(
        "osascript",
        ["-e", buildAccessibilityWindowProbeScript(pids)],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: ACCESSIBILITY_WINDOW_TIMEOUT_MS,
        },
      );
      const accessibilityRows =
        accessibility.status === 0
          ? parseAccessibilityWindowRows(accessibility.stdout)
          : [];
      const frontmost = accessibilityRows.some((row) => row.frontmost);
      const ok =
        result.status === 0 &&
        (/\bbundle=true\b/.test(stdout) || /\bpid=true\b/.test(stdout)) &&
        frontmost;
      return {
        ok,
        frontmost,
        status: result.status,
        stdout,
        stderr: [
          result.error?.code === "ETIMEDOUT"
            ? "foreground activation timed out"
            : null,
          stderr,
          accessibility.error?.code === "ETIMEDOUT"
            ? `post-activation Accessibility probe timed out after ${ACCESSIBILITY_WINDOW_TIMEOUT_MS}ms`
            : null,
          accessibility.status !== 0
            ? `post-activation Accessibility probe failed: ${accessibility.stderr.trim()}`
            : null,
        ]
          .filter(Boolean)
          .join("; "),
      };
    },
  });
  return {
    ...activation,
    bundleIdentifier,
    pids,
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


export function readOnscreenWindows() {
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


export function readAccessibilityWindows(pids) {
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


export function readAccessibilityWindowsBestEffort(pids) {
  const result = spawnSync("osascript", ["-e", buildAccessibilityWindowProbeScript(pids)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: ACCESSIBILITY_WINDOW_TIMEOUT_MS,
  });
  if (result.status === 0) {
    return { payload: result.stdout, error: null };
  }
  return {
    payload: "",
    error: [
      result.error?.code === "ETIMEDOUT"
        ? `System Events did not respond within ${ACCESSIBILITY_WINDOW_TIMEOUT_MS}ms`
        : null,
      result.stderr.trim() ? result.stderr.trim() : null,
      result.status !== null ? `exit status ${result.status}` : null,
    ].filter(Boolean).join("; ") || "Accessibility window probe unavailable",
  };
}


export function readAccessibilityText(pids, requiredText) {
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


export function verifyAccessibilityWindow({ appPath, executablePath }) {
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


export function verifyFrontmostWindow({ appPath, executablePath, printDiagnosticsOnFailure = false }) {
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


export function verifyAccessibilityText({ appPath, executablePath, requiredText }) {
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
