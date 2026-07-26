import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DESKTOP_SMOKE_DOCS,
  DESKTOP_SMOKE_LOCALES,
  DESKTOP_SMOKE_ROOT_ENTRY,
  DESKTOP_SMOKE_ROUTES,
  DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  DESKTOP_SMOKE_ROUTE_TEXT,
  DESKTOP_SMOKE_ROUTE_TITLES,
  evaluateDesktopSmoke,
} from "./desktop-smoke.mjs";

function makeOutDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "atlas-desktop-smoke-"));
}

function write(root, relativePath, contents = "<!doctype html>") {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

function routeIndexPath(locale, route) {
  return path.join(locale, route.replace(/^\/+|\/+$/g, ""), "index.html");
}

function routeChunkPath(locale, route) {
  const slug = route.replace(/^\/+|\/+$/g, "").replaceAll("/", "-");
  return `_next/static/chunks/${locale}-${slug || "root"}.js`;
}

function writeRoute(root, locale, route, { title, text = [], chunk = [] }) {
  const chunkPath = routeChunkPath(locale, route);
  write(root, chunkPath, chunk.join("\n"));
  write(
    root,
    routeIndexPath(locale, route),
    [
      "<!doctype html>",
      title ? `<title>${title}</title>` : "",
      `<main>${text.join(" ")}</main>`,
      `<script src="/${chunkPath}"></script>`,
    ].join(""),
  );
}

function makeCurrentOut() {
  const outDir = makeOutDir();
  write(outDir, DESKTOP_SMOKE_ROOT_ENTRY);
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  for (const doc of DESKTOP_SMOKE_DOCS) write(outDir, doc, "# bundled");

  for (const locale of DESKTOP_SMOKE_LOCALES) {
    for (const route of DESKTOP_SMOKE_ROUTES) {
      writeRoute(outDir, locale, route, {
        title: DESKTOP_SMOKE_ROUTE_TITLES[`${locale}:${route}`],
        text: DESKTOP_SMOKE_ROUTE_TEXT[`${locale}:${route}`] ?? [],
        chunk: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT[route] ?? [],
      });
    }
  }
  return outDir;
}

test("desktop smoke inventory covers the current packaged workbench", () => {
  assert.deepEqual(DESKTOP_SMOKE_LOCALES, ["en", "ko"]);
  assert.deepEqual(DESKTOP_SMOKE_ROUTES, [
    "/download",
    "/docs",
    "/ontology",
    "/topology",
    "/ontology/edit",
    "/ontology/insights",
  ]);
  assert.deepEqual(DESKTOP_SMOKE_DOCS, [
    "docs-vault/DESKTOP-MACOS.md",
    "docs-vault/ontology/capabilities/desktop-app-distribution.md",
  ]);
});

test("desktop smoke titles follow current metadata and do not revive retired surfaces", () => {
  assert.deepEqual(DESKTOP_SMOKE_ROUTE_TITLES, {
    "en:/download": "Download · Ontology Atlas",
    "ko:/download": "다운로드 · Ontology Atlas",
    "en:/docs": "Ontology workspace · Ontology Atlas",
    "ko:/docs": "저장소 · Ontology Atlas",
    "en:/ontology": "Ontology · Ontology Atlas",
    "ko:/ontology": "온톨로지 · Ontology Atlas",
    "en:/topology": "Relief · Ontology Atlas",
    "ko:/topology": "지형도 · Ontology Atlas",
    "en:/ontology/insights": "Graph Insights · Ontology Atlas",
    "ko:/ontology/insights": "그래프 인사이트 · Ontology Atlas",
  });
  assert.equal(
    Object.values(DESKTOP_SMOKE_ROUTE_TITLES).some((title) =>
      /Edit Relations|관계 편집|Verify Graph|그래프 검증/.test(title),
    ),
    false,
  );
});

test("desktop smoke download copy follows the shipped install path", () => {
  assert.deepEqual(DESKTOP_SMOKE_ROUTE_TEXT["en:/download"], [
    "Install once. Work from your local vault.",
    "Check GitHub releases",
    "Pick your vault folder",
    "Connect your AI assistant",
    "MCP server auto-registration",
  ]);
  assert.deepEqual(DESKTOP_SMOKE_ROUTE_TEXT["ko:/download"], [
    "한 번 설치하고, 내 로컬 vault 에서 작업하세요.",
    "GitHub에서 릴리스 확인",
    "vault 폴더 선택",
    "AI 어시스턴트 연결하기",
    "MCP 서버 자동등록",
  ]);
  assert.deepEqual(Object.keys(DESKTOP_SMOKE_ROUTE_TEXT).sort(), [
    "en:/download",
    "ko:/download",
  ]);
});

test("desktop smoke chunks prove current route meaning", () => {
  assert.deepEqual(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT, {
    "/download": [
      "download-fact-strip",
      "download-checksum-row",
      "download-release-availability",
    ],
    "/docs": [
      "data-docs-header-zone",
      "data-docs-viewer",
      "sourceContract.filesLabel",
      "sourceContract.graphLabel",
      "sourceContract.agentLabel",
    ],
    "/ontology": ["/topology/?", "index", "expanded"],
    "/topology": ["canvas-v2", "active-relation-inspector", "focus-path-state"],
    "/ontology/edit": ["/ontology/studio/?node=", "/ontology/studio/"],
    "/ontology/insights": [
      "maintenance-board",
      "one-tab-one-question",
      "tab-query",
    ],
  });

  const retired = JSON.stringify(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT);
  for (const marker of [
    "business-first",
    "queryCockpitContractsAriaLabel",
    "collaboratorBusinessExtractionChecks",
    "Saved concept list",
  ]) {
    assert.equal(retired.includes(marker), false, marker);
  }
});

test("desktop smoke accepts a complete current static payload", () => {
  const report = evaluateDesktopSmoke({
    outDir: makeCurrentOut(),
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });

  assert.equal(report.ok, true);
  assert.equal(report.missing.length, 0);
  assert.match(report.nextAction, /desktop:dev|desktop:build/);
});

test("desktop smoke reports the exact missing packaged route", () => {
  const outDir = makeCurrentOut();
  fs.rmSync(path.join(outDir, "en/topology"), { recursive: true });

  const report = evaluateDesktopSmoke({
    outDir,
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });

  assert.equal(report.ok, false);
  assert.ok(report.missing.some((check) => check.id === "route:en:/topology"));
  assert.match(report.nextAction, /pnpm build/);
});

test("desktop smoke reports the exact missing Tauri root entry", () => {
  const outDir = makeCurrentOut();
  fs.rmSync(path.join(outDir, DESKTOP_SMOKE_ROOT_ENTRY));

  const report = evaluateDesktopSmoke({
    outDir,
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });

  assert.equal(report.ok, false);
  assert.ok(report.missing.some((check) => check.id === "root-entry"));
  assert.match(report.nextAction, /pnpm build/);
});

test("desktop smoke detects stale route metadata without prescribing another build", () => {
  const outDir = makeCurrentOut();
  const routePath = routeIndexPath("en", "/ontology/insights");
  const html = fs.readFileSync(path.join(outDir, routePath), "utf8");
  write(
    outDir,
    routePath,
    html.replace("Graph Insights · Ontology Atlas", "Verify Graph · Ontology Atlas"),
  );

  const report = evaluateDesktopSmoke({
    outDir,
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });

  assert.equal(report.ok, false);
  assert.ok(
    report.missing.some(
      (check) => check.id === "route-title:en:/ontology/insights",
    ),
  );
  assert.match(report.nextAction, /contract drift|current route/i);
  assert.doesNotMatch(report.nextAction, /pnpm build/);
});

test("desktop smoke detects a missing current component marker", () => {
  const outDir = makeCurrentOut();
  const chunkPath = routeChunkPath("ko", "/ontology/insights");
  const chunk = fs.readFileSync(path.join(outDir, chunkPath), "utf8");
  write(outDir, chunkPath, chunk.replace("tab-query", ""));

  const report = evaluateDesktopSmoke({
    outDir,
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });

  assert.equal(report.ok, false);
  assert.ok(
    report.missing.some(
      (check) => check.id === "route-chunk-text:ko:/ontology/insights",
    ),
  );
  assert.match(report.nextAction, /contract drift|current route/i);
});

test("desktop smoke detects drift in the current download handoff", () => {
  const outDir = makeCurrentOut();
  const routePath = routeIndexPath("ko", "/download");
  const html = fs.readFileSync(path.join(outDir, routePath), "utf8");
  write(outDir, routePath, html.replace("AI 어시스턴트 연결하기", ""));

  const report = evaluateDesktopSmoke({
    outDir,
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });

  assert.equal(report.ok, false);
  assert.ok(
    report.missing.some((check) => check.id === "route-text:ko:/download"),
  );
  assert.match(report.nextAction, /contract drift|current route/i);
});
