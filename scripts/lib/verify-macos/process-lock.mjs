import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { normalizeAppPath, sleep } from "./cli-args.mjs";
import { GRACEFUL_QUIT_COMMAND_TIMEOUT_MS, STALE_PROCESS_EXIT_TIMEOUT_MS, STALE_PROCESS_POLL_MS } from "./webview-env.mjs";

export const INSTALLED_APP_CANDIDATE_DIRS = [
  "/Applications",
  path.join(os.homedir(), "Applications"),
];


export function verifyLockPath(appPath) {
  const digest = crypto
    .createHash("sha256")
    .update(path.resolve(appPath))
    .digest("hex")
    .slice(0, 16);
  return path.join(os.tmpdir(), `ontology-atlas-verify-app-${digest}.lock`);
}


export function pidIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}


export function readLockOwner(lockDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}


export function createVerifyLock(lockDir, { appPath, pid = process.pid } = {}) {
  try {
    fs.mkdirSync(lockDir);
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({
        pid,
        appPath: appPath ? path.resolve(appPath) : null,
        startedAt: new Date().toISOString(),
      }),
    );
    return {
      ok: true,
      release: () => fs.rmSync(lockDir, { recursive: true, force: true }),
    };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const owner = readLockOwner(lockDir);
    if (owner && !pidIsRunning(Number(owner.pid))) {
      fs.rmSync(lockDir, { recursive: true, force: true });
      return createVerifyLock(lockDir, { appPath, pid });
    }
    const ownerLabel = owner?.pid ? `pid=${owner.pid}` : "unknown owner";
    return {
      ok: false,
      message:
        `another desktop app verification is already running for this app (${ownerLabel}); ` +
        "run desktop:verify-app commands sequentially so --kill-existing cannot terminate a sibling verifier",
      release: () => undefined,
    };
  }
}


export function readBundleIdentifier(appPath) {
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(plistPath)) return null;
  const result = spawnSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleIdentifier", plistPath],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}


export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}


export function compactOntologyHandle(value) {
  const text = String(value || "");
  const separatorIndex = text.indexOf(":");
  return separatorIndex >= 0 ? text.slice(separatorIndex + 1) : text;
}


export function gracefulQuitCommandOptions() {
  return { stdio: "ignore", timeout: GRACEFUL_QUIT_COMMAND_TIMEOUT_MS };
}


export function installedAppBundleCandidates(appBundleName) {
  return INSTALLED_APP_CANDIDATE_DIRS
    .map((dir) => path.join(dir, appBundleName))
    .filter((appPath) => fs.existsSync(appPath));
}


export function bundlePathConflictWarnings({
  targetAppPath,
  targetBundleIdentifier,
  candidates,
}) {
  if (!targetBundleIdentifier) return [];
  const normalizedTarget = normalizeAppPath(targetAppPath);
  return candidates
    .filter(
      (candidate) =>
        candidate.bundleIdentifier === targetBundleIdentifier &&
        normalizeAppPath(candidate.appPath) !== normalizedTarget,
    )
    .map(
      (candidate) =>
        `${normalizeAppPath(candidate.appPath)} shares bundle id ${targetBundleIdentifier} with the verified app; app-name Computer Use may attach to that installed copy unless the Run script refreshed it, so use the full built app path when exact bundle provenance matters.`,
    );
}


export function printBundlePathConflictWarnings({ appPath, appBundleName }) {
  const targetBundleIdentifier = readBundleIdentifier(appPath);
  const candidates = installedAppBundleCandidates(appBundleName).map((candidatePath) => ({
    appPath: candidatePath,
    bundleIdentifier: readBundleIdentifier(candidatePath),
  }));
  for (const warning of bundlePathConflictWarnings({
    targetAppPath: appPath,
    targetBundleIdentifier,
    candidates,
  })) {
    console.warn(`[desktop-app-verify] warning: ${warning}`);
  }
}


export async function terminate(child, { appPath = null, executablePath = null, appName = null } = {}) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (appPath || appName) {
    const bundleIdentifier = appPath ? readBundleIdentifier(appPath) : null;
    for (const { command, args } of gracefulQuitExistingAppCommands({
      appName,
      bundleIdentifier,
    })) {
      spawnSync(command, args, gracefulQuitCommandOptions());
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(2500),
    ]);
    if (child.exitCode !== null || child.signalCode !== null) return;
  }
  if (executablePath && processIds(executablePath).length === 0) return;
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


export function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


export function existingProcessPatterns({ executablePath }) {
  const executableName = path.basename(executablePath);
  return [
    regexEscape(executablePath),
    `\\.app/Contents/MacOS/${regexEscape(executableName)}$`,
  ];
}


export function gracefulQuitExistingAppCommands({ appName, bundleIdentifier }) {
  return [
    bundleIdentifier
      ? {
          command: "osascript",
          args: ["-e", `tell application id ${JSON.stringify(bundleIdentifier)} to quit`],
        }
      : null,
    appName
      ? {
          command: "osascript",
          args: ["-e", `tell application ${JSON.stringify(appName)} to quit`],
        }
      : null,
  ].filter(Boolean);
}


export function terminateExisting({ appPath, executablePath, appName = null }) {
  const bundleIdentifier = readBundleIdentifier(appPath);
  for (const { command, args } of gracefulQuitExistingAppCommands({
    appName,
    bundleIdentifier,
  })) {
    spawnSync(command, args, gracefulQuitCommandOptions());
  }
  const gracefulQuitWaitUntil = Date.now() + 2500;
  while (processIds(executablePath).length > 0 && Date.now() < gracefulQuitWaitUntil) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (processIds(executablePath).length === 0) return;
  for (const pattern of existingProcessPatterns({ appPath, executablePath })) {
    spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });
  }
}


export function processExists(executablePath) {
  const result = spawnSync("pgrep", ["-f", executablePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}


export function processIds(executablePath) {
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


export function processIdsForPattern(pattern) {
  const result = spawnSync("pgrep", ["-f", pattern], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\s+/)
    .map((pid) => Number(pid))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}


export function existingProcessIds({ appPath, executablePath }) {
  const pids = new Set();
  for (const pattern of existingProcessPatterns({ appPath, executablePath })) {
    for (const pid of processIdsForPattern(pattern)) {
      pids.add(pid);
    }
  }
  return Array.from(pids).sort((a, b) => a - b);
}


export async function waitForExistingProcessesToExit({
  appPath,
  executablePath,
  timeoutMs = STALE_PROCESS_EXIT_TIMEOUT_MS,
  intervalMs = STALE_PROCESS_POLL_MS,
  readProcessIds = existingProcessIds,
  sleepFn = sleep,
} = {}) {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  let pids = readProcessIds({ appPath, executablePath });
  for (let attempt = 0; pids.length > 0 && attempt < attempts; attempt += 1) {
    await sleepFn(intervalMs);
    pids = readProcessIds({ appPath, executablePath });
  }
  return pids;
}

