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
    "en:/topology": "Map · Ontology Atlas",
    "ko:/topology": "지도 · Ontology Atlas",
    "en:/ontology/insights": "Graph Insights · Ontology Atlas",
    "ko:/ontology/insights": "내 폴더 분석 · Ontology Atlas",
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
      "gateway-hero-cta",
      "gateway-demo-section",
      "gateway-agents-section",
    ],
    "/docs": [
      "data-docs-header-zone",
      "data-docs-viewer",
      "sourceContract.filesLabel",
      "sourceContract.graphLabel",
      "sourceContract.agentLabel",
    ],
    "/ontology": ["/topology/?", "index", "expanded"],
    "/topology": ["topology-map-v2-canvas", "topology-concept-search"],
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

/**
 * **마커는 제품보다 오래 살 수 없다** (2026-08-01 신설).
 *
 * 위 표는 손으로 관리되는 문자열 목록이고, 그래서 이 파일 상단이 *"오늘 무엇
 * 인지를 말해야지, 어제 무엇이었는지를 말하면 안 된다"* 고 적어 두었다. 그
 * 규율에 **강제가 없었다** — 그리고 실제로 무너졌다.
 *
 * `/topology` 의 마커 셋(`canvas-v2` · `active-relation-inspector` ·
 * `focus-path-state`)은 그 컴포넌트들이 은퇴한 뒤에도 게이트를 통과하고 있었다.
 * 통과한 이유가 문제의 핵심이다: 그 이름들이 **생성된 문서함 JSON 안의 산문**
 * (`src/entities/docs-vault/data/*`)에 남아 있었고, 그 JSON 이 페이지에 인라인
 * 되니 `html.includes(marker)` 가 참이었다. 즉 이 게이트는 토폴로지 화면이
 * 아니라 **옛 컴포넌트를 언급한 문서 한 조각이 번들에 들어갔는지**를 재고 있었다.
 *
 * 그래서 #806 이 볼트를 재생성해 그 산문이 사라지자 rc.5 릴리스 리허설이
 * 여기서 멈췄다 — 토폴로지는 멀쩡한데. **틀린 이유로 통과하다 무관한 변경에
 * 빨개지는 것**이 `.claude/rules/documentation.md` 가 고정 문자열 핀에 대해
 * 경고한 정확히 그 두 방향이다.
 *
 * 이 시험이 그 구멍을 막는다: 모든 마커는 **생성물 밖의 제품 소스**에 실재해야
 * 한다. 생성된 데이터에만 있는 마커는 제품이 아니라 그때의 문서를 가리킨다.
 */
test("smoke markers must exist in product source, not only in generated data", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  /** 생성물은 제외한다 — 그 안의 등장은 "제품에 있다" 는 증거가 아니다. */
  const GENERATED = [
    path.join("src", "entities", "docs-vault", "data"),
    path.join("public", "docs-vault"),
  ];
  const roots = ["src", "app", "messages"];

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(repoRoot, full);
      if (GENERATED.some((g) => rel.startsWith(g))) continue;
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|json|css)$/.test(entry.name)) files.push(full);
    }
  };
  for (const root of roots) {
    const dir = path.join(repoRoot, root);
    if (fs.existsSync(dir)) walk(dir);
  }
  assert.ok(files.length > 100, "소스를 못 읽었다 — 이 시험이 지금 아무것도 지키지 않는다");

  const haystack = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const orphaned = [];
  for (const [route, markers] of Object.entries(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT)) {
    for (const marker of markers) {
      // 경로 조각(`/topology/?`)과 일반 단어(`index`)는 컴포넌트 마커가 아니다.
      if (marker.startsWith("/") || !/[-.]/.test(marker)) continue;
      if (!haystack.includes(marker)) orphaned.push(`${route} → ${marker}`);
    }
  }
  assert.deepEqual(
    orphaned,
    [],
    `제품 소스에 없는 스모크 마커(생성물 제외). 컴포넌트가 은퇴했는데 마커만 남았거나, `
      + `오타다. 남겨 두면 게이트가 틀린 이유로 통과하다 무관한 변경에 빨개진다:\n  `
      + orphaned.join("\n  "),
  );
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
