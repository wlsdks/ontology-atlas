#!/usr/bin/env node
/**
 * Builds and signs the only updater archive from the signed `.app` (`createUpdaterArtifacts:
 * false`). An archive packed before signing holds the unsigned app, which macOS judges "damaged",
 * so only the update path would break. The `.app` signature is verified before repacking.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName } = names;

const macosDir = path.join(root, "src-tauri", "target", "release", "bundle", "macos");
const appPath = path.join(macosDir, appBundleName);
const archivePath = path.join(macosDir, `${appBundleName}.tar.gz`);
const signaturePath = `${archivePath}.sig`;

function fail(message) {
  console.error(`[updater-repack] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
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
  console.log(`Usage: pnpm desktop:repack-updater

Rebuilds ${appBundleName}.tar.gz from the **signed** app bundle and re-signs it
with the Tauri updater key, so in-app updates ship the same signature state the
DMG does.

Environment:
  TAURI_SIGNING_PRIVATE_KEY           minisign private key (string)
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD  its password
`);
  process.exit(0);
}

if (process.platform !== "darwin") {
  fail("the updater archive is a macOS app payload — repack it on macOS.");
}

if (!fs.existsSync(appPath)) {
  fail(`missing app bundle at ${appPath}; run pnpm desktop:build:app first.`);
}

// This only means anything when called after signing. Repacking a broken signature
// leaves the update path broken while this step alone turns green — the exact defect
// this script exists to prevent.
const verified = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], {
  encoding: "utf8",
});
if (verified.status !== 0) {
  fail(
    `codesign --verify rejected ${appBundleName}: ${`${verified.stderr ?? ""}${verified.stdout ?? ""}`.trim()}\n` +
      "  This step must come **after signing** — right after pnpm desktop:sign or pnpm desktop:sign:adhoc.\n" +
      "  Repacking a broken bundle means an updated user meets 'is damaged' rather than 'unidentified developer'.",
  );
}

if (!(process.env.TAURI_SIGNING_PRIVATE_KEY ?? "").trim()) {
  fail(
    "TAURI_SIGNING_PRIVATE_KEY is empty — the rebuilt archive would ship without a .sig and the app refuses\n" +
      "  unsigned update packages (it shows 'no update available', silently).",
  );
}

fs.rmSync(archivePath, { force: true });
fs.rmSync(signaturePath, { force: true });

// `-C` into the directory and archive only `<app>.app` — the layout Tauri emits.
// COPYFILE_DISABLE=1 stops macOS tar inserting extended attributes as `._*`.
run("tar", ["-czf", archivePath, "-C", macosDir, appBundleName], {
  env: { ...process.env, COPYFILE_DISABLE: "1" },
});

run("pnpm", ["exec", "tauri", "signer", "sign", archivePath]);

if (!fs.existsSync(signaturePath)) {
  fail(`tauri signer reported success but ${signaturePath} is missing.`);
}

const sizeMiB = fs.statSync(archivePath).size / 1024 / 1024;
console.log(
  `[updater-repack] rebuilt ${path.relative(root, archivePath)} (${sizeMiB.toFixed(1)} MiB) from the signed ${appBundleName} and re-signed it`,
);
