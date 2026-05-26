#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "wlsdks/oh-my-ontology";

function printHelp() {
  console.log(`Usage: pnpm desktop:release-source [--repo=${DEFAULT_REPO}] [--sha=COMMIT] [--default-branch=main]

Fails unless the macOS release tag points at the current default-branch head.
Run this before signing so a tag pushed from an unmerged PR branch cannot publish
signed DMGs.
`);
}

function fail(message) {
  console.error(`[desktop-release-source] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    sha: (process.env.GITHUB_SHA ?? "").trim(),
    defaultBranch: "",
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
    if (arg.startsWith("--sha=")) {
      options.sha = arg.slice("--sha=".length).trim();
      continue;
    }
    if (arg.startsWith("--default-branch=")) {
      options.defaultBranch = arg.slice("--default-branch=".length).trim();
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    fail("--repo must use owner/name format.");
  }
  if (!/^[0-9a-f]{40}$/i.test(options.sha)) {
    fail(`release source sha must be a full 40-character commit SHA, got ${options.sha || "(empty)"}.`);
  }
  if (options.defaultBranch && !/^[A-Za-z0-9._/-]+$/.test(options.defaultBranch)) {
    fail(`default branch contains unsupported characters: ${options.defaultBranch}.`);
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
  });
  if (result.error) {
    fail(`failed to run gh ${args.join(" ")}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`gh ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`gh ${args.join(" ")} returned invalid JSON: ${error.message}`);
  }
}

const options = parseArgs(process.argv.slice(2));
const repo = options.defaultBranch
  ? null
  : runGh(["api", `repos/${options.repo}`]);
const defaultBranch = options.defaultBranch || repo?.default_branch;
if (!defaultBranch) {
  fail(`could not determine the default branch for ${options.repo}.`);
}

const defaultRef = runGh(["api", `repos/${options.repo}/git/ref/heads/${defaultBranch}`]);
const defaultSha = defaultRef?.object?.sha;
if (!/^[0-9a-f]{40}$/i.test(defaultSha ?? "")) {
  fail(`could not determine ${options.repo} ${defaultBranch} head SHA.`);
}

if (options.sha !== defaultSha) {
  fail(
    `release tag points at ${options.sha}, but ${options.repo} ${defaultBranch} is ${defaultSha}. Merge the desktop PR and tag the default-branch head before publishing signed DMGs.`,
  );
}

console.log(`[desktop-release-source] ${options.sha} is ${options.repo} ${defaultBranch} head`);
