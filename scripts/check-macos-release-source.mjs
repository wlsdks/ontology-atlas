#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const MAX_TAG_PEEL_DEPTH = 8;
const SEMVER_TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const FULL_SHA = /^[0-9a-f]{40}$/i;

function printHelp() {
  console.log(`Usage: pnpm desktop:release-source -- --mode=admit|pin --tag=vX.Y.Z --sha=COMMIT [--repo=${DEFAULT_REPO}] [--default-branch=main]

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
  if (!SEMVER_TAG.test(options.tag)) fail(`--tag must be a v-prefixed semantic version, got ${options.tag || "(empty)"}.`);
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

function requireGitObject(object, context) {
  if (!object || !["commit", "tag"].includes(object.type) || !FULL_SHA.test(object.sha ?? "")) {
    fail(`${context} did not resolve to a valid Git commit or tag object.`);
  }
  return { type: object.type, sha: object.sha.toLowerCase() };
}

function resolveTagCommit(repo, tag) {
  const ref = runGh(["api", `repos/${repo}/git/ref/tags/${tag}`]);
  let object = requireGitObject(ref?.object, `release tag ${tag}`);
  const seen = new Set();
  for (let depth = 0; depth <= MAX_TAG_PEEL_DEPTH; depth += 1) {
    if (object.type === "commit") return object.sha;
    if (seen.has(object.sha)) fail(`release tag ${tag} contains an annotated-tag cycle at ${object.sha}.`);
    if (depth === MAX_TAG_PEEL_DEPTH) fail(`release tag ${tag} exceeds the ${MAX_TAG_PEEL_DEPTH}-object peel limit.`);
    seen.add(object.sha);
    const tagObject = runGh(["api", `repos/${repo}/git/tags/${object.sha}`]);
    object = requireGitObject(tagObject?.object, `annotated tag object ${object.sha}`);
  }
  fail(`release tag ${tag} could not be peeled to a commit.`);
}

const options = parseArgs(process.argv.slice(2));
const admittedSha = options.sha.toLowerCase();
const tagSha = resolveTagCommit(options.repo, options.tag);

if (tagSha !== admittedSha) {
  const reason = options.mode === "pin" ? "tag changed after admission" : "tag does not match the admitted SHA";
  fail(`release tag ${options.tag} resolves to ${tagSha}, not admitted SHA ${admittedSha}; ${reason}.`);
}

if (options.mode === "admit") {
  const repo = options.defaultBranch ? null : runGh(["api", `repos/${options.repo}`]);
  const defaultBranch = options.defaultBranch || repo?.default_branch;
  if (!defaultBranch) fail(`could not determine the default branch for ${options.repo}.`);
  const defaultRef = runGh(["api", `repos/${options.repo}/git/ref/heads/${defaultBranch}`]);
  const defaultSha = requireGitObject(defaultRef?.object, `${options.repo} ${defaultBranch} head`);
  if (defaultSha.type !== "commit") fail(`${options.repo} ${defaultBranch} head is not a commit.`);
  if (admittedSha !== defaultSha.sha) {
    fail(`admitted SHA ${admittedSha} is not the current default-branch head ${defaultSha.sha}; create a new tag at ${defaultBranch} head.`);
  }
  console.log(`[desktop-release-source] ${options.tag} resolves to ${admittedSha} and is admitted against ${options.repo} ${defaultBranch}`);
} else {
  console.log(`[desktop-release-source] ${options.tag} remains pinned to admitted SHA ${admittedSha}`);
}
