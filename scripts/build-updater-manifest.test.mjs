import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PLATFORM_BY_ARCH,
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
