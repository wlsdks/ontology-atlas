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

/**
 * The identity name is printed on the certificate we just imported, so asking
 * an operator to also type it into a secret is a second chance to get it wrong
 * for no information gained. Derive it, and only fall back to the env var when
 * the keychain holds more than one Developer ID (or none, so the error says
 * what is actually missing).
 */
function resolveSigningIdentity() {
  if (signingIdentity) return signingIdentity;

  const found = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], {
    encoding: "utf8",
  });
  const identities = (found.stdout ?? "")
    .split("\n")
    .map((line) => line.match(/"(Developer ID Application:[^"]+)"/)?.[1])
    .filter(Boolean);

  if (identities.length === 1) {
    console.log(`[desktop-sign] using the imported identity: ${identities[0]}`);
    return identities[0];
  }
  if (identities.length === 0) {
    fail(
      "no Developer ID Application identity in the keychain — import the certificate first, " +
        "or set APPLE_SIGNING_IDENTITY explicitly.",
    );
  }
  fail(
    `${identities.length} Developer ID identities found; set APPLE_SIGNING_IDENTITY to pick one:\n` +
      identities.map((id) => `  ${id}`).join("\n"),
  );
}

const identity = resolveSigningIdentity();

run("codesign", [
  "--force",
  "--deep",
  "--options",
  "runtime",
  "--timestamp",
  "--sign",
  identity,
  appPath,
]);
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

console.log(`[desktop-sign] signed and verified ${appPath}`);
