import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  bundlePathConflictWarnings,
  createVerifyLock,
  existingProcessPatterns,
  staleInstanceFailure,
  gracefulQuitCommandOptions,
  gracefulQuitExistingAppCommands,
  restoreWindowStateAfterExit,
  setAsideWindowState,
  verifyLockPath,
  waitForExistingProcessesToExit,
  windowStatePath,
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


test("a running instance is a hard stop when --kill-existing was not passed", () => {
  // The app allows one instance, so launching over a running one would silently attach to the
  // previous build. This must fail loudly instead, and the message must name the pids and the way out.
  const message = staleInstanceFailure({
    appBundleName: "Ontology Atlas.app",
    pids: [4242, 4243],
  });
  assert.ok(message, "a running instance must produce a failure message");
  assert.match(message, /Ontology Atlas\.app is already running/);
  assert.match(message, /4242, 4243/);
  assert.match(message, /--kill-existing/);
});

test("no running instance is not a failure", () => {
  assert.equal(staleInstanceFailure({ appBundleName: "Ontology Atlas.app", pids: [] }), null);
  assert.equal(staleInstanceFailure({ appBundleName: "Ontology Atlas.app" }), null);
});


// The window-state helpers take an injected fsImpl precisely so these tests never touch the real
// `~/Library/Application Support/` — a test that rewrote the owner's saved geometry would be the
// exact defect the helper exists to prevent.
function makeFakeFs(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const renames = [];
  return {
    files,
    renames,
    existsSync: (filePath) => files.has(filePath),
    renameSync: (from, to) => {
      if (!files.has(from)) {
        throw Object.assign(new Error(`ENOENT: no such file, rename '${from}' -> '${to}'`), {
          code: "ENOENT",
        });
      }
      files.set(to, files.get(from));
      files.delete(from);
      renames.push({ from, to });
    },
  };
}

test("window state path follows the tauri-plugin-window-state layout under the given home", () => {
  assert.equal(
    windowStatePath({ bundleIdentifier: "dev.jinan.ontology-atlas", home: "/Users/owner" }),
    "/Users/owner/Library/Application Support/dev.jinan.ontology-atlas/.window-state.json",
  );
});

test("no bundle identifier yields no window state path, and setting a null path aside is inert", () => {
  // An unreadable Info.plist must degrade to "nothing to isolate", not crash the harness before
  // the verdict; the guard shape stays uniform so the finally-block restore never branches.
  assert.equal(windowStatePath({ bundleIdentifier: null, home: "/Users/owner" }), null);
  assert.equal(windowStatePath({ home: "/Users/owner" }), null);

  const guard = setAsideWindowState(null, { fsImpl: makeFakeFs() });
  assert.equal(guard.moved, false);
  assert.doesNotThrow(() => guard.restore());
});

test("an absent window state file is left alone and restore stays safe", () => {
  const statePath =
    "/Users/owner/Library/Application Support/dev.jinan.ontology-atlas/.window-state.json";
  const fakeFs = makeFakeFs();

  const guard = setAsideWindowState(statePath, { fsImpl: fakeFs });
  assert.equal(guard.moved, false);
  assert.deepEqual(fakeFs.renames, []);
  assert.doesNotThrow(() => guard.restore());
  assert.deepEqual(fakeFs.renames, []);
});

test("an existing window state file is moved — not deleted — and restore puts it back", () => {
  const statePath =
    "/Users/owner/Library/Application Support/dev.jinan.ontology-atlas/.window-state.json";
  const geometry = '{"main":{"width":800,"height":600}}';
  const fakeFs = makeFakeFs({ [statePath]: geometry });

  const guard = setAsideWindowState(statePath, { fsImpl: fakeFs });
  assert.equal(guard.moved, true);
  assert.equal(guard.parked, `${statePath}.verify-backup`);
  // Moved, not deleted: the owner's geometry must survive the run byte-for-byte at the parked path.
  assert.equal(fakeFs.files.has(statePath), false);
  assert.equal(fakeFs.files.get(guard.parked), geometry);

  guard.restore();
  assert.equal(fakeFs.files.get(statePath), geometry);
  assert.equal(fakeFs.files.has(guard.parked), false);
});

// A guard double that records restore() calls, so these tests prove the *decision* — restore or
// hold back — without a real filesystem behind it.
function makeFakeGuard({ moved }) {
  const guard = {
    moved,
    parked:
      "/Users/owner/Library/Application Support/dev.jinan.ontology-atlas/.window-state.json.verify-backup",
    restoreCalls: 0,
    restore() {
      guard.restoreCalls += 1;
    },
  };
  return guard;
}

test("window state restore waits for the app to exit before putting the file back", async () => {
  const guard = makeFakeGuard({ moved: true });
  const waited = [];
  const result = await restoreWindowStateAfterExit({
    guard,
    appPath: "/tmp/Ontology Atlas.app",
    executablePath: "/tmp/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    waitForExit: async ({ appPath, executablePath }) => {
      waited.push({ appPath, executablePath });
      return [];
    },
    warn: () => {
      throw new Error("a clean exit must not warn");
    },
  });

  assert.deepEqual(result, { restored: true, remainingPids: [] });
  assert.equal(guard.restoreCalls, 1);
  // The wait must target the same process identity the launch used, or it waits on nothing.
  assert.deepEqual(waited, [
    {
      appPath: "/tmp/Ontology Atlas.app",
      executablePath: "/tmp/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    },
  ]);
});

test("window state stays parked — loudly — while the app still runs", async () => {
  // Restoring under a live writer would let the app overwrite the owner's geometry on quit.
  // The honest behaviour is to keep the parked backup and report it, never a silent restore.
  const guard = makeFakeGuard({ moved: true });
  const warnings = [];
  const result = await restoreWindowStateAfterExit({
    guard,
    appPath: "/tmp/Ontology Atlas.app",
    executablePath: "/tmp/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    waitForExit: async () => [4242],
    warn: (message) => {
      warnings.push(message);
    },
  });

  assert.deepEqual(result, { restored: false, remainingPids: [4242] });
  assert.equal(guard.restoreCalls, 0, "must not restore into a live writer");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /NOT restored/);
  assert.match(warnings[0], /4242/);
  assert.ok(warnings[0].includes(guard.parked), "the report must name the parked path");
});

test("an unmoved window state guard skips the exit wait entirely", async () => {
  // Nothing was parked, so polling the process table would only slow the common no-flag path.
  const guard = makeFakeGuard({ moved: false });
  const result = await restoreWindowStateAfterExit({
    guard,
    appPath: "/tmp/Ontology Atlas.app",
    executablePath: "/tmp/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    waitForExit: async () => {
      throw new Error("must not poll processes when nothing was parked");
    },
    warn: () => {
      throw new Error("must not warn when nothing was parked");
    },
  });

  assert.deepEqual(result, { restored: false, remainingPids: [] });
  // restore() still runs once so the guard contract stays uniform; it is a no-op for an
  // unmoved guard.
  assert.equal(guard.restoreCalls, 1);
});

test("restore is idempotent and survives the parked file disappearing underneath it", () => {
  const statePath =
    "/Users/owner/Library/Application Support/dev.jinan.ontology-atlas/.window-state.json";
  const fakeFs = makeFakeFs({ [statePath]: "{}" });

  const guard = setAsideWindowState(statePath, { fsImpl: fakeFs });
  guard.restore();
  // The finally block runs after any exit path, including one that already restored; a second
  // restore must not throw ENOENT or clobber the freshly restored file.
  assert.doesNotThrow(() => guard.restore());
  assert.equal(fakeFs.files.get(statePath), "{}");

  const vanished = makeFakeFs({ [statePath]: "{}" });
  const vanishedGuard = setAsideWindowState(statePath, { fsImpl: vanished });
  vanished.files.delete(vanishedGuard.parked);
  assert.doesNotThrow(() => vanishedGuard.restore());
});
