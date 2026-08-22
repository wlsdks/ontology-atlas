#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadMacosReleaseNames } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName } = names;
/**
 * `--dmg` signs **the DMG container itself**.
 *
 * Signing only the `.app` and wrapping it in a DMG passes notarisation, but leaves
 * no signature for Gatekeeper to evaluate when it looks at the DMG. Measured on
 * v1.0.0-rc.1, 2026-07-27:
 *
 *   [desktop-notarize] notarized and stapled ...aarch64.dmg      ← notarised
 *   spctl --assess --type open ... : rejected
 *   source=no usable signature                                    ← yet rejected
 *
 * The notarisation ticket attached but **the wrapper had no signature.** This is
 * why Apple's distribution procedure signs the app and the container separately,
 * and the order is fixed: sign app → package DMG → **sign DMG** → notarise →
 * staple.
 *
 * Hardened runtime is not used here. That applies to executing code, and a DMG is a
 * container.
 */
const signDmg = process.argv.includes("--dmg");
const dmgPath = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "dmg",
  `${names.releaseAssetName}_${names.version}_${names.arch}.dmg`,
);
const appPath =
  process.env.MACOS_APP_PATH ??
  (signDmg
    ? dmgPath
    : path.join(
        root,
        "src-tauri",
        "target",
        "release",
        "bundle",
        "macos",
        appBundleName,
      ));
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
  fail(
    signDmg
      ? `missing DMG at ${appPath}; run node scripts/package-macos-dmg.mjs first.`
      : `missing app bundle at ${appPath}; run pnpm desktop:build:app first.`,
  );
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
 * `--adhoc` means **signing without an identity, not skipping the signature.**
 * That distinction blocked v1.0.0.
 *
 * The bundle Tauri emits is linker-signed on the binary only and has no
 * `Contents/_CodeSignature`. In that state the embedded signature claims resources
 * must be present while `CodeResources` is missing, so macOS judges it **a damaged
 * app rather than an unidentified developer**:
 *
 *   codesign --verify → code has no resources but signature indicates
 *                       they must be present
 *
 * The difference shows up in the dialog the user sees. "unidentified developer" is
 * the path where System Settings offers **"Open Anyway"** — exactly the path our
 * download page documents — whereas "is damaged" has **no such button**. So
 * dropping the ad-hoc bundle signature from an unsigned release makes that guidance
 * entirely false, and the only route left for the user is deleting the xattr in a
 * terminal.
 *
 * With an ad-hoc signature the bundle becomes `valid on disk` +
 * `satisfies its Designated Requirement`, and the Gatekeeper verdict drops to an
 * ordinary `rejected` (= unidentified developer). Measured 2026-07-27 on the
 * v1.0.0 draft's aarch64 bundle.
 *
 * Hardened runtime and timestamping are not used here — both assume a real
 * certificate, and timestamping calls Apple's servers.
 */
const adhoc = process.argv.includes("--adhoc");
const identity = adhoc ? "-" : resolveSigningIdentity();

const signArgs = signDmg
  ? // Container signature — neither deep nor hardened runtime applies.
    ["--force", "--timestamp", "--sign", identity, appPath]
  : adhoc
    ? ["--force", "--deep", "--sign", identity, appPath]
    : ["--force", "--deep", "--options", "runtime", "--timestamp", "--sign", identity, appPath];

run("codesign", signArgs);
run("codesign", signDmg
  ? ["--verify", "--strict", "--verbose=2", appPath]
  : ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

console.log(
  signDmg
    ? `[desktop-sign] signed and verified the DMG container ${appPath} — Gatekeeper needs this in addition to the app signature`
    : adhoc
    ? `[desktop-sign] ad-hoc signed and verified ${appPath} (no Developer ID — Gatekeeper will report an unidentified developer, which is the path the download page documents)`
    : `[desktop-sign] signed and verified ${appPath}`,
);
