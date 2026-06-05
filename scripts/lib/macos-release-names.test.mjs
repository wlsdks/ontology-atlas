import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadMacosReleaseNames, resolveMacosExecutable } from "./macos-release-names.mjs";

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-atlas-macos-names-"));
  fs.mkdirSync(path.join(root, "src-tauri"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "ontology-atlas", version: "0.1.0" }, null, 2),
  );
  fs.writeFileSync(
    path.join(root, "src-tauri", "tauri.conf.json"),
    JSON.stringify(
      { productName: "Ontology Atlas", version: "0.1.0", identifier: "dev.jinan.ontology-atlas" },
      null,
      2,
    ),
  );
  return root;
}

test("loads Ontology Atlas as app bundle name and release asset basename", () => {
  const root = makeFixture();
  try {
    const names = loadMacosReleaseNames(root);

    assert.equal(names.appName, "Ontology Atlas");
    assert.equal(names.appBundleName, "Ontology Atlas.app");
    assert.equal(names.releaseAssetName, "ontology-atlas");
    assert.equal(names.bundleIdentifier, "dev.jinan.ontology-atlas");
    assert.equal(names.version, "0.1.0");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolves the executable from Info.plist before falling back to naming conventions", () => {
  const root = makeFixture();
  try {
    const names = loadMacosReleaseNames(root);
    const appPath = path.join(root, "Ontology Atlas.app");
    const macosDir = path.join(appPath, "Contents", "MacOS");
    fs.mkdirSync(macosDir, { recursive: true });
    fs.writeFileSync(
      path.join(appPath, "Contents", "Info.plist"),
      [
        "<plist><dict>",
        "<key>CFBundleExecutable</key>",
        "<string>custom-runner</string>",
        "</dict></plist>",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(macosDir, "custom-runner"), "");
    fs.writeFileSync(path.join(macosDir, "Ontology Atlas"), "");

    assert.equal(
      resolveMacosExecutable(appPath, names),
      path.join(macosDir, "custom-runner"),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
