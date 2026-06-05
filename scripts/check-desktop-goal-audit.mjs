#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const DEFAULT_HOSTED_BASE_URL = "https://ontology-atlas.web.app";
const DEFAULT_JSON_FILE = ".tmp/desktop-goal-status.json";
const DEFAULT_MARKDOWN_FILE = ".tmp/desktop-goal-status.md";

function printHelp() {
  console.log(`Usage: pnpm desktop:goal-audit -- --pr=NUMBER --tag=vX.Y.Z [--repo=${DEFAULT_REPO}] [--hosted-base-url=${DEFAULT_HOSTED_BASE_URL}] [--json-file=PATH] [--markdown-file=PATH]

Runs the full desktop goal gate:
1. local release preflight: app build, DMG creation, app launch smoke, DMG verify, install smoke
2. public completion audit: PR readiness, release workflow, signing secrets, GitHub Release assets, hosted deploy workflow/secrets, and live download page

This wrapper requires --pr and --tag before starting the expensive local preflight so goal completion cannot accidentally skip PR evidence.
By default it writes release evidence to ${DEFAULT_JSON_FILE} and ${DEFAULT_MARKDOWN_FILE}; pass --json-file or --markdown-file to override those paths.
`);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    pr: "",
    tag: "",
    hostedBaseUrl: DEFAULT_HOSTED_BASE_URL,
    jsonFile: DEFAULT_JSON_FILE,
    markdownFile: DEFAULT_MARKDOWN_FILE,
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
    if (arg.startsWith("--pr=")) {
      options.pr = arg.slice("--pr=".length).trim();
      continue;
    }
    if (arg.startsWith("--tag=")) {
      options.tag = arg.slice("--tag=".length).trim();
      continue;
    }
    if (arg.startsWith("--hosted-base-url=")) {
      options.hostedBaseUrl = arg.slice("--hosted-base-url=".length).replace(/\/+$/, "");
      continue;
    }
    if (arg.startsWith("--json-file=")) {
      options.jsonFile = arg.slice("--json-file=".length).trim();
      continue;
    }
    if (arg.startsWith("--markdown-file=")) {
      options.markdownFile = arg.slice("--markdown-file=".length).trim();
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }

  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    fail("--repo must use owner/name format.");
  }
  if (!/^\d+$/.test(options.pr)) {
    fail("--pr=NUMBER is required for desktop goal completion evidence.");
  }
  if (!/^v.+/.test(options.tag)) {
    fail("--tag=vX.Y.Z is required for desktop goal completion evidence.");
  }
  try {
    const hostedUrl = new URL(options.hostedBaseUrl);
    if (!["http:", "https:"].includes(hostedUrl.protocol)) {
      fail("--hosted-base-url must use http or https.");
    }
  } catch {
    fail(`--hosted-base-url must be a valid URL, got ${options.hostedBaseUrl || "(empty)"}.`);
  }

  return options;
}

function pnpmBin() {
  return process.env.OATLAS_PNPM_BIN || "pnpm";
}

function fail(message) {
  console.error(`[desktop-goal-audit] ${message}`);
  process.exit(1);
}

function runPnpm(args) {
  const result = spawnSync(pnpmBin(), args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    fail(`failed to run ${pnpmBin()} ${args.join(" ")}: ${result.error.message}`);
  }
  return result.status ?? 1;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const preflightStatus = runPnpm(["desktop:release-preflight"]);
  if (preflightStatus !== 0) {
    process.exit(preflightStatus);
  }

  const releaseArgs = [
    "desktop:release-status",
    "--",
    `--repo=${options.repo}`,
    `--pr=${options.pr}`,
    `--tag=${options.tag}`,
    "--include-hosted-surface",
    `--hosted-base-url=${options.hostedBaseUrl}`,
  ];
  releaseArgs.push(`--json-file=${options.jsonFile}`);
  releaseArgs.push(`--markdown-file=${options.markdownFile}`);

  process.exit(runPnpm(releaseArgs));
}

main();
