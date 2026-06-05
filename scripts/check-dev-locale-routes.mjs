#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export const DEFAULT_DEV_ROUTE_TIMEOUT_MS = 30000;
export const DEFAULT_DEV_ROUTE_PATHS = [
  "/",
  "/en/",
  "/ko/",
  "/en/docs/",
  "/ko/docs/?slug=ontology%2Fcapabilities%2Fagent-graph-readiness",
  "/ko/ontology/?node=capability%3Aagent-graph-readiness",
];

function printHelp() {
  console.log(`Usage: pnpm dev:route-smoke [--port=<port>] [--base-url=http://localhost:3000] [--timeout-ms=${DEFAULT_DEV_ROUTE_TIMEOUT_MS}]

Starts a temporary Next dev server, or checks an already-running server when
--base-url is provided, then verifies the locale-prefixed workbench routes used
for browser design checks return 2xx responses.
`);
}

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    port: null,
    timeoutMs: DEFAULT_DEV_ROUTE_TIMEOUT_MS,
  };

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith("--port=")) {
      const value = Number(arg.slice("--port=".length));
      if (!Number.isInteger(value) || value <= 0 || value > 65535) {
        throw new Error(`--port must be an integer from 1 to 65535, got ${arg}`);
      }
      options.port = value;
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      const value = arg.slice("--base-url=".length).replace(/\/+$/, "");
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("--base-url must use http or https.");
      }
      options.baseUrl = value;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      const value = Number(arg.slice("--timeout-ms=".length));
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`--timeout-ms must be a positive number, got ${arg}`);
      }
      options.timeoutMs = value;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (typeof port === "number") resolve(port);
        else reject(new Error("failed to allocate an open port"));
      });
    });
  });
}

function waitForReady(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`dev server did not become ready within ${timeoutMs}ms\n${output}`));
    }, timeoutMs);

    const onData = (chunk) => {
      output += chunk.toString();
      if (/Ready in/i.test(output)) {
        clearTimeout(timeout);
        resolve(output);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`dev server exited before ready: code=${code} signal=${signal}\n${output}`));
    });
  });
}

async function requestStatus(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await requestStatusOnce(url, Math.min(2000, timeoutMs));
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw lastError ?? new Error(`request timed out after ${timeoutMs}ms: ${url}`);
}

function requestStatusOnce(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(
      parsed,
      {
        headers: { "User-Agent": "ontology-atlas-dev-route-smoke" },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`request timed out after ${timeoutMs}ms: ${url}`));
    });
    request.on("error", reject);
  });
}

export async function evaluateDevLocaleRoutes({
  baseUrl,
  paths = DEFAULT_DEV_ROUTE_PATHS,
  timeoutMs = DEFAULT_DEV_ROUTE_TIMEOUT_MS,
}) {
  const checks = [];
  for (const path of paths) {
    const url = new URL(path, baseUrl).toString();
    const status = await requestStatus(url, timeoutMs);
    checks.push({
      path,
      url,
      status,
      ok: status >= 200 && status < 300,
    });
  }
  const failed = checks.filter((check) => !check.ok);
  return {
    ok: failed.length === 0,
    checks,
    failed,
  };
}

function renderReport(report) {
  const lines = ["[dev-route-smoke] Next dev locale route smoke"];
  for (const check of report.checks) {
    lines.push(`${check.ok ? "✓" : "✗"} ${check.status} ${check.path}`);
  }
  lines.push(`[dev-route-smoke] ${report.ok ? "ready" : "blocked"}`);
  return lines.join("\n");
}

function formatError(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `; cause=${error.cause.message}` : "";
  return `${error.message}${cause}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.baseUrl) {
    try {
      const report = await evaluateDevLocaleRoutes({
        baseUrl: options.baseUrl,
        timeoutMs: Math.min(options.timeoutMs, 10000),
      });
      console.log(renderReport(report));
      if (!report.ok) {
        const failures = report.failed
          .map((check) => `${check.path} returned HTTP ${check.status}`)
          .join("; ");
        throw new Error(failures);
      }
    } catch (error) {
      console.error(`[dev-route-smoke] ${formatError(error)}`);
      process.exitCode = 1;
    }
    return;
  }

  const port = options.port ?? (await getOpenPort());
  const baseUrl = `http://localhost:${port}`;
  const child = spawn("pnpm", ["dev", "--port", String(port)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let readyOutput = "";
  try {
    readyOutput = await waitForReady(child, options.timeoutMs);
    const report = await evaluateDevLocaleRoutes({
      baseUrl,
      timeoutMs: Math.min(options.timeoutMs, 10000),
    });
    console.log(renderReport(report));
    if (!report.ok) {
      const failures = report.failed
        .map((check) => `${check.path} returned HTTP ${check.status}`)
        .join("; ");
      throw new Error(failures);
    }
  } catch (error) {
    if (readyOutput) {
      console.error("[dev-route-smoke] server output before failure:");
      console.error(readyOutput.trim());
    }
    console.error(`[dev-route-smoke] ${formatError(error)}`);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
