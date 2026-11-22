#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { RELEASE_TAG_SHAPES, isReleaseTag } from "../lib/release-tag.mjs";
import { requireDefaultBranchCommit, resolveTagCommit } from "./tag-commit.mjs";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const FULL_SHA = /^[0-9a-f]{40}$/i;

function printHelp() {
  console.log(`Usage: pnpm desktop:release-source -- --mode=admit|pin --tag=vX.Y.Z[-beta.N] --sha=COMMIT [--repo=${DEFAULT_REPO}] [--default-branch=main]

Peels lightweight or annotated Git tags to a commit and fails closed unless it
equals the supplied admitted SHA. admit also requires that SHA to be the current
default-branch head. pin rechecks the immutable release source later while main may advance.
`);
}

function fail(message) {
  console.error(`[desktop-release-source] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    mode: "",
    tag: (process.env.RELEASE_TAG ?? "").trim(),
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
    if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length).trim();
      continue;
    }
    if (arg.startsWith("--tag=")) {
      options.tag = arg.slice("--tag=".length).trim();
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
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repo)) fail("--repo must use owner/name format.");
  if (options.mode !== "admit" && options.mode !== "pin") fail("--mode must be admit or pin.");
  if (!isReleaseTag(options.tag)) fail(`--tag must be ${RELEASE_TAG_SHAPES}, got ${options.tag || "(empty)"}.`);
  if (!FULL_SHA.test(options.sha)) fail(`release source sha must be a full 40-character commit SHA, got ${options.sha || "(empty)"}.`);
  if (options.defaultBranch && !/^[A-Za-z0-9._/-]+$/.test(options.defaultBranch)) {
    fail(`default branch contains unsupported characters: ${options.defaultBranch}.`);
  }
  return options;
}

function ghBin() {
  return process.env.OATLAS_GH_BIN || "gh";
}

function runGh(args) {
  const result = spawnSync(ghBin(), args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.error) fail(`failed to run gh ${args.join(" ")}: ${result.error.message}`);
  if (result.status !== 0) fail(`gh ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`gh ${args.join(" ")} returned invalid JSON: ${error.message}`);
  }
}

const options = parseArgs(process.argv.slice(2));
const admittedSha = options.sha.toLowerCase();
const tagSha = resolveTagCommit({ repo: options.repo, tag: options.tag, readJson: runGh, fail });

if (tagSha !== admittedSha) {
  const reason = options.mode === "pin" ? "tag changed after admission" : "tag does not match the admitted SHA";
  fail(`release tag ${options.tag} resolves to ${tagSha}, not admitted SHA ${admittedSha}; ${reason}.`);
}

if (options.mode === "admit") {
  const repo = options.defaultBranch ? null : runGh(["api", `repos/${options.repo}`]);
  const defaultBranch = options.defaultBranch || repo?.default_branch;
  if (!defaultBranch) fail(`could not determine the default branch for ${options.repo}.`);
  const defaultSha = requireDefaultBranchCommit({ repo: options.repo, branch: defaultBranch, readJson: runGh, fail });
  if (admittedSha !== defaultSha) {
    fail(`admitted SHA ${admittedSha} is not the current default-branch head ${defaultSha}; create a new tag at ${defaultBranch} head.`);
  }
  console.log(`[desktop-release-source] ${options.tag} resolves to ${admittedSha} and is admitted against ${options.repo} ${defaultBranch}`);
} else {
  console.log(`[desktop-release-source] ${options.tag} remains pinned to admitted SHA ${admittedSha}`);
}
