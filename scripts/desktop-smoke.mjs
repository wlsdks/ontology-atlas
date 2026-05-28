#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

export const DESKTOP_SMOKE_LOCALES = ["en", "ko"];
export const DESKTOP_SMOKE_ROUTES = [
  "/download",
  "/docs",
  "/ontology",
  "/topology",
  "/ontology/edit",
  "/ontology/insights",
];
export const DESKTOP_SMOKE_ROOT_ENTRY = "index.html";
export const DESKTOP_SMOKE_DOCS = [
  "docs-vault/DESKTOP-MACOS.md",
  "docs-vault/ontology/capabilities/desktop-app-distribution.md",
];
export const DESKTOP_SMOKE_ROUTE_TITLES = {
  "en:/ontology": "Ontology · Context Atlas",
  "ko:/ontology": "온톨로지 · Context Atlas",
  "en:/ontology/edit": "Ontology Builder · Context Atlas",
  "ko:/ontology/edit": "온톨로지 빌더 · Context Atlas",
  "en:/ontology/insights": "Ontology Insights · Context Atlas",
  "ko:/ontology/insights": "온톨로지 인사이트 · Context Atlas",
};
export const DESKTOP_SMOKE_ROUTE_TEXT = {
  "en:/docs": ["Source Vault", "Files", "Graph", "Agent", "Copy graph gate"],
  "ko:/docs": ["Source Vault", "Files", "Graph", "Agent", "graph gate 복사"],
  "en:/ontology": ["Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "canonical slug", "Copy runtime gate"],
  "ko:/ontology": ["Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "canonical slug", "runtime gate 복사"],
  "en:/ontology/edit": ["Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "runtime replay", "active slug", "Copy guard"],
  "ko:/ontology/edit": ["Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "runtime replay", "활성 slug", "Guard 복사"],
  "en:/ontology/insights": ["Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "Copy runtime gate"],
  "ko:/ontology/insights": ["Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "runtime gate 복사"],
};

function routeIndexPath({ locale, route }) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, "");
  return path.join(locale, cleanRoute, "index.html");
}

function existsUnder(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readTextUnder(root, relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function hasTitle(html, title) {
  return html.includes(`<title>${title}</title>`);
}

function hasAllText(html, fragments) {
  return fragments.every((fragment) => html.includes(fragment));
}

export function evaluateDesktopSmoke({
  outDir = path.join(process.cwd(), "out"),
  locales = DESKTOP_SMOKE_LOCALES,
  routes = DESKTOP_SMOKE_ROUTES,
  docs = DESKTOP_SMOKE_DOCS,
  routeTitles = DESKTOP_SMOKE_ROUTE_TITLES,
  routeText = DESKTOP_SMOKE_ROUTE_TEXT,
} = {}) {
  const checks = [];
  const addCheck = (id, label, ok, details = "") => {
    checks.push({ id, label, ok, details });
  };

  addCheck("out-dir", "Next.js static export exists", fs.existsSync(outDir), outDir);
  addCheck("_next", "packaged app assets exist", existsUnder(outDir, "_next"), "_next");
  addCheck(
    "root-entry",
    "Tauri app root entry exists",
    existsUnder(outDir, DESKTOP_SMOKE_ROOT_ENTRY),
    DESKTOP_SMOKE_ROOT_ENTRY,
  );

  for (const locale of locales) {
    for (const route of routes) {
      const relativePath = routeIndexPath({ locale, route });
      const exists = existsUnder(outDir, relativePath);
      addCheck(
        `route:${locale}:${route}`,
        `${locale}${route} static route exists`,
        exists,
        relativePath,
      );
      const expectedTitle = routeTitles[`${locale}:${route}`];
      if (expectedTitle) {
        const html = readTextUnder(outDir, relativePath);
        addCheck(
          `route-title:${locale}:${route}`,
          `${locale}${route} static route title matches`,
          typeof html === "string" && hasTitle(html, expectedTitle),
          expectedTitle,
        );
      }
      const expectedText = routeText[`${locale}:${route}`] ?? routeText[route];
      if (expectedText) {
        const html = readTextUnder(outDir, relativePath);
        addCheck(
          `route-text:${locale}:${route}`,
          `${locale}${route} workbench proof copy is bundled`,
          typeof html === "string" && hasAllText(html, expectedText),
          expectedText.join(", "),
        );
      }
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
