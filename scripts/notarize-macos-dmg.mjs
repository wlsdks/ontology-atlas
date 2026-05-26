#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

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

  APPLE_ID                       Apple ID for notarytool.
  APPLE_APP_SPECIFIC_PASSWORD    App-specific password for the Apple ID.
  APPLE_TEAM_ID                  Apple Developer Team ID.
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

function notaryAuthArgs() {
  if (process.env.NOTARYTOOL_PROFILE) {
    return ["--keychain-profile", process.env.NOTARYTOOL_PROFILE];
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID) {
    return [
      "--apple-id",
      APPLE_ID,
      "--password",
      APPLE_APP_SPECIFIC_PASSWORD,
      "--team-id",
      APPLE_TEAM_ID,
    ];
  }

  fail(
    "notarization requires NOTARYTOOL_PROFILE or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID.",
  );
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

run("xcrun", ["notarytool", "submit", dmgPath, "--wait", ...notaryAuthArgs()]);
run("xcrun", ["stapler", "staple", dmgPath]);
run("xcrun", ["stapler", "validate", dmgPath]);

const hash = crypto.createHash("sha256").update(fs.readFileSync(dmgPath)).digest("hex");
fs.writeFileSync(checksumPath, `${hash}  ${path.basename(dmgPath)}\n`);

console.log(`[desktop-notarize] notarized and stapled ${dmgPath}`);
console.log(`[desktop-notarize] refreshed ${checksumPath}`);
