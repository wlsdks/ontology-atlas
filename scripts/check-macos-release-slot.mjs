#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "wlsdks/oh-my-ontology";

function printHelp() {
  console.log(`Usage: pnpm desktop:release-slot -- --tag=vX.Y.Z [--repo=${DEFAULT_REPO}]

Fails closed when a GitHub Release already exists for the tag that the macOS
release workflow is about to publish. This prevents reruns or manual draft
releases from mixing stale DMG assets with freshly signed artifacts.
`);
}

function fail(message) {
  console.error(`[desktop-release-slot] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    tag: "",
  };
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith("--repo=")) {
      options.repo = arg.slice("--repo=".length).trim();
      continue;
    }
    if (arg.startsWith("--tag=")) {
      options.tag = arg.slice("--tag=".length).trim();
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    fail("--repo must use owner/name format.");
  }
  if (!/^v.+/.test(options.tag)) {
    fail(`--tag must be v-prefixed, got ${options.tag || "(empty)"}.`);
  }
  return options;
}

function ghBin() {
  return process.env.OMOT_GH_BIN || "gh";
}

function runGh(args) {
  const result = spawnSync(ghBin(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) {
    fail(`failed to run gh ${args.join(" ")}: ${result.error.message}`);
  }
  return result;
}

const options = parseArgs(process.argv.slice(2));
const result = runGh([
  "release",
  "view",
  options.tag,
  "--repo",
  options.repo,
  "--json",
  "tagName,isDraft,isPrerelease,url",
]);

if (result.status === 0) {
  let release = null;
  try {
    release = JSON.parse(result.stdout);
  } catch {
    // Keep the failure actionable even if gh changes the JSON shape.
  }
  const url = release?.url ? ` (${release.url})` : "";
  const state = release?.isDraft ? "draft" : release?.isPrerelease ? "prerelease" : "public";
  fail(
    `release ${options.tag} already exists for ${options.repo}${url}. Delete the existing ${state} release or choose a new version before uploading signed macOS DMGs.`,
  );
}

const output = `${result.stderr || ""}\n${result.stdout || ""}`;
if (!/\b404\b|not found|release not found/i.test(output)) {
  fail(`gh release view ${options.tag} failed: ${output.trim() || `exit ${result.status}`}`);
}

console.log(
  `[desktop-release-slot] ${options.repo} ${options.tag} has no existing GitHub Release; safe to upload signed macOS DMGs`,
);
