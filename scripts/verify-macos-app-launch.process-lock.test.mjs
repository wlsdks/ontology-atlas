import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  bundlePathConflictWarnings,
  createVerifyLock,
  existingProcessPatterns,
  gracefulQuitCommandOptions,
  gracefulQuitExistingAppCommands,
  verifyLockPath,
  waitForExistingProcessesToExit,
} from "./verify-macos-app-launch.mjs";

test("verify app launch waits until stale processes disappear after cleanup", async () => {
  const calls = [];
  const slept = [];
  const remaining = await waitForExistingProcessesToExit({
    appPath: "/tmp/Ontology Atlas.app",
    executablePath: "/tmp/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    timeoutMs: 1000,
    intervalMs: 100,
    readProcessIds: ({ appPath, executablePath }) => {
      calls.push({ appPath, executablePath });
      return calls.length < 3 ? [101, 202] : [];
    },
    sleepFn: async (ms) => {
      slept.push(ms);
    },
  });

  assert.deepEqual(remaining, []);
  assert.equal(calls.length, 3);
  assert.deepEqual(slept, [100, 100]);
});

test("verify app launch reports stale processes that survive cleanup polling", async () => {
  const remaining = await waitForExistingProcessesToExit({
    appPath: "/tmp/Ontology Atlas.app",
    executablePath: "/tmp/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    timeoutMs: 250,
    intervalMs: 100,
    readProcessIds: () => [303],
    sleepFn: async () => undefined,
  });

  assert.deepEqual(remaining, [303]);
});

test("bundle path conflict warnings flag installed copies with the same bundle id", () => {
  assert.deepEqual(
    bundlePathConflictWarnings({
      targetAppPath:
        "/Users/me/ontology-atlas/src-tauri/target/release/bundle/macos/Ontology Atlas.app",
      targetBundleIdentifier: "dev.jinan.ontology-atlas",
      candidates: [
        {
          appPath: "/Applications/Ontology Atlas.app",
          bundleIdentifier: "dev.jinan.ontology-atlas",
        },
        {
          appPath: "/Users/me/Applications/Other.app",
          bundleIdentifier: "com.example.other",
        },
        {
          appPath:
            "/Users/me/ontology-atlas/src-tauri/target/release/bundle/macos/Ontology Atlas.app",
          bundleIdentifier: "dev.jinan.ontology-atlas",
        },
      ],
    }),
    [
      "/Applications/Ontology Atlas.app shares bundle id dev.jinan.ontology-atlas with the verified app; app-name Computer Use may attach to that installed copy unless the Run script refreshed it, so use the full built app path when exact bundle provenance matters.",
    ],
  );
});

test("stale app cleanup prepares graceful quit commands before force killing", () => {
  assert.deepEqual(
    gracefulQuitExistingAppCommands({
      appName: "Ontology Atlas",
      bundleIdentifier: "dev.jinan.ontology-atlas",
    }),
    [
      {
        command: "osascript",
        args: ["-e", 'tell application id "dev.jinan.ontology-atlas" to quit'],
      },
      {
        command: "osascript",
        args: ["-e", 'tell application "Ontology Atlas" to quit'],
      },
    ],
  );
});

test("graceful quit commands time out so verification can fall back to process termination", () => {
  assert.deepEqual(gracefulQuitCommandOptions(), {
    stdio: "ignore",
    timeout: 1200,
  });
});

test("verify app launch lock prevents concurrent app checks and releases cleanly", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-atlas-lock-test-"));
  const lockDir = path.join(tmp, "verify.lock");
  try {
    const first = createVerifyLock(lockDir, { appPath: "/tmp/Ontology Atlas.app" });
    assert.equal(first.ok, true);

    const second = createVerifyLock(lockDir, { appPath: "/tmp/Ontology Atlas.app" });
    assert.equal(second.ok, false);
    assert.match(second.message, /another desktop app verification is already running/);

    first.release();
    const third = createVerifyLock(lockDir, { appPath: "/tmp/Ontology Atlas.app" });
    assert.equal(third.ok, true);
    third.release();
    assert.equal(fs.existsSync(lockDir), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("verify app launch lock path is stable per app path", () => {
  assert.equal(
    verifyLockPath("/Applications/Ontology Atlas.app"),
    verifyLockPath("/Applications/Ontology Atlas.app"),
  );
  assert.notEqual(
    verifyLockPath("/Applications/Ontology Atlas.app"),
    verifyLockPath("/tmp/Ontology Atlas.app"),
  );
});

test("existingProcessPatterns match stale macOS app copies with the same executable", () => {
  assert.deepEqual(
    existingProcessPatterns({
      appPath: "/Users/me/Ontology Atlas.app",
      executablePath: "/Users/me/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    }),
    [
      "/Users/me/Ontology Atlas\\.app/Contents/MacOS/ontology-atlas",
      "\\.app/Contents/MacOS/ontology-atlas$",
    ],
  );
});
