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
 * The web bundle's `RELEASE_VERSION` — **derived, and this checks that it stays derived.**
 *
 * History: it was a hand-maintained constant, which made it a fifth place to remember. Shipping
 * `v1.0.0-rc.2` produced a green preflight with red tests because this gate looked at four of the
 * five. The literal was removed on 2026-08-25 and the value now comes from `package.json` through
 * `next.config.ts`, so it **cannot** drift.
 *
 * That changes what is worth checking. Comparing a derived value to its own source proves nothing;
 * what can still break is somebody re-introducing a literal, which silently restores the old
 * failure. So the property is asserted instead of the value.
 */
const releaseFacts = fs.readFileSync(
  path.join(root, "src", "views", "download", "lib", "release-facts.ts"),
  "utf8",
);
const releaseFactsLiteral = releaseFacts.match(/RELEASE_VERSION\s*=\s*["'`]([^"'`]+)["'`]/)?.[1];
const releaseFactsDerived = /RELEASE_VERSION\s*=\s*process\.env\.NEXT_PUBLIC_RELEASE_VERSION/.test(
  releaseFacts,
);
const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
const nextConfigFeedsVersion =
  /NEXT_PUBLIC_RELEASE_VERSION\s*:\s*releaseVersion/.test(nextConfig) &&
  /packageJson[\s\S]{0,120}version/.test(nextConfig);

function printHelp() {
  console.log(`Usage: pnpm desktop:release-tag -- --tag=vX.Y.Z

Fails unless the macOS release tag matches every version declaration:
package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml, and unless
/download still derives its version from package.json rather than declaring one.
In GitHub Actions the tag can also come from GITHUB_REF_NAME.
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
if (releaseFactsLiteral) {
  fail(
    `src/views/download/lib/release-facts.ts declares RELEASE_VERSION as the literal "${releaseFactsLiteral}". It must read process.env.NEXT_PUBLIC_RELEASE_VERSION so the download page cannot state a version the app does not have.`,
  );
}
if (!releaseFactsDerived || !nextConfigFeedsVersion) {
  fail(
    "the download page's RELEASE_VERSION is no longer fed from package.json through next.config.ts. Restore that chain rather than typing the version again.",
  );
}

const versions = {
  package: pkg.version,
  tauri: tauriConfig.version,
  cargo: cargoVersion,
};
const mismatches = Object.entries(versions)
  .filter(([, version]) => version !== tagVersion)
  .map(([source, version]) => `${source}=${version ?? "missing"}`);

if (mismatches.length > 0) {
  fail(
    `release tag ${tag} does not match macOS app versions: ${mismatches.join(", ")}. Update package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml together before tagging; the download page follows package.json on its own.`,
  );
}

console.log(
  `[desktop-release-tag] ${tag} matches package, Tauri and Cargo versions, and /download derives its own from package.json`,
);
