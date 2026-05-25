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

function printHelp() {
  console.log(`Usage: pnpm desktop:release-tag -- --tag=vX.Y.Z

Fails unless the macOS release tag matches package.json, Tauri, and Cargo
package versions. In GitHub Actions the tag can also come from GITHUB_REF_NAME.
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
};
const mismatches = Object.entries(versions)
  .filter(([, version]) => version !== tagVersion)
  .map(([source, version]) => `${source}=${version ?? "missing"}`);

if (mismatches.length > 0) {
  fail(
    `release tag ${tag} does not match macOS app versions: ${mismatches.join(", ")}. Update package.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml together before tagging.`,
  );
}

console.log(`[desktop-release-tag] ${tag} matches package, Tauri, and Cargo versions`);
