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
  "en:/docs": ["Source Vault", "source records", "Files", "Graph", "Agent", "local markdown", "frontmatter", "MCP", "runtime gate", "relation_name_parity", "pattern_walk/project_map", "Copy graph gate"],
  "ko:/docs": ["Source Vault", "소스 기록", "Files", "Graph", "Agent", "local markdown", "frontmatter", "MCP", "runtime gate", "relation_name_parity", "pattern_walk/project_map", "graph gate 복사"],
  "en:/ontology": ["Tree role", "Graph refs", "Evidence", "Graph DB proof", "Browse", "Write", "Query", "01", "02", "03", "tree projection", "frontmatter write", "dogfood:graph-db", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "canonical slug", "graph handle", "Copy runtime gate"],
  "ko:/ontology": ["역할", "참조", "근거", "Graph DB proof", "Browse", "Write", "Query", "01", "02", "03", "tree projection", "frontmatter write", "dogfood:graph-db", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "canonical slug", "graph handle", "runtime gate 복사"],
  "en:/ontology/edit": ["Save proof", "Layout", "Auto layout", "local markdown", "canvas draft", "not on disk until save", "relation guard", "graph db + health", "Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "runtime replay", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "focus saved slug", "active slug", "Focus saved anchor", "Copy guard", "Copy sync gate"],
  "ko:/ontology/edit": ["저장·검증", "배치", "자동 정렬", "local markdown", "canvas draft", "save 전까지 디스크 아님", "relation guard", "graph db + health", "Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "runtime replay", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "저장 slug 먼저", "활성 slug", "저장 anchor 포커스", "Guard 복사", "sync gate 복사"],
  "en:/ontology/insights": ["Query cockpit", "Readiness", "Pack", "MCP", "CLI", "MATCH", "Run order", "Payloads", "CLI fallback", "Scan contract", "Path contract", "setup gate", "self-check + health gate", "Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "Copy runtime gate"],
  "ko:/ontology/insights": ["Query cockpit", "Readiness", "Pack", "MCP", "CLI", "MATCH", "실행 순서", "Payloads", "CLI fallback", "Scan contract", "Path contract", "setup gate", "self-check + health gate", "Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "runtime gate 복사"],
};
export const DESKTOP_SMOKE_ROUTE_CHUNK_TEXT = {
  "/docs": [
    "sourceContract.filesLabel",
    "sourceContract.graphLabel",
    "sourceContract.agentLabel",
    "proofMarkers",
    "relation_name_parity",
    "pattern_walk/project_map",
    "sourceContract.agentCopyGate",
  ],
  "/ontology": [
    "activeSlugLabel",
    "selectedHandleLabel",
    "selectAriaLabel",
    "treeLoopAction",
    "graphDbLoopAction",
    "copySyncGate",
  ],
  "/ontology/edit": [
    "Persisted graph anchors",
    "anchorAriaLabel",
    "activeFocusAriaLabel",
    "proofChipSelected",
    "syncCopyText",
    "copySyncGate",
    "activeFocus",
  ],
  "/ontology/insights": [
    "queryCockpitContractsAriaLabel",
    "queryCockpitEvidenceAriaLabel",
    "queryCockpitCopyRuntimeGate",
    "focused_blast_radius",
    "relation_name_parity",
    "pattern_walk/project_map",
  ],
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

function scriptChunkPathsFromHtml(html) {
  return Array.from(html.matchAll(/\bsrc=["']([^"']*_next\/static\/chunks\/[^"']+\.js)["']/g))
    .map((match) => match[1].replace(/^\//, ""))
    .filter((value, index, array) => array.indexOf(value) === index);
}

function readRouteChunkText(outDir, html) {
  return scriptChunkPathsFromHtml(html)
    .map((chunkPath) => readTextUnder(outDir, chunkPath) ?? "")
    .join("\n");
}

export function evaluateDesktopSmoke({
  outDir = path.join(process.cwd(), "out"),
  locales = DESKTOP_SMOKE_LOCALES,
  routes = DESKTOP_SMOKE_ROUTES,
  docs = DESKTOP_SMOKE_DOCS,
  routeTitles = DESKTOP_SMOKE_ROUTE_TITLES,
  routeText = DESKTOP_SMOKE_ROUTE_TEXT,
  routeChunkText = {},
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
      const expectedChunkText =
        routeChunkText[`${locale}:${route}`] ?? routeChunkText[route];
      if (expectedChunkText) {
        const html = readTextUnder(outDir, relativePath);
        const chunkText = typeof html === "string" ? readRouteChunkText(outDir, html) : "";
        addCheck(
          `route-chunk-text:${locale}:${route}`,
          `${locale}${route} workbench component contract is bundled`,
          typeof html === "string" && hasAllText(chunkText, expectedChunkText),
          expectedChunkText.join(", "),
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
  const report = evaluateDesktopSmoke({
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });
  console.log(renderDesktopSmoke(report));
  if (!report.ok) process.exitCode = 1;
}
