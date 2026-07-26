import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateForegroundActivationAttempt,
  runForegroundActivationWithRetry,
  buildAccessibilityWindowProbeScript,
  buildAccessibilityTextProbeSwift,
  buildForegroundActivationScript,
  parseAccessibilityWindowRows,
  parseOnscreenWindows,
  validateAccessibilityWindowRows,
  validateAccessibilityText,
  validateFrontmostAccessibilityRows,
  validateWindowRequirements,
  windowCaptureTargets,
} from "./verify-macos-app-launch.mjs";

test("foreground proof trusts the final AX state when activation command return times out", () => {
  const result = evaluateForegroundActivationAttempt({
    activationResult: {
      status: null,
      stdout: "",
      stderr: "",
      error: { code: "ETIMEDOUT" },
    },
    accessibilityResult: {
      status: 0,
      stdout: "101\tOntology Atlas\ttrue\t1\n",
      stderr: "",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.frontmost, true);
  assert.equal(result.activationCommandConfirmed, false);
  assert.equal(result.stderr, "");
  assert.deepEqual(result.warnings, [
    "foreground activation command timed out after AX confirmed frontmost",
  ]);
});

test("foreground proof remains unconfirmed without a final AX frontmost row", () => {
  const result = evaluateForegroundActivationAttempt({
    activationResult: {
      status: 0,
      stdout: "bundle=true\tpid=true",
      stderr: "",
    },
    accessibilityResult: {
      status: null,
      stdout: "",
      stderr: "",
      error: { code: "ETIMEDOUT" },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.frontmost, false);
  assert.match(
    result.stderr,
    /post-activation Accessibility probe timed out after 3000ms/,
  );
});

test("foreground visual evidence retries one transient activation/AX miss", () => {
  const seen = [];
  const result = runForegroundActivationWithRetry({
    maxAttempts: 2,
    runAttempt: (attempt) => {
      seen.push(attempt);
      return attempt === 1
        ? {
            ok: false,
            frontmost: false,
            stdout: "",
            stderr: "post-activation Accessibility probe timed out after 3000ms",
          }
        : {
            ok: true,
            frontmost: true,
            stdout: "bundle=true\tpid=true",
            stderr: "",
          };
    },
  });

  assert.deepEqual(seen, [1, 2]);
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.recovered, true);
  assert.deepEqual(result.attemptErrors, [
    "attempt 1: post-activation Accessibility probe timed out after 3000ms",
  ]);
});

test("foreground visual evidence keeps persistent failures fail-closed", () => {
  const result = runForegroundActivationWithRetry({
    maxAttempts: 2,
    runAttempt: (attempt) => ({
      ok: false,
      frontmost: false,
      stdout: "",
      stderr: attempt === 1 ? "activation timed out" : "process not frontmost",
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.attempts, 2);
  assert.equal(result.recovered, false);
  assert.deepEqual(result.attemptErrors, [
    "attempt 1: activation timed out",
    "attempt 2: process not frontmost",
  ]);
});

test("Accessibility text probe script targets launched pids", () => {
  const script = buildAccessibilityTextProbeSwift([101, 202], ["개념 지도"]);

  assert.match(script, /let requiredPids: Set<pid_t> = \[101,202\]/);
  assert.match(script, /let requiredText = \["개념 지도"\]/);
  assert.match(script, /func isComplete/);
  assert.match(script, /func collectText/);
  assert.match(script, /kAXChildrenAttribute/);
});

test("validateAccessibilityText requires every requested text fragment", () => {
  const payload = "Ontology Atlas\n개념 지도\nAI 에이전트 그래프 검증";

  assert.equal(validateAccessibilityText(payload, []), null);
  assert.equal(
    validateAccessibilityText(payload, ["개념 지도", "AI 에이전트 그래프 검증"]),
    null,
  );
  assert.match(
    validateAccessibilityText(payload, ["Source Vault"]),
    /missing Accessibility text "Source Vault"/,
  );
  assert.match(validateAccessibilityText("", ["개념 지도"]), /empty Accessibility text/);
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
        alpha: null,
        sharingState: null,
        storeType: null,
        memoryUsage: null,
      },
    ],
  );
});

test("Accessibility window probe targets launched process ids", () => {
  const script = buildAccessibilityWindowProbeScript([101, 202]);

  assert.match(script, /procPid = 101 or procPid = 202/);
  assert.match(script, /count of windows of proc/);
  assert.doesNotMatch(
    script,
    /count of UI elements of proc/,
    "the fast foreground/window probe must not traverse the WebView accessibility tree",
  );
});

test("foreground activation targets both bundle id and launched process ids", () => {
  const script = buildForegroundActivationScript({
    bundleIdentifier: "dev.jinan.ontology-atlas",
    pids: [101, 202],
  });

  assert.match(script, /tell application id "dev\.jinan\.ontology-atlas" to activate/);
  assert.match(script, /procPid = 101 or procPid = 202/);
  assert.match(script, /set frontmost of proc to true/);
  assert.match(script, /bundle=/);
  assert.match(script, /pid=/);
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

test("validateFrontmostAccessibilityRows requires a foreground launched process", () => {
  assert.equal(
    validateFrontmostAccessibilityRows([
      {
        pid: 101,
        processName: "ontology-atlas",
        frontmost: true,
        windowCount: 0,
        uiElementCount: 2,
      },
    ]),
    null,
  );
  assert.match(validateFrontmostAccessibilityRows([]), /did not find/);
  assert.match(
    validateFrontmostAccessibilityRows([
      {
        pid: 101,
        processName: "ontology-atlas",
        frontmost: false,
        windowCount: 0,
        uiElementCount: 2,
      },
    ]),
    /not frontmost/,
  );
});
