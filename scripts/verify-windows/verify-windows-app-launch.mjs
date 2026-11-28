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
 *   node scripts/verify-windows/verify-windows-app-launch.mjs --app=<ontology-atlas.exe> --vault=<folder> [--route=/en/topology/]
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateFixtureVaultGrant } from "../lib/verify-macos/payload-contract.mjs";
import { parseWebviewVerifyPayload } from "../lib/verify-macos/relation-marker-validators.mjs";
import {
  WEBVIEW_VERIFY_ENV,
  WEBVIEW_VERIFY_ROUTE_ENV,
  WEBVIEW_VERIFY_VAULT_ENV,
  webviewWorkbenchMarkersForPath,
} from "../lib/verify-macos/webview-env.mjs";

export const DEFAULT_ROUTE = "/en/topology/";
const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_MS = 250;
/** WebView2 serves the app from `http://tauri.localhost`; macOS and Linux use `tauri://localhost`. */
const APP_ORIGINS = ["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"];

/** What is still wrong with a launch's output so far; empty once the route has rendered. */
export function launchProblems(stdout, { route = DEFAULT_ROUTE } = {}) {
  const problems = [];
  const grant = validateFixtureVaultGrant(stdout);
  if (grant) problems.push(grant);

  const arrival = new RegExp(`^\\[ontology-atlas-verify-route\\] route=${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} arrived=true\\b`, "m");
  if (!arrival.test(stdout.replace(/\r/g, ""))) {
    problems.push(`the app never reported arriving at ${route} ([ontology-atlas-verify-route] … arrived=true)`);
  }

  const payload = parseWebviewVerifyPayload(stdout);
  if (!payload) {
    problems.push("the app printed no WebView document report ([ontology-atlas-webview-verify] {…})");
    return problems;
  }
  let location;
  try {
    location = new URL(payload.href);
  } catch {
    problems.push(`the WebView reported no address (href=${payload.href ?? "missing"})`);
    return problems;
  }
  if (!APP_ORIGINS.includes(location.origin === "null" ? `${location.protocol}//${location.host}` : location.origin)) {
    problems.push(`the WebView was at ${location.origin}, not the app's own origin (${APP_ORIGINS.join(" or ")})`);
  }
  if (location.pathname !== route) problems.push(`the WebView was at ${location.pathname}, expected ${route}`);
  if (payload.readyState !== "complete") problems.push(`the document was not complete (readyState=${payload.readyState ?? "unknown"})`);
  if (!/Ontology Atlas/.test(payload.title ?? "")) problems.push(`the document title was "${payload.title ?? ""}", not the app's`);
  if (typeof payload.bodyText !== "string" || payload.bodyText.trim() === "") {
    problems.push("the document body was empty");
  } else if (!webviewWorkbenchMarkersForPath(route).every((marker) => marker.test(payload.bodyText))) {
    problems.push(`the document body did not hold the words the ${route} screen draws`);
  }
  if (payload.markers?.verificationFixtureVaultError) problems.push(`the fixture vault bootstrap failed: ${payload.markers.verificationFixtureVaultError}`);
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
  let problems = launchProblems(stdout, { route });
  try {
    while (problems.length > 0 && Date.now() < deadline && exit === null) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      problems = launchProblems(stdout, { route });
    }
    // The process may print its last lines and leave in the same tick.
    if (problems.length > 0) problems = launchProblems(stdout, { route });
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const route = argument(argv, "route") ?? DEFAULT_ROUTE;
  const timeoutMs = Number(argument(argv, "timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  const result = await verifyWindowsAppLaunch({ app: argument(argv, "app"), vault: argument(argv, "vault"), route, timeoutMs });
  if (result.ok) {
    console.log(`[verify-windows] ${route} rendered in the installed app`);
  } else {
    console.error(`[verify-windows] ${route} did not render in the installed app:`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    console.error(`--- app stdout (last 2,000 characters) ---\n${result.stdout.slice(-2000)}`);
    if (result.stderr) console.error(`--- app stderr (last 1,000 characters) ---\n${result.stderr.slice(-1000)}`);
    process.exitCode = 1;
  }
}
