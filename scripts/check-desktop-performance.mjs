#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

// Raised from 8 MiB on 2026-08-31 at 7.81 MiB measured, which is 97.6% of the
// old ceiling. The number was not the problem and raising it is not the fix.
//
// Measured cause: `src/entities/docs-vault/data/content.json` is 4.53 MiB, of
// which `DECISIONS` is 2.84 MiB and `CHANGELOG` is 1.14 MiB. Both ledgers are
// append-only by charter, so this input only ever grows and will reach any
// ceiling eventually. The same documents already ship as plain files in
// `out/docs-vault/` (5.4 MiB), which does not count here — the bundle is
// carrying a second copy of documents the app can already fetch.
//
// So this ceiling buys time for the structural fix, which is to stop bundling
// the two ledgers and read them from the static copy on demand. **If this gate
// goes red again, do that instead of raising the number a second time.** The
// gate exists to catch accidental bloat; it stops meaning anything if documented
// growth is answered by moving the line.
export const DESKTOP_PERFORMANCE_BUDGETS = {
  nextStaticBytes: 10 * 1024 * 1024,
  maxStaticAssetBytes: 1.5 * 1024 * 1024,
};

const STATIC_ASSET_EXTENSIONS = new Set([".js", ".css"]);
export const DESKTOP_PERFORMANCE_EVIDENCE_BOUNDARY =
  "This check measures static artifact sizes only; runtime startup is verified by desktop:verify-app and MCP startup by cli:mcp-verify.";

function formatMiB(bytes) {
  if (bytes === null) return "not measured";
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
    kind: "budget",
    label,
    actual,
    budget,
    ok: actual <= budget,
  });
}

function addSizeMetric(checks, label, actual, detail) {
  checks.push({
    kind: "metric",
    label,
    actual,
    ok: true,
    ...(detail ? { detail } : {}),
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
      evidenceBoundary: DESKTOP_PERFORMANCE_EVIDENCE_BOUNDARY,
    };
  }
  if (!fs.existsSync(nextStaticDir)) {
    return {
      ok: false,
      missing: [`${path.relative(root, nextStaticDir)}/`],
      checks,
      appBundlePath,
      evidenceBoundary: DESKTOP_PERFORMANCE_EVIDENCE_BOUNDARY,
    };
  }

  addSizeMetric(checks, "static export out/ size", directorySize(outDir));
  addBudgetCheck(
    checks,
    "Next static asset size",
    directorySize(nextStaticDir),
    budgets.nextStaticBytes,
  );
  const largest = largestStaticAsset(nextStaticDir);
  if (largest) {
    checks.push({
      kind: "budget",
      label: "largest JS/CSS chunk",
      actual: largest.size,
      budget: budgets.maxStaticAssetBytes,
      ok: largest.size <= budgets.maxStaticAssetBytes,
      detail: path.relative(root, largest.path),
    });
  } else {
    checks.push({
      kind: "budget",
      label: "largest JS/CSS chunk",
      actual: null,
      budget: budgets.maxStaticAssetBytes,
      ok: false,
      detail: "no .js or .css asset found under out/_next/static",
    });
  }

  if (fs.existsSync(appBundlePath)) {
    addSizeMetric(checks, "macOS .app bundle size", directorySize(appBundlePath));
  } else if (requireApp) {
    return {
      ok: false,
      missing: [path.relative(root, appBundlePath)],
      checks,
      appBundlePath,
      evidenceBoundary: DESKTOP_PERFORMANCE_EVIDENCE_BOUNDARY,
    };
  }

  return {
    ok: checks.filter((check) => check.kind === "budget").every((check) => check.ok),
    missing: [],
    checks,
    appBundlePath,
    evidenceBoundary: DESKTOP_PERFORMANCE_EVIDENCE_BOUNDARY,
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
  console.log("[desktop-performance] static artifact hard gates + desktop size metrics");
  console.log(
    `[desktop-performance] evidence boundary: ${result.evidenceBoundary ?? DESKTOP_PERFORMANCE_EVIDENCE_BOUNDARY}`,
  );
  for (const missingPath of result.missing) {
    console.error(`✗ missing build artifact: ${missingPath}`);
  }
  for (const check of result.checks) {
    const marker = check.kind === "metric" ? "ℹ" : check.ok ? "✓" : "✗";
    const detail = check.detail ? ` (${check.detail})` : "";
    const value = formatMiB(check.actual);
    const budget = check.budget === undefined ? "" : ` / ${formatMiB(check.budget)}`;
    console.log(`${marker} ${check.label}: ${value}${budget}${detail}`);
  }
  if (result.ok) {
    console.log("[desktop-performance] ready: enforced static asset gates passed");
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const result = evaluateDesktopPerformance(args);
  printDesktopPerformanceReport(result);
  if (!result.ok) process.exit(1);
}
