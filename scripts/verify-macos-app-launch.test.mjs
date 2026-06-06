import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccessibilityWindowProbeScript,
  existingProcessPatterns,
  parseAccessibilityWindowRows,
  parseMinWindowSize,
  parseOnscreenWindows,
  parseVerifyAppLaunchArgs,
  parseWebviewVerifyPayload,
  validateAccessibilityWindowRows,
  validateCapturableWindowRows,
  validateWindowRequirements,
  validateWebviewVerifyPayload,
  windowCaptureTargets,
} from "./verify-macos-app-launch.mjs";

test("verify app launch args keep executable launch defaults", () => {
  assert.deepEqual(
    parseVerifyAppLaunchArgs([], {
      defaultAppPath: "/tmp/Ontology Atlas.app",
      defaultHoldMs: 5000,
    }),
    {
      appPath: "/tmp/Ontology Atlas.app",
      holdMs: 5000,
      killExisting: false,
      leaveRunning: false,
      openApp: false,
      requireWindow: false,
      requireCapturableWindow: false,
      requireAccessibilityWindow: false,
      requireWebviewContent: true,
      printWindowDiagnostics: false,
      requireOwnerName: null,
      minWindowSize: null,
    },
  );
});

test("verify app launch args keep LaunchServices dogfood compatible with window checks", () => {
  assert.deepEqual(
    parseVerifyAppLaunchArgs([
      "/tmp/Custom.app",
      "--open-app",
      "--require-window",
      "--require-capturable-window",
      "--require-accessibility-window",
    ]),
    {
      appPath: "/tmp/Custom.app",
      holdMs: 5000,
      killExisting: false,
      leaveRunning: false,
      openApp: true,
      requireWindow: true,
      requireCapturableWindow: true,
      requireAccessibilityWindow: true,
      requireWebviewContent: false,
      printWindowDiagnostics: false,
      requireOwnerName: null,
      minWindowSize: null,
    },
  );
});

test("verify app launch args support stale-process cleanup, LaunchServices, and window checks", () => {
  assert.deepEqual(
    parseVerifyAppLaunchArgs([
      "/tmp/Custom.app",
      "--hold-ms=7000",
      "--kill-existing",
      "--leave-running",
      "--open-app",
      "--require-window",
      "--require-capturable-window",
      "--require-accessibility-window",
      "--require-webview-content",
      "--print-window-diagnostics",
      "--require-owner-name=Ontology Atlas",
      "--min-window-size=1040x720",
    ]),
    {
      appPath: "/tmp/Custom.app",
      holdMs: 7000,
      killExisting: true,
      leaveRunning: true,
      openApp: true,
      requireWindow: true,
      requireCapturableWindow: true,
      requireAccessibilityWindow: true,
      requireWebviewContent: true,
      printWindowDiagnostics: true,
      requireOwnerName: "Ontology Atlas",
      minWindowSize: { width: 1040, height: 720 },
    },
  );
});

test("WebView verification payload parses nested JSON and checks loaded DOM", () => {
  const payload = {
    href: "tauri://localhost/ko/",
    title: "Ontology Atlas",
    bodyText: "문서함\n온톨로지",
    bodyChildren: 19,
    readyState: "complete",
    bg: "rgb(8, 9, 10)",
    color: "rgb(247, 248, 248)",
    width: 1280,
    height: 789,
    markers: {
      ontologyNav: true,
      sourceVaultNav: true,
      agentBriefCopy: true,
      businessDecisionQuestions: true,
    },
  };
  const stdout = `[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(payload))}\n`;

  assert.deepEqual(parseWebviewVerifyPayload(stdout), payload);
  assert.equal(validateWebviewVerifyPayload(payload), null);
  assert.match(validateWebviewVerifyPayload({ ...payload, bodyText: "" }), /body text/);
  assert.match(validateWebviewVerifyPayload({ ...payload, title: "Tauri" }), /Ontology Atlas title/);
  assert.match(
    validateWebviewVerifyPayload({ ...payload, bodyText: "Loading local app shell" }),
    /Ontology Atlas workbench markers/,
  );
  assert.match(validateWebviewVerifyPayload({ ...payload, markers: null }), /structured markers/);
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      markers: { ...payload.markers, agentBriefCopy: false },
    }),
    /agent brief copy marker/,
  );
  assert.match(
    validateWebviewVerifyPayload({
      ...payload,
      markers: { ...payload.markers, businessDecisionQuestions: false },
    }),
    /business decision questions marker/,
  );
  assert.match(validateWebviewVerifyPayload({ ...payload, href: "about:blank" }), /tauri/);
});

test("parseMinWindowSize accepts WIDTHxHEIGHT only", () => {
  assert.deepEqual(parseMinWindowSize("1280x820"), { width: 1280, height: 820 });
  assert.equal(parseMinWindowSize("1280"), null);
  assert.equal(parseMinWindowSize("widextall"), null);
});

test("parseOnscreenWindows keeps visible layer-zero windows for launched process ids", () => {
  const payload = JSON.stringify([
    {
      kCGWindowOwnerPID: 101,
      kCGWindowIsOnscreen: true,
      kCGWindowLayer: 0,
      kCGWindowAlpha: 1,
      kCGWindowOwnerName: "Ontology Atlas",
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
    {
      kCGWindowOwnerPID: 101,
      kCGWindowIsOnscreen: true,
      kCGWindowLayer: 1,
      kCGWindowAlpha: 1,
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
    {
      kCGWindowOwnerPID: 202,
      kCGWindowIsOnscreen: true,
      kCGWindowLayer: 0,
      kCGWindowAlpha: 1,
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
    {
      kCGWindowOwnerPID: 101,
      kCGWindowIsOnscreen: false,
      kCGWindowLayer: 0,
      kCGWindowAlpha: 1,
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
  ]);

  assert.deepEqual(parseOnscreenWindows(payload, [101]), [
    {
      kCGWindowOwnerPID: 101,
      kCGWindowIsOnscreen: true,
      kCGWindowLayer: 0,
      kCGWindowAlpha: 1,
      kCGWindowOwnerName: "Ontology Atlas",
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
  ]);
});

test("validateWindowRequirements checks owner name and minimum size", () => {
  const windows = [
    {
      kCGWindowOwnerName: "Ontology Atlas",
      kCGWindowBounds: { Width: 1280, Height: 821 },
    },
  ];

  assert.equal(
    validateWindowRequirements(windows, {
      requireOwnerName: "Ontology Atlas",
      minWindowSize: { width: 1040, height: 720 },
    }),
    null,
  );
  assert.match(
    validateWindowRequirements(windows, { requireOwnerName: "Other App" }),
    /owner name/,
  );
  assert.match(
    validateWindowRequirements(windows, { minWindowSize: { width: 1600, height: 900 } }),
    /at least 1600x900/,
  );
});

test("windowCaptureTargets keeps CoreGraphics window ids for screenshot capture", () => {
  assert.deepEqual(
    windowCaptureTargets([
      {
        kCGWindowNumber: 68525,
        kCGWindowOwnerPID: 101,
        kCGWindowOwnerName: "Ontology Atlas",
        kCGWindowName: "Ontology Atlas",
      },
      {
        kCGWindowOwnerPID: 101,
        kCGWindowOwnerName: "Ontology Atlas",
      },
    ]),
    [
      {
        id: 68525,
        ownerPid: 101,
        ownerName: "Ontology Atlas",
        name: "Ontology Atlas",
        bounds: null,
      },
    ],
  );
});

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

test("Accessibility window probe targets launched process ids", () => {
  const script = buildAccessibilityWindowProbeScript([101, 202]);

  assert.match(script, /procPid = 101 or procPid = 202/);
  assert.match(script, /count of windows of proc/);
});

test("parseAccessibilityWindowRows reads System Events tabular output", () => {
  assert.deepEqual(
    parseAccessibilityWindowRows(
      "101\tOntology Atlas\tfalse\t1\t3\n202\tOther\ttrue\t0\t2\n",
    ),
    [
      {
        pid: 101,
        processName: "Ontology Atlas",
        frontmost: false,
        windowCount: 1,
        uiElementCount: 3,
      },
      {
        pid: 202,
        processName: "Other",
        frontmost: true,
        windowCount: 0,
        uiElementCount: 2,
      },
    ],
  );
});

test("validateAccessibilityWindowRows requires System Events windows", () => {
  assert.equal(
    validateAccessibilityWindowRows([
      {
        pid: 101,
        processName: "Ontology Atlas",
        frontmost: false,
        windowCount: 1,
        uiElementCount: 3,
      },
    ]),
    null,
  );
  assert.match(
    validateAccessibilityWindowRows([
      {
        pid: 101,
        processName: "ontology-atlas",
        frontmost: false,
        windowCount: 0,
        uiElementCount: 2,
      },
    ]),
    /no Accessibility windows/,
  );
  assert.match(validateAccessibilityWindowRows([]), /did not find/);
  assert.match(
    validateAccessibilityWindowRows([
      {
        pid: 101,
        processName: "Ontology Atlas",
        frontmost: false,
        windowCount: 0,
        uiElementCount: 0,
      },
    ]),
    /no Accessibility windows/,
  );
});

test("existingProcessPatterns include exact path and app-bundle stale copies", () => {
  assert.deepEqual(
    existingProcessPatterns({
      appPath: "/Users/me/Ontology Atlas.app",
      executablePath: "/Users/me/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    }),
    [
      "/Users/me/Ontology Atlas\\.app/Contents/MacOS/ontology-atlas",
      "Ontology Atlas\\.app/Contents/MacOS/ontology-atlas",
    ],
  );
});
