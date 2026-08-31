import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PLATFORM_BY_ARCH,
  resolveArchDir,
  REQUIRED_ARCHES,
  buildManifest,
  findUpdaterArtifacts,
} from "./build-updater-manifest.mjs";

test("platform keys are Tauri's Rust target names, not our arch labels", () => {
  // A typo fails silently — the app just says "no update".
  assert.deepEqual(PLATFORM_BY_ARCH, {
    aarch64: "darwin-aarch64",
    x64: "darwin-x86_64",
  });
});

test("download URLs pin the tag, never `latest`", () => {
  const manifest = buildManifest({
    version: "1.0.1",
    pubDate: "2026-07-27T00:00:00Z",
    repo: "wlsdks/ontology-atlas",
    tag: "v1.0.1",
    platforms: {
      aarch64: { archiveName: "a.app.tar.gz", signature: "sig-a" },
      x64: { archiveName: "b.app.tar.gz", signature: "sig-b" },
    },
  });

  // With `latest`, the file this manifest points at changes the moment the next
  // release ships and signature verification fails.
  for (const platform of Object.values(manifest.platforms)) {
    assert.match(platform.url, /\/releases\/download\/v1\.0\.1\//);
    assert.doesNotMatch(platform.url, /releases\/latest/);
  }
  assert.equal(manifest.version, "1.0.1");
  assert.equal(manifest.platforms["darwin-aarch64"].signature, "sig-a");
  assert.equal(manifest.platforms["darwin-x86_64"].signature, "sig-b");
});

test("a missing architecture is refused rather than shipped half-complete", () => {
  // Emitting only one arch means that architecture's users never receive an update — with no error either.
  const originalExit = process.exit;
  const originalError = console.error;
  let exitCode = null;
  let message = "";
  process.exit = (code) => {
    exitCode = code;
    throw new Error("exit");
  };
  console.error = (text) => {
    message += text;
  };
  try {
    assert.throws(() =>
      buildManifest({
        version: "1.0.1",
        pubDate: "2026-07-27T00:00:00Z",
        repo: "wlsdks/ontology-atlas",
        tag: "v1.0.1",
        platforms: { aarch64: { archiveName: "a.app.tar.gz", signature: "sig-a" } },
      }),
    );
  } finally {
    process.exit = originalExit;
    console.error = originalError;
  }
  assert.equal(exitCode, 1);
  assert.match(message, /x64/);
});

test("an archive without its .sig is refused — that build had no signing key", () => {
  const dir = mkdtempSync(join(tmpdir(), "oa-updater-"));
  const archDir = join(dir, "aarch64");
  mkdirSync(archDir, { recursive: true });
  writeFileSync(join(archDir, "Ontology Atlas.app.tar.gz"), "archive");

  const originalExit = process.exit;
  const originalError = console.error;
  let message = "";
  process.exit = () => {
    throw new Error("exit");
  };
  console.error = (text) => {
    message += text;
  };
  try {
    assert.throws(() => findUpdaterArtifacts(archDir));
  } finally {
    process.exit = originalExit;
    console.error = originalError;
    rmSync(dir, { recursive: true, force: true });
  }
  // Shipping without a signature makes the app silently see "no update", so it stops here.
  assert.match(message, /sig/);
});

test("finds the archive and signature pair", () => {
  const dir = mkdtempSync(join(tmpdir(), "oa-updater-ok-"));
  const archDir = join(dir, "x64");
  mkdirSync(archDir, { recursive: true });
  writeFileSync(join(archDir, "App.app.tar.gz"), "archive");
  writeFileSync(join(archDir, "App.app.tar.gz.sig"), "signature-line\n");
  try {
    const found = findUpdaterArtifacts(archDir);
    assert.equal(found.archiveName, "App.app.tar.gz");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("both architectures are required", () => {
  assert.deepEqual(REQUIRED_ARCHES, ["aarch64", "x64"]);
});

/**
 * v1.0.0-rc.1 stopped here on 2026-07-27: "architectures with no updater artifact:
 * aarch64, x64". Both arches built and signed successfully; **the place being searched
 * was wrong** — `merge-multiple: false` turns the artifact *name* into the folder, so
 * it is `release-assets/ontology-atlas-macos-aarch64/`, not `release-assets/aarch64/`.
 *
 * The first version of this fixture reproduced only the folder name and created an
 * **empty folder**, so it went green while CI stayed red — there were two
 * divergences: the name, and **the depth**. While there were four upload paths the
 * artifact root was their lowest common ancestor `bundle/`, so directly under the arch
 * folder there were only `dmg/` and `macos/`. The fixture therefore places the files
 * at their real locations too.
 */
test("resolves the arch folder CI actually produces, not the bare arch name", () => {
  const root = mkdtempSync(join(tmpdir(), "oa-archdir-"));
  try {
    mkdirSync(join(root, "ontology-atlas-macos-aarch64"), { recursive: true });
    mkdirSync(join(root, "ontology-atlas-macos-x64"), { recursive: true });

    assert.equal(resolveArchDir(root, "aarch64"), join(root, "ontology-atlas-macos-aarch64"));
    assert.equal(resolveArchDir(root, "x64"), join(root, "ontology-atlas-macos-x64"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reaches the archive even when it sits a folder deeper than expected", () => {
  // Exactly the layout where the lowest common ancestor resolved to `bundle/`. Uploads
  // are flattened beforehand now, but if the finder depends on depth it stops the same
  // way again.
  const root = mkdtempSync(join(tmpdir(), "oa-archdir-deep-"));
  try {
    const macosDir = join(root, "ontology-atlas-macos-aarch64", "macos");
    mkdirSync(macosDir, { recursive: true });
    mkdirSync(join(root, "ontology-atlas-macos-aarch64", "dmg"), { recursive: true });
    writeFileSync(join(macosDir, "Ontology Atlas.app.tar.gz"), "archive");
    writeFileSync(join(macosDir, "Ontology Atlas.app.tar.gz.sig"), "signature-line\n");

    const found = findUpdaterArtifacts(resolveArchDir(root, "aarch64"));
    assert.equal(found.archiveName, "Ontology Atlas.app.tar.gz");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two archives under one arch folder are refused, not guessed", () => {
  // Choosing wrong ships users an app for a different architecture — a silent failure.
  const root = mkdtempSync(join(tmpdir(), "oa-archdir-dup-"));
  const archDir = join(root, "ontology-atlas-macos-x64");
  mkdirSync(join(archDir, "macos"), { recursive: true });
  writeFileSync(join(archDir, "one.app.tar.gz"), "archive");
  writeFileSync(join(archDir, "one.app.tar.gz.sig"), "sig\n");
  writeFileSync(join(archDir, "macos", "two.app.tar.gz"), "archive");
  writeFileSync(join(archDir, "macos", "two.app.tar.gz.sig"), "sig\n");

  const originalExit = process.exit;
  const originalError = console.error;
  let message = "";
  process.exit = () => {
    throw new Error("exit");
  };
  console.error = (text) => {
    message += text;
  };
  try {
    assert.throws(() => findUpdaterArtifacts(archDir));
  } finally {
    process.exit = originalExit;
    console.error = originalError;
    rmSync(root, { recursive: true, force: true });
  }
  assert.match(message, /2 \.app\.tar\.gz files/);
});

test("still resolves a bare arch folder", () => {
  const root = mkdtempSync(join(tmpdir(), "oa-archdir-bare-"));
  try {
    mkdirSync(join(root, "aarch64"), { recursive: true });
    assert.equal(resolveArchDir(root, "aarch64"), join(root, "aarch64"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("x64 does not match the aarch64 folder", () => {
  // A naive `endsWith` lets a "…-x64" check match "…-aarch64". Choosing wrong ships
  // users an app for a different architecture — a silent failure.
  const root = mkdtempSync(join(tmpdir(), "oa-archdir-x-"));
  try {
    mkdirSync(join(root, "ontology-atlas-macos-aarch64"), { recursive: true });
    assert.equal(resolveArchDir(root, "x64"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("returns null when the root does not exist", () => {
  assert.equal(resolveArchDir("/definitely/not/here", "aarch64"), null);
});
