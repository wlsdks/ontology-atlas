#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName, releaseAssetName, version, arch } = names;
const requireSigned = process.argv.includes("--require-signed");
const requireNotarized = process.argv.includes("--require-notarized");
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
  console.log(`Usage: pnpm desktop:verify-dmg [path/to/app.dmg] [--require-signed] [--require-notarized]

Verifies checksum, hdiutil image integrity, mounted DMG layout, and optionally
the contained app signature, stapled notarization ticket, and Gatekeeper
assessment.
`);
}

function fail(message) {
  console.error(`[desktop-dmg-verify] ${message}`);
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

function runCheck(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(
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
  fail("DMG verification requires macOS because it mounts the image with hdiutil.");
}

if (!fs.existsSync(dmgPath)) {
  fail(`missing DMG at ${dmgPath}; run pnpm desktop:build first.`);
}

if (!fs.existsSync(checksumPath)) {
  fail(`missing checksum at ${checksumPath}; run pnpm desktop:build first.`);
}

const expectedChecksum = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
const actualChecksum = crypto.createHash("sha256").update(fs.readFileSync(dmgPath)).digest("hex");
if (actualChecksum !== expectedChecksum) {
  fail(`checksum mismatch for ${dmgPath}: expected ${expectedChecksum}, got ${actualChecksum}`);
}

run("hdiutil", ["verify", dmgPath]);
const attach = run("hdiutil", ["attach", "-readonly", "-nobrowse", dmgPath]);
const mountLine = attach.stdout
  .split("\n")
  .find((line) => line.includes("/Volumes/"));
const mountDir = mountLine?.match(/(\/Volumes\/.+)$/)?.[1]?.trim();

if (!mountDir) {
  fail(`could not find mounted volume in hdiutil output:\n${attach.stdout}`);
}

let verificationError = null;

try {
  const appPath = path.join(mountDir, appBundleName);
  const applicationsLink = path.join(mountDir, "Applications");
  if (!fs.existsSync(appPath)) {
    throw new Error(`mounted DMG is missing ${appBundleName}`);
  }
  if (!fs.lstatSync(applicationsLink).isSymbolicLink()) {
    throw new Error("mounted DMG is missing Applications symlink");
  }
  if (requireSigned) {
    runCheck("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  }
  if (requireNotarized) {
    runCheck("spctl", ["--assess", "--type", "execute", "--verbose=2", appPath]);
  }
} catch (error) {
  verificationError = error;
} finally {
  try {
    run("hdiutil", ["detach", mountDir]);
  } catch (detachError) {
    verificationError ??= detachError;
  }
}

if (verificationError) {
  fail(verificationError.message);
}

if (requireNotarized) {
  run("xcrun", ["stapler", "validate", dmgPath]);
  run("spctl", [
    "--assess",
    "--type",
    "open",
    "--context",
    "context:primary-signature",
    "--verbose=2",
    dmgPath,
  ]);
}

const extraChecks = [
  requireSigned ? "signed app" : null,
  requireNotarized ? "stapled notarization + Gatekeeper" : null,
].filter(Boolean);
console.log(
  `[desktop-dmg-verify] verified ${dmgPath}${extraChecks.length > 0 ? ` (${extraChecks.join(", ")})` : ""}`,
);
