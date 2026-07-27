#!/usr/bin/env node
/**
 * 설치된 앱이 갱신을 찾는 단 하나의 파일, `latest.json` 을 만든다.
 *
 * 앱은 `tauri.conf.json` 의 endpoint 하나만 안다:
 *
 *   https://github.com/wlsdks/ontology-atlas/releases/latest/download/latest.json
 *
 * `releases/latest` 는 **프리릴리스를 가리키지 않는다.** 그게 이 설계의 핵심
 * 안전장치다 — RC 를 내도 정식 사용자에게는 내려가지 않고, 찾아온 사람만 받는다.
 * 채널 분리를 위해 코드를 더 쓸 필요가 없다.
 *
 * ## 서명이 두 겹인 이유
 *
 * Apple 인증서는 "누가 만들었나" 를 보증하고, minisign 키는 "이 갱신 패키지가
 * 우리 것인가" 를 보증한다. 둘은 다른 질문이다. 앱은 `pubkey` 로 `.sig` 를
 * 검증한 뒤에만 번들을 교체하므로, 우리 키로 서명되지 않은 패키지는 어떤
 * 경로로 와도 설치되지 않는다 — 릴리스 페이지가 뚫려도 마찬가지다.
 *
 * ## 왜 스크립트인가
 *
 * `.sig` 는 base64 한 줄이고 플랫폼 키(`darwin-aarch64`)는 오타가 나도 조용히
 * 실패한다 — 앱이 "갱신 없음" 이라고 말할 뿐이라, 손으로 만들면 틀린 줄도
 * 모른다. 여기서 만들고 여기서 검사한다.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Tauri 가 macOS 에 쓰는 플랫폼 키. Rust 타깃 이름이지 우리 arch 표기가 아니다. */
export const PLATFORM_BY_ARCH = {
  aarch64: "darwin-aarch64",
  x64: "darwin-x86_64",
};

export const REQUIRED_ARCHES = ["aarch64", "x64"];

function fail(message) {
  console.error(`[updater-manifest] ${message}`);
  process.exit(1);
}

/**
 * 아치별 업데이터 아티팩트를 찾는다.
 *
 * Tauri 는 `.app.tar.gz` 와 그 옆의 `.app.tar.gz.sig` 를 낸다. 파일명에 아치가
 * 들어가지 않으므로 **디렉토리로 구분한다** — CI 가 아치별 아티팩트를 각자의
 * 폴더에 내려받는 구조에 맞춘다.
 */
export function findUpdaterArtifacts(dir) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir);
  const archive = entries.find((name) => name.endsWith(".app.tar.gz"));
  if (!archive) return null;
  const signature = `${archive}.sig`;
  if (!entries.includes(signature)) {
    fail(
      `${dir} 에 ${archive} 는 있는데 ${signature} 가 없다.\n` +
        "TAURI_SIGNING_PRIVATE_KEY 없이 빌드하면 아카이브만 나오고 서명이 빠진다 — " +
        "그 상태로 배포하면 앱이 갱신을 거부한다(조용히 '갱신 없음' 으로 보인다).",
    );
  }
  return {
    archivePath: path.join(dir, archive),
    signaturePath: path.join(dir, signature),
    archiveName: archive,
  };
}

/**
 * 매니페스트를 만든다. 다운로드 URL 은 **태그 고정**이다 — `latest` 로 두면
 * 다음 릴리스가 나오는 순간 이 매니페스트가 가리키는 파일이 바뀐다.
 */
export function buildManifest({ version, pubDate, notes, repo, tag, platforms }) {
  const missing = REQUIRED_ARCHES.filter((arch) => !platforms[arch]);
  if (missing.length > 0) {
    fail(
      `업데이터 아티팩트가 없는 아키텍처: ${missing.join(", ")}.\n` +
        "한쪽만 내면 그 아키텍처 사용자는 영영 갱신을 못 받는다 — 오류도 없이 조용히.",
    );
  }

  return {
    version,
    notes: notes ?? "",
    pub_date: pubDate,
    platforms: Object.fromEntries(
      REQUIRED_ARCHES.map((arch) => [
        PLATFORM_BY_ARCH[arch],
        {
          signature: platforms[arch].signature,
          url: `https://github.com/${repo}/releases/download/${tag}/${platforms[arch].archiveName}`,
        },
      ]),
    ),
  };
}

function parseArgs(argv) {
  const flag = (name) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(`--${name}=`.length).trim() : undefined;
  };
  return {
    dir: flag("dir") ?? "release-assets",
    out: flag("out") ?? "release-assets/latest.json",
    tag: flag("tag") ?? process.env.GITHUB_REF_NAME,
    repo: flag("repo") ?? process.env.GITHUB_REPOSITORY ?? "wlsdks/ontology-atlas",
    pubDate: flag("pub-date"),
    notes: flag("notes"),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.tag) fail("--tag 또는 GITHUB_REF_NAME 이 필요하다.");
  const version = options.tag.replace(/^v/, "");

  const platforms = {};
  for (const arch of REQUIRED_ARCHES) {
    // CI 는 아치별 아티팩트를 `<dir>/<arch>/` 로 내려받는다. 평평한 디렉토리도
    // 지원하지만 그 경우 두 아치를 구분할 수 없으므로 하위 폴더가 정본이다.
    const found = findUpdaterArtifacts(path.join(options.dir, arch));
    if (!found) continue;
    platforms[arch] = {
      archiveName: found.archiveName,
      signature: fs.readFileSync(found.signaturePath, "utf8").trim(),
    };
  }

  const manifest = buildManifest({
    version,
    pubDate: options.pubDate ?? new Date().toISOString(),
    notes: options.notes,
    repo: options.repo,
    tag: options.tag,
    platforms,
  });

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[updater-manifest] wrote ${options.out} for ${options.tag}`);
  for (const key of Object.keys(manifest.platforms)) {
    console.log(`[updater-manifest]   ${key} → ${manifest.platforms[key].url}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
