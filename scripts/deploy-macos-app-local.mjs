#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const DEFAULT_ROUTE = "/en/topology/";
const DEFAULT_SCREENSHOT = path.join(root, ".tmp", "ontology-atlas-deployed-relief.png");

export function parseDeployMacosAppArgs(argv) {
  const option = (prefix) => {
    const arg = argv.find((entry) => entry.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : null;
  };

  return {
    skipBuild: argv.includes("--skip-build"),
    leaveRunning: !argv.includes("--no-leave-running"),
    route: option("--route=") || DEFAULT_ROUTE,
    holdMs: Number(option("--hold-ms=") || 12000),
    screenshotPath: option("--screenshot=") || DEFAULT_SCREENSHOT,
    installPath:
      option("--install-path=") || path.join("/Applications", names.appBundleName),
    builtAppPath:
      option("--built-app=") ||
      path.join(root, "src-tauri", "target", "release", "bundle", "macos", names.appBundleName),
  };
}

export function buildDeployMacosAppPlan(options) {
  const verifyArgs = [
    "desktop:verify-app",
    options.installPath,
    "--kill-existing",
    "--require-window",
    "--require-capturable-window",
    `--window-screenshot=${options.screenshotPath}`,
    `--hold-ms=${options.holdMs}`,
    `--require-owner-name=${names.appName}`,
    "--min-window-size=1040x720",
    `--require-webview-route=${options.route}`,
  ];
  if (options.leaveRunning) verifyArgs.push("--leave-running");

  return {
    build: options.skipBuild ? null : ["pnpm", ["desktop:build:app"]],
    quit: ["osascript", ["-e", `tell application "${names.appName}" to quit`]],
    removeInstalled: ["rm", ["-rf", options.installPath]],
    copyInstalled: ["ditto", [options.builtAppPath, options.installPath]],
    verify: ["pnpm", verifyArgs],
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

  fs.mkdirSync(path.dirname(options.screenshotPath), { recursive: true });
  run(plan.quit[0], plan.quit[1], { allowFailure: true });
  run(plan.removeInstalled[0], plan.removeInstalled[1]);
  run(plan.copyInstalled[0], plan.copyInstalled[1]);
  run(plan.verify[0], plan.verify[1]);

  console.log(
    `[desktop-deploy-app] deployed ${options.installPath} and verified ${options.route}; screenshot=${options.screenshotPath}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
