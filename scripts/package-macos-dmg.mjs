#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appName, appBundleName, releaseAssetName, version, arch } = names;
const bundleRoot = path.join(root, "src-tauri", "target", "release", "bundle");
const appPath = path.join(bundleRoot, "macos", appBundleName);
const dmgDir = path.join(bundleRoot, "dmg");
const stagingDir = path.join(dmgDir, ".staging");
const dmgPath = path.join(dmgDir, `${releaseAssetName}_${version}_${arch}.dmg`);
const checksumPath = `${dmgPath}.sha256`;

function fail(message) {
  console.error(`[desktop-dmg] ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    fail(
      [
        `${command} ${args.join(" ")} failed with exit ${result.status}`,
        stdout ? `stdout:\n${stdout}` : null,
        stderr ? `stderr:\n${stderr}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return result;
}

function removeExistingDmgArtifacts() {
  if (!fs.existsSync(dmgDir)) return [];
  const removed = [];
  for (const entry of fs.readdirSync(dmgDir)) {
    if (!entry.endsWith(".dmg") && !entry.endsWith(".dmg.sha256")) continue;
    const artifactPath = path.join(dmgDir, entry);
    if (!fs.lstatSync(artifactPath).isFile()) continue;
    fs.rmSync(artifactPath, { force: true });
    removed.push(entry);
  }
  return removed.sort();
}

if (process.platform !== "darwin") {
  fail("DMG packaging requires macOS because it uses hdiutil.");
}

if (!fs.existsSync(appPath)) {
  fail(`missing app bundle at ${appPath}; run pnpm tauri build --bundles app first.`);
}

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });
fs.mkdirSync(dmgDir, { recursive: true });
const removedArtifacts = removeExistingDmgArtifacts();
if (removedArtifacts.length > 0) {
  console.log(`[desktop-dmg] removed stale DMG artifacts: ${removedArtifacts.join(", ")}`);
}

const stagedAppPath = path.join(stagingDir, appBundleName);
run("ditto", [appPath, stagedAppPath]);
fs.symlinkSync("/Applications", path.join(stagingDir, "Applications"));

run("hdiutil", [
  "create",
  "-volname",
  appName,
  "-srcfolder",
  stagingDir,
  "-ov",
  "-format",
  "UDZO",
  dmgPath,
]);
run("hdiutil", ["verify", dmgPath]);

fs.rmSync(stagingDir, { recursive: true, force: true });

const hash = crypto.createHash("sha256").update(fs.readFileSync(dmgPath)).digest("hex");
fs.writeFileSync(checksumPath, `${hash}  ${path.basename(dmgPath)}\n`);

const sizeMiB = fs.statSync(dmgPath).size / 1024 / 1024;
console.log(`[desktop-dmg] created ${dmgPath} (${sizeMiB.toFixed(1)} MiB)`);
console.log(`[desktop-dmg] wrote ${checksumPath}`);
