#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { constants, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VAULT_DIR_ENV } from "./look/open-vault.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SAMPLE_VAULT = path.join(ROOT, "samples/storefront");
const SETUP = path.join(ROOT, "scripts/design/look/open-vault.mjs");
// Playwright owns 3100 (dev) and 3110 (static export); a look must never answer for either.
const RESERVED_PORTS = new Set([3100, 3110]);
const SERVER_READY_TIMEOUT_MS = 30_000;
const USAGE =
  "usage: pnpm ui:look -- --route=<path> [--route=...] [--vault=fixture|sample|<dir>] [--widths=1440] [--height=900] [--url=<base>] [--out=<dir>] [--audit]";

export function parseLookArgs(argv) {
  const opts = { routes: [], vault: "fixture", widths: [1440], height: 900, audit: false };
  for (const arg of argv) {
    if (arg === "--") continue;
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    const value = rest.join("=");
    if (key === "route" && value) opts.routes.push(value);
    else if (key === "vault" && value) opts.vault = value;
    else if (key === "widths") opts.widths = parsePositiveList(value, "--widths");
    else if (key === "height") opts.height = parsePositiveList(value, "--height")[0];
    else if (key === "url" && value) opts.url = value.replace(/\/$/, "");
    else if (key === "out" && value) opts.out = value;
    else if (arg === "--audit") opts.audit = true;
    else throw new Error(`unknown argument: ${arg}\n${USAGE}`);
  }
  if (opts.routes.length === 0) throw new Error(USAGE);
  return opts;
}

function parsePositiveList(value, flag) {
  const numbers = value.split(",").map(Number);
  if (!value || numbers.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error(`${flag} takes positive integers, got "${value}"`);
  return numbers;
}

/** `fixture` seeds the e2e fixture vault; `sample` and a directory seed that folder's Markdown files. */
export function resolveVaultSource(value, { cwd = process.cwd() } = {}) {
  if (value === "fixture") return { kind: "fixture" };
  if (value === "sample") return { kind: "dir", dir: SAMPLE_VAULT };
  if (value.startsWith("synthetic:")) throw new Error(`--vault=${value}: synthetic vaults are not yet supported; use fixture, sample or a directory`);
  const dir = path.resolve(cwd, value);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`--vault=${value}: ${dir} is not a directory`);
  return { kind: "dir", dir };
}

/** The file name `ui:audit --shots` writes for one route and width. */
export function shotName(route, width) {
  return `${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root"}@${width}.png`;
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: ["ignore", process.stderr, "inherit"] });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function freePort() {
  for (;;) {
    const port = await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.on("error", reject);
      probe.listen(0, "127.0.0.1", () => {
        const { port: chosen } = probe.address();
        probe.close(() => resolve(chosen));
      });
    });
    if (!RESERVED_PORTS.has(port)) return port;
  }
}

async function waitForServer(base) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const answered = await fetch(`${base}/`).then((response) => response.status < 500, () => false);
    if (answered) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the static export server at ${base} did not answer within ${SERVER_READY_TIMEOUT_MS} ms`);
}

/** Serves `out/` on a free port until `stop` is called or this process exits. */
async function serveStaticExport() {
  const port = await freePort();
  const server = spawn(process.execPath, ["scripts/web/serve-static-export.mjs", `--port=${port}`], {
    cwd: ROOT,
    stdio: ["ignore", process.stderr, "inherit"],
  });
  const stop = () => {
    if (server.exitCode === null && server.signalCode === null) server.kill();
  };
  process.on("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      stop();
      process.exit(128 + constants.signals[signal]);
    });
  }
  const base = `http://127.0.0.1:${port}`;
  await waitForServer(base);
  return { base, stop };
}

async function main() {
  const callerCwd = process.env.INIT_CWD ?? process.cwd();
  const opts = parseLookArgs(process.argv.slice(2));
  const vault = resolveVaultSource(opts.vault, { cwd: callerCwd });
  const out = opts.out ? path.resolve(callerCwd, opts.out) : mkdtempSync(path.join(tmpdir(), "ui-look-"));
  mkdirSync(out, { recursive: true });
  const shots = opts.routes.flatMap((route) => opts.widths.map((width) => path.join(out, shotName(route, width))));
  for (const shot of shots) rmSync(shot, { force: true });

  let server = null;
  if (!opts.url) {
    const built = await run("pnpm", ["build:static"]);
    if (built !== 0) return built;
    server = await serveStaticExport();
  }
  try {
    const auditStatus = await run(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "scripts/design/ui-audit.mjs",
        `--url=${opts.url ?? server.base}`,
        ...opts.routes.map((route) => `--route=${route}`),
        `--widths=${opts.widths.join(",")}`,
        `--height=${opts.height}`,
        `--setup=${SETUP}`,
        `--shots=${out}`,
      ],
      { ...process.env, [VAULT_DIR_ENV]: vault.kind === "dir" ? vault.dir : "" },
    );
    const missing = shots.filter((shot) => !existsSync(shot));
    for (const shot of shots) if (!missing.includes(shot)) console.log(shot);
    for (const shot of missing) console.error(`[ui:look] no screenshot was written: ${shot}`);
    if (missing.length > 0) return 1;
    return opts.audit ? auditStatus : 0;
  } finally {
    server?.stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`[ui:look] ${error.message}`);
      process.exit(1);
    },
  );
}
