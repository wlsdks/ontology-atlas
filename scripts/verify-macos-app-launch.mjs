#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadMacosReleaseNames, resolveMacosExecutable } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName } = names;

export function parseVerifyAppLaunchArgs(argv, {
  defaultAppPath,
  defaultHoldMs = 5000,
} = {}) {
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  const holdMsArg = argv.find((arg) => arg.startsWith("--hold-ms="));

  return {
    appPath: positional[0] ?? defaultAppPath,
    holdMs: holdMsArg ? Number(holdMsArg.slice("--hold-ms=".length)) : defaultHoldMs,
    killExisting: argv.includes("--kill-existing"),
    openApp: argv.includes("--open-app"),
  };
}

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-app [path/to/${appBundleName}] [--hold-ms=5000] [--kill-existing] [--open-app]

Launches the packaged macOS .app executable, waits long enough to catch early
startup crashes, then terminates it. This is an unsigned local runtime smoke;
release artifacts still need pnpm desktop:verify-release-dmg.

Options:
  --kill-existing  Terminate already-running copies of this app executable before launch.
  --open-app       Launch through macOS LaunchServices (open -n) instead of spawning the executable directly.
`);
}

function fail(message) {
  console.error(`[desktop-app-verify] ${message}`);
  process.exit(1);
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

function terminateExisting(executablePath) {
  spawnSync("pkill", ["-f", executablePath], { stdio: "ignore" });
}

function processExists(executablePath) {
  const result = spawnSync("pgrep", ["-f", executablePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

async function verifyOpenAppLaunch({ appPath, executablePath, holdMs }) {
  const open = spawn("open", ["-n", appPath], {
    cwd: path.dirname(appPath),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  open.stdout.setEncoding("utf8");
  open.stderr.setEncoding("utf8");
  open.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  open.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const openExit = await new Promise((resolve) => {
    open.once("exit", (code, signal) => resolve({ code, signal }));
  });

  if (openExit.code !== 0) {
    fail(
      [
        `open failed for ${appPath} (code=${openExit.code}, signal=${openExit.signal})`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
        stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  await sleep(holdMs);

  if (!processExists(executablePath)) {
    fail(`${path.basename(appPath)} was not running after LaunchServices hold (${holdMs}ms).`);
  }

  terminateExisting(executablePath);
}

async function verifyExecutableLaunch({ executablePath, holdMs }) {
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
    fail(
      [
        `${appBundleName} exited before ${holdMs}ms (code=${earlyExit.code}, signal=${earlyExit.signal})`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
        stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  await terminate(child);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (process.platform !== "darwin") {
    fail("macOS .app launch verification requires darwin.");
  }

  const {
    appPath,
    holdMs,
    killExisting,
    openApp,
  } = parseVerifyAppLaunchArgs(process.argv.slice(2), {
    defaultAppPath: path.join(
      root,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "macos",
      appBundleName,
    ),
  });
  const executablePath = resolveMacosExecutable(appPath, names);

  if (!Number.isFinite(holdMs) || holdMs < 1000) {
    fail("--hold-ms must be a number >= 1000.");
  }

  if (!fs.existsSync(appPath)) {
    fail(`missing app bundle at ${appPath}; run pnpm desktop:build:app first.`);
  }

  if (!fs.existsSync(executablePath)) {
    fail(`missing app executable at ${executablePath}; run pnpm desktop:build:app first.`);
  }

  if (killExisting) {
    terminateExisting(executablePath);
    await sleep(600);
  }

  if (openApp) {
    await verifyOpenAppLaunch({ appPath, executablePath, holdMs });
  } else {
    await verifyExecutableLaunch({ executablePath, holdMs });
  }

  console.log(
    `[desktop-app-verify] launched ${appPath} for ${holdMs}ms without early exit`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
