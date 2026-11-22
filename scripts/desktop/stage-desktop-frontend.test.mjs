import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { isDesktopFrontendPath, stageDesktopFrontend } from "./stage-desktop-frontend.mjs";

const locales = ["en", "ko"];
const tempDirs = [];

function makeExport(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-atlas-desktop-frontend-"));
  tempDirs.push(root);
  for (const file of files) {
    const filePath = path.join(root, "out", ...file.split("/"));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file);
  }
  return root;
}

function listFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort();
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("isDesktopFrontendPath", () => {
  it("keeps the app's routes, assets and offline docs", () => {
    for (const kept of [
      "index.html",
      "404.html",
      "logo.png",
      "_next/static/chunks/app.js",
      "docs-vault/guide/start.md",
      "en/index.html",
      "en/topology/index.html",
      "en/guide/index.html",
      "en/changelog/index.html",
      "en/project/fallback/index.html",
      "en/project/new/index.html",
    ]) {
      assert.equal(isDesktopFrontendPath(kept, { locales }), true, kept);
    }
  });

  it("leaves out the website's own pages and files", () => {
    for (const dropped of [
      "demo/clip.en.mp4",
      "gateway/screen.png",
      "og/en.png",
      "og-image.png",
      "llms-full.txt",
      "sitemap.xml",
      "robots.txt",
      "ko/download/index.html",
      "en/project/storefront",
      "en/project/storefront/edit/index.html",
    ]) {
      assert.equal(isDesktopFrontendPath(dropped, { locales }), false, dropped);
    }
  });

  it("matches route names only under a locale", () => {
    // A vault document may be called `download`; only `<locale>/download` is the gateway page.
    assert.equal(isDesktopFrontendPath("docs-vault/features/download.md", { locales }), true);
    assert.equal(isDesktopFrontendPath("docs-vault/project/storefront.md", { locales }), true);
  });
});

describe("stageDesktopFrontend", () => {
  it("copies the kept files, reports the dropped ones, and replaces an older stage", () => {
    const root = makeExport([
      "index.html",
      "_next/static/chunks/app.js",
      "demo/clip.en.mp4",
      "en/topology/index.html",
      "en/download/index.html",
      "en/project/fallback/index.html",
      "en/project/storefront/index.html",
    ]);
    const target = path.join(root, "staged");
    fs.mkdirSync(path.join(target, "en", "download"), { recursive: true });
    fs.writeFileSync(path.join(target, "en", "download", "index.html"), "stale");

    const report = stageDesktopFrontend({ root, target, locales });

    assert.deepEqual(listFiles(target), [
      "_next/static/chunks/app.js",
      "en/project/fallback/index.html",
      "en/topology/index.html",
      "index.html",
    ]);
    assert.deepEqual(report.dropped, ["demo", "en/download", "en/project/storefront"]);
    assert.equal(report.staged.files, 4);
    assert.equal(report.source.files, 7);
  });

  it("refuses an export without the root entry Tauri falls back to", () => {
    const root = makeExport(["_next/static/chunks/app.js"]);
    assert.throws(
      () => stageDesktopFrontend({ root, target: path.join(root, "staged"), locales }),
      /index\.html is missing; run pnpm build first/,
    );
  });
});
