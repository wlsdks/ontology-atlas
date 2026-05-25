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

test("desktop smoke proves packaged locale routes and offline docs exist", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });

  for (const locale of ["en", "ko"]) {
    for (const route of ["/download", "/docs", "/ontology", "/topology", "/ontology/edit"]) {
      touch(outDir, path.join(locale, route.replace(/^\/+/, ""), "index.html"));
    }
  }
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  touch(outDir, "docs-vault/ontology/capabilities/desktop-app-distribution.md");

  const report = evaluateDesktopSmoke({ outDir });

  assert.equal(report.ok, true);
  assert.equal(report.missing.length, 0);
  assert.match(report.nextAction, /pnpm desktop:dev/);
});

test("desktop smoke reports the exact missing packaged route", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "en/docs/index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs", "/topology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route:en:/topology"],
  );
  assert.match(report.nextAction, /pnpm build/);
});
