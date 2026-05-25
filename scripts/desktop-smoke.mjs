#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

export const DESKTOP_SMOKE_LOCALES = ["en", "ko"];
export const DESKTOP_SMOKE_ROUTES = ["/docs", "/ontology", "/topology", "/ontology/edit"];
export const DESKTOP_SMOKE_DOCS = [
  "docs-vault/DESKTOP-MACOS.md",
  "docs-vault/ontology/capabilities/desktop-app-distribution.md",
];

function routeIndexPath({ locale, route }) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, "");
  return path.join(locale, cleanRoute, "index.html");
}

function existsUnder(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

export function evaluateDesktopSmoke({
  outDir = path.join(process.cwd(), "out"),
  locales = DESKTOP_SMOKE_LOCALES,
  routes = DESKTOP_SMOKE_ROUTES,
  docs = DESKTOP_SMOKE_DOCS,
} = {}) {
  const checks = [];
  const addCheck = (id, label, ok, details = "") => {
    checks.push({ id, label, ok, details });
  };

  addCheck("out-dir", "Next.js static export exists", fs.existsSync(outDir), outDir);
  addCheck("_next", "packaged app assets exist", existsUnder(outDir, "_next"), "_next");

  for (const locale of locales) {
    for (const route of routes) {
      const relativePath = routeIndexPath({ locale, route });
      addCheck(
        `route:${locale}:${route}`,
        `${locale}${route} static route exists`,
        existsUnder(outDir, relativePath),
        relativePath,
      );
    }
  }

  for (const doc of docs) {
    addCheck(`doc:${doc}`, `${doc} is bundled for offline docs`, existsUnder(outDir, doc), doc);
  }

  const missing = checks.filter((check) => !check.ok);
  return {
    ok: missing.length === 0,
    checks,
    missing,
    nextAction:
      missing.length === 0
        ? "Run pnpm desktop:dev or pnpm desktop:build, then smoke the same routes inside the .app shell."
        : "Run pnpm build before pnpm desktop:smoke so out/ contains the static desktop payload.",
  };
}

function renderDesktopSmoke(report) {
  const lines = ["[desktop-smoke] packaged static route smoke"];
  for (const check of report.checks) {
    lines.push(`${check.ok ? "✓" : "✗"} ${check.label}${check.details ? ` (${check.details})` : ""}`);
  }
  lines.push(`[desktop-smoke] ${report.ok ? "ready" : "blocked"}: ${report.nextAction}`);
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = evaluateDesktopSmoke();
  console.log(renderDesktopSmoke(report));
  if (!report.ok) process.exitCode = 1;
}
