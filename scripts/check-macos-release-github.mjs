#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "wlsdks/oh-my-ontology";
const REQUIRED_SECRETS = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_KEYCHAIN_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];

function printHelp() {
  console.log(`Usage: pnpm desktop:release-github [--repo=${DEFAULT_REPO}] [--tag=vX.Y.Z]

Checks GitHub-side prerequisites for the macOS release workflow before a public
tag push: gh authentication, the release workflow file, required Apple signing
and notarization secret names, and optional local tag/version alignment.

This check can only prove that required secret names exist. The tag workflow
still runs desktop:release-secrets to verify that values are non-empty and the
Developer ID certificate secret is structurally valid.

Required GitHub Actions secret names:
${REQUIRED_SECRETS.map((name) => `  ${name}`).join("\n")}
`);
}

function fail(message) {
  console.error(`[desktop-release-github] ${message}`);
  process.exit(1);
}

function secretSetHints(repo, names) {
  return names.map((name) => `  gh secret set ${name} --repo ${repo} < /path/to/${name}`).join("\n");
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
  if (options.tag && !/^v.+/.test(options.tag)) {
    fail(`--tag must be v-prefixed, got ${options.tag}.`);
  }
  return options;
}

function ghBin() {
  return process.env.OMOT_GH_BIN || "gh";
}

function runGh(args, { parseJson = false } = {}) {
  const result = spawnSync(ghBin(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error) {
    fail(`failed to run gh ${args.join(" ")}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (
      args.some((arg) => String(arg).includes("actions/workflows/release-macos.yml")) &&
      /\b404\b|not found/i.test(result.stderr || result.stdout)
    ) {
      fail(
        "release-macos.yml is not available on GitHub for this repo yet. Commit and push .github/workflows/release-macos.yml before pushing the release tag.",
      );
    }
    fail(`gh ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  if (!parseJson) return result.stdout;
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`gh ${args.join(" ")} returned invalid JSON: ${error.message}`);
  }
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail((result.stderr || result.stdout).trim());
  }
}

const options = parseArgs(process.argv.slice(2));

runGh(["auth", "status"]);

const workflow = runGh([
  "api",
  `repos/${options.repo}/actions/workflows/release-macos.yml`,
], { parseJson: true });
if (workflow?.state !== "active") {
  fail(`release-macos.yml workflow for ${options.repo} is not active.`);
}

const secrets = runGh([
  "secret",
  "list",
  "--repo",
  options.repo,
  "--json",
  "name",
], { parseJson: true });
if (!Array.isArray(secrets)) {
  fail("gh secret list did not return an array.");
}
const secretNames = new Set(secrets.map((secret) => secret?.name).filter(Boolean));
const missing = REQUIRED_SECRETS.filter((name) => !secretNames.has(name));
if (missing.length > 0) {
  fail(
    `missing GitHub Actions secrets for ${options.repo}: ${missing.join(", ")}. Add the Apple Developer ID signing and notary secrets before pushing the release tag.\n\nSet them with:\n${secretSetHints(options.repo, missing)}`,
  );
}

if (options.tag) {
  runNode(["scripts/check-macos-release-tag.mjs", `--tag=${options.tag}`]);
}

console.log(
  `[desktop-release-github] ${options.repo} has an active release workflow and all required Apple release secret names`,
);
if (options.tag) {
  console.log(`[desktop-release-github] ${options.tag} matches package, Tauri, and Cargo versions`);
}
