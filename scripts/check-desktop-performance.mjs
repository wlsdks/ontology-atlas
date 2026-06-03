#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

export const DESKTOP_PERFORMANCE_BUDGETS = {
  outBytes: 32 * 1024 * 1024,
  nextStaticBytes: 8 * 1024 * 1024,
  maxStaticAssetBytes: 1.5 * 1024 * 1024,
  appBundleBytes: 25 * 1024 * 1024,
};

const STATIC_ASSET_EXTENSIONS = new Set([".js", ".css"]);

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MiB`;
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) {
        stack.push(path.join(current, name));
      }
    } else if (stat.isFile()) {
      out.push({ path: current, size: stat.size });
    }
  }
  return out;
}

function directorySize(root) {
  return walkFiles(root).reduce((sum, file) => sum + file.size, 0);
}

function largestStaticAsset(root) {
  return walkFiles(root)
    .filter((file) => STATIC_ASSET_EXTENSIONS.has(path.extname(file.path)))
    .sort((a, b) => b.size - a.size)[0] ?? null;
}

function addBudgetCheck(checks, label, actual, budget) {
  checks.push({
    label,
    actual,
    budget,
    ok: actual <= budget,
  });
}

export function evaluateDesktopPerformance({
  root = process.cwd(),
  requireApp = false,
  budgets = DESKTOP_PERFORMANCE_BUDGETS,
} = {}) {
  const checks = [];
  const outDir = path.join(root, "out");
  const nextStaticDir = path.join(outDir, "_next", "static");
  const names = loadMacosReleaseNames(root);
  const appBundlePath = path.join(
    root,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    names.appBundleName,
  );

  if (!fs.existsSync(outDir)) {
    return {
      ok: false,
      missing: [`${path.relative(root, outDir)}/`],
      checks,
      appBundlePath,
    };
  }
  if (!fs.existsSync(nextStaticDir)) {
    return {
      ok: false,
      missing: [`${path.relative(root, nextStaticDir)}/`],
      checks,
      appBundlePath,
    };
  }

  addBudgetCheck(checks, "static export out/ size", directorySize(outDir), budgets.outBytes);
  addBudgetCheck(
    checks,
    "Next static asset size",
    directorySize(nextStaticDir),
    budgets.nextStaticBytes,
  );
  const largest = largestStaticAsset(nextStaticDir);
  if (largest) {
    checks.push({
      label: "largest JS/CSS chunk",
      actual: largest.size,
      budget: budgets.maxStaticAssetBytes,
      ok: largest.size <= budgets.maxStaticAssetBytes,
      detail: path.relative(root, largest.path),
    });
  }

  if (fs.existsSync(appBundlePath)) {
    addBudgetCheck(
      checks,
      "macOS .app bundle size",
      directorySize(appBundlePath),
      budgets.appBundleBytes,
    );
  } else if (requireApp) {
    return {
      ok: false,
      missing: [path.relative(root, appBundlePath)],
      checks,
      appBundlePath,
    };
  }

  return {
    ok: checks.every((check) => check.ok),
    missing: [],
    checks,
    appBundlePath,
  };
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    requireApp: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      args.root = argv[i + 1] ?? args.root;
      i += 1;
    } else if (arg === "--require-app") {
      args.requireApp = true;
    }
  }
  return args;
}

export function printDesktopPerformanceReport(result) {
  console.log("[desktop-performance] static export + macOS app size budgets");
  for (const missingPath of result.missing) {
    console.error(`✗ missing build artifact: ${missingPath}`);
  }
  for (const check of result.checks) {
    const marker = check.ok ? "✓" : "✗";
    const detail = check.detail ? ` (${check.detail})` : "";
    console.log(
      `${marker} ${check.label}: ${formatMiB(check.actual)} / ${formatMiB(check.budget)}${detail}`,
    );
  }
  if (result.ok) {
    console.log("[desktop-performance] ready: desktop artifacts stay within current budgets");
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const result = evaluateDesktopPerformance(args);
  printDesktopPerformanceReport(result);
  if (!result.ok) process.exit(1);
}
