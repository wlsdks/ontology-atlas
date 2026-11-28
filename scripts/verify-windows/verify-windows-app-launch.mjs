#!/usr/bin/env node
/**
 * Launches the installed Windows app with the WebView verifier and requires the route it was told to open to
 * render. The verifier is the app's own (`src-tauri/src/webview_verify/`), which prints three kinds of line:
 *   [ontology-atlas-verify-vault] root=… granted=true       the fixture vault was granted for this launch
 *   [ontology-atlas-verify-route] route=… arrived=true      the window reached the route
 *   [ontology-atlas-webview-verify] {json}                  what the document holds (title, body text, markers)
 * The lines come over the pipes this script gives the process. The app is a GUI-subsystem executable, and Windows
 * hands such a process the standard handles its parent names in `STARTUPINFO` (`STARTF_USESTDHANDLES`), which
 * Node sets for piped stdio; a run whose pipes stay empty fails here with that said, not silently.
 *
 * The document report is judged by `validateWebviewVerifyPayload`, the macOS verifier's own judgement, so a map
 * that drew no pixels fails here as it does there. On success the script prints `SUCCESS_LINE`, which the
 * workflow requires as well as the exit code: a script that did not run its entry point also exits 0.
 *
 *   node scripts/verify-windows/verify-windows-app-launch.mjs --app=<ontology-atlas.exe> --vault=<folder> [--route=/en/topology/]
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { validateFixtureVaultGrant, validateWebviewVerifyPayload } from "../lib/verify-macos/payload-contract.mjs";
import { parseWebviewVerifyPayload } from "../lib/verify-macos/relation-marker-validators.mjs";
import {
  WEBVIEW_VERIFY_ENV,
  WEBVIEW_VERIFY_ROUTE_ENV,
  WEBVIEW_VERIFY_VAULT_ENV,
} from "../lib/verify-macos/webview-env.mjs";

const DEFAULT_ROUTE = "/en/topology/";
const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_MS = 250;

export const successLine = (route) => `[verify-windows] ${route} rendered in the installed app`;

/** What is still wrong with a launch's output so far; empty once the route has rendered. */
export function launchProblems(stdout, { route = DEFAULT_ROUTE, vault } = {}) {
  const problems = [];
  const arrival = new RegExp(`^\\[ontology-atlas-verify-route\\] route=${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} arrived=true\\b`, "m");
  if (!arrival.test(stdout.replace(/\r/g, ""))) {
    problems.push(`the app never reported arriving at ${route} ([ontology-atlas-verify-route] … arrived=true)`);
  }

  const payload = parseWebviewVerifyPayload(stdout);
  if (!payload) {
    const grant = validateFixtureVaultGrant(stdout);
    if (grant) problems.push(grant);
    problems.push("the app printed no WebView document report ([ontology-atlas-webview-verify] {…})");
    return problems;
  }
  const error = validateWebviewVerifyPayload(payload, { expectedPath: route, expectedFixtureVault: vault, launchStdout: stdout });
  if (error) problems.push(error);
  return problems;
}

/** Ends the app and what it started: the WebView host is a child process, and Windows has no process groups to signal. */
function endProcessTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}

export async function verifyWindowsAppLaunch({ app, args = [], vault, route = DEFAULT_ROUTE, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env } = {}) {
  if (!app) throw new Error("--app is required");
  if (!vault) throw new Error("--vault is required");
  const child = spawn(app, args, {
    env: { ...env, [WEBVIEW_VERIFY_ENV]: "1", [WEBVIEW_VERIFY_ROUTE_ENV]: route, [WEBVIEW_VERIFY_VAULT_ENV]: vault },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (text) => (stdout += text));
  child.stderr.setEncoding("utf8").on("data", (text) => (stderr += text));
  let exit = null;
  child.on("exit", (code, signal) => (exit = { code, signal }));
  child.on("error", (error) => (exit = { code: null, signal: null, error }));

  const deadline = Date.now() + timeoutMs;
  let problems = launchProblems(stdout, { route, vault });
  try {
    while (problems.length > 0 && Date.now() < deadline && exit === null) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      problems = launchProblems(stdout, { route, vault });
    }
    // The process may print its last lines and leave in the same tick.
    if (problems.length > 0) problems = launchProblems(stdout, { route, vault });
  } finally {
    endProcessTree(child);
  }
  if (problems.length === 0) return { ok: true, problems, stdout };
  const lead = [];
  if (exit !== null) lead.push(`the app exited early (${exit.error?.message ?? `code ${exit.code}, signal ${exit.signal}`})`);
  if (stdout.trim() === "") lead.push("the app printed nothing over its pipes, so the verifier's output did not reach this job (a GUI-subsystem process may not have inherited them)");
  return { ok: false, problems: [...lead, ...problems], stdout, stderr };
}

function argument(argv, name) {
  return argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/** Whether this file is the command Node was started with: real paths, so a drive letter's case or a link does not matter. */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const argv = process.argv.slice(2);
  const route = argument(argv, "route") ?? DEFAULT_ROUTE;
  const timeoutMs = Number(argument(argv, "timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  const result = await verifyWindowsAppLaunch({ app: argument(argv, "app"), vault: argument(argv, "vault"), route, timeoutMs });
  if (result.ok) {
    console.log(successLine(route));
  } else {
    console.error(`[verify-windows] ${route} did not render in the installed app:`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    console.error(`--- app stdout (last 2,000 characters) ---\n${result.stdout.slice(-2000)}`);
    if (result.stderr) console.error(`--- app stderr (last 1,000 characters) ---\n${result.stderr.slice(-1000)}`);
    process.exitCode = 1;
  }
}
