import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fail } from "./cli-args.mjs";
import { normalizeVisualEvidenceReference } from "./evidence-payload.mjs";
import { processIds } from "./process-lock.mjs";
import { VISUAL_EVIDENCE_MIN_LUMA_SPREAD, VISUAL_EVIDENCE_MIN_NON_DARK_RATIO } from "./webview-env.mjs";
import { activateAppForVisualEvidence, parseAccessibilityWindowRows, parseOnscreenWindows, readAccessibilityWindows, readAccessibilityWindowsBestEffort, readOnscreenWindows, validateWindowRequirements, windowCaptureTargets } from "./window-accessibility.mjs";

export function captureRegion(target, outPath) {
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


export function buildImageVisualStatsSwift(imagePath) {
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


export function readImageVisualStats(imagePath) {
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


export function visualEvidenceFailure(outPath, exists, stats) {
  if (!exists || !stats || stats.size <= 0) return null;
  const visual = readImageVisualStats(outPath);
  if (!visual.ok) return `image visual stats unavailable: ${visual.error}`;
  return validateVisualEvidenceStats(visual.stats);
}


export function captureWindow(target, { keepPath = null } = {}) {
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


export function captureScreenEvidence(outPath) {
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
  const activationError = `${activation?.stderr ?? ""} ${activation?.stdout ?? ""}`;
  const activationBlockedByAccessibility =
    activation?.frontmost === false &&
    /Accessibility|System Events|not authorized|not permitted|timed out|timeout/i.test(
      activationError,
    );
  const captureBlocked =
    captureRows.some((row) => typeof row.stderr === "string" && row.stderr.trim().length > 0);
  if (activationBlockedByAccessibility && captureBlocked) {
    return "macos-automation-and-screen-capture-blocked";
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


export function visualEvidenceBlockerHint(blocker) {
  if (blocker === "macos-automation-and-screen-capture-blocked") {
    return {
      summary:
        "macOS automation and screen capture blocked visual evidence; WebView proof may still be valid.",
      nextActions: [
        "Grant Accessibility permission to the terminal or Codex host running the verifier.",
        "Grant Screen Recording permission, then rerun with --try-window-screenshot or --require-capturable-window.",
        "Use the saved WebView evidence JSON as deterministic route proof until PNG capture is available.",
      ],
    };
  }
  if (blocker === "foreground-activation-unconfirmed") {
    return {
      summary: "macOS did not confirm the launched app became frontmost.",
      nextActions: [
        "Rerun with --require-frontmost when foreground activation itself is the behavior under test.",
        "Inspect System Events Accessibility rows in the diagnostics payload.",
      ],
    };
  }
  if (blocker === "screen-capture-returned-blank-image") {
    return {
      summary: "screencapture returned a blank or low-contrast image.",
      nextActions: [
        "Grant Screen Recording permission to the terminal or Codex host.",
        "Rerun visual evidence capture after confirming the app window is visible on the current desktop.",
      ],
    };
  }
  if (blocker === "screen-capture-command-failed") {
    return {
      summary: "screencapture failed for the matching CoreGraphics window.",
      nextActions: [
        "Inspect captureRows stderr for the failing window-id or bounds-region method.",
        "Rerun with --print-window-diagnostics when capturable-window proof is required.",
      ],
    };
  }
  return {
    summary: "visual evidence capture was unavailable.",
    nextActions: [
      "Inspect the saved diagnostics payload before treating the missing screenshot as an app failure.",
    ],
  };
}


export function formatVisualEvidenceHandoffLines({
  blocker,
  requestedPath,
  diagnosticsPath,
  webviewEvidencePath = null,
  hint,
}) {
  return [
    `[desktop-app-verify:visual-evidence] blocker ${blocker}: ${hint.summary}`,
    webviewEvidencePath
      ? `[desktop-app-verify:visual-evidence] WebView route proof: ${webviewEvidencePath}`
      : null,
    ...hint.nextActions.map((action, index) =>
      `[desktop-app-verify:visual-evidence] next action ${index + 1}: ${action}`,
    ),
    `[desktop-app-verify:visual-evidence] diagnostics saved ${diagnosticsPath}`,
    `[desktop-app-verify:visual-evidence] screenshot unavailable for ${requestedPath}`,
  ].filter(Boolean);
}


export function verifyOnscreenWindow({
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


export function verifyCapturableWindow({
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
  const savedRow = rows.find((row) => row.ok && row.artifactPath);
  return savedRow
    ? normalizeVisualEvidenceReference({
        screenshotPath: savedRow.artifactPath,
        screenshotStatus: "saved",
        bytes: savedRow.bytes,
        method: savedRow.method,
      })
    : null;
}


export function tryCaptureWindowEvidence({
  appPath,
  executablePath,
  windows,
  windowScreenshotPath,
  webviewEvidencePath = null,
}) {
  if (!windowScreenshotPath || windows.length === 0) {
    return null;
  }
  const activation = activateAppForVisualEvidence({ appPath, executablePath });
  const activationDetail = [
    activation.bundleIdentifier ? `bundleId=${activation.bundleIdentifier}` : null,
    activation.pids.length > 0 ? `pids=${activation.pids.join(",")}` : "pids=none",
    `frontmost=${activation.frontmost}`,
    `commandConfirmed=${activation.activationCommandConfirmed}`,
    `attempts=${activation.attempts}`,
    activation.recovered ? "recovered=true" : null,
    activation.attemptErrors.length > 0
      ? `attemptErrors=${JSON.stringify(activation.attemptErrors)}`
      : null,
    activation.warnings.length > 0
      ? `warnings=${JSON.stringify(activation.warnings)}`
      : null,
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
    return normalizeVisualEvidenceReference({
      screenshotPath: savedRow.artifactPath,
      screenshotStatus: "saved",
      bytes: savedRow.bytes,
      method: savedRow.method,
    });
  }
  fs.rmSync(windowScreenshotPath, { force: true });
  const fallbackRow = captureScreenEvidence(windowScreenshotPath);
  const allRows = [...rows, fallbackRow];
  if (fallbackRow.ok && fallbackRow.artifactPath) {
    console.log(
      `[desktop-app-verify:visual-evidence] saved ${path.resolve(fallbackRow.artifactPath)} (${fallbackRow.bytes} bytes, ${fallbackRow.method} fallback)`,
    );
    return normalizeVisualEvidenceReference({
      screenshotPath: fallbackRow.artifactPath,
      screenshotStatus: "saved",
      bytes: fallbackRow.bytes,
      method: fallbackRow.method,
    });
  }
  fs.rmSync(windowScreenshotPath, { force: true });
  const diagnostics = collectWindowDiagnostics({
    executablePath,
    windows,
    captureRows: allRows,
    allowAccessibilityFailure: true,
  });
  const blocker = classifyVisualEvidenceBlocker({ activation, captureRows: allRows });
  const blockerHint = visualEvidenceBlockerHint(blocker);
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
          blocker,
          summary: blockerHint.summary,
          nextActions: blockerHint.nextActions,
          webviewEvidencePath: webviewEvidencePath ? path.resolve(webviewEvidencePath) : null,
          activation: {
            ok: activation.ok,
            frontmost: activation.frontmost,
            activationCommandConfirmed:
              activation.activationCommandConfirmed,
            attempts: activation.attempts,
            recovered: activation.recovered,
            attemptErrors: activation.attemptErrors,
            warnings: activation.warnings,
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
  for (const line of formatVisualEvidenceHandoffLines({
    blocker,
    requestedPath: path.resolve(windowScreenshotPath),
    diagnosticsPath: path.resolve(diagnosticsPath),
    webviewEvidencePath: webviewEvidencePath ? path.resolve(webviewEvidencePath) : null,
    hint: blockerHint,
  })) {
    console.log(line);
  }
  console.log(`[desktop-app-verify:window-diagnostics] ${JSON.stringify(diagnostics)}`);
  return normalizeVisualEvidenceReference({
    screenshotPath: windowScreenshotPath,
    screenshotStatus: "unavailable",
    blocker,
    diagnosticsPath,
    summary: blockerHint.summary,
    nextActions: blockerHint.nextActions,
  });
}


export function formatWindowDiagnosticsPayload({
  pids,
  windows,
  accessibilityRows,
  accessibilityError = null,
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
    ...(accessibilityError ? { accessibilityError } : {}),
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


export function collectWindowDiagnostics({
  executablePath,
  windows = null,
  captureRows = [],
  allowAccessibilityFailure = false,
  processIdsFn = processIds,
  readOnscreenWindowsFn = readOnscreenWindows,
  readAccessibilityWindowsFn = readAccessibilityWindows,
} = {}) {
  const pids = processIdsFn(executablePath);
  const resolvedWindows = windows ?? (pids.length > 0 ? parseOnscreenWindows(readOnscreenWindowsFn(), pids) : []);
  let accessibilityRows = [];
  let accessibilityError = null;
  if (pids.length > 0) {
    try {
      if (allowAccessibilityFailure && readAccessibilityWindowsFn === readAccessibilityWindows) {
        const accessibility = readAccessibilityWindowsBestEffort(pids);
        accessibilityRows = parseAccessibilityWindowRows(accessibility.payload);
        accessibilityError = accessibility.error;
      } else {
        accessibilityRows = parseAccessibilityWindowRows(readAccessibilityWindowsFn(pids));
      }
    } catch (error) {
      if (!allowAccessibilityFailure) throw error;
      accessibilityError = error instanceof Error ? error.message : String(error);
    }
  }
  return formatWindowDiagnosticsPayload({
    pids,
    windows: resolvedWindows,
    accessibilityRows,
    accessibilityError,
    captureRows,
  });
}


export function printWindowDiagnostics({ executablePath, windows = null, captureRows = [] }) {
  console.log(
    `[desktop-app-verify:window-diagnostics] ${JSON.stringify(
      collectWindowDiagnostics({ executablePath, windows, captureRows }),
    )}`,
  );
}
