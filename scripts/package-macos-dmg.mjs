#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";
import { isTransientHdiutilFailure, stalePathForVolume } from "./lib/hdiutil-retry.mjs";

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

/*
 * ⚠️ **The DMG step is retried, and only for a busy resource.** rc.15 built, signed and
 * notarized on aarch64 and then died on x64 with `hdiutil: create failed - Resource busy`.
 * Nothing was wrong with it: something on the runner held the staging folder open for a
 * moment. Because this is the last step before staging, both publish jobs were skipped and
 * the whole release had to be dispatched again.
 *
 * The retry is deliberately narrow. Attempting every failure three times would turn a real
 * error -- an unsignable bundle, a full disk -- into three identical ones reported as the
 * last, hiding both the cause and the fact that it never varied. So only a failure whose
 * text names a busy resource is retried; everything else still fails on the first attempt.
 */
const DMG_CREATE_ATTEMPTS = 3;
for (let attempt = 1; attempt <= DMG_CREATE_ATTEMPTS; attempt += 1) {
  const result = spawnSync(
    "hdiutil",
    ["create", "-volname", appName, "-srcfolder", stagingDir, "-ov", "-format", "UDZO", dmgPath],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  );
  if (result.status === 0) break;

  const lastAttempt = attempt === DMG_CREATE_ATTEMPTS;
  if (lastAttempt || !isTransientHdiutilFailure(result)) {
    /*
     * Report the output already in hand rather than running `hdiutil` again to obtain a
     * message. Re-running would cost another compression pass and could just as easily
     * succeed, turning a real failure into a confusing one.
     */
    fail(
      [
        `hdiutil create failed with exit ${result.status}` +
          (attempt > 1 ? ` after ${attempt} attempts` : ""),
        result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : null,
        result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  console.warn(
    `[desktop-dmg] hdiutil create attempt ${attempt}/${DMG_CREATE_ATTEMPTS} hit a busy resource; retrying`,
  );
  /*
   * A still-attached volume of the same name is the most common holder and it outlives the
   * process that made it. Detaching is best effort: with nothing mounted the command simply
   * fails, and the next attempt happens either way.
   */
  spawnSync("hdiutil", ["detach", "-force", stalePathForVolume(appName)], { stdio: "ignore" });
  spawnSync("sleep", [String(attempt * 3)], { stdio: "ignore" });
}
run("hdiutil", ["verify", dmgPath]);

fs.rmSync(stagingDir, { recursive: true, force: true });

const hash = crypto.createHash("sha256").update(fs.readFileSync(dmgPath)).digest("hex");
fs.writeFileSync(checksumPath, `${hash}  ${path.basename(dmgPath)}\n`);

const sizeMiB = fs.statSync(dmgPath).size / 1024 / 1024;
console.log(`[desktop-dmg] created ${dmgPath} (${sizeMiB.toFixed(1)} MiB)`);
console.log(`[desktop-dmg] wrote ${checksumPath}`);
