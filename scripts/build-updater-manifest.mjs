#!/usr/bin/env node
/**
 * 설치된 앱이 갱신을 찾는 단 하나의 파일, `latest.json` 을 만든다.
 *
 * 앱은 `tauri.conf.json` 의 안정 endpoint 하나만 안다:
 *
 *   https://wlsdks.github.io/ontology-atlas/update/latest.json
 *
 * GitHub의 `releases/latest`는 프리릴리스를 제외해 RC-only 기간에 404가 된다.
 * Pages 배포가 newest non-draft release(프리릴리스 포함)의 이 파일을 위 안정
 * 주소에 복사한다(`stage-hosted-updater-manifest.mjs`). 설치 전 minisign 검증은
 * 그대로라 게시 주소가 바뀌어도 신뢰 경계는 바뀌지 않는다.
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
 * 아치별 아티팩트 폴더를 찾는다.
 *
 * CI 의 폴더 이름은 아치가 아니라 **아티팩트 이름**이다
 * (`ontology-atlas-macos-aarch64`), `merge-multiple: false` 가 그 이름을 그대로
 * 폴더로 만들기 때문이다. 처음엔 `<dir>/aarch64` 를 찾도록 썼고, 그래서 실제
 * 릴리스에서 "업데이터 아티팩트가 없는 아키텍처: aarch64, x64" 로 멈췄다
 * (2026-07-27 v1.0.0-rc.1). 빌드는 정상이었고 찾는 자리가 틀렸다.
 *
 * 이름을 못박지 않고 **아치로 끝나는 폴더**를 찾는다 — 아티팩트 이름이 바뀌어도
 * 견딘다. 정확히 하나여야 한다: 여럿이면 어느 것이 그 아치인지 알 수 없고,
 * 잘못 고르면 사용자가 다른 아키텍처의 앱을 받는다.
 */
export function resolveArchDir(root, arch) {
  if (!fs.existsSync(root)) return null;
  const exact = path.join(root, arch);
  if (fs.existsSync(exact) && fs.statSync(exact).isDirectory()) return exact;

  const matches = fs
    .readdirSync(root)
    .filter((name) => name.endsWith(`-${arch}`) || name === arch)
    .filter((name) => fs.statSync(path.join(root, name)).isDirectory());

  if (matches.length > 1) {
    fail(`${arch} 에 해당하는 폴더가 ${matches.length}개다: ${matches.join(", ")} — 어느 것인지 정할 수 없다.`);
  }
  return matches.length === 1 ? path.join(root, matches[0]) : null;
}

/** 폴더 아래 모든 `.app.tar.gz` 를 깊이 상관없이 모은다. */
function collectArchives(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectArchives(full));
    } else if (entry.isFile() && entry.name.endsWith(".app.tar.gz")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * 아치 폴더 **아래 어디서든** 업데이터 아티팩트를 찾는다.
 *
 * 깊이는 우리가 고른 적이 없다. `actions/upload-artifact` 는 경로를 여럿 받으면
 * 그들의 최소공통조상을 아티팩트 루트로 잡는데, `bundle/dmg/*` 와
 * `bundle/macos/*` 를 같이 올리던 동안 그 루트가 `bundle/` 이었다 — 아치 폴더
 * 바로 밑에는 `dmg/` 와 `macos/` 뿐이고 `.app.tar.gz` 는 한 겹 더 안에 있었다.
 * 그래서 v1.0.0-rc.1 이 "업데이터 아티팩트가 없는 아키텍처" 로 멈췄다.
 *
 * 지금은 업로드 전에 `scripts/stage-macos-release-assets.mjs` 가 한 폴더로 모아
 * 평평하게 못박는다. 그래도 찾는 쪽이 깊이에 기대지 않는 이유는, 규칙이 한쪽
 * 머릿속에만 있으면 다음에 또 어긋나기 때문이다.
 *
 * 아카이브는 그 아치에 **정확히 하나**여야 한다 — 여럿이면 어느 것이 이 아치의
 * 것인지 알 수 없고, 잘못 고르면 사용자가 다른 아키텍처의 앱을 받는다.
 */
export function findUpdaterArtifacts(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const archives = collectArchives(dir);
  if (archives.length === 0) return null;
  if (archives.length > 1) {
    fail(
      `${dir} 아래에 .app.tar.gz 가 ${archives.length}개다: ` +
        `${archives.map((file) => path.relative(dir, file)).join(", ")} — 어느 것을 낼지 정할 수 없다.`,
    );
  }
  const archivePath = archives[0];
  const archive = path.basename(archivePath);
  const signaturePath = `${archivePath}.sig`;
  if (!fs.existsSync(signaturePath)) {
    fail(
      `${dir} 에 ${archive} 는 있는데 ${archive}.sig 가 없다.\n` +
        "TAURI_SIGNING_PRIVATE_KEY 없이 빌드하면 아카이브만 나오고 서명이 빠진다 — " +
        "그 상태로 배포하면 앱이 갱신을 거부한다(조용히 '갱신 없음' 으로 보인다).",
    );
  }
  return {
    archivePath,
    signaturePath,
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
    // 폴더 이름은 아티팩트 이름(`ontology-atlas-macos-<arch>`)이다 — 아치로
    // 끝나는 폴더를 찾는다. 평평하게 합치면 두 아치를 구분할 수 없다.
    const found = findUpdaterArtifacts(resolveArchDir(options.dir, arch));
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
