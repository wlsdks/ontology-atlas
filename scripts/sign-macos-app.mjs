#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName } = names;
const appPath =
  process.env.MACOS_APP_PATH ??
  path.join(
    root,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    appBundleName,
  );
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY;

function printHelp() {
  console.log(`Usage: APPLE_SIGNING_IDENTITY="Developer ID Application: ..." pnpm desktop:sign

Signs the built macOS .app with hardened runtime enabled.

Environment:
  APPLE_SIGNING_IDENTITY  Required codesign identity name or SHA-1 hash.
  MACOS_APP_PATH          Optional .app path. Defaults to the Tauri release bundle.
`);
}

function fail(message) {
  console.error(`[desktop-sign] ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    fail(
      [
        `${command} ${args.join(" ")} failed with exit ${result.status}`,
        result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : null,
        result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return result;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (process.platform !== "darwin") {
  fail("macOS app signing requires macOS because it uses codesign.");
}

if (!fs.existsSync(appPath)) {
  fail(`missing app bundle at ${appPath}; run pnpm desktop:build:app first.`);
}

/**
 * The identity name is printed on the certificate we just imported, so asking
 * an operator to also type it into a secret is a second chance to get it wrong
 * for no information gained. Derive it, and only fall back to the env var when
 * the keychain holds more than one Developer ID (or none, so the error says
 * what is actually missing).
 */
function resolveSigningIdentity() {
  if (signingIdentity) return signingIdentity;

  const found = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], {
    encoding: "utf8",
  });
  const identities = (found.stdout ?? "")
    .split("\n")
    .map((line) => line.match(/"(Developer ID Application:[^"]+)"/)?.[1])
    .filter(Boolean);

  if (identities.length === 1) {
    console.log(`[desktop-sign] using the imported identity: ${identities[0]}`);
    return identities[0];
  }
  if (identities.length === 0) {
    fail(
      "no Developer ID Application identity in the keychain — import the certificate first, " +
        "or set APPLE_SIGNING_IDENTITY explicitly.",
    );
  }
  fail(
    `${identities.length} Developer ID identities found; set APPLE_SIGNING_IDENTITY to pick one:\n` +
      identities.map((id) => `  ${id}`).join("\n"),
  );
}

/**
 * `--adhoc` 는 **서명을 안 하는 것이 아니라 신원 없이 서명하는 것**이다. 이
 * 구분이 v1.0.0 을 막았다.
 *
 * Tauri 가 낸 번들은 바이너리만 linker-signed 이고 `Contents/_CodeSignature`
 * 가 없다. 그 상태의 임베디드 서명은 "resources 가 있어야 한다" 고 주장하는데
 * 정작 `CodeResources` 가 없어서, macOS 는 이걸 **미확인 개발자가 아니라
 * 손상된 앱**으로 판정한다:
 *
 *   codesign --verify → code has no resources but signature indicates
 *                       they must be present
 *
 * 차이는 사용자가 보는 대화상자에서 갈린다. "확인되지 않은 개발자" 는 시스템
 * 설정에 **"확인 없이 열기"** 가 뜨는 경로이고 — 우리 다운로드 페이지가
 * 안내하는 바로 그 경로다 — "손상되었습니다" 는 그 버튼이 **없다**. 즉 미서명
 * 배포에서 ad-hoc 번들 서명을 빼면 안내문이 통째로 거짓이 되고, 사용자에게
 * 남는 길은 터미널에서 xattr 을 지우는 것뿐이다.
 *
 * ad-hoc 서명을 붙이면 `valid on disk` + `satisfies its Designated Requirement`
 * 가 되고 Gatekeeper 판정이 평범한 `rejected`(= 미확인 개발자) 로 내려온다.
 * 실측: 2026-07-27, v1.0.0 draft 의 aarch64 번들.
 *
 * 하드닝 런타임과 타임스탬프는 여기서 쓰지 않는다 — 둘 다 실제 인증서를
 * 전제하고, 타임스탬프는 Apple 서버를 부른다.
 */
const adhoc = process.argv.includes("--adhoc");
const identity = adhoc ? "-" : resolveSigningIdentity();

run(
  "codesign",
  adhoc
    ? ["--force", "--deep", "--sign", identity, appPath]
    : ["--force", "--deep", "--options", "runtime", "--timestamp", "--sign", identity, appPath],
);
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

console.log(
  adhoc
    ? `[desktop-sign] ad-hoc signed and verified ${appPath} (no Developer ID — Gatekeeper will report an unidentified developer, which is the path the download page documents)`
    : `[desktop-sign] signed and verified ${appPath}`,
);
