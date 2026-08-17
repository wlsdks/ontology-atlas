#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";
import { resolveNotaryAuthentication } from "./lib/notary-credentials.mjs";
import { formatCommandForLog } from "./lib/redact-command.mjs";
import { releaseChildEnv } from "./lib/release-secret-env.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { releaseAssetName, version, arch } = names;
const dmgPath =
  process.argv.slice(2).find((arg) => !arg.startsWith("-")) ??
  path.join(
    root,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "dmg",
    `${releaseAssetName}_${version}_${arch}.dmg`,
  );
const checksumPath = `${dmgPath}.sha256`;

function printHelp() {
  console.log(`Usage: pnpm desktop:notarize [path/to/app.dmg]

Submits the DMG to Apple notarization, waits for the result, staples the
ticket, and validates the stapled artifact.

Environment, choose one authentication mode:
  NOTARYTOOL_PROFILE             Stored notarytool keychain profile.

  NOTARYTOOL_KEY_PATH            Path to an App Store Connect .p8 private key.
  APPLE_API_KEY_ID               App Store Connect API key ID.
  APPLE_API_ISSUER_ID            App Store Connect API issuer UUID.

The private key bytes must stay in the 0600 file. Password authentication is
not accepted because notarytool places --password values in process arguments.
`);
}

function fail(message) {
  console.error(`[desktop-notarize] ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    env: releaseChildEnv(process.env),
  });

  if (result.status !== 0) {
    fail(
      [
        `${formatCommandForLog(command, args)} failed with exit ${result.status}`,
        result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : null,
        result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return result;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (process.platform !== "darwin") {
  fail("macOS notarization requires macOS because it uses xcrun notarytool and stapler.");
}

if (!fs.existsSync(dmgPath)) {
  fail(`missing DMG at ${dmgPath}; run pnpm desktop:build first.`);
}

let authentication;
try {
  authentication = resolveNotaryAuthentication(process.env);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

run("xcrun", ["notarytool", "submit", dmgPath, "--wait", ...authentication.args]);
run("xcrun", ["stapler", "staple", dmgPath]);
run("xcrun", ["stapler", "validate", dmgPath]);

const hash = crypto.createHash("sha256").update(fs.readFileSync(dmgPath)).digest("hex");
fs.writeFileSync(checksumPath, `${hash}  ${path.basename(dmgPath)}\n`);

console.log(`[desktop-notarize] notarized and stapled ${dmgPath}`);
console.log(`[desktop-notarize] refreshed ${checksumPath}`);
