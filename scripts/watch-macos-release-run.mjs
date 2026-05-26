#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "wlsdks/oh-my-ontology";
const DEFAULT_WORKFLOW = "release-macos.yml";
const DEFAULT_ATTEMPTS = 30;
const DEFAULT_INTERVAL_MS = 5000;

function printHelp() {
  console.log(`Usage: pnpm desktop:release-run -- --tag=vX.Y.Z [--repo=${DEFAULT_REPO}] [--sha=COMMIT] [--workflow=${DEFAULT_WORKFLOW}] [--attempts=${DEFAULT_ATTEMPTS}] [--interval-ms=${DEFAULT_INTERVAL_MS}]

Waits for the tag-push macOS release workflow run to appear, then watches that
exact run to completion. The lookup is scoped to the pushed tag commit and the
push event so an operator does not accidentally watch an unrelated latest run.
`);
}

function fail(message) {
  console.error(`[desktop-release-run] ${message}`);
  process.exit(1);
}

function parsePositiveInteger(raw, label) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${label} must be a positive integer, got ${raw || "(empty)"}.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    tag: "",
    sha: "",
    workflow: DEFAULT_WORKFLOW,
    attempts: DEFAULT_ATTEMPTS,
    intervalMs: DEFAULT_INTERVAL_MS,
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
    if (arg.startsWith("--sha=")) {
      options.sha = arg.slice("--sha=".length).trim();
      continue;
    }
    if (arg.startsWith("--workflow=")) {
      options.workflow = arg.slice("--workflow=".length).trim();
      continue;
    }
    if (arg.startsWith("--attempts=")) {
      options.attempts = parsePositiveInteger(arg.slice("--attempts=".length).trim(), "--attempts");
      continue;
    }
    if (arg.startsWith("--interval-ms=")) {
      options.intervalMs = parsePositiveInteger(arg.slice("--interval-ms=".length).trim(), "--interval-ms");
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
  if (!/^[A-Za-z0-9_.-]+\.ya?ml$/.test(options.workflow)) {
    fail(`--workflow must name a GitHub Actions YAML file, got ${options.workflow || "(empty)"}.`);
  }
  if (options.sha && !/^[0-9a-f]{7,40}$/i.test(options.sha)) {
    fail(`--sha must be a Git commit SHA, got ${options.sha}.`);
  }
  return options;
}

function ghBin() {
  return process.env.OMOT_GH_BIN || "gh";
}

function gitBin() {
  return process.env.OMOT_GIT_BIN || "git";
}

function run(bin, args, { parseJson = false, allowFailure = false } = {}) {
  const result = spawnSync(bin, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) {
    fail(`failed to run ${bin} ${args.join(" ")}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (allowFailure) return result;
    fail(`${bin} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim() || `exit ${result.status}`}`);
  }
  if (!parseJson) return result.stdout.trim();
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`${bin} ${args.join(" ")} returned invalid JSON: ${error.message}`);
  }
}

function resolveTagSha(options) {
  if (options.sha) return options.sha;
  return run(gitBin(), ["rev-list", "-n", "1", options.tag]);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function findReleaseRun(options, sha) {
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const runs = run(ghBin(), [
      "run",
      "list",
      "--repo",
      options.repo,
      "--workflow",
      options.workflow,
      "--event",
      "push",
      "--commit",
      sha,
      "--limit",
      "1",
      "--json",
      "databaseId,status,conclusion,url,headSha,event,workflowName",
    ], { parseJson: true });
    if (!Array.isArray(runs)) {
      fail("gh run list did not return an array.");
    }
    const runInfo = runs.find((candidate) => String(candidate?.headSha ?? "").startsWith(sha) || String(candidate?.headSha ?? "") === sha) ?? runs[0];
    if (runInfo?.databaseId) {
      return runInfo;
    }
    if (attempt < options.attempts) {
      console.error(`[desktop-release-run] waiting for ${options.workflow} push run for ${options.tag} (${sha}); attempt ${attempt}/${options.attempts}`);
      sleep(options.intervalMs);
    }
  }
  fail(
    `no ${options.workflow} push run appeared for ${options.repo} ${options.tag} (${sha}) after ${options.attempts} attempts. Check that the tag was pushed to origin and the workflow exists on the default branch.`,
  );
}

const options = parseArgs(process.argv.slice(2));
const sha = resolveTagSha(options);
const runInfo = findReleaseRun(options, sha);

console.log(`[desktop-release-run] watching ${options.workflow} run ${runInfo.databaseId} for ${options.repo} ${options.tag} (${sha})`);
if (runInfo.url) {
  console.log(`[desktop-release-run] ${runInfo.url}`);
}
run(ghBin(), ["run", "watch", String(runInfo.databaseId), "--repo", options.repo, "--exit-status"]);
console.log(`[desktop-release-run] ${options.workflow} run ${runInfo.databaseId} completed successfully`);
