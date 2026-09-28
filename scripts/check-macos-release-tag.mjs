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
 * `/download` derives RELEASE_VERSION from package.json through next.config.ts; this
 * asserts the derivation still exists, because comparing the value with itself proves nothing.
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

Fails unless the macOS release tag is a plain vMAJOR.MINOR.PATCH (release
candidates are retired) and matches every version declaration:
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

if (!tag.startsWith("v")) {
  fail(`release tag must be v-prefixed, got ${tag}.`);
}
const suffixed = tag.match(/^v(\d+\.\d+\.\d+)[-+]/);
if (suffixed) {
  fail(
    `release tag ${tag} has a pre-release or build suffix. Release candidates are retired: every release is a plain vX.Y.Z tag, so tag v${suffixed[1]} instead.`,
  );
}
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
  fail(`release tag must be vMAJOR.MINOR.PATCH, got ${tag}.`);
}

const tagVersion = tag.slice(1);
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
