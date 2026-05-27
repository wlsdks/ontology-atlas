import assert from "node:assert/strict";
import test from "node:test";
import { parseVerifyAppLaunchArgs } from "./verify-macos-app-launch.mjs";

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
    },
  );
});

test("verify app launch args support stale-process cleanup and LaunchServices mode", () => {
  assert.deepEqual(
    parseVerifyAppLaunchArgs([
      "/tmp/Custom.app",
      "--hold-ms=7000",
      "--kill-existing",
      "--open-app",
    ]),
    {
      appPath: "/tmp/Custom.app",
      holdMs: 7000,
      killExisting: true,
      openApp: true,
    },
  );
});
