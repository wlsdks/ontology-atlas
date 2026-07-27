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

/** Tauri 가 실제로 내는 이름 그대로 만든다 — 공백과 아치 없음까지 포함해서. */
function fakeBundle(version, arch) {
  const root = mkdtempSync(join(tmpdir(), "oa-stage-"));
  const dmgDir = join(root, "bundle", "dmg");
  const macosDir = join(root, "bundle", "macos");
  mkdirSync(dmgDir, { recursive: true });
  mkdirSync(macosDir, { recursive: true });
  const dmg = `ontology-atlas_${version}_${arch}.dmg`;
  writeFileSync(join(dmgDir, dmg), "dmg");
  writeFileSync(join(dmgDir, `${dmg}.sha256`), `abc  ${dmg}\n`);
  // `.app` 은 폴더다. 파일만 골라야 아카이브로 오인하지 않는다.
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
    // 평평해야 아티팩트 루트가 예측 가능하다. 하위 폴더가 하나라도 생기면
    // 내려받는 쪽이 다시 깊이를 추측하게 된다.
    for (const file of staged.files) {
      assert.ok(!file.includes("/"), `${file} 은 하위 폴더에 있다`);
    }
    assert.equal(staged.artifactName, "ontology-atlas-macos-aarch64");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renames the updater archive so both architectures survive one release", () => {
  // Tauri 는 두 아치 모두 `Ontology Atlas.app.tar.gz` 로 낸다. 그대로 올리면
  // 하나가 다른 하나를 덮고, 이름의 공백은 GitHub 이 점으로 바꿔 latest.json 의
  // URL 과도 어긋난다 — 둘 다 오류 없이 "갱신 없음" 으로 보인다.
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
  // 사용자가 실제로 내려받는 자산이 그 규칙을 이미 진실원으로 쓴다. 따로
  // 계산하면 latest.json 과 DMG 가 어긋날 자리가 생긴다.
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
  // 다운로드 시 아치를 나르는 것은 폴더뿐이다.
  assert.equal(artifactNameForArch("aarch64"), "ontology-atlas-macos-aarch64");
  assert.equal(artifactNameForArch("x64"), "ontology-atlas-macos-x64");
  assert.deepEqual(parseDmgName("ontology-atlas_1.0.0-rc.2_x64.dmg"), {
    version: "1.0.0-rc.2",
    arch: "x64",
  });
  assert.equal(parseDmgName("Ontology Atlas.dmg"), null);
});
