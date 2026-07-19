import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyVisualEvidenceBlocker,
  collectWindowDiagnostics,
  formatWindowDiagnosticsPayload,
  formatVisualEvidenceHandoffLines,
  validateCapturableWindowRows,
  validateVisualEvidenceStats,
  visualEvidenceBlockerHint,
} from "./verify-macos-app-launch.mjs";

test("validateCapturableWindowRows requires at least one successful window capture", () => {
  assert.equal(
    validateCapturableWindowRows([
      { id: 1, ownerName: "Ontology Atlas", ok: false, stderr: "could not create image from window" },
      { id: 2, ownerName: "Ontology Atlas", ok: true, method: "bounds-region", stderr: "", bytes: 2048 },
    ]),
    null,
  );
  assert.match(validateCapturableWindowRows([]), /no CoreGraphics window ids/);
  assert.match(
    validateCapturableWindowRows([
      { id: 1, ownerName: "Ontology Atlas", ok: false, stderr: "could not create image from window" },
    ]),
    /could not create image from window/,
  );
});

test("classifyVisualEvidenceBlocker explains foreground and blank-capture failures", () => {
  assert.equal(
    classifyVisualEvidenceBlocker({
      activation: {
        frontmost: false,
        stderr: "post-activation Accessibility probe timed out after 3000ms",
      },
      captureRows: [
        { ok: false, stderr: "window-id: could not create image from window", artifactPath: null },
        {
          ok: false,
          stderr: "full-screen: image appears blank or black (nonDarkRatio 0)",
          artifactPath: null,
        },
      ],
    }),
    "macos-automation-and-screen-capture-blocked",
  );
  assert.equal(
    classifyVisualEvidenceBlocker({
      activation: { frontmost: false },
      captureRows: [
        { ok: false, stderr: "window-id: could not create image from window", artifactPath: null },
      ],
    }),
    "foreground-activation-unconfirmed",
  );
  assert.equal(
    classifyVisualEvidenceBlocker({
      activation: { frontmost: true },
      captureRows: [
        { ok: false, stderr: "full-screen: image appears blank or black (nonDarkRatio 0)", artifactPath: null },
      ],
    }),
    "screen-capture-returned-blank-image",
  );
  assert.equal(
    classifyVisualEvidenceBlocker({
      activation: { frontmost: true },
      captureRows: [
        { ok: true, stderr: "", artifactPath: "/tmp/ontology-atlas.png" },
      ],
    }),
    "captured",
  );
});

test("visualEvidenceBlockerHint gives actionable remediation for macOS automation blockers", () => {
  assert.deepEqual(
    visualEvidenceBlockerHint("macos-automation-and-screen-capture-blocked"),
    {
      summary:
        "macOS automation and screen capture blocked visual evidence; WebView proof may still be valid.",
      nextActions: [
        "Grant Accessibility permission to the terminal or Codex host running the verifier.",
        "Grant Screen Recording permission, then rerun with --try-window-screenshot or --require-capturable-window.",
        "Use the saved WebView evidence JSON as deterministic route proof until PNG capture is available.",
      ],
    },
  );
});

test("formatVisualEvidenceHandoffLines prints blocker summary and next actions", () => {
  assert.deepEqual(
    formatVisualEvidenceHandoffLines({
      blocker: "macos-automation-and-screen-capture-blocked",
      requestedPath: "/tmp/ontology-atlas.png",
      diagnosticsPath: "/tmp/ontology-atlas.png.diagnostics.json",
      webviewEvidencePath: "/tmp/ontology-atlas.webview.json",
      hint: visualEvidenceBlockerHint("macos-automation-and-screen-capture-blocked"),
    }),
    [
      "[desktop-app-verify:visual-evidence] blocker macos-automation-and-screen-capture-blocked: macOS automation and screen capture blocked visual evidence; WebView proof may still be valid.",
      "[desktop-app-verify:visual-evidence] WebView route proof: /tmp/ontology-atlas.webview.json",
      "[desktop-app-verify:visual-evidence] next action 1: Grant Accessibility permission to the terminal or Codex host running the verifier.",
      "[desktop-app-verify:visual-evidence] next action 2: Grant Screen Recording permission, then rerun with --try-window-screenshot or --require-capturable-window.",
      "[desktop-app-verify:visual-evidence] next action 3: Use the saved WebView evidence JSON as deterministic route proof until PNG capture is available.",
      "[desktop-app-verify:visual-evidence] diagnostics saved /tmp/ontology-atlas.png.diagnostics.json",
      "[desktop-app-verify:visual-evidence] screenshot unavailable for /tmp/ontology-atlas.png",
    ],
  );
});

test("formatWindowDiagnosticsPayload includes capture and Accessibility evidence", () => {
  assert.deepEqual(
    formatWindowDiagnosticsPayload({
      pids: [101],
      windows: [
        {
          kCGWindowNumber: 81157,
          kCGWindowOwnerPID: 101,
          kCGWindowOwnerName: "Ontology Atlas",
          kCGWindowName: "Ontology Atlas",
          kCGWindowBounds: { X: 116, Y: 98, Width: 1280, Height: 821 },
          kCGWindowLayer: 0,
          kCGWindowIsOnscreen: true,
          kCGWindowAlpha: 1,
          kCGWindowSharingState: 1,
          kCGWindowStoreType: 2,
          kCGWindowMemoryUsage: 4096,
        },
      ],
      accessibilityRows: [
        {
          pid: 101,
          processName: "ontology-atlas",
          frontmost: false,
          windowCount: 0,
          uiElementCount: 2,
        },
      ],
      captureRows: [
        {
          id: 81157,
          ownerName: "Ontology Atlas",
          sharingState: 1,
          alpha: 1,
          ok: false,
          method: "bounds-region",
          stderr: "window-id: could not create image from window; bounds-region: could not create image from rect",
          bytes: 0,
        },
      ],
    }),
    {
      pids: [101],
      windows: [
        {
          windowNumber: 81157,
          ownerPid: 101,
          ownerName: "Ontology Atlas",
          name: "Ontology Atlas",
          bounds: { X: 116, Y: 98, Width: 1280, Height: 821 },
          layer: 0,
          onscreen: true,
          alpha: 1,
          sharingState: 1,
          storeType: 2,
          memoryUsage: 4096,
        },
      ],
      accessibilityRows: [
        {
          pid: 101,
          processName: "ontology-atlas",
          frontmost: false,
          windowCount: 0,
          uiElementCount: 2,
        },
      ],
      captureRows: [
        {
          windowNumber: 81157,
          ownerName: "Ontology Atlas",
          sharingState: 1,
          alpha: 1,
          ok: false,
          method: "bounds-region",
          stderr: "window-id: could not create image from window; bounds-region: could not create image from rect",
          bytes: 0,
          artifactPath: null,
        },
      ],
    },
  );
});

test("collectWindowDiagnostics can keep best-effort visual diagnostics when Accessibility is unavailable", () => {
  assert.deepEqual(
    collectWindowDiagnostics({
      executablePath: "/tmp/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
      processIdsFn: () => [101],
      readOnscreenWindowsFn: () => "[]",
      readAccessibilityWindowsFn: () => {
        throw new Error("System Events did not respond within 3000ms");
      },
      allowAccessibilityFailure: true,
      captureRows: [
        {
          id: 81157,
          ownerName: "Ontology Atlas",
          sharingState: 1,
          alpha: 1,
          ok: false,
          method: "bounds-region",
          stderr: "window-id: could not create image from window",
          bytes: 0,
        },
      ],
    }),
    {
      pids: [101],
      windows: [],
      accessibilityRows: [],
      accessibilityError: "System Events did not respond within 3000ms",
      captureRows: [
        {
          windowNumber: 81157,
          ownerName: "Ontology Atlas",
          sharingState: 1,
          alpha: 1,
          ok: false,
          method: "bounds-region",
          stderr: "window-id: could not create image from window",
          bytes: 0,
          artifactPath: null,
        },
      ],
    },
  );
});

test("formatWindowDiagnosticsPayload records full-screen visual evidence fallback rows", () => {
  assert.deepEqual(
    formatWindowDiagnosticsPayload({
      pids: [101],
      windows: [],
      accessibilityRows: [],
      captureRows: [
        {
          id: null,
          ownerName: "desktop",
          sharingState: null,
          alpha: null,
          ok: true,
          method: "full-screen",
          stderr: "",
          bytes: 4096,
          artifactPath: "/tmp/ontology-atlas-full-screen.png",
        },
      ],
    }).captureRows,
    [
      {
        windowNumber: null,
        ownerName: "desktop",
        sharingState: null,
        alpha: null,
        ok: true,
        method: "full-screen",
        stderr: "",
        bytes: 4096,
        artifactPath: "/tmp/ontology-atlas-full-screen.png",
      },
    ],
  );
});

test("validateVisualEvidenceStats rejects blank or low-contrast screenshots", () => {
  assert.equal(
    validateVisualEvidenceStats({
      width: 3024,
      height: 1964,
      sampleCount: 4096,
      nonDarkRatio: 0.02,
      lumaSpread: 32,
    }),
    null,
  );
  assert.match(
    validateVisualEvidenceStats({
      width: 3024,
      height: 1964,
      sampleCount: 4096,
      nonDarkRatio: 0,
      lumaSpread: 0,
    }),
    /blank or black/,
  );
  assert.match(
    validateVisualEvidenceStats({
      width: 3024,
      height: 1964,
      sampleCount: 4096,
      nonDarkRatio: 0.02,
      lumaSpread: 2,
    }),
    /too little visible contrast/,
  );
});
