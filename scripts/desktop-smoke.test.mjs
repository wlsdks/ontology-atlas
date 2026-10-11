import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DESKTOP_SMOKE_DOCS,
  DESKTOP_SMOKE_THIRD_PARTY_LICENSES,
  DESKTOP_SMOKE_LOCALES,
  DESKTOP_SMOKE_ROOT_ENTRY,
  DESKTOP_SMOKE_ROUTES,
  DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  DESKTOP_SMOKE_ROUTE_TEXT_KEYS,
  DESKTOP_SMOKE_ROUTE_TITLES,
  DESKTOP_SMOKE_ROUTE_TITLE_KEYS,
  resolveRouteTitles,
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
  write(outDir, DESKTOP_SMOKE_THIRD_PARTY_LICENSES, "license texts");

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
  assert.deepEqual(DESKTOP_SMOKE_LOCALES, ["en", "ja", "ko", "zh"]);
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

test("desktop smoke titles derive current route metadata for every locale", () => {
  assert.equal(Object.keys(DESKTOP_SMOKE_ROUTE_TITLES).length, 20);
  assert.equal(DESKTOP_SMOKE_ROUTE_TITLE_KEYS["/ontology/edit"], undefined);
  for (const locale of DESKTOP_SMOKE_LOCALES) {
    const { metadata } = JSON.parse(fs.readFileSync(`messages/${locale}.json`, "utf8"));
    for (const [route, key] of Object.entries(DESKTOP_SMOKE_ROUTE_TITLE_KEYS)) {
      const expected = route === "/download" ? metadata.homeTitle : `${metadata.pages[key]} · ${metadata.siteName}`;
      assert.equal(DESKTOP_SMOKE_ROUTE_TITLES[`${locale}:${route}`], expected);
    }
  }
});

test("download uses absolute landing metadata and refuses a missing title", () => {
  const root = makeOutDir();
  try {
    const messages = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
    messages.metadata.homeTitle = "Fixture landing title";
    messages.metadata.siteName = "Fixture brand";
    write(root, "messages/en.json", JSON.stringify(messages));
    assert.equal(resolveRouteTitles({ root, locales: ["en"] })["en:/download"], messages.metadata.homeTitle);
    delete messages.metadata.homeTitle;
    write(root, "messages/en.json", JSON.stringify(messages));
    assert.throws(() => resolveRouteTitles({ root, locales: ["en"] }), /en:\/download.*metadata.homeTitle/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("desktop title expectations follow a changed catalogue and reject missing metadata", () => {
  const root = makeOutDir();
  try {
    const messages = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
    messages.metadata.pages.docs = "Renamed fixture collection";
    write(root, "messages/en.json", JSON.stringify(messages));
    assert.equal(resolveRouteTitles({ root, locales: ["en"] })["en:/docs"], `Renamed fixture collection · ${messages.metadata.siteName}`);
    delete messages.metadata.pages.docs;
    write(root, "messages/en.json", JSON.stringify(messages));
    assert.throws(() => resolveRouteTitles({ root, locales: ["en"] }), /en:\/docs.*metadata.pages.docs/);
    assert.throws(() => resolveRouteTitles({ root, locales: [] }), /at least one locale/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Pins keys, not sentences, and checks that they resolve against the live catalogue, so copy
 * changes bring the gate along.
 */
test("desktop smoke download copy is read from the live message catalog", () => {
  assert.deepEqual(Object.keys(DESKTOP_SMOKE_ROUTE_TEXT_KEYS), ["/download"]);

  const resolved = resolveRouteText();
  assert.deepEqual(Object.keys(resolved).sort(), ["en:/download", "ja:/download", "ko:/download", "zh:/download"]);

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
    // The key must be live and carry a placeholder: a deleted key makes the probe throw "missing key"
    // instead of "ICU rejected".
    () => resolveRouteText({ keysByRoute: { "/download": ["download.factShaLink"] } }),
    /ICU placeholder/,
  );
});

test("desktop smoke chunks prove current route meaning", () => {
  assert.deepEqual(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT, {
    "/download": [
      "gateway-hero-cta",
      "gateway-demo-section",
      "gateway-screens-section",
    ],
    "/docs": [
      "data-docs-header-zone",
      "data-docs-viewer",
      "sourceContract.filesLabel",
      "sourceContract.graphLabel",
      "sourceContract.agentLabel",
    ],
    "/ontology": ["/topology/?", "index", "expanded"],
    "/topology": ["ontology-map-canvas", "topology-concept-search"],
    "/ontology/edit": ["/topology/?p=", "/topology/?workbench=create"],
    "/ontology/insights": [
      "relationship-analysis",
      "claim-evidence",
      "analysis-dependency-diagram",
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
 * Every marker must exist in product source outside generated output: a marker found only in
 * generated docs data passes for the wrong reason and goes red on an unrelated change
 * (`.claude/rules/documentation.md`).
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
      else if (
        /\.(tsx?|json|css)$/.test(entry.name)
        && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
      ) files.push(full);
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
      // Ordinary words (`index`) are not stable markers. Route fragments must still appear in current
      // product source, or a retired redirect survives until the release build.
      if (!marker.startsWith("/") && !/[-.]/.test(marker)) continue;
      if (!haystack.includes(marker)) orphaned.push(`${route} → ${marker}`);
    }
  }
  assert.deepEqual(
    orphaned,
    [],
    `Smoke markers absent from product source (generated files excluded): the component retired and left its marker behind, `
      + `or the marker is a typo. Left alone, the gate passes for the wrong reason, then turns red on an unrelated change:\n  `
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

test("desktop smoke refuses an export without the third-party license texts", () => {
  const outDir = makeCurrentOut();
  fs.rmSync(path.join(outDir, DESKTOP_SMOKE_THIRD_PARTY_LICENSES));

  const report = evaluateDesktopSmoke({
    outDir,
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.missing.map((check) => check.id), ["third-party-licenses"]);
  assert.match(report.nextAction, /pnpm build/);
});

test("desktop smoke detects stale route metadata without prescribing another build", () => {
  const outDir = makeCurrentOut();
  const routePath = routeIndexPath("en", "/ontology/insights");
  const html = fs.readFileSync(path.join(outDir, routePath), "utf8");
  write(
    outDir,
    routePath,
    html.replace("Analysis · Ontology Atlas", "Verify Graph · Ontology Atlas"),
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
  write(outDir, chunkPath, chunk.replace("analysis-dependency-diagram", ""));

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

test("desktop smoke follows reachable lazy chunks without accepting unrelated output", () => {
  const outDir = makeCurrentOut();
  const entry = routeChunkPath("en", "/ontology/insights");
  const lazy = "_next/static/chunks/insights-lazy.js";
  const nested = "_next/static/chunks/insights-handoff.js";
  const markers = DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"];
  const evaluate = () => evaluateDesktopSmoke({ outDir, routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT });
  try {
    write(outDir, entry, 'load("static/chunks/insights-lazy.js")');
    write(outDir, lazy, `${markers.slice(0, 2).join("\n")}\nload("static/chunks/insights-handoff.js")`);
    write(outDir, nested, `${markers[2]}\nload("${entry}")`);
    assert.equal(evaluate().ok, true, "lazy descendants and cycles remain reachable");

    fs.unlinkSync(path.join(outDir, nested));
    write(outDir, "_next/static/chunks/unrelated.js", markers[2]);
    const missing = evaluate();
    assert.equal(missing.ok, false, "an unrelated chunk cannot replace a missing descendant");
    assert.ok(missing.missing.some((check) => check.id === "route-chunk-text:en:/ontology/insights"));

    write(outDir, nested, markers[2]);
    assert.equal(evaluate().ok, true, "restoring the reachable artifact restores the gate");

    write(outDir, entry, "");
    assert.equal(evaluate().ok, false, "orphaned output cannot satisfy a route contract");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
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

test("desktop smoke follows an injected four-locale list", () => {
  const root = makeOutDir();
  try {
    const locales = ["en", "ja", "ko", "zh"];
    for (const locale of locales) {
      const catalog = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
      catalog.metadata.siteName = `Site ${locale}`;
      catalog.metadata.homeTitle = `Home ${locale}`;
      write(root, `messages/${locale}.json`, JSON.stringify(catalog));
    }
    const titles = resolveRouteTitles({ root, locales });
    assert.equal(Object.keys(titles).length, locales.length * Object.keys(DESKTOP_SMOKE_ROUTE_TITLE_KEYS).length);
    assert.equal(titles["zh:/download"], "Home zh");
    assert.ok(titles["zh:/docs"].endsWith("· Site zh"));
    assert.deepEqual(
      Object.keys(resolveRouteText({ root, locales })).sort(),
      locales.map((locale) => `${locale}:/download`),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
