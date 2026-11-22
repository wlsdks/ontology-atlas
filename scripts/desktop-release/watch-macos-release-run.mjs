#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { isReleaseTag, parseReleaseTag, RELEASE_TAG_SHAPES } from "../lib/release-tag.mjs";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const DEFAULT_WORKFLOW = "release-macos.yml";
const PROMOTE_WORKFLOW = "promote-release.yml";
const BROWSER_WORKFLOW = "e2e.yml";
const REGISTRY_WORKFLOW = "publish-mcp-registry.yml";
/** A dispatched run's `createdAt` may trail the local clock by this much and still be ours. */
const DISPATCH_CLOCK_SKEW_MS = 2 * 60 * 1000;
const DEFAULT_REF = "main";
const DEFAULT_ATTEMPTS = 30;
const DEFAULT_INTERVAL_MS = 5000;

function printHelp() {
  console.log(`Usage: pnpm desktop:release-run -- --tag=vX.Y.Z|vX.Y.Z-beta.N [--repo=${DEFAULT_REPO}] [--sha=COMMIT] [--workflow=${DEFAULT_WORKFLOW}] [--ref=${DEFAULT_REF}] [--attempts=${DEFAULT_ATTEMPTS}] [--interval-ms=${DEFAULT_INTERVAL_MS}]
       pnpm desktop:release-run -- --tag=vX.Y.Z --promote-from=vX.Y.Z-beta.N [--repo=${DEFAULT_REPO}] [--ref=${DEFAULT_REF}]

Dispatches the macOS release workflow from the protected ref with the requested
tag as workflow_dispatch input, then watches that exact run to completion. The
lookup is scoped to the admitted tag commit and workflow_dispatch event so an
operator does not accidentally watch an unrelated latest run. It also starts the
whole browser suite (${BROWSER_WORKFLOW}) on the tag, which a stable release
must pass before it publishes.

A vX.Y.Z-beta.N tag cuts a beta release: a GitHub pre-release with no
latest.json, which no installed app is offered and /download never names. The
command ends by printing how to promote it.

--promote-from dispatches ${PROMOTE_WORKFLOW} instead: it publishes the beta's own
bytes as vX.Y.Z once vX.Y.Z is pushed at the beta's commit and the browser suite
on that commit is green. No wait is required between the cut and promotion.

After a stable release, a direct cut or a promotion, it
refreshes what /download says about the release and opens the PR for it, using
your credentials -- the same ones that pushed the tag. Merging
that PR is what moves the public download page. A promotion also starts the MCP
Registry listing. If any of it fails the release is still fine; the command says what to
finish by hand, and --refresh-only retries just the /download part without
dispatching another release.
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
    /*
     * The refresh must be retryable without re-releasing: if the watcher dies after dispatch, the only
     * other way back is a second release of a tag that already published.
     */
    if (arg === "--refresh-only") {
      options.refreshOnly = true;
      continue;
    }
    if (arg.startsWith("--repo=")) {
      options.repo = arg.slice("--repo=".length).trim();
      continue;
    }
    if (arg.startsWith("--tag=")) {
      options.tag = arg.slice("--tag=".length).trim();
      continue;
    }
    if (arg.startsWith("--promote-from=")) {
      options.promoteFrom = arg.slice("--promote-from=".length).trim();
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
  if (!isReleaseTag(options.tag)) {
    fail(`--tag must be ${RELEASE_TAG_SHAPES}, got ${options.tag || "(empty)"}.`);
  }
  options.channel = parseReleaseTag(options.tag).channel;
  if (options.promoteFrom !== undefined) {
    const from = isReleaseTag(options.promoteFrom) ? parseReleaseTag(options.promoteFrom) : null;
    if (!from || from.channel !== "beta") {
      fail(`--promote-from must name a beta tag vX.Y.Z-beta.N, got ${options.promoteFrom || "(empty)"}.`);
    }
    if (from.stableTag !== options.tag) {
      fail(`--promote-from=${options.promoteFrom} promotes to ${from.stableTag}, not ${options.tag}.`);
    }
    if (options.sha || options.refreshOnly) fail("--promote-from takes neither --sha nor --refresh-only.");
  }
  if (options.refreshOnly && options.channel === "beta") {
    fail(`${options.tag} is a beta release; /download names stable releases only, so there is nothing to refresh.`);
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

/* `maxBuffer` is raised because `gh run watch` streams for the whole build and overflows Node's 1 MB default (`spawnSync gh ENOBUFS`). */
function run(bin, args, { parseJson = false, allowFailure = false } = {}) {
  const result = spawnSync(bin, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
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

/**
 * Starts the whole browser suite on the tag. A stable release refuses to publish without a whole
 * green run on its commit; a beta does not wait for it. A failed dispatch is reported, never fatal.
 */
function dispatchBrowserSuite(options) {
  const result = run(ghBin(), ["workflow", "run", BROWSER_WORKFLOW, "--repo", options.repo, "--ref", options.tag], {
    allowFailure: true,
  });
  if (typeof result === "string") {
    console.log(`[desktop-release-run] started ${BROWSER_WORKFLOW} on ${options.tag}; a stable release of this commit publishes only once it is green`);
    return;
  }
  console.log(
    `[desktop-release-run] could not start ${BROWSER_WORKFLOW} on ${options.tag}: ${(result.stderr || result.stdout || "").trim()}\n` +
      `[desktop-release-run] start it yourself: gh workflow run ${BROWSER_WORKFLOW} --repo ${options.repo} --ref ${options.tag}`,
  );
}

function findReleaseRun(options, sha) {
  return findDispatchedRun(options, {
    workflow: options.workflow,
    title: `Release Desktop ${options.tag}`,
    filter: ["--commit", sha],
    matches: (candidate) => candidate?.headSha === sha,
    describe: `${options.tag} (${sha})`,
  });
}

/** A promotion runs from the protected ref's head, not the tag's commit, so it is found by title and time. */
function findPromotionRun(options, dispatchedAt) {
  return findDispatchedRun(options, {
    workflow: PROMOTE_WORKFLOW,
    title: `Promote Desktop Beta ${options.promoteFrom}`,
    filter: ["--branch", options.ref],
    matches: (candidate) => Date.parse(candidate?.createdAt ?? "") >= dispatchedAt - DISPATCH_CLOCK_SKEW_MS,
    describe: `${options.promoteFrom} to ${options.tag}`,
  });
}

function findDispatchedRun(options, { workflow, title, filter, matches, describe }) {
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const runs = run(ghBin(), [
      "run",
      "list",
      "--repo",
      options.repo,
      "--workflow",
      workflow,
      "--event",
      "workflow_dispatch",
      ...filter,
      "--limit",
      "20",
      "--json",
      "databaseId,displayTitle,headBranch,status,conclusion,url,headSha,event,workflowName,createdAt",
    ], { parseJson: true });
    if (!Array.isArray(runs)) {
      fail("gh run list did not return an array.");
    }
    const runInfo = runs.find((candidate) => (
      candidate?.event === "workflow_dispatch" &&
      candidate?.headBranch === options.ref &&
      candidate?.displayTitle === title &&
      matches(candidate)
    ));
    if (runInfo?.databaseId) {
      return runInfo;
    }
    if (attempt < options.attempts) {
      console.error(`[desktop-release-run] waiting for ${workflow} workflow_dispatch run for ${describe}; attempt ${attempt}/${options.attempts}`);
      sleep(options.intervalMs);
    }
  }
  fail(
    `no ${workflow} workflow_dispatch run appeared for ${options.repo} ${describe} after ${options.attempts} attempts. Check that the tag exists remotely and the workflow was dispatched from protected ref ${options.ref}.`,
  );
}

/**
 * Opens the PR that refreshes `/download` for the published release, with the credentials that
 * pushed the tag. The generator reads the published release for real sizes and SHA-256 values.
 * Failure is reported, never fatal.
 */
function refreshDownloadPage(options) {
  const branch = `chore/download-facts-${options.tag}`;
  console.log(`[desktop-release-run] refreshing /download for ${options.tag}`);

  const generated = "src/views/download/model/macos-release.generated.ts";
  const repoFacts = "src/views/download/model/repo-facts.generated.ts";
  /* `run` answers with a string on success and the raw spawn result when a failure is allowed, so the shape is normalised once, here. */
  const attempted = (bin, args) => {
    const result = run(bin, args, { allowFailure: true });
    return typeof result === "string"
      ? { ok: true, output: result }
      : { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
  };

  const attempt = attempted("pnpm", [
    "download:release-facts",
    "--",
    `--tag=${options.tag}`,
  ]);
  if (!attempt.ok) {
    console.log(`[desktop-release-run] could not regenerate ${generated}: ${attempt.output}`);
    console.log(
      `[desktop-release-run] run it yourself: pnpm download:release-facts -- --tag=${options.tag}`,
    );
    return;
  }

  const dirty = attempted("git", ["status", "--porcelain", "--", generated]);
  if (!dirty.output) {
    console.log(`[desktop-release-run] ${generated} already matches ${options.tag}; nothing to open`);
    return;
  }

  // ⚠️ Branch off the remote head, not the working tree: the tag was cut from origin/main and
  // whatever else is checked out locally has no business riding along in a release-facts PR.
  const steps = [
    ["git", ["fetch", "origin", "main", "--quiet"]],
    ["git", ["checkout", "-B", branch, "origin/main", "--quiet"]],
    ["pnpm", ["download:release-facts", "--", `--tag=${options.tag}`]],
    // The star and fork counts ride along so their printed day is this release's. A failed read
    // writes nothing, and the release facts still go out with the older day.
    ["pnpm", ["download:repo-facts"], { optional: true }],
    ["git", ["add", "--", generated, repoFacts]],
    ["git", ["commit", "--quiet", "-m", `chore: point /download at ${options.tag}`]],
    ["git", ["push", "--quiet", "-u", "origin", branch]],
  ];
  for (const [bin, args, { optional = false } = {}] of steps) {
    const step = attempted(bin, args);
    if (!step.ok && optional) {
      console.log(`[desktop-release-run] ${bin} ${args.join(" ")} skipped: ${step.output}`);
      continue;
    }
    if (!step.ok) {
      console.log(`[desktop-release-run] ${bin} ${args.join(" ")} failed: ${step.output}`);
      console.log("[desktop-release-run] finish the /download refresh by hand; the release is fine.");
      return;
    }
  }

  const pr = attempted(ghBin(), [
      "pr", "create", "--repo", options.repo, "--head", branch, "--base", "main",
      "--title", `chore: point /download at ${options.tag}`,
      "--body",
      `Regenerated by \`pnpm desktop:release-run\` after ${options.tag} published. Byte sizes and SHA-256 values are read from the published release, not typed.\n\nWithout this the download page keeps advertising the previous build.`,
  ]);
  if (!pr.ok) {
    console.log(`[desktop-release-run] branch ${branch} is pushed; open its PR: ${pr.output}`);
    return;
  }
  console.log(`[desktop-release-run] /download refresh PR: ${pr.output}`);
  console.log("[desktop-release-run] merging it is what moves the public download page.");
}

function watchRun(options, workflow, runInfo) {
  console.log(`[desktop-release-run] watching ${workflow} run ${runInfo.databaseId} for ${options.repo} ${options.tag}`);
  if (runInfo.url) {
    console.log(`[desktop-release-run] ${runInfo.url}`);
  }
  run(ghBin(), ["run", "watch", String(runInfo.databaseId), "--repo", options.repo, "--exit-status"]);
  console.log(`[desktop-release-run] ${workflow} run ${runInfo.databaseId} completed successfully`);
}

/** The registry job inside the cut skips a beta tag, so a promoted release is listed from here. */
function listInMcpRegistry(options) {
  const result = run(ghBin(), [
    "workflow", "run", REGISTRY_WORKFLOW, "--repo", options.repo, "--ref", options.ref, "-f", `tag=${options.tag}`,
  ], { allowFailure: true });
  if (typeof result === "string") {
    console.log(`[desktop-release-run] started the MCP Registry listing for ${options.tag}`);
    return;
  }
  console.log(
    `[desktop-release-run] could not start the MCP Registry listing: ${(result.stderr || result.stdout || "").trim()}\n` +
      `[desktop-release-run] start it yourself: gh workflow run ${REGISTRY_WORKFLOW} --repo ${options.repo} --ref ${options.ref} -f tag=${options.tag}`,
  );
}

const options = parseArgs(process.argv.slice(2));

if (options.refreshOnly) {
  console.log(`[desktop-release-run] refresh only: skipping dispatch for ${options.tag}`);
  refreshDownloadPage(options);
} else if (options.promoteFrom) {
  runPromotion(options);
} else {
  runRelease(options);
}

function runRelease(options) {
  const sha = resolveTagSha(options);
  dispatchRelease(options);
  dispatchBrowserSuite(options);
  const runInfo = findReleaseRun(options, sha);
  watchRun(options, options.workflow, runInfo);
  if (options.channel === "beta") {
    const { stableTag } = parseReleaseTag(options.tag);
    console.log(`[desktop-release-run] ${options.tag} is published as a beta release: a GitHub pre-release with no latest.json. No installed app is offered it and /download does not name it.`);
    console.log("[desktop-release-run] install it by hand from the release page. To promote these bytes to the stable release, once the browser suite on the tag is green:");
    console.log(`  git tag ${stableTag} "${options.tag}^{commit}" && git push origin ${stableTag}`);
    console.log(`  pnpm desktop:release-run -- --tag=${stableTag} --promote-from=${options.tag}`);
    return;
  }
  refreshDownloadPage(options);
}

function runPromotion(options) {
  const dispatchedAt = Date.now();
  run(ghBin(), [
    "workflow", "run", PROMOTE_WORKFLOW, "--repo", options.repo, "--ref", options.ref, "-f", `beta_tag=${options.promoteFrom}`,
  ]);
  const runInfo = findPromotionRun(options, dispatchedAt);
  watchRun(options, PROMOTE_WORKFLOW, runInfo);
  console.log(`[desktop-release-run] ${options.tag} is published with the bytes of ${options.promoteFrom}`);
  listInMcpRegistry(options);
  refreshDownloadPage(options);
}
