#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  CURRENT_RELEASE_SECRET_NAMES,
  releaseChildEnv,
} from "./lib/release-secret-env.mjs";
import { decodeNotaryApiKeySecret } from "./lib/notary-credentials.mjs";

const TAURI_UPDATER_SECRETS = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];
const NOTARY_CREDENTIALS = [
  "NOTARYTOOL_KEY_PATH",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER_ID",
];

export const RELEASE_ARTIFACT_STEPS = Object.freeze([
  { label: "validate release credentials", command: "pnpm", args: ["desktop:release-secrets"], allow: CURRENT_RELEASE_SECRET_NAMES },
  { label: "build static application", command: "pnpm", args: ["build"], allow: [] },
  { label: "smoke static application", command: "pnpm", args: ["desktop:smoke"], allow: [] },
  { label: "build signed-updater app bundle", command: "pnpm", args: ["desktop:build:app"], allow: TAURI_UPDATER_SECRETS },
  { label: "sign app bundle", command: "pnpm", args: ["desktop:sign"], allow: [] },
  { label: "repack signed updater archive", command: "pnpm", args: ["desktop:repack-updater"], allow: TAURI_UPDATER_SECRETS },
  { label: "package DMG", command: process.execPath, args: ["scripts/package-macos-dmg.mjs"], allow: [] },
  { label: "sign DMG", command: "pnpm", args: ["desktop:sign:dmg"], allow: [] },
  { label: "notarize DMG", command: "pnpm", args: ["desktop:notarize"], allow: NOTARY_CREDENTIALS },
  { label: "verify release DMG", command: "pnpm", args: ["desktop:verify-release-dmg"], allow: [] },
  { label: "verify installed app", command: "pnpm", args: ["desktop:verify-install"], allow: [] },
]);

export function runReleaseArtifactPipeline({
  cwd = process.cwd(),
  env = process.env,
  spawn = spawnSync,
} = {}) {
  for (const step of RELEASE_ARTIFACT_STEPS) {
    const result = spawn(step.command, step.args, {
      cwd,
      env: releaseChildEnv(env, step.allow),
      stdio: "inherit",
    });
    if (result.error) {
      throw new Error(`[desktop-release-artifact] ${step.label} could not start: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(
        `[desktop-release-artifact] ${step.label} failed with exit ${result.status ?? "unknown"}`,
      );
    }
  }
  return 0;
}

export function withNotaryApiKeyFile(
  env,
  callback,
  { tempRoot = os.tmpdir() } = {},
) {
  const tempDir = fs.mkdtempSync(path.join(tempRoot, "ontology-atlas-notary-"));
  const keyPath = path.join(tempDir, "AuthKey.p8");
  try {
    fs.chmodSync(tempDir, 0o700);
    fs.writeFileSync(keyPath, decodeNotaryApiKeySecret(env.APPLE_API_KEY_P8_BASE64), { mode: 0o600 });
    fs.chmodSync(keyPath, 0o600);
    return callback({ ...env, NOTARYTOOL_KEY_PATH: keyPath });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  try {
    return withNotaryApiKeyFile(process.env, (env) =>
      runReleaseArtifactPipeline({ env }),
    );
  } catch (error) {
    console.error(
      `[desktop-release-artifact] ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
