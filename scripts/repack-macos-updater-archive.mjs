#!/usr/bin/env node
/**
 * 서명한 `.app` 으로 업데이터 아카이브를 **다시 만들고 다시 서명한다.**
 *
 * ## 왜 이 단계가 있나
 *
 * `tauri build` 는 `.app` 과 `.app.tar.gz`(+`.sig`)를 **한 번에** 낸다. 그런데
 * 이 저장소는 코드서명을 그 뒤에 따로 한다(`desktop:sign` / `desktop:sign:adhoc`).
 * 즉 아카이브가 담고 있는 것은 **서명 전의 앱**이다. 실측(2026-07-28, 깨끗한
 * 체크아웃):
 *
 *   tar xzf "Ontology Atlas.app.tar.gz"
 *   codesign --verify --deep --strict "Ontology Atlas.app"
 *     → code has no resources but signature indicates they must be present
 *
 * 그 문장은 이 저장소가 이미 한 번 싸운 상태다. Tauri 번들은 바이너리만
 * linker-signed 이고 `Contents/_CodeSignature` 가 없어서, macOS 가 이걸
 * **"확인되지 않은 개발자"가 아니라 "손상되었습니다"** 로 판정한다. 앞의
 * 대화상자에는 "확인 없이 열기" 가 있고 뒤에는 **없다** (#717 에서 미서명
 * 릴리스에 ad-hoc 서명을 넣은 이유가 정확히 이것이다).
 *
 * 그래서 지금 갈림길은 이렇다:
 *
 *   DMG 로 받은 사용자  → 서명된 앱 (정상)
 *   앱 안에서 갱신한 사용자 → 손상된 앱 (설치 불가 / 실행 불가)
 *
 * 갱신 경로만 조용히 깨진다. 릴리스는 초록으로 끝나고, DMG 검사도 전부
 * 통과하고, 아무도 모른다 — **처음 갱신을 받는 사람**이 알게 된다.
 *
 * 이 스크립트는 서명 **뒤에** 끼어들어 아카이브를 서명된 앱으로 다시 만들고
 * minisign 으로 다시 서명한다. Tauri 와 같은 레이아웃(`<앱>.app/` 이 루트)을
 * 쓰고, macOS tar 의 AppleDouble(`._*`) 동봉을 끈다 — Tauri 의 tar 도 확장
 * 속성을 담지 않으므로 그쪽에 맞춘다.
 *
 * fail-closed: 다시 담기 **전에** `.app` 의 서명 구조를 확인한다. 깨진 서명을
 * 다시 포장하면 이 단계는 아무것도 고치지 않은 채 초록을 준다.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName } = names;

const macosDir = path.join(root, "src-tauri", "target", "release", "bundle", "macos");
const appPath = path.join(macosDir, appBundleName);
const archivePath = path.join(macosDir, `${appBundleName}.tar.gz`);
const signaturePath = `${archivePath}.sig`;

function fail(message) {
  console.error(`[updater-repack] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
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
  console.log(`Usage: pnpm desktop:repack-updater

Rebuilds ${appBundleName}.tar.gz from the **signed** app bundle and re-signs it
with the Tauri updater key, so in-app updates ship the same signature state the
DMG does.

Environment:
  TAURI_SIGNING_PRIVATE_KEY           minisign private key (string)
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD  its password
`);
  process.exit(0);
}

if (process.platform !== "darwin") {
  fail("the updater archive is a macOS app payload — repack it on macOS.");
}

if (!fs.existsSync(appPath)) {
  fail(`missing app bundle at ${appPath}; run pnpm desktop:build:app first.`);
}

// 서명 뒤에 불려야 의미가 있다. 깨진 서명을 다시 포장하면 갱신 경로는 그대로
// 깨진 채 이 단계만 초록이 된다 — 그게 이 스크립트가 막으려던 바로 그 결함이다.
const verified = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], {
  encoding: "utf8",
});
if (verified.status !== 0) {
  fail(
    `codesign --verify rejected ${appBundleName}: ${`${verified.stderr ?? ""}${verified.stdout ?? ""}`.trim()}\n` +
      "  이 단계는 **서명 뒤에** 와야 한다 — pnpm desktop:sign 또는 pnpm desktop:sign:adhoc 다음.\n" +
      "  깨진 번들을 다시 담으면 갱신받은 사용자는 '확인되지 않은 개발자'가 아니라 '손상되었습니다'를 만난다.",
  );
}

if (!(process.env.TAURI_SIGNING_PRIVATE_KEY ?? "").trim()) {
  fail(
    "TAURI_SIGNING_PRIVATE_KEY is empty — the rebuilt archive would ship without a .sig and the app refuses\n" +
      "  unsigned update packages (it shows 'no update available', silently).",
  );
}

fs.rmSync(archivePath, { force: true });
fs.rmSync(signaturePath, { force: true });

// `-C` 로 들어가서 `<앱>.app` 만 담는다 — Tauri 가 내는 레이아웃과 같다.
// COPYFILE_DISABLE=1 은 macOS tar 가 확장 속성을 `._*` 로 끼워 넣는 것을 끈다.
run("tar", ["-czf", archivePath, "-C", macosDir, appBundleName], {
  env: { ...process.env, COPYFILE_DISABLE: "1" },
});

run("pnpm", ["exec", "tauri", "signer", "sign", archivePath]);

if (!fs.existsSync(signaturePath)) {
  fail(`tauri signer reported success but ${signaturePath} is missing.`);
}

const sizeMiB = fs.statSync(archivePath).size / 1024 / 1024;
console.log(
  `[updater-repack] rebuilt ${path.relative(root, archivePath)} (${sizeMiB.toFixed(1)} MiB) from the signed ${appBundleName} and re-signed it`,
);
