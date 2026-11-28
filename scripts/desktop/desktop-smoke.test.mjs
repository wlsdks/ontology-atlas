import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DESKTOP_SMOKE_APP_ROUTES,
  DESKTOP_SMOKE_LOCALES,
  DESKTOP_SMOKE_ROOT_ENTRY,
  DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  DESKTOP_SMOKE_ROUTE_TEXT_KEYS,
  DESKTOP_SMOKE_SITE_FILES,
  DESKTOP_SMOKE_THIRD_PARTY_LICENSES,
  evaluateDesktopSmoke,
  resolveDownloadTitles,
  resolveRouteText,
} from "./desktop-smoke.mjs";

/** The expected copy expanded from the catalogue — the fixture uses the same source as the gate. */
const ROUTE_TEXT = resolveRouteText();
const TITLES = resolveDownloadTitles();
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const loadingWords = (locale) => JSON.parse(fs.readFileSync(`messages/${locale}/mapEntry.json`, "utf8"));

function write(root, relativePath, contents = "<!doctype html>") {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

/** An app folder, a site folder and the app build's manifest that satisfy the smoke, as a build would write them. */
function makeCurrentFolders() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-desktop-smoke-"));
  const appDir = path.join(root, "app");
  const siteDir = path.join(root, "site");
  const manifestPath = path.join(root, "manifest.json");

  const pictures = DESKTOP_SMOKE_LOCALES.flatMap((locale) => {
    const { mapComing, loadingDetail } = loadingWords(locale);
    return [escapeHtml(mapComing), escapeHtml(loadingDetail)];
  });
  write(appDir, DESKTOP_SMOKE_ROOT_ENTRY, `<!doctype html><script type="module" src="/assets/index-a1.js"></script><p>${pictures.join("</p><p>")}</p>`);
  write(appDir, DESKTOP_SMOKE_THIRD_PARTY_LICENSES, "license texts");
  // The public file the code names by its address, so the app-folder check finds it named.
  write(appDir, "assets/folders-b2.js", '"/third-party-licenses.txt"');

  const manifest = { "index.html": { file: "assets/index-a1.js", isEntry: true } };
  const loads = ['import("./folders-b2.js")'];
  for (const [route, source] of Object.entries(DESKTOP_SMOKE_APP_ROUTES)) {
    const name = `route-${route.slice(1).replaceAll("/", "-")}.js`;
    write(appDir, `assets/${name}`, (DESKTOP_SMOKE_ROUTE_CHUNK_TEXT[route] ?? []).join("\n"));
    manifest[`${source}.tsx`] = { file: `assets/${name}`, src: `${source}.tsx`, isDynamicEntry: true };
    loads.push(`import("./${name}")`);
  }
  // The entry loads every route chunk, as the router's code splitting does, so each file is one the bundle names.
  write(appDir, "assets/index-a1.js", loads.join(";"));
  write(root, "manifest.json", JSON.stringify(manifest));

  for (const locale of DESKTOP_SMOKE_LOCALES) {
    write(siteDir, `${locale}/download/index.html`, `<title>${TITLES[locale]}</title><main>${ROUTE_TEXT[`${locale}:/download`].join(" ")}</main>`);
  }
  for (const file of DESKTOP_SMOKE_SITE_FILES) write(siteDir, file, "x");
  write(siteDir, "assets/download-c3.js", DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/download"].join("\n"));
  return { root, appDir, siteDir, manifestPath, manifest };
}

const evaluate = ({ appDir, siteDir, manifestPath }) =>
  evaluateDesktopSmoke({ appDir, siteDir, manifestPath, routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT });

const failing = (report) => report.missing.map((check) => check.id);

test("desktop smoke inventory covers the screens the installed app packages", () => {
  assert.deepEqual(DESKTOP_SMOKE_LOCALES, ["en", "ja", "ko", "zh"]);
  assert.deepEqual(Object.keys(DESKTOP_SMOKE_APP_ROUTES), ["/docs", "/ontology", "/topology", "/ontology/edit", "/ontology/insights"]);
});

/**
 * Pins keys, not sentences, and checks that they resolve against the live catalogue, so copy
 * changes bring the gate along.
 */
test("desktop smoke wording is read from the live message catalog and refuses a retired key", () => {
  assert.deepEqual(Object.keys(DESKTOP_SMOKE_ROUTE_TEXT_KEYS), ["/download"]);
  assert.deepEqual(Object.keys(ROUTE_TEXT).sort(), ["en:/download", "ja:/download", "ko:/download", "zh:/download"]);
  for (const locale of DESKTOP_SMOKE_LOCALES) {
    assert.equal(TITLES[locale], JSON.parse(fs.readFileSync(`messages/${locale}.json`, "utf8")).metadata.homeTitle);
    for (const fragment of ROUTE_TEXT[`${locale}:/download`]) {
      // Copy with an ICU placeholder renders differently from its source and cannot be found in the static HTML.
      assert.doesNotMatch(fragment, /[{}]/, `${locale} "${fragment}" carries an ICU placeholder`);
    }
  }
  // Two locales producing the same sentence means one catalogue was left untranslated.
  assert.notDeepEqual(ROUTE_TEXT["en:/download"], ROUTE_TEXT["ko:/download"]);

  assert.throws(() => resolveRouteText({ keysByRoute: { "/download": ["download.factStripRetired"] } }), /no longer exists/);
  // The key must be live and carry a placeholder: a deleted key makes the probe throw "missing key" instead.
  assert.throws(() => resolveRouteText({ keysByRoute: { "/download": ["download.factShaLink"] } }), /ICU placeholder/);
  assert.throws(() => resolveDownloadTitles({ locales: [] }), /at least one locale/);
});

/**
 * Every marker must exist in product source outside generated output: a marker found only in
 * generated docs data passes for the wrong reason and goes red on an unrelated change
 * (`.claude/rules/documentation.md`).
 */
test("smoke markers must exist in product source, not only in generated data", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  /** Generated output is excluded — an appearance there is not evidence the product has it. */
  const GENERATED = [
    path.join("src", "entities", "docs-vault", "data"),
    path.join("public", "docs-vault"),
  ];
  const roots = ["src", "app", "messages"];

  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
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
    const directory = path.join(repoRoot, root);
    if (fs.existsSync(directory)) walk(directory);
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

test("desktop smoke accepts the app folder, the site folder and the manifest a build writes", () => {
  const folders = makeCurrentFolders();
  try {
    const report = evaluate(folders);
    assert.deepEqual(failing(report), []);
    assert.match(report.nextAction, /desktop:dev|desktop:build/);
  } finally {
    fs.rmSync(folders.root, { recursive: true, force: true });
  }
});

test("desktop smoke names a missing build artifact as one to build, and drift as one to read", () => {
  const folders = makeCurrentFolders();
  try {
    fs.rmSync(path.join(folders.appDir, DESKTOP_SMOKE_ROOT_ENTRY));
    fs.rmSync(path.join(folders.appDir, DESKTOP_SMOKE_THIRD_PARTY_LICENSES));
    const missingArtifact = evaluate(folders);
    assert.equal(missingArtifact.blockerKind, "missing-build-artifact");
    assert.ok(failing(missingArtifact).includes("root-entry") && failing(missingArtifact).includes("third-party-licenses"));
    assert.match(missingArtifact.nextAction, /pnpm build/);

    write(folders.appDir, DESKTOP_SMOKE_ROOT_ENTRY, '<!doctype html><script type="module" src="/assets/index-a1.js"></script>');
    write(folders.appDir, DESKTOP_SMOKE_THIRD_PARTY_LICENSES, "license texts");
    const drift = evaluate(folders);
    assert.deepEqual(failing(drift), DESKTOP_SMOKE_LOCALES.map((locale) => `loading-picture:${locale}`));
    assert.equal(drift.blockerKind, "static-contract-drift");
    assert.doesNotMatch(drift.nextAction, /pnpm build/);
  } finally {
    fs.rmSync(folders.root, { recursive: true, force: true });
  }
});

test("desktop smoke refuses a file only the website serves, or one nothing names, in the app folder", () => {
  const folders = makeCurrentFolders();
  try {
    write(folders.appDir, "og-image.png", "png");
    assert.ok(failing(evaluate(folders)).includes("app-folder-contents"));
    fs.rmSync(path.join(folders.appDir, "og-image.png"));
    write(folders.appDir, "orphan.bin", "x");
    assert.ok(failing(evaluate(folders)).includes("app-folder-contents"));
  } finally {
    fs.rmSync(folders.root, { recursive: true, force: true });
  }
});

test("desktop smoke follows a route's lazy chunks, and an unrelated chunk cannot stand in for one", () => {
  const folders = makeCurrentFolders();
  const { appDir, manifest, manifestPath } = folders;
  const source = `${DESKTOP_SMOKE_APP_ROUTES["/ontology"]}.tsx`;
  const markers = DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology"];
  const withLazyMarkers = () => {
    write(appDir, "assets/lazy-d4.js", markers.join("\n"));
    write(appDir, "assets/route-ontology.js", 'import("./lazy-d4.js")');
    manifest[source] = { ...manifest[source], dynamicImports: ["lazy"] };
    manifest.lazy = { file: "assets/lazy-d4.js", isDynamicEntry: true };
    write(path.dirname(manifestPath), "manifest.json", JSON.stringify(manifest));
  };
  try {
    withLazyMarkers();
    assert.deepEqual(failing(evaluate(folders)), [], "markers in a chunk the route loads on demand count");

    delete manifest[source].dynamicImports;
    write(path.dirname(manifestPath), "manifest.json", JSON.stringify(manifest));
    assert.ok(failing(evaluate(folders)).includes("route-chunk-text:/ontology"), "a chunk the route does not load cannot satisfy it");
  } finally {
    fs.rmSync(folders.root, { recursive: true, force: true });
  }
});

test("desktop smoke detects drift in the download page the website serves", () => {
  const folders = makeCurrentFolders();
  try {
    const page = path.join(folders.siteDir, "ko/download/index.html");
    const [firstFragment] = ROUTE_TEXT["ko:/download"];
    fs.writeFileSync(page, fs.readFileSync(page, "utf8").replace(firstFragment, ""));
    fs.writeFileSync(path.join(folders.siteDir, "en/download/index.html"), "<title>Old title</title>");
    const report = evaluate(folders);
    assert.deepEqual(failing(report).sort(), ["route-text:en:/download", "route-text:ko:/download", "route-title:en:/download"].sort());
    assert.match(report.nextAction, /drift/i);
  } finally {
    fs.rmSync(folders.root, { recursive: true, force: true });
  }
});
