import assert from "node:assert/strict";
import test from "node:test";

import { resolveNotaryAuthentication } from "./notary-credentials.mjs";

test("App Store Connect API key authentication never puts private key bytes in argv", () => {
  const privateKeyBytes = "-----BEGIN PRIVATE KEY-----\nsuper-secret-key\n-----END PRIVATE KEY-----";
  const encodedPrivateKey = Buffer.from(privateKeyBytes).toString("base64");
  const auth = resolveNotaryAuthentication({
    NOTARYTOOL_KEY_PATH: "/private/tmp/notary/AuthKey.p8",
    APPLE_API_KEY_ID: "KEYID12345",
    APPLE_API_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
    APPLE_API_KEY_P8_BASE64: encodedPrivateKey,
  });

  assert.deepEqual(auth.args, [
    "--key",
    "/private/tmp/notary/AuthKey.p8",
    "--key-id",
    "KEYID12345",
    "--issuer",
    "11111111-2222-3333-4444-555555555555",
  ]);
  assert.ok(!auth.args.join(" ").includes(privateKeyBytes));
  assert.ok(!auth.args.join(" ").includes("super-secret-key"));
  assert.ok(!auth.args.includes(encodedPrivateKey));
});

test("legacy Apple ID password input is rejected instead of becoming a notarytool argv fallback", () => {
  assert.throws(
    () =>
      resolveNotaryAuthentication({
        APPLE_ID: "developer@example.com",
        APPLE_APP_SPECIFIC_PASSWORD: "app-specific-password",
        APPLE_TEAM_ID: "ABCDE12345",
      }),
    /NOTARYTOOL_KEY_PATH.*APPLE_API_KEY_ID.*APPLE_API_ISSUER_ID/,
  );
});

test("an existing keychain profile remains a password-free local authentication mode", () => {
  const auth = resolveNotaryAuthentication({
    NOTARYTOOL_PROFILE: "ontology-atlas-notary",
  });

  assert.deepEqual(auth, {
    mode: "keychain-profile",
    args: ["--keychain-profile", "ontology-atlas-notary"],
  });
});
