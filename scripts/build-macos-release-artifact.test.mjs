import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runReleaseArtifactPipeline,
  withNotaryApiKeyFile,
} from "./build-macos-release-artifact.mjs";

const ALL_SECRETS = {
  APPLE_CERTIFICATE_P12_BASE64: "certificate-bytes",
  APPLE_CERTIFICATE_PASSWORD: "certificate-password",
  APPLE_API_KEY_P8_BASE64: "notary-private-key-bytes",
  APPLE_API_KEY_ID: "KEYID12345",
  APPLE_API_ISSUER_ID: "issuer-id",
  TAURI_SIGNING_PRIVATE_KEY: "updater-private-key",
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "updater-password",
};

test("the release pipeline exposes each credential only to the step that needs it", () => {
  const calls = [];
  const result = runReleaseArtifactPipeline({
    cwd: process.cwd(),
    env: {
      PATH: "/usr/bin:/bin",
      CI: "true",
      NOTARYTOOL_KEY_PATH: "/private/tmp/notary/AuthKey.p8",
      ...ALL_SECRETS,
    },
    spawn(command, args, options) {
      calls.push({ command, args, env: options.env });
      return { status: 0 };
    },
  });

  assert.equal(result, 0);
  assert.equal(calls.length, 11, "every release step must be classified instead of silently skipped");

  const byScript = new Map(calls.map((call) => [call.args[0], call]));
  const secretCheck = byScript.get("desktop:release-secrets");
  for (const [name, value] of Object.entries(ALL_SECRETS)) {
    assert.equal(secretCheck.env[name], value, `${name} must reach only the credential validator first`);
  }

  for (const script of ["build", "desktop:smoke", "desktop:sign", "desktop:sign:dmg", "desktop:verify-release-dmg", "desktop:verify-install"]) {
    const call = byScript.get(script);
    assert.equal(call.env.NOTARYTOOL_KEY_PATH, undefined, `${script} inherited the notary key path`);
    for (const name of Object.keys(ALL_SECRETS)) {
      assert.equal(call.env[name], undefined, `${script} inherited ${name}`);
    }
  }

  for (const script of ["desktop:build:app", "desktop:repack-updater"]) {
    const call = byScript.get(script);
    assert.equal(call.env.TAURI_SIGNING_PRIVATE_KEY, ALL_SECRETS.TAURI_SIGNING_PRIVATE_KEY);
    assert.equal(
      call.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
      ALL_SECRETS.TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
    );
    for (const name of Object.keys(ALL_SECRETS).filter((key) => !key.startsWith("TAURI_"))) {
      assert.equal(call.env[name], undefined, `${script} inherited ${name}`);
    }
  }

  const notarize = byScript.get("desktop:notarize");
  assert.equal(notarize.env.NOTARYTOOL_KEY_PATH, "/private/tmp/notary/AuthKey.p8");
  assert.equal(notarize.env.APPLE_API_KEY_ID, ALL_SECRETS.APPLE_API_KEY_ID);
  assert.equal(notarize.env.APPLE_API_ISSUER_ID, ALL_SECRETS.APPLE_API_ISSUER_ID);
  assert.equal(notarize.env.APPLE_API_KEY_P8_BASE64, undefined);
  assert.equal(notarize.env.APPLE_CERTIFICATE_PASSWORD, undefined);
  assert.equal(notarize.env.TAURI_SIGNING_PRIVATE_KEY, undefined);
});

test("the public release-artifact command uses the credential-isolating orchestrator", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(
    pkg.scripts["desktop:release-artifact"],
    "node scripts/build-macos-release-artifact.mjs",
  );
});

test("the notarization private key exists as a 0600 temp file only while the pipeline uses it", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-notary-test-"));
  const privateKey = "-----BEGIN PRIVATE KEY-----\nprivate-key-material\n-----END PRIVATE KEY-----\n";
  let observedPath = "";

  try {
    const value = withNotaryApiKeyFile(
      {
        ...ALL_SECRETS,
        APPLE_API_KEY_P8_BASE64: Buffer.from(privateKey).toString("base64"),
      },
      (env) => {
        observedPath = env.NOTARYTOOL_KEY_PATH;
        assert.equal(fs.readFileSync(observedPath, "utf8"), privateKey);
        assert.equal(fs.statSync(observedPath).mode & 0o777, 0o600);
        return "pipeline-result";
      },
      { tempRoot },
    );

    assert.equal(value, "pipeline-result");
    assert.ok(observedPath);
    assert.equal(fs.existsSync(observedPath), false, "private key temp file survived the pipeline");
    assert.deepEqual(fs.readdirSync(tempRoot), []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("the notarization private key temp file is removed when the pipeline throws", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-notary-failure-test-"));
  const privateKey = "-----BEGIN PRIVATE KEY-----\nprivate-key-material\n-----END PRIVATE KEY-----\n";
  let observedPath = "";

  try {
    assert.throws(
      () =>
        withNotaryApiKeyFile(
          { APPLE_API_KEY_P8_BASE64: Buffer.from(privateKey).toString("base64") },
          (env) => {
            observedPath = env.NOTARYTOOL_KEY_PATH;
            throw new Error("simulated pipeline failure");
          },
          { tempRoot },
        ),
      /simulated pipeline failure/,
    );
    assert.equal(fs.existsSync(observedPath), false);
    assert.deepEqual(fs.readdirSync(tempRoot), []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
