import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { cleanTauriMacosApps } from "./clean-tauri-macos-apps.mjs";

const tempDirs = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omot-desktop-clean-"));
  tempDirs.push(root);
  return root;
}

function makeDir(root, relativePath) {
  fs.mkdirSync(path.join(root, relativePath), { recursive: true });
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("cleanTauriMacosApps", () => {
  it("removes stale macOS app bundles before a new Tauri build", () => {
    const root = makeTempRoot();
    makeDir(root, "src-tauri/target/release/bundle/macos/Context Atlas.app");
    makeDir(root, "src-tauri/target/release/bundle/macos/oh-my-ontology.app");
    makeDir(root, "src-tauri/target/release/bundle/macos/keep.dSYM");

    const removed = cleanTauriMacosApps({ root });

    assert.deepEqual(removed, ["Context Atlas.app", "oh-my-ontology.app"]);
    assert.equal(
      fs.existsSync(path.join(root, "src-tauri/target/release/bundle/macos/Context Atlas.app")),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(root, "src-tauri/target/release/bundle/macos/oh-my-ontology.app")),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(root, "src-tauri/target/release/bundle/macos/keep.dSYM")),
      true,
    );
  });

  it("is a no-op when the macOS bundle directory does not exist", () => {
    const root = makeTempRoot();

    assert.deepEqual(cleanTauriMacosApps({ root }), []);
  });
});
