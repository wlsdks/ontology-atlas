import assert from "node:assert/strict";
import test from "node:test";

import { releaseChildEnv } from "./release-secret-env.mjs";

test("release child environments keep only the credentials explicitly allowed for that step", () => {
  const env = releaseChildEnv(
    {
      PATH: "/usr/bin:/bin",
      CI: "true",
      APPLE_CERTIFICATE_P12_BASE64: "certificate-bytes",
      APPLE_CERTIFICATE_PASSWORD: "certificate-password",
      APPLE_API_KEY_P8_BASE64: "notary-key-bytes",
      APPLE_API_KEY_ID: "KEYID12345",
      APPLE_API_ISSUER_ID: "issuer-id",
      APPLE_ID: "legacy@example.com",
      APPLE_APP_SPECIFIC_PASSWORD: "legacy-password",
      APPLE_TEAM_ID: "LEGACYTEAM",
      NOTARYTOOL_KEY_PATH: "/private/tmp/notary/AuthKey.p8",
      TAURI_SIGNING_PRIVATE_KEY: "updater-key",
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "updater-password",
    },
    ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"],
  );

  assert.equal(env.PATH, "/usr/bin:/bin");
  assert.equal(env.CI, "true");
  assert.equal(env.TAURI_SIGNING_PRIVATE_KEY, "updater-key");
  assert.equal(env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD, "updater-password");
  assert.equal(env.APPLE_CERTIFICATE_P12_BASE64, undefined);
  assert.equal(env.APPLE_CERTIFICATE_PASSWORD, undefined);
  assert.equal(env.APPLE_API_KEY_P8_BASE64, undefined);
  assert.equal(env.APPLE_API_KEY_ID, undefined);
  assert.equal(env.APPLE_API_ISSUER_ID, undefined);
  assert.equal(env.APPLE_ID, undefined);
  assert.equal(env.APPLE_APP_SPECIFIC_PASSWORD, undefined);
  assert.equal(env.APPLE_TEAM_ID, undefined);
  assert.equal(env.NOTARYTOOL_KEY_PATH, undefined);
});
