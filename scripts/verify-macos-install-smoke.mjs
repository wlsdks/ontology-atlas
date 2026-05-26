#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseHdiutilMountDir, verifyApplicationsSymlink } from "./lib/macos-dmg-layout.mjs";
import { loadMacosReleaseNames, resolveMacosExecutable } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName, releaseAssetName, version, arch } = names;
const holdMsArg = process.argv.find((arg) => arg.startsWith("--hold-ms="));
const holdMs = holdMsArg ? Number(holdMsArg.slice("--hold-ms=".length)) : 5000;
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
  console.log(`Usage: pnpm desktop:verify-install [path/to/app.dmg] [--hold-ms=5000]

Mounts the DMG read-only, copies ${appBundleName} to a temporary install
directory with ditto, launches that copied app long enough to catch early
startup crashes, then detaches and removes the temporary install.
`);
}

function fail(message) {
  console.error(`[desktop-install-verify] ${message}`);
  process.exit(1);
}

function run(command, args) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000).then(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

async function launchCopiedApp(appPath) {
  const executablePath = resolveMacosExecutable(appPath, names);
  if (!fs.existsSync(executablePath)) {
    throw new Error(`copied app is missing executable ${executablePath}`);
  }

  const child = spawn(executablePath, {
    cwd: path.dirname(executablePath),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let earlyExit = null;
  child.once("exit", (code, signal) => {
    earlyExit = { code, signal };
  });

  await sleep(holdMs);

  if (earlyExit) {
    throw new Error(
      [
        `${appBundleName} copied from DMG exited before ${holdMs}ms (code=${earlyExit.code}, signal=${earlyExit.signal})`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
        stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  await terminate(child);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (process.platform !== "darwin") {
  fail("macOS install verification requires darwin.");
}

if (!Number.isFinite(holdMs) || holdMs < 1000) {
  fail("--hold-ms must be a number >= 1000.");
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

let mountDir = null;
let tempDir = null;
let verificationError = null;

try {
  run("hdiutil", ["verify", dmgPath]);
  const attach = run("hdiutil", ["attach", "-readonly", "-nobrowse", dmgPath]);
  mountDir = parseHdiutilMountDir(attach.stdout);

  if (!mountDir) {
    throw new Error(`could not find mounted volume in hdiutil output:\n${attach.stdout}`);
  }

  const mountedApp = path.join(mountDir, appBundleName);
  const applicationsLink = path.join(mountDir, "Applications");
  if (!fs.existsSync(mountedApp)) {
    throw new Error(`mounted DMG is missing ${appBundleName}`);
  }
  verifyApplicationsSymlink(applicationsLink);

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omot-install-smoke-"));
  const installedApp = path.join(tempDir, appBundleName);
  run("ditto", [mountedApp, installedApp]);

  await launchCopiedApp(installedApp);
} catch (error) {
  verificationError = error;
} finally {
  if (mountDir) {
    try {
      run("hdiutil", ["detach", mountDir]);
    } catch (detachError) {
      verificationError ??= detachError;
    }
  }
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (verificationError) {
  fail(verificationError.message);
}

console.log(
  `[desktop-install-verify] copied and launched ${appBundleName} from ${dmgPath} for ${holdMs}ms`,
);
