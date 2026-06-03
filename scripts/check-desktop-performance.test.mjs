import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  DESKTOP_PERFORMANCE_BUDGETS,
  evaluateDesktopPerformance,
} from "./check-desktop-performance.mjs";

const tempDirs = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omot-desktop-perf-"));
  tempDirs.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "oh-my-ontology", version: "0.1.0" }),
  );
  fs.mkdirSync(path.join(root, "src-tauri"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src-tauri", "tauri.conf.json"),
    JSON.stringify({
      productName: "Context Atlas",
      version: "0.1.0",
      identifier: "dev.jinan.context-atlas",
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
  writeFile(root, "out/index.html", 1024);
  writeFile(root, "out/_next/static/chunks/app.js", 2048);
  writeFile(
    root,
    "src-tauri/target/release/bundle/macos/Context Atlas.app/Contents/MacOS/context-atlas",
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
  });

  it("reports a missing app bundle when app artifacts are required", () => {
    const root = makeTempRoot();
    writeFile(root, "out/index.html", 1024);
    writeFile(root, "out/_next/static/chunks/app.js", 2048);

    const result = evaluateDesktopPerformance({ root, requireApp: true });

    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, [
      "src-tauri/target/release/bundle/macos/Context Atlas.app",
    ]);
  });

  it("fails when a JS chunk exceeds the desktop startup budget", () => {
    const root = makeTempRoot();
    writeMinimalArtifacts(root);
    writeFile(
      root,
      "out/_next/static/chunks/huge.js",
      DESKTOP_PERFORMANCE_BUDGETS.maxStaticAssetBytes + 1,
    );

    const result = evaluateDesktopPerformance({ root, requireApp: true });
    const largestChunkCheck = result.checks.find(
      (check) => check.label === "largest JS/CSS chunk",
    );

    assert.equal(result.ok, false);
    assert.equal(largestChunkCheck?.ok, false);
    assert.equal(largestChunkCheck?.detail, "out/_next/static/chunks/huge.js");
  });
});
