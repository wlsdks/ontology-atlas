#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName } = names;
const appPath =
  process.env.MACOS_APP_PATH ??
  path.join(
    root,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    appBundleName,
  );
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY;

function printHelp() {
  console.log(`Usage: APPLE_SIGNING_IDENTITY="Developer ID Application: ..." pnpm desktop:sign

Signs the built macOS .app with hardened runtime enabled.

Environment:
  APPLE_SIGNING_IDENTITY  Required codesign identity name or SHA-1 hash.
  MACOS_APP_PATH          Optional .app path. Defaults to the Tauri release bundle.
`);
}

function fail(message) {
  console.error(`[desktop-sign] ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    fail(
      [
        `${command} ${args.join(" ")} failed with exit ${result.status}`,
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
  fail("macOS app signing requires macOS because it uses codesign.");
}

if (!fs.existsSync(appPath)) {
  fail(`missing app bundle at ${appPath}; run pnpm desktop:build:app first.`);
}

if (!signingIdentity) {
  fail("APPLE_SIGNING_IDENTITY is required for macOS release signing.");
}

run("codesign", [
  "--force",
  "--options",
  "runtime",
  "--timestamp",
  "--sign",
  signingIdentity,
  appPath,
]);
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

console.log(`[desktop-sign] signed and verified ${appPath}`);
