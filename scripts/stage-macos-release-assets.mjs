#!/usr/bin/env node
/**
 * 릴리스에 올라갈 자산 넷을 한 폴더에 모은다 — **아티팩트의 루트를 우리가 정하기
 * 위해서다.**
 *
 * ## 왜 이 단계가 있나
 *
 * `actions/upload-artifact` 에 경로를 여럿 주면 루트가 그 경로들의
 * **최소공통조상**으로 정해진다. `bundle/dmg/*` 와 `bundle/macos/*` 를 같이 주면
 * 루트가 `bundle/` 이 되어 아티팩트 안에 `dmg/` · `macos/` 한 겹이 더 생기는데,
 * 내려받는 쪽은 그 깊이를 고른 적이 없으므로 알 수도 없다. v1.0.0-rc.1 이 세 번
 * 그 자리에서 멈췄다 — 빌드·서명·공증은 전부 통과했는데 매니페스트가
 * "업데이터 아티팩트가 없는 아키텍처: aarch64, x64" 로 끝났다.
 *
 * 경로를 **하나**만 올리면 그 폴더가 곧 루트다. 그래서 여기서 모은다. 생산 측이
 * 레이아웃을 선언하고, 소비 측(매니페스트 빌더 · 릴리스 업로드 글롭)은 그것만
 * 안다.
 *
 * ## 왜 업데이터 아카이브의 이름을 바꾸나
 *
 * Tauri 는 업데이터 아카이브를 `<제품명>.app.tar.gz` 로 낸다 — 두 아치가 **같은
 * 이름**이고 그 안에 **공백**이 있다. 이대로 두면 조용히 실패하는 길이 둘이다:
 *
 * 1. 같은 릴리스에 같은 이름으로 올라가 한 아치가 다른 아치를 덮는다. 덮인 쪽
 *    사용자는 다른 아키텍처의 앱을 받거나, 서명 검증에 실패해 영영 갱신을 못
 *    받는다.
 * 2. GitHub 은 자산 이름의 공백을 점으로 바꾼다. `latest.json` 이 적어 둔 URL 은
 *    공백 그대로라 실제 자산과 어긋나고, 설치된 앱은 404 를 "갱신 없음" 으로
 *    표시한다.
 *
 * 그래서 DMG 와 같은 규칙(`ontology-atlas_<버전>_<아치>`)으로 다시 붙인다.
 * 버전과 아치는 **DMG 파일 이름에서 읽는다** — 사용자가 실제로 내려받는 자산이
 * 이미 그 규칙을 진실원으로 쓰고 있고(`check-macos-download-release.mjs` 가 그
 * 이름을 검사한다), 따로 계산하면 둘이 어긋날 자리가 생긴다.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** CI 가 아티팩트를 만드는 폴더. 경로 하나 = 예측 가능한 루트. */
export const STAGING_DIR = "release-upload";

/** Tauri 가 산출물을 두는 폴더. */
export const DEFAULT_BUNDLE_DIR = "src-tauri/target/release/bundle";

/** 다운로드 시 아치를 나르는 것은 폴더뿐이다 — 그 폴더 이름이 아티팩트 이름이다. */
export function artifactNameForArch(arch) {
  return `ontology-atlas-macos-${arch}`;
}

/** DMG 와 같은 규칙. 아치가 이름에 있어야 한 릴리스에 둘 다 올라간다. */
export function updaterArchiveName(version, arch) {
  return `ontology-atlas_${version}_${arch}.app.tar.gz`;
}

/** `ontology-atlas_1.0.0-rc.2_aarch64.dmg` → `{ version, arch }`. */
export function parseDmgName(name) {
  const match = name.match(/^ontology-atlas_(.+)_(aarch64|x64)\.dmg$/);
  return match ? { version: match[1], arch: match[2] } : null;
}

function exactlyOneFile(dir, matches, label) {
  if (!fs.existsSync(dir)) {
    throw new Error(`${label} 을(를) 찾을 폴더가 없다: ${dir}`);
  }
  const hits = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && matches(entry.name))
    .map((entry) => entry.name);
  if (hits.length === 0) {
    throw new Error(`${dir} 에 ${label} 이(가) 없다.`);
  }
  if (hits.length > 1) {
    throw new Error(
      `${dir} 에 ${label} 이(가) ${hits.length}개다: ${hits.join(", ")} — 어느 것을 낼지 정할 수 없다.`,
    );
  }
  return hits[0];
}

/**
 * 자산 넷을 `outDir` 에 평평하게 모으고, 올라갈 파일 이름을 돌려준다.
 *
 * `expectArch` 를 주면 DMG 가 말하는 아치와 대조한다 — 매트릭스가 말하는 아치와
 * 산출물이 다르면 여기서 멈춘다. 통과시키면 사용자가 다른 아키텍처의 앱을 받는다.
 */
export function stageReleaseAssets({ bundleDir, outDir, expectArch } = {}) {
  const bundle = bundleDir ?? DEFAULT_BUNDLE_DIR;
  const out = outDir ?? STAGING_DIR;
  const dmgDir = path.join(bundle, "dmg");
  const macosDir = path.join(bundle, "macos");

  const dmg = exactlyOneFile(dmgDir, (name) => name.endsWith(".dmg"), "DMG");
  const parsed = parseDmgName(dmg);
  if (!parsed) {
    throw new Error(
      `DMG 이름이 규칙과 다르다: ${dmg} — ontology-atlas_<버전>_<aarch64|x64>.dmg 여야 한다.`,
    );
  }
  if (expectArch && parsed.arch !== expectArch) {
    throw new Error(
      `이 잡은 ${expectArch} 를 만든다는데 DMG 는 ${parsed.arch} 다: ${dmg}.`,
    );
  }

  const checksum = `${dmg}.sha256`;
  if (!fs.existsSync(path.join(dmgDir, checksum))) {
    throw new Error(`${dmgDir} 에 ${checksum} 이 없다 — 서명 없는 배포의 유일한 무결성 검사다.`);
  }

  const archive = exactlyOneFile(
    macosDir,
    (name) => name.endsWith(".app.tar.gz"),
    "업데이터 아카이브(.app.tar.gz)",
  );
  const signature = `${archive}.sig`;
  if (!fs.existsSync(path.join(macosDir, signature))) {
    throw new Error(
      `${macosDir} 에 ${signature} 가 없다 — TAURI_SIGNING_PRIVATE_KEY 없이 빌드하면 ` +
        "아카이브만 나오고 서명이 빠진다. 그 상태로 배포하면 앱이 갱신을 거부한다(조용히 '갱신 없음' 으로 보인다).",
    );
  }

  const stagedArchive = updaterArchiveName(parsed.version, parsed.arch);
  const copies = [
    [path.join(dmgDir, dmg), dmg],
    [path.join(dmgDir, checksum), checksum],
    [path.join(macosDir, archive), stagedArchive],
    [path.join(macosDir, signature), `${stagedArchive}.sig`],
  ];

  // 이전 실행이 남긴 파일이 섞이면 릴리스에 남의 버전이 따라 올라간다.
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const [from, to] of copies) {
    fs.copyFileSync(from, path.join(out, to));
  }

  return {
    outDir: out,
    version: parsed.version,
    arch: parsed.arch,
    artifactName: artifactNameForArch(parsed.arch),
    files: copies.map(([, to]) => to),
  };
}

function parseArgs(argv) {
  const flag = (name) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(`--${name}=`.length).trim() : undefined;
  };
  return {
    bundleDir: flag("bundle-dir"),
    outDir: flag("out"),
    expectArch: flag("arch") || process.env.TAURI_ARCH || undefined,
  };
}

function main() {
  let staged;
  try {
    staged = stageReleaseAssets(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`[release-stage] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
    return;
  }
  console.log(`[release-stage] ${staged.artifactName} → ${staged.outDir}`);
  for (const file of staged.files) {
    console.log(`[release-stage]   ${file}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
