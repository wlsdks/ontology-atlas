#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { parseSha256Checksum } from "./lib/macos-checksum.mjs";
import { parseHdiutilMountDir, verifyApplicationsSymlink } from "./lib/macos-dmg-layout.mjs";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName, releaseAssetName, version, arch } = names;
const defaultDmgPath = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "dmg",
  `${releaseAssetName}_${version}_${arch}.dmg`,
);

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-install [path/to/app.dmg] [--hold-ms=5000]

Checks the named .sha256 file, mounts the DMG read-only, copies ${appBundleName}
to a temporary install directory with ditto, opens that copied app through
LaunchServices, requires a visible Ontology Atlas window plus Accessibility text,
then detaches and removes the temporary install.
`);
}

function fail(message) {
  console.error(`[desktop-install-verify] ${message}`);
  process.exit(1);
}

export function parseVerifyInstallArgs(argv, { defaultDmgPath }) {
  const holdMsArg = argv.find((arg) => arg.startsWith("--hold-ms="));
  return {
    dmgPath: argv.find((arg) => !arg.startsWith("-")) ?? defaultDmgPath,
    holdMs: holdMsArg ? Number(holdMsArg.slice("--hold-ms=".length)) : 5000,
  };
}

export function buildInstalledAppVerifyArgs(installedApp, holdMs) {
  return [
    "scripts/verify-macos-app-launch.mjs",
    installedApp,
    `--hold-ms=${holdMs}`,
    "--kill-existing",
    "--open-app",
    "--require-window",
    "--require-owner-name=Ontology Atlas",
    "--min-window-size=1040x720",
    "--require-accessibility-text=Ontology Atlas",
  ];
}

/**
 * 실행만으로는 이 결함을 못 잡는다 — 그게 v1.0.0 draft 가 여기를 통과한 이유다.
 *
 * 이 검증은 앱을 복사해서 띄워보는데, **복사본에는 quarantine 속성이 없다.**
 * Gatekeeper 는 quarantine 이 붙은 것만 평가하므로, 이 경로에서는 애초에
 * 평가가 일어나지 않는다. 그래서 서명이 구조적으로 깨진 번들도 조용히 실행되고
 * 검증은 초록불을 준다. 정작 사용자가 브라우저로 받은 DMG 에는 quarantine 이
 * 붙고, 거기서 처음으로 판정이 내려진다.
 *
 * 실측(2026-07-27, v1.0.0 draft): Tauri 번들은 `_CodeSignature` 가 없어
 * `codesign --verify` 가 "code has no resources but signature indicates they
 * must be present" 로 거절한다. 그건 "확인되지 않은 개발자"(→ 시스템 설정에
 * **"확인 없이 열기"** 가 뜨는, 우리 다운로드 페이지가 안내하는 경로)가
 * 아니라 **"손상되었습니다"**(그 버튼이 없는 경로)다.
 *
 * 그래서 실행 전에 서명 자체의 구조를 본다. 신원(Developer ID)은 요구하지
 * 않는다 — 미서명 릴리스에서는 ad-hoc 서명이 정답이고, 여기서 막아야 하는
 * 것은 "신원 없음" 이 아니라 **"구조가 깨짐"** 이다.
 */
export function verifyBundleSignature(appPath, { label = appBundleName } = {}) {
  const verified = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], {
    encoding: "utf8",
  });
  if (verified.status !== 0) {
    const detail = `${verified.stderr ?? ""}${verified.stdout ?? ""}`.trim();
    throw new Error(
      `codesign --verify rejected ${label}: ${detail || `exit ${verified.status}`}\n` +
        "브라우저로 받은 사용자는 이 번들을 '확인되지 않은 개발자'가 아니라 '손상되었습니다'로 만나고,\n" +
        "그 대화상자에는 '확인 없이 열기'가 없다 — 다운로드 페이지의 안내가 통째로 틀리게 된다.\n" +
        "미서명 릴리스라면 pnpm desktop:sign:adhoc 를 패키징 전에 실행하라.",
    );
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(
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

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (process.platform !== "darwin") {
    fail("macOS install verification requires darwin.");
  }

  const { dmgPath, holdMs } = parseVerifyInstallArgs(process.argv.slice(2), { defaultDmgPath });
  const checksumPath = `${dmgPath}.sha256`;

  if (!Number.isFinite(holdMs) || holdMs < 1000) {
    fail("--hold-ms must be a number >= 1000.");
  }

  if (!fs.existsSync(dmgPath)) {
    fail(`missing DMG at ${dmgPath}; run pnpm desktop:build first.`);
  }

  if (!fs.existsSync(checksumPath)) {
    fail(`missing checksum at ${checksumPath}; run pnpm desktop:build first.`);
  }

  const { checksum: expectedChecksum } = parseSha256Checksum(fs.readFileSync(checksumPath, "utf8"), {
    expectedFilename: path.basename(dmgPath),
  });
  const actualChecksum = crypto.createHash("sha256").update(fs.readFileSync(dmgPath)).digest("hex");
  if (actualChecksum !== expectedChecksum) {
    fail(`checksum mismatch for ${dmgPath}: expected ${expectedChecksum}, got ${actualChecksum}`);
  }

  let mountDir = null;
  let tempDir = null;
  let verificationError = null;

  try {
    run("hdiutil", ["verify", dmgPath]);
    const attach = run("hdiutil", ["attach", "-readonly", "-nobrowse", dmgPath]);
    mountDir = parseHdiutilMountDir(attach.stdout);

    if (!mountDir) {
      throw new Error(`could not find mounted volume in hdiutil output:\n${attach.stdout}`);
    }

    const mountedApp = path.join(mountDir, appBundleName);
    const applicationsLink = path.join(mountDir, "Applications");
    if (!fs.existsSync(mountedApp)) {
      throw new Error(`mounted DMG is missing ${appBundleName}`);
    }
    verifyApplicationsSymlink(applicationsLink);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-atlas-install-smoke-"));
    const installedApp = path.join(tempDir, appBundleName);
    run("ditto", [mountedApp, installedApp]);

    verifyBundleSignature(installedApp);

    run(process.execPath, buildInstalledAppVerifyArgs(installedApp, holdMs));
  } catch (error) {
    verificationError = error;
  } finally {
    if (mountDir) {
      try {
        run("hdiutil", ["detach", mountDir]);
      } catch (detachError) {
        verificationError ??= detachError;
      }
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  if (verificationError) {
    fail(verificationError.message);
  }

  console.log(
    `[desktop-install-verify] copied and launched ${appBundleName} from ${dmgPath} for ${holdMs}ms with LaunchServices app content proof`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
