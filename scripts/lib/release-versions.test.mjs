import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readAppVersions, versionMismatches } from "./release-versions.mjs";

function withVersionFiles({ app, mcp }, check) {
  const root = mkdtempSync(join(tmpdir(), "release-versions-"));
  try {
    mkdirSync(join(root, "src-tauri"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: app }));
    writeFileSync(join(root, "src-tauri", "tauri.conf.json"), JSON.stringify({ version: app }));
    writeFileSync(join(root, "src-tauri", "Cargo.toml"), `[package]\nname = "ontology-atlas"\nversion = "${app}"\n`);
    if (mcp !== undefined) {
      mkdirSync(join(root, "mcp"));
      writeFileSync(join(root, "mcp", "package.json"), JSON.stringify({ version: mcp }));
    }
    check(readAppVersions(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("four declarations of one version have no mismatch", () => {
  withVersionFiles({ app: "2.7.15", mcp: "2.7.15" }, (versions) => {
    assert.deepEqual(versionMismatches(versions, "2.7.15"), []);
  });
});

test("an MCP server version that lags the app is named as the one mismatch", () => {
  withVersionFiles({ app: "2.7.15", mcp: "0.13.0" }, (versions) => {
    assert.deepEqual(versionMismatches(versions, "2.7.15"), ["mcp=0.13.0"]);
  });
});

test("a missing MCP manifest is reported as missing rather than passing", () => {
  withVersionFiles({ app: "2.7.15" }, (versions) => {
    assert.deepEqual(versionMismatches(versions, "2.7.15"), ["mcp=missing"]);
  });
});
