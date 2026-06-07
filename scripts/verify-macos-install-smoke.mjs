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
