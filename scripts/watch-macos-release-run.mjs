#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const DEFAULT_WORKFLOW = "release-macos.yml";
const DEFAULT_REF = "main";
const DEFAULT_ATTEMPTS = 30;
const DEFAULT_INTERVAL_MS = 5000;

function printHelp() {
  console.log(`Usage: pnpm desktop:release-run -- --tag=vX.Y.Z [--repo=${DEFAULT_REPO}] [--sha=COMMIT] [--workflow=${DEFAULT_WORKFLOW}] [--ref=${DEFAULT_REF}] [--attempts=${DEFAULT_ATTEMPTS}] [--interval-ms=${DEFAULT_INTERVAL_MS}]

Dispatches the macOS release workflow from the protected ref with the requested
tag as workflow_dispatch input, then watches that exact run to completion. The
lookup is scoped to the admitted tag commit and workflow_dispatch event so an
operator does not accidentally watch an unrelated latest run.

On success it refreshes what /download says about the release and opens the PR
for it, using your credentials -- the same ones that pushed the tag. Merging
that PR is what moves the public download page. If any of it fails the release
is still fine; the command says what to finish by hand.
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
    ref: DEFAULT_REF,
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
    if (arg.startsWith("--ref=")) {
      options.ref = arg.slice("--ref=".length).trim();
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
  if (!/^v[0-9A-Za-z][0-9A-Za-z._-]*$/.test(options.tag)) {
    fail(`--tag must be v-prefixed, got ${options.tag || "(empty)"}.`);
  }
  if (!/^[A-Za-z0-9_.-]+\.ya?ml$/.test(options.workflow)) {
    fail(`--workflow must name a GitHub Actions YAML file, got ${options.workflow || "(empty)"}.`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(options.ref) || options.ref.includes("..")) {
    fail(`--ref must name a protected branch, got ${options.ref || "(empty)"}.`);
  }
  if (options.sha && !/^[0-9a-f]{40}$/i.test(options.sha)) {
    fail(`--sha must be a full 40-character Git commit SHA, got ${options.sha}.`);
  }
  return options;
}

function ghBin() {
  return process.env.OATLAS_GH_BIN || "gh";
}

function gitBin() {
  return process.env.OATLAS_GIT_BIN || "git";
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

function dispatchRelease(options) {
  run(ghBin(), [
    "workflow",
    "run",
    options.workflow,
    "--repo",
    options.repo,
    "--ref",
    options.ref,
    "-f",
    `tag=${options.tag}`,
  ]);
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
      "workflow_dispatch",
      "--commit",
      sha,
      "--limit",
      "20",
      "--json",
      "databaseId,displayTitle,headBranch,status,conclusion,url,headSha,event,workflowName",
    ], { parseJson: true });
    if (!Array.isArray(runs)) {
      fail("gh run list did not return an array.");
    }
    const expectedTitle = `Release Desktop ${options.tag}`;
    const runInfo = runs.find((candidate) => (
      candidate?.event === "workflow_dispatch" &&
      candidate?.headBranch === options.ref &&
      candidate?.headSha === sha &&
      candidate?.displayTitle === expectedTitle
    ));
    if (runInfo?.databaseId) {
      return runInfo;
    }
    if (attempt < options.attempts) {
      console.error(`[desktop-release-run] waiting for ${options.workflow} workflow_dispatch run for ${options.tag} (${sha}); attempt ${attempt}/${options.attempts}`);
      sleep(options.intervalMs);
    }
  }
  fail(
    `no ${options.workflow} workflow_dispatch run appeared for ${options.repo} ${options.tag} (${sha}) after ${options.attempts} attempts. Check that the tag exists remotely and the workflow was dispatched from protected ref ${options.ref}.`,
  );
}

/**
 * Refresh what `/download` says about the release that just published.
 *
 * ⚠️ **Why this runs itself now.** It used to print the commands and stop, on the reasoning that the
 * bot token cannot push to protected `main`. True, and irrelevant: **a person dispatches the
 * release**, so the credentials that just pushed the tag are the same ones that can open this PR.
 * Handing somebody a list of commands at the end of a twenty-minute build is handing them a step to
 * forget — and it was forgotten twice on 2026-08-25, leaving the public download page advertising
 * rc.10 while rc.11 and rc.12 had both shipped.
 *
 * The generator reads the **published** release for real byte sizes and SHA-256 values, so it is run
 * here rather than copied out of the build artifact: same numbers, one less thing to move by hand.
 *
 * Failure here is reported, never fatal. The release itself has already succeeded; a page that is one commit
 * behind is worth a loud message, not an exit code that suggests the build went wrong.
 */
function refreshDownloadPage(options) {
  const branch = `chore/download-facts-${options.tag}`;
  console.log(`[desktop-release-run] refreshing /download for ${options.tag}`);

  const generated = "src/views/download/model/macos-release.generated.ts";
  const attempt = run(
    "pnpm",
    ["download:release-facts", "--", `--tag=${options.tag}`, "--allow-prerelease"],
    { allowFailure: true },
  );
  if (attempt.status !== 0) {
    console.log(
      `[desktop-release-run] could not regenerate ${generated}: ${(attempt.stderr || attempt.stdout).trim()}`,
    );
    console.log(
      `[desktop-release-run] run it yourself: pnpm download:release-facts -- --tag=${options.tag} --allow-prerelease`,
    );
    return;
  }

  const dirty = run("git", ["status", "--porcelain", "--", generated], { allowFailure: true });
  if (!String(dirty.stdout ?? dirty).trim()) {
    console.log(`[desktop-release-run] ${generated} already matches ${options.tag}; nothing to open`);
    return;
  }

  // ⚠️ Branch off the remote head, not the working tree: the tag was cut from origin/main and
  // whatever else is checked out locally has no business riding along in a release-facts PR.
  const steps = [
    ["git", ["fetch", "origin", "main", "--quiet"]],
    ["git", ["checkout", "-B", branch, "origin/main", "--quiet"]],
    ["pnpm", ["download:release-facts", "--", `--tag=${options.tag}`, "--allow-prerelease"]],
    ["git", ["add", "--", generated]],
    ["git", ["commit", "--quiet", "-m", `chore: point /download at ${options.tag}`]],
    ["git", ["push", "--quiet", "-u", "origin", branch]],
  ];
  for (const [bin, args] of steps) {
    const step = run(bin, args, { allowFailure: true });
    if (step.status !== 0) {
      console.log(
        `[desktop-release-run] ${bin} ${args.join(" ")} failed: ${(step.stderr || step.stdout).trim()}`,
      );
      console.log("[desktop-release-run] finish the /download refresh by hand; the release is fine.");
      return;
    }
  }

  const pr = run(
    ghBin(),
    [
      "pr", "create", "--repo", options.repo, "--head", branch, "--base", "main",
      "--title", `chore: point /download at ${options.tag}`,
      "--body",
      `Regenerated by \`pnpm desktop:release-run\` after ${options.tag} published. Byte sizes and SHA-256 values are read from the published release, not typed.\n\nWithout this the download page keeps advertising the previous build.`,
    ],
    { allowFailure: true },
  );
  if (pr.status !== 0) {
    console.log(`[desktop-release-run] branch ${branch} is pushed; open its PR: ${(pr.stderr || pr.stdout).trim()}`);
    return;
  }
  console.log(`[desktop-release-run] /download refresh PR: ${String(pr.stdout).trim()}`);
  console.log("[desktop-release-run] merging it is what moves the public download page.");
}

const options = parseArgs(process.argv.slice(2));
const sha = resolveTagSha(options);
dispatchRelease(options);
const runInfo = findReleaseRun(options, sha);

console.log(`[desktop-release-run] watching ${options.workflow} run ${runInfo.databaseId} for ${options.repo} ${options.tag} (${sha})`);
if (runInfo.url) {
  console.log(`[desktop-release-run] ${runInfo.url}`);
}
run(ghBin(), ["run", "watch", String(runInfo.databaseId), "--repo", options.repo, "--exit-status"]);
console.log(`[desktop-release-run] ${options.workflow} run ${runInfo.databaseId} completed successfully`);
refreshDownloadPage(options);
