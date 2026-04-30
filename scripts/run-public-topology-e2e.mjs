#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const ROOT_DIR = process.cwd();
const APP_PORT = 3201;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const PLAYWRIGHT_OUTPUT_DIR = path.join(ROOT_DIR, "output/playwright/test-results");
const NEXT_DEV_LOCK_PATH = path.join(ROOT_DIR, ".next/dev/lock");
const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  "demo-aslan-project-map";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST is required. Run this through firebase emulators:exec.");
}

function prefixStream(stream, prefix) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length > 0) {
        process.stdout.write(`${prefix} ${line}\n`);
      }
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      process.stdout.write(`${prefix} ${buffer}\n`);
    }
  });
}

function startProcess(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: ROOT_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  prefixStream(child.stdout, `[${label}]`);
  prefixStream(child.stderr, `[${label}]`);
  return child;
}

function runCommand(label, command, args, env) {
  return new Promise((resolve, reject) => {
    const child = startProcess(label, command, args, env);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function waitForHttp(url, timeoutMs = 90_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Wait until the server becomes reachable.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.killed) return;

  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5_000).then(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

async function stopExistingRepoDevServer() {
  try {
    const raw = await fs.readFile(NEXT_DEV_LOCK_PATH, "utf8");
    const lock = JSON.parse(raw);
    if (typeof lock.pid === "number" && lock.pid > 0 && lock.pid !== process.pid) {
      process.kill(lock.pid, "SIGTERM");
      await delay(1_000);
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      console.warn("[cleanup] failed to stop existing next dev server:", error);
    }
  }
}

await fs.rm(PLAYWRIGHT_OUTPUT_DIR, { recursive: true, force: true });

const baseEnv = {
  ...process.env,
  CI: "1",
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo.local",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-bucket.local",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "demo-sender",
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "demo-app",
  NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "1",
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
};

let appProcess;

try {
  await stopExistingRepoDevServer();
  await runCommand("seed", "node", ["scripts/seed-emulator.mjs"], baseEnv);

  appProcess = startProcess(
    "next",
    "pnpm",
    ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(APP_PORT)],
    baseEnv,
  );
  await waitForHttp(`${APP_URL}/`);

  await runCommand(
    "playwright",
    "pnpm",
    ["exec", "playwright", "test", "tests/e2e/public-topology.spec.ts"],
    {
      ...baseEnv,
      PLAYWRIGHT_BASE_URL: APP_URL,
    },
  );
} finally {
  await stopProcess(appProcess);
  await fs.rm(PLAYWRIGHT_OUTPUT_DIR, { recursive: true, force: true });
}
