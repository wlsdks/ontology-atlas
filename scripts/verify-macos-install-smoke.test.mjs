import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInstalledAppVerifyArgs,
  parseVerifyInstallArgs,
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

test("installed app verification reuses WebView content launch gate", () => {
  assert.deepEqual(
    buildInstalledAppVerifyArgs("/tmp/install/Ontology Atlas.app", 9000),
    [
      "scripts/verify-macos-app-launch.mjs",
      "/tmp/install/Ontology Atlas.app",
      "--hold-ms=9000",
      "--kill-existing",
      "--require-webview-content",
    ],
  );
});
