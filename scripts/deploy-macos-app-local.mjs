#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadMacosReleaseNames, resolveMacosExecutable } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const DEFAULT_ROUTE = "/en/topology/";
const DEFAULT_SCREENSHOT = path.join(root, ".tmp", "ontology-atlas-deployed-relief.png");
const DEFAULT_WEBVIEW_EVIDENCE = path.join(
  root,
  ".tmp",
  "ontology-atlas-deployed-relief.webview.json",
);
const DEFAULT_MIN_WINDOW_SIZE = "1360x840";
const DEFAULT_MIN_WEBVIEW_SIZE = "1400x860";
const PROCESS_EXIT_TIMEOUT_MS = 6000;
const PROCESS_POLL_MS = 250;

function readMacosAppleLanguages() {
  const result = spawnSync("defaults", ["read", "-g", "AppleLanguages"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout : "";
}

export function resolveDefaultDeployRoute({
  env = process.env,
  appleLanguagesRaw = readMacosAppleLanguages(),
} = {}) {
  const preferredLanguages = String(appleLanguagesRaw || "").toLowerCase();
  if (preferredLanguages.includes("ko")) return "/ko/topology/";

  const envLocale = [
    env.LC_ALL,
    env.LC_MESSAGES,
    env.LANG,
  ].find(Boolean);
  return String(envLocale || "").toLowerCase().startsWith("ko")
    ? "/ko/topology/"
    : DEFAULT_ROUTE;
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseDeployMacosAppArgs(argv, defaultRouteOptions = {}) {
  const option = (prefix) => {
    const arg = argv.find((entry) => entry.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : null;
  };

  return {
    skipBuild: argv.includes("--skip-build"),
    leaveRunning: !argv.includes("--no-leave-running"),
    verifyTopologyDrag: !argv.includes("--no-topology-drag"),
    requireScreenshot: argv.includes("--require-screenshot"),
    visualEvidence: !argv.includes("--no-visual-evidence"),
    route: option("--route=") || resolveDefaultDeployRoute(defaultRouteOptions),
    holdMs: Number(option("--hold-ms=") || 12000),
    minWindowSize: option("--min-window-size=") || DEFAULT_MIN_WINDOW_SIZE,
    minWebviewSize: option("--min-webview-size=") || DEFAULT_MIN_WEBVIEW_SIZE,
    screenshotPath: option("--screenshot=") || DEFAULT_SCREENSHOT,
    webviewEvidencePath: option("--webview-evidence=") || DEFAULT_WEBVIEW_EVIDENCE,
    installPath:
      option("--install-path=") || path.join("/Applications", names.appBundleName),
    builtAppPath:
      option("--built-app=") ||
      path.join(root, "src-tauri", "target", "release", "bundle", "macos", names.appBundleName),
  };
}

export function buildDeployMacosAppPlan(options) {
  const baseVerifyArgs = [
    "desktop:verify-app",
    options.installPath,
    "--kill-existing",
    `--hold-ms=${options.holdMs}`,
    `--require-webview-route=${options.route}`,
  ];
  const verifyArgs = [...baseVerifyArgs];
  if (options.visualEvidence || options.requireScreenshot) {
    verifyArgs.push(
      "--require-window",
      `--require-owner-name=${names.appName}`,
      `--min-window-size=${options.minWindowSize}`,
    );
  }
  if (options.visualEvidence && !options.requireScreenshot) {
    verifyArgs.push(`--try-window-screenshot=${options.screenshotPath}`);
  }
  verifyArgs.push(
    `--min-webview-size=${options.minWebviewSize}`,
    `--webview-evidence=${options.webviewEvidencePath}`,
  );
  if (options.requireScreenshot) {
    verifyArgs.splice(
      4,
      0,
      "--require-capturable-window",
      `--window-screenshot=${options.screenshotPath}`,
    );
  }
  if (options.leaveRunning) verifyArgs.push("--leave-running");
  if (options.verifyTopologyDrag) verifyArgs.push("--verify-topology-drag");

  const fallbackVerifyArgs = [
    ...baseVerifyArgs,
    `--min-webview-size=${options.minWebviewSize}`,
    `--webview-evidence=${options.webviewEvidencePath}`,
  ];
  if (options.leaveRunning) fallbackVerifyArgs.push("--leave-running");
  if (options.verifyTopologyDrag) fallbackVerifyArgs.push("--verify-topology-drag");

  return {
    build: options.skipBuild ? null : ["pnpm", ["desktop:build:app"]],
    quit: ["osascript", ["-e", `tell application "${names.appName}" to quit`]],
    removeInstalled: ["rm", ["-rf", options.installPath]],
    copyInstalled: ["ditto", [options.builtAppPath, options.installPath]],
    verify: ["pnpm", verifyArgs],
    fallbackVerify:
      options.requireScreenshot || (!options.visualEvidence && !options.requireScreenshot)
        ? null
        : ["pnpm", fallbackVerifyArgs],
  };
}

export function summarizeDeployMacosAppEvidence(
  options,
  {
    screenshotExists = fs.existsSync(options.screenshotPath),
    usedFallback = false,
  } = {},
) {
  const screenshot = options.requireScreenshot
    ? screenshotExists
      ? options.screenshotPath
      : `missing-required:${options.screenshotPath}`
    : options.visualEvidence
      ? screenshotExists
        ? options.screenshotPath
        : usedFallback
          ? `unavailable-after-window-fallback:${options.screenshotPath}`
          : `attempted-no-file:${options.screenshotPath}`
      : "not requested";
  const visualEvidence = options.visualEvidence
    ? screenshotExists
      ? options.screenshotPath
      : usedFallback
        ? "unavailable; window/capture verification failed and deterministic WebView fallback passed"
        : "attempted; no screenshot artifact saved"
    : "disabled";
  return {
    screenshot,
    visualEvidence,
    webviewEvidence: options.webviewEvidencePath,
  };
}

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }
  return result.status ?? 0;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function installedProcessPatterns(installPath) {
  const executablePath = resolveMacosExecutable(installPath, names);
  const executableName = path.basename(executablePath);
  return [...new Set([
    executablePath,
    `${installPath}/Contents/MacOS/${executableName}`,
    `\\.app/Contents/MacOS/${regexEscape(executableName)}$`,
  ])];
}

function anyProcessMatches(patterns) {
  return patterns.some((pattern) => {
    const result = spawnSync("pgrep", ["-f", pattern], { stdio: "ignore" });
    return result.status === 0;
  });
}

function waitForNoInstalledProcess(installPath, timeoutMs = PROCESS_EXIT_TIMEOUT_MS) {
  const patterns = installedProcessPatterns(installPath);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!anyProcessMatches(patterns)) return true;
    sleepSync(PROCESS_POLL_MS);
  }
  return !anyProcessMatches(patterns);
}

function forceKillInstalledProcess(installPath) {
  for (const pattern of installedProcessPatterns(installPath)) {
    spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });
  }
}

function main() {
  const options = parseDeployMacosAppArgs(process.argv.slice(2));
  const plan = buildDeployMacosAppPlan(options);

  if (plan.build) run(plan.build[0], plan.build[1]);
  if (!fs.existsSync(options.builtAppPath)) {
    console.error(`[desktop-deploy-app] missing built app: ${options.builtAppPath}`);
    console.error("[desktop-deploy-app] run without --skip-build or build the app first.");
    process.exit(1);
  }

  if (options.visualEvidence || options.requireScreenshot) {
    fs.mkdirSync(path.dirname(options.screenshotPath), { recursive: true });
    fs.rmSync(options.screenshotPath, { force: true });
  }
  run(plan.quit[0], plan.quit[1], { allowFailure: true });
  if (!waitForNoInstalledProcess(options.installPath)) {
    forceKillInstalledProcess(options.installPath);
    if (!waitForNoInstalledProcess(options.installPath)) {
      console.error(
        `[desktop-deploy-app] ${options.installPath} is still running; refusing to replace the app bundle.`,
      );
      process.exit(1);
    }
  }
  run(plan.removeInstalled[0], plan.removeInstalled[1]);
  run(plan.copyInstalled[0], plan.copyInstalled[1]);
  const verifyStatus = run(plan.verify[0], plan.verify[1], {
    allowFailure: plan.fallbackVerify !== null,
  });
  let usedFallback = false;
  if (verifyStatus !== 0) {
    if (!plan.fallbackVerify) process.exit(verifyStatus);
    usedFallback = true;
    console.warn(
      "[desktop-deploy-app] visual/window verification failed; retrying deterministic WebView route verification without macOS window-capture requirements.",
    );
    run(plan.fallbackVerify[0], plan.fallbackVerify[1]);
  }
  const evidence = summarizeDeployMacosAppEvidence(options, { usedFallback });

  console.log(
    `[desktop-deploy-app] deployed ${options.installPath} and verified ${options.route}; screenshot=${evidence.screenshot}; visualEvidence=${evidence.visualEvidence}; webviewEvidence=${evidence.webviewEvidence}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
