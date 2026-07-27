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
  // 오타가 나도 조용히 실패한다 — 앱이 "갱신 없음" 이라고 말할 뿐이다.
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

  // `latest` 로 두면 다음 릴리스가 나오는 순간 이 매니페스트가 가리키는 파일이
  // 바뀌고, 서명 검증이 실패한다.
  for (const platform of Object.values(manifest.platforms)) {
    assert.match(platform.url, /\/releases\/download\/v1\.0\.1\//);
    assert.doesNotMatch(platform.url, /releases\/latest/);
  }
  assert.equal(manifest.version, "1.0.1");
  assert.equal(manifest.platforms["darwin-aarch64"].signature, "sig-a");
  assert.equal(manifest.platforms["darwin-x86_64"].signature, "sig-b");
});

test("a missing architecture is refused rather than shipped half-complete", () => {
  // 한쪽만 내면 그 아키텍처 사용자는 영영 갱신을 못 받는다 — 오류도 없이.
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
  // 서명 없이 배포하면 앱이 조용히 "갱신 없음" 으로 본다. 그래서 여기서 멈춘다.
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
 * 2026-07-27 v1.0.0-rc.1 이 여기서 멈췄다: "업데이터 아티팩트가 없는 아키텍처:
 * aarch64, x64". 빌드는 두 아치 모두 성공했고 서명도 됐는데, **찾는 자리가
 * 틀렸다** — `merge-multiple: false` 는 아티팩트 *이름*을 폴더로 만들므로
 * `release-assets/ontology-atlas-macos-aarch64/` 이지 `release-assets/aarch64/`
 * 가 아니다. 이 테스트는 CI 의 실제 폴더 구조를 그대로 재현한다.
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
  // `endsWith` 를 순진하게 쓰면 "…-x64" 검사가 "…-aarch64" 를 잡을 수 있다.
  // 잘못 고르면 사용자가 다른 아키텍처의 앱을 받는다 — 조용한 실패다.
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
