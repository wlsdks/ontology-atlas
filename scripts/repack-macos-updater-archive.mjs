#!/usr/bin/env node
/**
 * **Rebuilds and re-signs** the updater archive from the signed `.app`.
 *
 * **Why this step exists.** `tauri build` emits the `.app` and the `.app.tar.gz`
 * (plus `.sig`) **together**, but this repository code-signs separately afterwards
 * (`desktop:sign` / `desktop:sign:adhoc`). So the archive contains **the unsigned
 * app**. Measured on a clean checkout, 2026-07-28:
 *
 *   tar xzf "Ontology Atlas.app.tar.gz"
 *   codesign --verify --deep --strict "Ontology Atlas.app"
 *     → code has no resources but signature indicates they must be present
 *
 * That message is a state this repository has already fought once. A Tauri bundle
 * has only the binary linker-signed and no `Contents/_CodeSignature`, so macOS
 * judges it **"is damaged" rather than "unidentified developer"**. The former dialog
 * offers "open anyway"; the latter **does not** (which is exactly why #717 added
 * ad-hoc signing to unsigned releases).
 *
 * So the fork in the road is:
 *
 *   users who downloaded the DMG   → a signed app (fine)
 *   users who updated in-app        → a damaged app (cannot install or launch)
 *
 * Only the update path breaks, and silently: the release finishes green, every DMG
 * check passes, and nobody knows — until **the first person to receive an update**
 * finds out.
 *
 * This script runs **after** signing, rebuilds the archive from the signed app, and
 * re-signs it with minisign. It uses Tauri's layout (`<app>.app/` at the root) and
 * disables macOS tar's AppleDouble (`._*`) companions, matching Tauri's tar, which
 * also carries no extended attributes.
 *
 * Fail-closed: the `.app`'s signature structure is verified **before** repacking.
 * Repacking a broken signature would make this step hand out a green result while
 * fixing nothing.
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

// This only means anything when called after signing. Repacking a broken signature
// leaves the update path broken while this step alone turns green — the exact defect
// this script exists to prevent.
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

// `-C` into the directory and archive only `<app>.app` — the layout Tauri emits.
// COPYFILE_DISABLE=1 stops macOS tar inserting extended attributes as `._*`.
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
