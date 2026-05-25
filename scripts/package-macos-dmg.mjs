#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
);

const productName = tauriConfig.productName ?? pkg.name;
const version = tauriConfig.version ?? pkg.version;
const arch = process.env.TAURI_ARCH ?? (process.arch === "arm64" ? "aarch64" : process.arch);
const bundleRoot = path.join(root, "src-tauri", "target", "release", "bundle");
const appPath = path.join(bundleRoot, "macos", `${productName}.app`);
const dmgDir = path.join(bundleRoot, "dmg");
const stagingDir = path.join(dmgDir, ".staging");
const dmgPath = path.join(dmgDir, `${productName}_${version}_${arch}.dmg`);
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

if (process.platform !== "darwin") {
  fail("DMG packaging requires macOS because it uses hdiutil.");
}

if (!fs.existsSync(appPath)) {
  fail(`missing app bundle at ${appPath}; run pnpm tauri build --bundles app first.`);
}

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });
fs.mkdirSync(dmgDir, { recursive: true });
fs.rmSync(dmgPath, { force: true });
fs.rmSync(checksumPath, { force: true });

const stagedAppPath = path.join(stagingDir, `${productName}.app`);
run("ditto", [appPath, stagedAppPath]);
fs.symlinkSync("/Applications", path.join(stagingDir, "Applications"));

run("hdiutil", [
  "create",
  "-volname",
  productName,
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
