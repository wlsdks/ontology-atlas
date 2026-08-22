import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  artifactNameForArch,
  parseDmgName,
  stageReleaseAssets,
  updaterArchiveName,
} from "./stage-macos-release-assets.mjs";

/** Reproduces exactly the names Tauri emits — including the space and the missing architecture. */
function fakeBundle(version, arch) {
  const root = mkdtempSync(join(tmpdir(), "oa-stage-"));
  const dmgDir = join(root, "bundle", "dmg");
  const macosDir = join(root, "bundle", "macos");
  mkdirSync(dmgDir, { recursive: true });
  mkdirSync(macosDir, { recursive: true });
  const dmg = `ontology-atlas_${version}_${arch}.dmg`;
  writeFileSync(join(dmgDir, dmg), "dmg");
  writeFileSync(join(dmgDir, `${dmg}.sha256`), `abc  ${dmg}\n`);
  // `.app` is a directory. Only files must be selected, or it is mistaken for the archive.
  mkdirSync(join(macosDir, "Ontology Atlas.app"), { recursive: true });
  writeFileSync(join(macosDir, "Ontology Atlas.app.tar.gz"), "archive");
  writeFileSync(join(macosDir, "Ontology Atlas.app.tar.gz.sig"), "sig\n");
  return { root, bundleDir: join(root, "bundle"), outDir: join(root, "release-upload") };
}

test("stages exactly the four release assets, flat", () => {
  const { root, bundleDir, outDir } = fakeBundle("1.0.0-rc.2", "aarch64");
  try {
    const staged = stageReleaseAssets({ bundleDir, outDir, expectArch: "aarch64" });
    assert.deepEqual(readdirSync(outDir).sort(), staged.files.slice().sort());
    assert.equal(staged.files.length, 4);
    // Flat is what makes the artifact root predictable. One subfolder and the
    // downloading side is guessing at depth again.
    for (const file of staged.files) {
      assert.ok(!file.includes("/"), `${file} 은 하위 폴더에 있다`);
    }
    assert.equal(staged.artifactName, "ontology-atlas-macos-aarch64");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renames the updater archive so both architectures survive one release", () => {
  // Tauri emits `Ontology Atlas.app.tar.gz` for both architectures. Uploaded as
  // is, one overwrites the other, and GitHub turns the space into a dot so the URL
  // in latest.json no longer matches — both failures surface as "no update
  // available" with no error.
  const a = fakeBundle("1.0.0-rc.2", "aarch64");
  const b = fakeBundle("1.0.0-rc.2", "x64");
  try {
    const left = stageReleaseAssets({ bundleDir: a.bundleDir, outDir: a.outDir });
    const right = stageReleaseAssets({ bundleDir: b.bundleDir, outDir: b.outDir });
    const archives = [left, right].map(
      (staged) => staged.files.find((file) => file.endsWith(".app.tar.gz")),
    );
    assert.deepEqual(archives, [
      "ontology-atlas_1.0.0-rc.2_aarch64.app.tar.gz",
      "ontology-atlas_1.0.0-rc.2_x64.app.tar.gz",
    ]);
    for (const name of archives) {
      assert.ok(!/\s/.test(name), `${name} 에 공백이 있다`);
      assert.equal(name, encodeURI(name));
    }
    assert.ok(existsSync(join(a.outDir, `${archives[0]}.sig`)));
  } finally {
    rmSync(a.root, { recursive: true, force: true });
    rmSync(b.root, { recursive: true, force: true });
  }
});

test("version and arch come from the DMG name, never recomputed", () => {
  // The asset users actually download already treats that rule as the source of
  // truth. Recomputing separately creates a place for latest.json and the DMG to
  // diverge.
  const { root, bundleDir, outDir } = fakeBundle("2.3.4", "x64");
  try {
    const staged = stageReleaseAssets({ bundleDir, outDir });
    assert.equal(staged.version, "2.3.4");
    assert.equal(staged.arch, "x64");
    assert.ok(staged.files.includes(updaterArchiveName("2.3.4", "x64")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a matrix/bundle architecture mismatch stops here", () => {
  const { root, bundleDir, outDir } = fakeBundle("1.0.0", "x64");
  try {
    assert.throws(
      () => stageReleaseAssets({ bundleDir, outDir, expectArch: "aarch64" }),
      /aarch64.*x64|x64/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a missing signature stops here, not at the user's updater", () => {
  const { root, bundleDir, outDir } = fakeBundle("1.0.0", "aarch64");
  rmSync(join(bundleDir, "macos", "Ontology Atlas.app.tar.gz.sig"));
  try {
    assert.throws(() => stageReleaseAssets({ bundleDir, outDir }), /sig/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a missing checksum stops here", () => {
  const { root, bundleDir, outDir } = fakeBundle("1.0.0", "aarch64");
  rmSync(join(bundleDir, "dmg", "ontology-atlas_1.0.0_aarch64.dmg.sha256"));
  try {
    assert.throws(() => stageReleaseAssets({ bundleDir, outDir }), /sha256/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two DMGs are refused rather than picked", () => {
  const { root, bundleDir, outDir } = fakeBundle("1.0.0", "aarch64");
  writeFileSync(join(bundleDir, "dmg", "ontology-atlas_1.0.0_x64.dmg"), "dmg");
  try {
    assert.throws(() => stageReleaseAssets({ bundleDir, outDir }), /2개/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale files from a previous run never ride along", () => {
  const { root, bundleDir, outDir } = fakeBundle("1.0.0", "aarch64");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "ontology-atlas_0.9.0_aarch64.dmg"), "old");
  try {
    const staged = stageReleaseAssets({ bundleDir, outDir });
    assert.deepEqual(readdirSync(outDir).sort(), staged.files.slice().sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the artifact folder name carries the architecture", () => {
  // On download the folder is the only thing carrying the architecture.
  assert.equal(artifactNameForArch("aarch64"), "ontology-atlas-macos-aarch64");
  assert.equal(artifactNameForArch("x64"), "ontology-atlas-macos-x64");
  assert.deepEqual(parseDmgName("ontology-atlas_1.0.0-rc.2_x64.dmg"), {
    version: "1.0.0-rc.2",
    arch: "x64",
  });
  assert.equal(parseDmgName("Ontology Atlas.dmg"), null);
});
