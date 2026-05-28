import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateDesktopSmoke } from "./desktop-smoke.mjs";

function makeOutDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "omo-desktop-smoke-"));
}

function touch(root, relativePath) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "<!doctype html>", "utf8");
}

function htmlWithWorkbenchProof(title = "Context Atlas") {
  return `<!doctype html><title>${title}</title><main>Source Vault Files Graph Agent Copy graph gate graph gate 복사 Source Draft Guard Proof 01 02 03 04 local markdown canvas draft relation guard graph db + health Tree role Graph refs Evidence 역할 참조 근거 Query cockpit Readiness Pack MCP CLI self-check + health gate Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius runtime replay canonical slug active slug 활성 slug Copy guard Guard 복사 Copy sync gate sync gate 복사 Copy runtime gate runtime gate 복사</main>`;
}

test("desktop smoke proves packaged locale routes and offline docs exist", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");

  for (const locale of ["en", "ko"]) {
    for (const route of ["/download", "/docs", "/ontology", "/topology", "/ontology/edit", "/ontology/insights"]) {
      touch(outDir, path.join(locale, route.replace(/^\/+/, ""), "index.html"));
    }
  }
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  touch(outDir, "docs-vault/ontology/capabilities/desktop-app-distribution.md");

  const report = evaluateDesktopSmoke({ outDir, routeTitles: {}, routeText: {} });

  assert.equal(report.ok, true);
  assert.equal(report.missing.length, 0);
  assert.ok(report.checks.some((check) => check.id === "root-entry"));
  assert.match(report.nextAction, /pnpm desktop:dev/);
});

test("desktop smoke checks ontology workbench route titles", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const routes = {
    "en/ontology/index.html": "Ontology · Context Atlas",
    "ko/ontology/index.html": "온톨로지 · Context Atlas",
    "en/ontology/edit/index.html": "Ontology Builder · Context Atlas",
    "ko/ontology/edit/index.html": "온톨로지 빌더 · Context Atlas",
    "en/ontology/insights/index.html": "Ontology Insights · Context Atlas",
    "ko/ontology/insights/index.html": "온톨로지 인사이트 · Context Atlas",
  };
  for (const [relativePath, title] of Object.entries(routes)) {
    const filePath = path.join(outDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, htmlWithWorkbenchProof(title), "utf8");
  }

  const report = evaluateDesktopSmoke({
    outDir,
    routes: ["/ontology", "/ontology/edit", "/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, true);
  assert.equal(report.missing.length, 0);
  assert.ok(report.checks.some((check) => check.id === "route-title:en:/ontology/insights"));
  assert.ok(report.checks.some((check) => check.id === "route-title:ko:/ontology/insights"));
  assert.ok(report.checks.some((check) => check.id === "route-text:en:/ontology/insights"));
  assert.ok(report.checks.some((check) => check.id === "route-text:ko:/ontology/insights"));
});

test("desktop smoke fails when source vault graph gate copy action is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/docs/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><main>Source Vault Files Graph Agent</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/docs"],
  );
  assert.match(report.missing[0].details, /Copy graph gate/);
});

test("desktop smoke fails when an ontology route title is stale", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  touch(outDir, "en/ontology/insights/index.html");

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeText: {},
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-title:en:/ontology/insights"],
  );
});

test("desktop smoke fails when ontology workbench proof copy is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "<!doctype html><title>Ontology Builder · Context Atlas</title>", "utf8");

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
});

test("desktop smoke fails when builder active slug proof handle is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "ko/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>온톨로지 빌더 · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["ko"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:ko:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /활성 slug/);
});

test("desktop smoke fails when builder write loop cells are absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology Builder · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius active slug Copy guard</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /Source/);
  assert.match(report.missing[0].details, /Draft/);
  assert.match(report.missing[0].details, /Guard/);
  assert.match(report.missing[0].details, /Proof/);
});

test("desktop smoke fails when builder write loop order and proof chips are absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology Builder · Context Atlas</title><main>Source Draft Guard Proof Graph DB proof Browse Write Query dogfood:graph-db runtime replay focused blast_radius active slug Copy guard Copy sync gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /01/);
  assert.match(report.missing[0].details, /04/);
  assert.match(report.missing[0].details, /local markdown/);
  assert.match(report.missing[0].details, /canvas draft/);
  assert.match(report.missing[0].details, /relation guard/);
  assert.match(report.missing[0].details, /graph db \+ health/);
});

test("desktop smoke fails when browse canonical slug proof handle is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /canonical slug/);
});

test("desktop smoke fails when browse tree role strip is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius canonical slug Copy runtime gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /Tree role/);
  assert.match(report.missing[0].details, /Graph refs/);
  assert.match(report.missing[0].details, /Evidence/);
});

test("desktop smoke fails when browse runtime gate copy action is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db canonical slug</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /Copy runtime gate/);
});

test("desktop smoke fails when browse runtime gate does not name focused blast-radius replay", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db canonical slug Copy runtime gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /focused blast_radius/);
});

test("desktop smoke fails when builder guard copy action is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology Builder · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db active slug</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /Copy guard/);
});

test("desktop smoke fails when builder sync gate copy action is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology Builder · Context Atlas</title><main>Source Draft Guard Proof Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius active slug Copy guard</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /Copy sync gate/);
});

test("desktop smoke fails when builder focused blast-radius replay proof is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology Builder · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db active slug Copy guard</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /focused blast_radius/);
});

test("desktop smoke fails when builder runtime replay proof is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology Builder · Context Atlas</title><main>Source Draft Guard Proof Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius active slug Copy guard Copy sync gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /runtime replay/);
});

test("desktop smoke fails when insights runtime gate copy action is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/insights/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology Insights · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/insights"],
  );
  assert.match(report.missing[0].details, /Copy runtime gate/);
});

test("desktop smoke fails when insights query cockpit contract is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/insights/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology Insights · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius Copy runtime gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/insights"],
  );
  assert.match(report.missing[0].details, /Query cockpit/);
  assert.match(report.missing[0].details, /Readiness/);
  assert.match(report.missing[0].details, /self-check \+ health gate/);
});

test("desktop smoke fails when insights runtime gate does not name focused blast-radius replay", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/insights/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology Insights · Context Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db Copy runtime gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/insights"],
  );
  assert.match(report.missing[0].details, /focused blast_radius/);
});

test("desktop smoke reports the exact missing packaged route", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "en/docs/index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs", "/topology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeText: {},
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route:en:/topology"],
  );
  assert.match(report.nextAction, /pnpm build/);
});

test("desktop smoke reports the exact missing Tauri app root entry", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "en/docs/index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeText: {},
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["root-entry"],
  );
});
