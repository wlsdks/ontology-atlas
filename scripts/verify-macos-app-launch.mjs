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
  const ownerNameArg = argv.find((arg) => arg.startsWith("--require-owner-name="));
  const minWindowSizeArg = argv.find((arg) => arg.startsWith("--min-window-size="));

  return {
    appPath: positional[0] ?? defaultAppPath,
    holdMs: holdMsArg ? Number(holdMsArg.slice("--hold-ms=".length)) : defaultHoldMs,
    killExisting: argv.includes("--kill-existing"),
    openApp: argv.includes("--open-app"),
    requireWindow: argv.includes("--require-window"),
    requireOwnerName: ownerNameArg
      ? ownerNameArg.slice("--require-owner-name=".length)
      : null,
    minWindowSize: minWindowSizeArg
      ? parseMinWindowSize(minWindowSizeArg.slice("--min-window-size=".length))
      : null,
  };
}

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-app [path/to/${appBundleName}] [--hold-ms=5000] [--kill-existing] [--open-app] [--require-window] [--require-owner-name="Context Atlas"] [--min-window-size=1040x720]

Launches the packaged macOS .app executable, waits long enough to catch early
startup crashes, then terminates it. This is an unsigned local runtime smoke;
release artifacts still need pnpm desktop:verify-release-dmg.

Options:
  --kill-existing   Terminate already-running copies of this app executable before launch.
  --open-app        Launch through macOS LaunchServices (open -n) instead of spawning the executable directly.
  --require-window  Require an on-screen macOS window owned by the launched app process.
  --require-owner-name=NAME
                    Require the visible app window's macOS owner name to match NAME.
  --min-window-size=WIDTHxHEIGHT
                    Require the visible app window to be at least WIDTH by HEIGHT points.
`);
}

function fail(message) {
  console.error(`[desktop-app-verify] ${message}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseMinWindowSize(value) {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
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

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function existingProcessPatterns({ appPath, executablePath }) {
  return [
    regexEscape(executablePath),
    `${regexEscape(path.basename(appPath))}/Contents/MacOS/${regexEscape(path.basename(executablePath))}`,
  ];
}

function terminateExisting({ appPath, executablePath }) {
  for (const pattern of existingProcessPatterns({ appPath, executablePath })) {
    spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });
  }
}

function processExists(executablePath) {
  const result = spawnSync("pgrep", ["-f", executablePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function processIds(executablePath) {
  const result = spawnSync("pgrep", ["-f", executablePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\s+/)
    .map((pid) => Number(pid))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

export function parseOnscreenWindows(payload, ownerPids) {
  const allowedPids = new Set(ownerPids);
  const windows = JSON.parse(payload);
  if (!Array.isArray(windows)) return [];
  return windows.filter((window) => {
    const bounds = window.kCGWindowBounds;
    return (
      allowedPids.has(window.kCGWindowOwnerPID) &&
      window.kCGWindowIsOnscreen === true &&
      window.kCGWindowLayer === 0 &&
      window.kCGWindowAlpha !== 0 &&
      bounds &&
      Number(bounds.Width) > 0 &&
      Number(bounds.Height) > 0
    );
  });
}

export function validateWindowRequirements(windows, {
  requireOwnerName = null,
  minWindowSize = null,
} = {}) {
  if (requireOwnerName) {
    const matchesOwnerName = windows.some((window) => window.kCGWindowOwnerName === requireOwnerName);
    if (!matchesOwnerName) {
      return `no visible app window has owner name "${requireOwnerName}"`;
    }
  }
  if (minWindowSize) {
    const matchesSize = windows.some((window) => {
      const bounds = window.kCGWindowBounds;
      return (
        bounds &&
        Number(bounds.Width) >= minWindowSize.width &&
        Number(bounds.Height) >= minWindowSize.height
      );
    });
    if (!matchesSize) {
      return `no visible app window is at least ${minWindowSize.width}x${minWindowSize.height}`;
    }
  }
  return null;
}

function readOnscreenWindows() {
  const swift = `
import CoreGraphics
import Foundation

let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
let windows = (CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]]) ?? []
let data = try JSONSerialization.data(withJSONObject: windows, options: [])
print(String(data: data, encoding: .utf8)!)
`;
  const result = spawnSync("swift", ["-e", swift], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(
      [
        "failed to inspect macOS windows with CoreGraphics",
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

function verifyOnscreenWindow({
  appPath,
  executablePath,
  requireOwnerName,
  minWindowSize,
}) {
  const pids = processIds(executablePath);
  if (pids.length === 0) {
    fail(`${path.basename(appPath)} has no running process for ${executablePath}.`);
  }

  const windows = parseOnscreenWindows(readOnscreenWindows(), pids);
  if (windows.length === 0) {
    fail(
      `${path.basename(appPath)} is running but has no on-screen macOS window for PID(s) ${pids.join(", ")}.`,
    );
  }
  const unmetRequirement = validateWindowRequirements(windows, {
    requireOwnerName,
    minWindowSize,
  });
  if (unmetRequirement) {
    fail(
      `${path.basename(appPath)} has ${windows.length} visible window(s), but ${unmetRequirement}.`,
    );
  }
}

async function verifyOpenAppLaunch({
  appPath,
  executablePath,
  holdMs,
  requireWindow,
  requireOwnerName,
  minWindowSize,
}) {
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

  if (requireWindow) {
    verifyOnscreenWindow({
      appPath,
      executablePath,
      requireOwnerName,
      minWindowSize,
    });
  }

  terminateExisting({ appPath, executablePath });
}

async function verifyExecutableLaunch({
  appPath,
  executablePath,
  holdMs,
  requireWindow,
  requireOwnerName,
  minWindowSize,
}) {
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

  if (requireWindow) {
    verifyOnscreenWindow({
      appPath,
      executablePath,
      requireOwnerName,
      minWindowSize,
    });
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
    requireWindow,
    requireOwnerName,
    minWindowSize,
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
  if (process.argv.some((arg) => arg.startsWith("--min-window-size=")) && !minWindowSize) {
    fail("--min-window-size must use WIDTHxHEIGHT, e.g. 1040x720.");
  }
  if ((requireOwnerName || minWindowSize) && !requireWindow) {
    fail("--require-owner-name and --min-window-size require --require-window.");
  }

  if (!fs.existsSync(appPath)) {
    fail(`missing app bundle at ${appPath}; run pnpm desktop:build:app first.`);
  }

  if (!fs.existsSync(executablePath)) {
    fail(`missing app executable at ${executablePath}; run pnpm desktop:build:app first.`);
  }

  if (killExisting) {
    terminateExisting({ appPath, executablePath });
    await sleep(600);
  }

  if (openApp) {
    await verifyOpenAppLaunch({
      appPath,
      executablePath,
      holdMs,
      requireWindow,
      requireOwnerName,
      minWindowSize,
    });
  } else {
    await verifyExecutableLaunch({
      appPath,
      executablePath,
      holdMs,
      requireWindow,
      requireOwnerName,
      minWindowSize,
    });
  }

  console.log(
    `[desktop-app-verify] launched ${appPath} for ${holdMs}ms without early exit${
      requireWindow ? " and with an on-screen window" : ""
    }${requireOwnerName ? ` owned by ${requireOwnerName}` : ""}${
      minWindowSize ? ` at least ${minWindowSize.width}x${minWindowSize.height}` : ""
    }`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
