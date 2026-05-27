import assert from "node:assert/strict";
import test from "node:test";
import {
  existingProcessPatterns,
  parseOnscreenWindows,
  parseVerifyAppLaunchArgs,
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
    ]),
    {
      appPath: "/tmp/Custom.app",
      holdMs: 7000,
      killExisting: true,
      openApp: true,
      requireWindow: true,
    },
  );
});

test("parseOnscreenWindows keeps visible layer-zero windows for launched process ids", () => {
  const payload = JSON.stringify([
    {
      kCGWindowOwnerPID: 101,
      kCGWindowIsOnscreen: true,
      kCGWindowLayer: 0,
      kCGWindowAlpha: 1,
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
      kCGWindowBounds: { Width: 1280, Height: 820 },
    },
  ]);
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
