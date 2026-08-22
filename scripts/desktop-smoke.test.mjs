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

/** The expected copy expanded from the catalogue — the fixture uses the same source as the gate. */
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
    // The sample must survive a vault rebuild — not a concept node but the
    // `vault-readme` the generator always produces.
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
 * This test used to check only **whether a constant equalled its own literal**. So
 * when #730 removed the download screen's sentences all 249 tests stayed green, and
 * the defect surfaced only where `desktop:smoke` actually runs after `pnpm build` —
 * **the release build after the tag was cut**. A gate that verifies itself is not a
 * gate.
 *
 * It now pins **keys** rather than sentences and checks that they resolve against
 * the live catalogue. Copy changes bring the gate with them, and a deleted key turns
 * this red immediately.
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
      // Copy with an ICU placeholder renders differently from its source and cannot be found in the static HTML.
      assert.doesNotMatch(fragment, /[{}]/, `${locale} "${fragment}" carries an ICU placeholder`);
    }
  }

  // Two locales producing the same sentence means one catalogue was left untranslated.
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
    // The key must be live and carry a placeholder — using a deleted key makes this
    // probe throw "missing key" instead of "ICU rejected", so **it tests something
    // other than what it was written to test** (which happened on 2026-07-29 when
    // `macosPublishedBadge` disappeared in the gateway redesign).
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
 * **A marker cannot outlive the product** (added 2026-08-01).
 *
 * The table above is a hand-maintained list of strings, which is why the top of this
 * file says a marker *"must say what this route is today, not what it used to be"*.
 * That discipline had **nothing enforcing it**, and it duly collapsed.
 *
 * `/topology`'s marker set (`canvas-v2` · `active-relation-inspector` ·
 * `focus-path-state`) kept passing the gate after those components retired. Why it
 * passed is the point: those names survived **in prose inside the generated docs
 * JSON** (`src/entities/docs-vault/data/*`), that JSON was inlined into the page, and
 * so `html.includes(marker)` was true. The gate was measuring whether a document
 * fragment mentioning old components had entered the bundle, not the topology screen.
 *
 * So when #806 regenerated the vault and that prose disappeared, the rc.5 release
 * rehearsal stopped here — with topology perfectly healthy. **Passing for the wrong
 * reason and then going red on an unrelated change** are exactly the two directions
 * `.claude/rules/documentation.md` warns about for pinned strings.
 *
 * This test closes that hole: every marker must exist in **product source outside
 * generated output**. A marker present only in generated data points at that day's
 * documentation, not at the product.
 */
test("smoke markers must exist in product source, not only in generated data", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  /** Generated output is excluded — an appearance there is not evidence the product has it. */
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
      // Path fragments (`/topology/?`) and ordinary words (`index`) are not component markers.
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
  // The sentence being removed also comes from the catalogue — pinning a literal
  // would make this probe itself silently meaningless at the next remake (which is
  // exactly what happened after #730).
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
