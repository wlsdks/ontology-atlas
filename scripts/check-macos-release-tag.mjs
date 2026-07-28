#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
);
const cargoToml = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargoToml.match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1];

/**
 * 다섯 번째 자리 — 웹 번들의 `RELEASE_VERSION` (2026-07-28 추가).
 *
 * `v1.0.0-rc.2` 를 낼 때 **프리플라이트는 초록인데 테스트가 빨간** 상태가 나왔다.
 * 버전이 다섯 곳에 있는데 이 검사는 넷(실은 셋)만 봤기 때문이다 — 이 값은 웹
 * 번들이 서버 진입점을 못 끌어와 손으로 두는 상수라, 잊으면 다운로드 화면이
 * 옛 버전을 말한다. 그때는 테스트가 잡았지만 **프리플라이트를 믿고 태그를 밀면
 * 놓친다.** 게이트가 진실의 일부만 보면 그 게이트는 거짓 초록을 만든다.
 */
const releaseFacts = fs.readFileSync(
  path.join(root, "src", "views", "download", "lib", "release-facts.ts"),
  "utf8",
);
const releaseFactsVersion = releaseFacts.match(/RELEASE_VERSION\s*=\s*"([^"]+)"/)?.[1];

function printHelp() {
  console.log(`Usage: pnpm desktop:release-tag -- --tag=vX.Y.Z

Fails unless the macOS release tag matches every version declaration:
package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, and
src/views/download/lib/release-facts.ts. In GitHub Actions the tag can also
come from GITHUB_REF_NAME.
`);
}

function fail(message) {
  console.error(`[desktop-release-tag] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  let tag = "";
  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith("--tag=")) {
      tag = arg.slice("--tag=".length).trim();
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  return tag || (process.env.GITHUB_REF_NAME ?? "").trim();
}

const tag = parseArgs(process.argv.slice(2));
if (!tag) {
  fail("release tag is required. Pass --tag=vX.Y.Z or set GITHUB_REF_NAME.");
}

const match = tag.match(/^v(.+)$/);
if (!match) {
  fail(`release tag must be v-prefixed, got ${tag}.`);
}

const tagVersion = match[1];
const versions = {
  package: pkg.version,
  tauri: tauriConfig.version,
  cargo: cargoVersion,
  "release-facts": releaseFactsVersion,
};
const mismatches = Object.entries(versions)
  .filter(([, version]) => version !== tagVersion)
  .map(([source, version]) => `${source}=${version ?? "missing"}`);

if (mismatches.length > 0) {
  fail(
    `release tag ${tag} does not match macOS app versions: ${mismatches.join(", ")}. Update package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, and src/views/download/lib/release-facts.ts together before tagging.`,
  );
}

console.log(
  `[desktop-release-tag] ${tag} matches package, Tauri, Cargo, and release-facts versions`,
);
