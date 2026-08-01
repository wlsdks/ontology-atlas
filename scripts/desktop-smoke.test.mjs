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
  DESKTOP_SMOKE_ROUTE_TEXT_KEYS,
  DESKTOP_SMOKE_ROUTE_TITLES,
  evaluateDesktopSmoke,
  resolveRouteText,
} from "./desktop-smoke.mjs";

/** 카탈로그에서 편 실제 기대 문구 — 픽스처도 게이트와 같은 출처를 쓴다. */
const ROUTE_TEXT = resolveRouteText();

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
        text: ROUTE_TEXT[`${locale}:${route}`] ?? [],
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
    // 볼트 재생성에도 살아남는 표본이어야 한다 — 개념 노드가 아니라
    // 생성기가 항상 만드는 `vault-readme`.
    "docs-vault/ontology/README.md",
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

/**
 * 이 테스트는 예전에 **상수가 자기 리터럴과 같은지**만 봤다. 그래서 #730 이
 * 다운로드 화면의 문장을 걷어냈을 때도 249개 테스트가 전부 초록이었고, 결함은
 * `pnpm build` 뒤에 `desktop:smoke` 를 실제로 돌리는 유일한 곳 — **태그를 찍은
 * 뒤의 릴리스 빌드** — 에서만 드러났다. 자기 자신을 확인하는 게이트는 게이트가
 * 아니다.
 *
 * 이제 문장이 아니라 **키**를 못박고, 그 키가 살아 있는 카탈로그에서 실제로
 * 풀리는지 본다. 문구가 바뀌면 게이트가 같이 따라오고, 키가 사라지면 여기서
 * 즉시 빨개진다.
 */
test("desktop smoke download copy is read from the live message catalog", () => {
  assert.deepEqual(Object.keys(DESKTOP_SMOKE_ROUTE_TEXT_KEYS), ["/download"]);

  const resolved = resolveRouteText();
  assert.deepEqual(Object.keys(resolved).sort(), ["en:/download", "ko:/download"]);

  for (const locale of DESKTOP_SMOKE_LOCALES) {
    const fragments = resolved[`${locale}:/download`];
    assert.equal(fragments.length, DESKTOP_SMOKE_ROUTE_TEXT_KEYS["/download"].length);
    for (const fragment of fragments) {
      assert.equal(typeof fragment, "string");
      assert.ok(fragment.length > 0, `${locale} download copy fragment is empty`);
      // ICU 플레이스홀더가 든 문구는 렌더 결과가 원문과 달라 정적 HTML 에서 못 찾는다.
      assert.doesNotMatch(fragment, /[{}]/, `${locale} "${fragment}" carries an ICU placeholder`);
    }
  }

  // 두 어권이 같은 문장을 내면 한쪽 카탈로그가 번역되지 않은 것이다.
  assert.notDeepEqual(resolved["en:/download"], resolved["ko:/download"]);
});

test("desktop smoke copy contract refuses a message key the catalog dropped", () => {
  assert.throws(
    () => resolveRouteText({ keysByRoute: { "/download": ["download.factStripRetired"] } }),
    /no longer exists/,
  );
});

test("desktop smoke copy contract refuses a message with an ICU placeholder", () => {
  assert.throws(
    // 살아 있으면서 플레이스홀더를 가진 키여야 한다 — 사라진 키를 쓰면 이
    // 프로브가 "ICU 거부" 대신 "키 없음" 으로 던져서, **검사하려던 것과 다른
    // 것을 검사하게 된다**(2026-07-29: `macosPublishedBadge` 가 관문 재설계에서
    // 사라지며 실제로 그렇게 됐다).
    () => resolveRouteText({ keysByRoute: { "/download": ["download.trustVerifyCommand"] } }),
    /ICU placeholder/,
  );
});

test("desktop smoke chunks prove current route meaning", () => {
  assert.deepEqual(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT, {
    "/download": [
      "download-trust",
      "download-platform-macos",
      "download-platform-windows",
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
  // 지우는 문장도 카탈로그에서 가져온다 — 리터럴을 박으면 이 프로브 자체가
  // 다음 리메이크에서 조용히 무의미해진다(그게 #730 이후 실제로 벌어진 일이다).
  const [firstFragment] = ROUTE_TEXT["ko:/download"];
  write(outDir, routePath, html.replace(firstFragment, ""));

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
