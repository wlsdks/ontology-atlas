import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./check-macos-release-secrets.mjs", import.meta.url));
const APPLE_SECRET_NAMES = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_API_KEY_P8_BASE64",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER_ID",
];
const TAURI_SECRET_NAMES = ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"];
const STRUCTURALLY_VALID_PKCS12 = Buffer.from([
  0x30, 0x1e, 0x02, 0x01, 0x03, 0x30, 0x19, 0x06,
  0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01,
  0x07, 0x01, 0xa0, 0x0c, 0x04, 0x0a, 0x30, 0x08,
  0x02, 0x01, 0x00, 0x04, 0x03, 0x70, 0x31, 0x32,
]).toString("base64");
const STRUCTURALLY_VALID_P8 = Buffer.from(
  "-----BEGIN PRIVATE KEY-----\nprivate-key-material\n-----END PRIVATE KEY-----\n",
).toString("base64");

function cleanEnv() {
  const env = { ...process.env };
  for (const name of [...APPLE_SECRET_NAMES, ...TAURI_SECRET_NAMES]) {
    delete env[name];
  }
  return env;
}

function run(args, env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
}

test("updater-only mode accepts only the Tauri signing secrets", () => {
  const env = cleanEnv();
  env.APPLE_CERTIFICATE_P12_BASE64 = "not base64";
  env.TAURI_SIGNING_PRIVATE_KEY = "private-key";
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "private-key-password";

  const result = run(["--updater-only"], env);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /updater signing secrets are present/);
});

test("default mode requires the five Apple secrets and both Tauri secrets", () => {
  const env = cleanEnv();
  Object.assign(env, {
    APPLE_CERTIFICATE_P12_BASE64: STRUCTURALLY_VALID_PKCS12,
    APPLE_CERTIFICATE_PASSWORD: "certificate-password",
    APPLE_API_KEY_P8_BASE64: STRUCTURALLY_VALID_P8,
    APPLE_API_KEY_ID: "KEYID12345",
    APPLE_API_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
    TAURI_SIGNING_PRIVATE_KEY: "private-key",
  });

  const result = run([], env);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
});

test("default mode reports all seven required secret names when empty", () => {
  const result = run([], cleanEnv());

  assert.equal(result.status, 1);
  for (const name of [...APPLE_SECRET_NAMES, ...TAURI_SECRET_NAMES]) {
    assert.match(result.stderr, new RegExp(name));
  }
});

test("default mode accepts exactly the seven signing and notarization secrets", () => {
  const env = cleanEnv();
  Object.assign(env, {
    APPLE_CERTIFICATE_P12_BASE64: STRUCTURALLY_VALID_PKCS12,
    APPLE_CERTIFICATE_PASSWORD: "certificate-password",
    APPLE_API_KEY_P8_BASE64: STRUCTURALLY_VALID_P8,
    APPLE_API_KEY_ID: "KEYID12345",
    APPLE_API_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
    TAURI_SIGNING_PRIVATE_KEY: "private-key",
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "private-key-password",
  });

  const result = run([], env);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /signing, notarization, and updater secrets are present/);
});

test("legacy Apple ID password credentials cannot satisfy the hosted notarization gate", () => {
  const env = cleanEnv();
  Object.assign(env, {
    APPLE_CERTIFICATE_P12_BASE64: STRUCTURALLY_VALID_PKCS12,
    APPLE_CERTIFICATE_PASSWORD: "certificate-password",
    APPLE_ID: "developer@example.com",
    APPLE_APP_SPECIFIC_PASSWORD: "app-specific-password",
    APPLE_TEAM_ID: "ABCDE12345",
    TAURI_SIGNING_PRIVATE_KEY: "private-key",
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "private-key-password",
  });

  const result = run([], env);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /APPLE_API_KEY_P8_BASE64/);
  assert.match(result.stderr, /APPLE_API_KEY_ID/);
  assert.match(result.stderr, /APPLE_API_ISSUER_ID/);
});

test("updater-only mode fails when either Tauri secret is missing", () => {
  const env = cleanEnv();
  env.TAURI_SIGNING_PRIVATE_KEY = "private-key";

  const result = run(["--updater-only"], env);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
  assert.doesNotMatch(result.stderr, /APPLE_CERTIFICATE_P12_BASE64/);
});

test("default mode preserves structural PKCS#12 validation", () => {
  const env = cleanEnv();
  Object.assign(env, {
    APPLE_CERTIFICATE_P12_BASE64: "not base64",
    APPLE_CERTIFICATE_PASSWORD: "certificate-password",
    APPLE_API_KEY_P8_BASE64: STRUCTURALLY_VALID_P8,
    APPLE_API_KEY_ID: "KEYID12345",
    APPLE_API_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
    TAURI_SIGNING_PRIVATE_KEY: "private-key",
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "private-key-password",
  });

  const result = run([], env);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must be a base64-encoded \.p12 export/);
});

test("default mode rejects base64 that is not an App Store Connect p8 key", () => {
  const env = cleanEnv();
  Object.assign(env, {
    APPLE_CERTIFICATE_P12_BASE64: STRUCTURALLY_VALID_PKCS12,
    APPLE_CERTIFICATE_PASSWORD: "certificate-password",
    APPLE_API_KEY_P8_BASE64: Buffer.from("not-a-private-key").toString("base64"),
    APPLE_API_KEY_ID: "KEYID12345",
    APPLE_API_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
    TAURI_SIGNING_PRIVATE_KEY: "private-key",
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "private-key-password",
  });

  const result = run([], env);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must decode to an App Store Connect \.p8 private key/);
});

test("help documents the updater-only mode and both Tauri secrets", () => {
  const result = run(["--help"], cleanEnv());

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--updater-only/);
  assert.match(result.stdout, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(result.stdout, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
});
