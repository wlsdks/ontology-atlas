#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
);

const productName = tauriConfig.productName ?? pkg.name;
const holdMsArg = process.argv.find((arg) => arg.startsWith("--hold-ms="));
const holdMs = holdMsArg ? Number(holdMsArg.slice("--hold-ms=".length)) : 5000;
const appPath =
  process.argv.slice(2).find((arg) => !arg.startsWith("-")) ??
  path.join(
    root,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    `${productName}.app`,
  );
const executablePath = path.join(appPath, "Contents", "MacOS", productName);

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-app [path/to/${productName}.app] [--hold-ms=5000]

Launches the packaged macOS .app executable, waits long enough to catch early
startup crashes, then terminates it. This is an unsigned local runtime smoke;
release artifacts still need pnpm desktop:verify-release-dmg.
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

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (process.platform !== "darwin") {
  fail("macOS .app launch verification requires darwin.");
}

if (!Number.isFinite(holdMs) || holdMs < 1000) {
  fail("--hold-ms must be a number >= 1000.");
}

if (!fs.existsSync(appPath)) {
  fail(`missing app bundle at ${appPath}; run pnpm desktop:build:app first.`);
}

if (!fs.existsSync(executablePath)) {
  fail(`missing app executable at ${executablePath}; run pnpm desktop:build:app first.`);
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
  fail(
    [
      `${productName}.app exited before ${holdMs}ms (code=${earlyExit.code}, signal=${earlyExit.signal})`,
      stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
      stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

await terminate(child);

console.log(`[desktop-app-verify] launched ${appPath} for ${holdMs}ms without early exit`);
