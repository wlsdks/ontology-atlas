import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildInstalledAppVerifyArgs,
  parseVerifyInstallArgs,
  verifyBundleSignature,
} from "./verify-macos-install-smoke.mjs";

test("verify install args use named DMG and hold duration", () => {
  assert.deepEqual(
    parseVerifyInstallArgs(["/tmp/Ontology_Atlas_0.1.0_aarch64.dmg", "--hold-ms=8000"], {
      defaultDmgPath: "/tmp/default.dmg",
    }),
    {
      dmgPath: "/tmp/Ontology_Atlas_0.1.0_aarch64.dmg",
      holdMs: 8000,
    },
  );
});

test("verify install args fall back to generated release DMG path", () => {
  assert.deepEqual(parseVerifyInstallArgs([], { defaultDmgPath: "/tmp/default.dmg" }), {
    dmgPath: "/tmp/default.dmg",
    holdMs: 5000,
  });
});

test("installed app verification reuses the LaunchServices app content gate", () => {
  assert.deepEqual(
    buildInstalledAppVerifyArgs("/tmp/install/Ontology Atlas.app", 9000),
    [
      "scripts/verify-macos-app-launch.mjs",
      "/tmp/install/Ontology Atlas.app",
      "--hold-ms=9000",
      "--kill-existing",
      "--open-app",
      "--require-window",
      "--require-owner-name=Ontology Atlas",
      "--min-window-size=1040x720",
      "--require-accessibility-text=Ontology Atlas",
    ],
  );
});

/**
 * The gate for the regression where the v1.0.0 draft passed install verification
 * and still showed users "is damaged".
 *
 * The verification did **launch** the app, but the copy had no quarantine attribute
 * so no Gatekeeper evaluation happened at all, and a bundle with a broken signature
 * structure ran quietly. These two cases invoke the real `codesign`, so they only
 * mean anything on macOS.
 */
const darwin = process.platform === "darwin";

function makeBundle(dir, { sign }) {
  const app = join(dir, "Probe.app");
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  writeFileSync(join(app, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>probe</string>
<key>CFBundleIdentifier</key><string>dev.jinan.probe</string>
</dict></plist>
`);
  // codesign only treats it as a bundle when a real Mach-O is present.
  execFileSync("cp", ["/bin/echo", join(app, "Contents", "MacOS", "probe")]);
  if (sign) execFileSync("codesign", ["--force", "--deep", "--sign", "-", app]);
  return app;
}

test("bundle signature gate accepts an ad-hoc signed bundle", { skip: !darwin }, () => {
  const dir = mkdtempSync(join(tmpdir(), "oa-sig-ok-"));
  try {
    assert.doesNotThrow(() => verifyBundleSignature(makeBundle(dir, { sign: true }), { label: "Probe.app" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle signature gate rejects a bundle whose signature is structurally broken", { skip: !darwin }, () => {
  const dir = mkdtempSync(join(tmpdir(), "oa-sig-bad-"));
  try {
    const app = makeBundle(dir, { sign: true });
    // Reproduces the real shape of a Tauri-emitted bundle: the binary is signed but
    // the bundle has no _CodeSignature.
    rmSync(join(app, "Contents", "_CodeSignature"), { recursive: true, force: true });
    // Precondition — check that this state really is rejected by codesign.
    const probe = spawnSync("codesign", ["--verify", "--deep", "--strict", app], { encoding: "utf8" });
    assert.notEqual(probe.status, 0, "fixture is supposed to be a broken bundle");

    assert.throws(
      () => verifyBundleSignature(app, { label: "Probe.app" }),
      /codesign --verify rejected Probe\.app/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
