import assert from "node:assert/strict";
import test from "node:test";
import {
  existingProcessPatterns,
  parseMinWindowSize,
  parseOnscreenWindows,
  parseVerifyAppLaunchArgs,
  validateWindowRequirements,
} from "./verify-macos-app-launch.mjs";

test("verify app launch args keep executable launch defaults", () => {
  assert.deepEqual(
    parseVerifyAppLaunchArgs([], {
      defaultAppPath: "/tmp/Context Atlas.app",
      defaultHoldMs: 5000,
    }),
    {
      appPath: "/tmp/Context Atlas.app",
      holdMs: 5000,
      killExisting: false,
      openApp: false,
      requireWindow: false,
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
      "--open-app",
      "--require-window",
      "--require-owner-name=Context Atlas",
      "--min-window-size=1040x720",
    ]),
    {
      appPath: "/tmp/Custom.app",
      holdMs: 7000,
      killExisting: true,
      openApp: true,
      requireWindow: true,
      requireOwnerName: "Context Atlas",
      minWindowSize: { width: 1040, height: 720 },
    },
  );
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
      kCGWindowOwnerName: "Context Atlas",
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
      kCGWindowOwnerName: "Context Atlas",
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
  ]);
});

test("validateWindowRequirements checks owner name and minimum size", () => {
  const windows = [
    {
      kCGWindowOwnerName: "Context Atlas",
      kCGWindowBounds: { Width: 1280, Height: 821 },
    },
  ];

  assert.equal(
    validateWindowRequirements(windows, {
      requireOwnerName: "Context Atlas",
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

test("existingProcessPatterns include exact path and app-bundle stale copies", () => {
  assert.deepEqual(
    existingProcessPatterns({
      appPath: "/Users/me/Context Atlas.app",
      executablePath: "/Users/me/Context Atlas.app/Contents/MacOS/oh-my-ontology",
    }),
    [
      "/Users/me/Context Atlas\\.app/Contents/MacOS/oh-my-ontology",
      "Context Atlas\\.app/Contents/MacOS/oh-my-ontology",
    ],
  );
});
