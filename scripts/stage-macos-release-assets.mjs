#!/usr/bin/env node
/**
 * Collects the four release assets into one folder — **so that we decide the
 * artifact's root.**
 *
 * **Why this step exists.** Giving `actions/upload-artifact` several paths makes
 * the root their **lowest common ancestor**. Passing `bundle/dmg/*` and
 * `bundle/macos/*` together makes the root `bundle/`, adding an extra `dmg/` /
 * `macos/` layer inside the artifact that the downloading side never chose and
 * cannot know about. v1.0.0-rc.1 stalled there three times — build, signing, and
 * notarisation all passed while the manifest ended with "architectures with no
 * updater artifact: aarch64, x64".
 *
 * Uploading **one** path makes that folder the root. So the assets are gathered
 * here: the producing side declares the layout, and the consuming side (manifest
 * builder, release upload glob) knows only that.
 *
 * **Why the updater archive is renamed.** Tauri emits it as
 * `<product name>.app.tar.gz` — **the same name for both architectures**, and
 * containing a **space**. Left alone there are two ways to fail silently:
 *
 * 1. Both architectures upload under the same name into one release and one
 *    overwrites the other. Users on the overwritten side either get the app for
 *    another architecture or fail signature verification and never receive an
 *    update again.
 * 2. GitHub converts spaces in asset names to dots. The URL recorded in
 *    `latest.json` still has the space, so it no longer matches the real asset,
 *    and the installed app shows the 404 as "no update available".
 *
 * So it is renamed under the same rule as the DMG
 * (`ontology-atlas_<version>_<arch>`). Version and architecture are **read from
 * the DMG file name** — the asset users actually download already treats that
 * rule as the source of truth (`check-macos-download-release.mjs` checks the
 * name), and recomputing them separately creates a place for the two to
 * diverge.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The folder CI builds the artifact from. One path = a predictable root. */
export const STAGING_DIR = "release-upload";

/** Where Tauri puts its output. */
export const DEFAULT_BUNDLE_DIR = "src-tauri/target/release/bundle";

/** On download the folder is the only thing carrying the architecture, so the folder name is the artifact name. */
export function artifactNameForArch(arch) {
  return `ontology-atlas-macos-${arch}`;
}

/** Same rule as the DMG. The architecture must be in the name for both to survive one release. */
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
 * Gathers the four assets flat into `outDir` and returns the names that will be
 * uploaded.
 *
 * Passing `expectArch` cross-checks the architecture the DMG names — if the build
 * output disagrees with the matrix, it stops here. Letting it through ships users
 * the app for another architecture.
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

  // Leftovers from a previous run would ride along and publish another version into the release.
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
