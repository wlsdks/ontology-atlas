import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  DESKTOP_PERFORMANCE_BUDGETS,
  DESKTOP_PERFORMANCE_EVIDENCE_BOUNDARY,
  evaluateDesktopPerformance,
} from "./check-desktop-performance.mjs";

const tempDirs = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-atlas-desktop-perf-"));
  tempDirs.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "ontology-atlas", version: "0.1.0" }),
  );
  fs.mkdirSync(path.join(root, "src-tauri"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src-tauri", "tauri.conf.json"),
    JSON.stringify({
      productName: "Ontology Atlas",
      version: "0.1.0",
      identifier: "dev.jinan.ontology-atlas",
    }),
  );
  return root;
}

function writeFile(root, relativePath, size) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(size, "x"));
}

function writeMinimalArtifacts(root) {
  writeFile(root, "src-tauri/target/desktop-frontend/index.html", 1024);
  writeFile(root, "src-tauri/target/desktop-frontend/assets/app.js", 2048);
  writeFile(
    root,
    "src-tauri/target/release/bundle/macos/Ontology Atlas.app/Contents/MacOS/ontology-atlas",
    4096,
  );
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("evaluateDesktopPerformance", () => {
  it("accepts static and app artifacts under budget", () => {
    const root = makeTempRoot();
    writeMinimalArtifacts(root);

    const result = evaluateDesktopPerformance({ root, requireApp: true });

    assert.equal(result.ok, true);
    assert.equal(result.missing.length, 0);
    assert.equal(result.checks.length, 4);
    assert.deepEqual(
      result.checks.filter((check) => check.kind === "metric").map((check) => check.label),
      ["app folder size", "macOS .app bundle size"],
    );
    assert.equal(result.evidenceBoundary, DESKTOP_PERFORMANCE_EVIDENCE_BOUNDARY);
  });

  it("does not fail on the app folder or .app size metrics", () => {
    const root = makeTempRoot();
    writeMinimalArtifacts(root);

    const result = evaluateDesktopPerformance({
      root,
      requireApp: true,
      budgets: {
        ...DESKTOP_PERFORMANCE_BUDGETS,
        appFolderBytes: 1,
        appBundleBytes: 1,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.checks.find((check) => check.label === "app folder size")?.ok, true);
    assert.equal(result.checks.find((check) => check.label === "macOS .app bundle size")?.ok, true);
  });

  it("reports a missing app bundle when app artifacts are required", () => {
    const root = makeTempRoot();
    writeFile(root, "src-tauri/target/desktop-frontend/index.html", 1024);
    writeFile(root, "src-tauri/target/desktop-frontend/assets/app.js", 2048);

    const result = evaluateDesktopPerformance({ root, requireApp: true });

    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, [
      "src-tauri/target/release/bundle/macos/Ontology Atlas.app",
    ]);
  });

  it("fails when a JS chunk exceeds the desktop startup budget", () => {
    const root = makeTempRoot();
    writeMinimalArtifacts(root);
    writeFile(
      root,
      "src-tauri/target/desktop-frontend/assets/huge.js",
      DESKTOP_PERFORMANCE_BUDGETS.maxStaticAssetBytes + 1,
    );

    const result = evaluateDesktopPerformance({ root, requireApp: true });
    const largestChunkCheck = result.checks.find(
      (check) => check.label === "largest JS/CSS chunk",
    );

    assert.equal(result.ok, false);
    assert.equal(largestChunkCheck?.ok, false);
    assert.equal(largestChunkCheck?.detail, "src-tauri/target/desktop-frontend/assets/huge.js");
  });

  it("fails when the bundled asset total exceeds its budget", () => {
    const root = makeTempRoot();
    writeMinimalArtifacts(root);
    writeFile(root, "src-tauri/target/desktop-frontend/assets/large.css", DESKTOP_PERFORMANCE_BUDGETS.bundleBytes);

    const result = evaluateDesktopPerformance({ root });
    const staticTotalCheck = result.checks.find(
      (check) => check.label === "bundled asset size",
    );

    assert.equal(result.ok, false);
    assert.equal(staticTotalCheck?.ok, false);
  });

  it("fails closed when no JS/CSS asset can be measured", () => {
    const root = makeTempRoot();
    writeFile(root, "src-tauri/target/desktop-frontend/index.html", 1024);
    fs.mkdirSync(path.join(root, "src-tauri", "target", "desktop-frontend", "assets"), { recursive: true });

    const result = evaluateDesktopPerformance({ root });
    const largestChunkCheck = result.checks.find(
      (check) => check.label === "largest JS/CSS chunk",
    );

    assert.equal(result.ok, false);
    assert.equal(largestChunkCheck?.ok, false);
    assert.equal(largestChunkCheck?.actual, null);
  });
});
