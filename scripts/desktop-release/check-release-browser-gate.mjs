#!/usr/bin/env node
/**
 * The browser gate of a stable release: the newest finished `e2e.yml` run on the release commit must
 * be a whole run that concluded `success`. A run still going, a red run, a partial run and no run at
 * all each refuse and print the command that starts a whole run. No flag skips it.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { fullBrowserRunKind } from "../lib/landing/pr-land/main-health.mjs";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const WORKFLOW = "e2e.yml";
const FULL_SHA = /^[0-9a-f]{40}$/i;
const RUN_LIMIT = 30;

function printHelp() {
  console.log(`Usage: pnpm desktop:release-browser-gate -- --sha=COMMIT [--tag=vX.Y.Z] [--repo=${DEFAULT_REPO}]

Passes only when the newest finished ${WORKFLOW} run on COMMIT is a whole run
(its shards uploaded playwright-timings-full-* artifacts) that concluded
success. A running, red, partial or absent run refuses, and the refusal prints
the dispatch command for a whole run. --tag names the ref that command uses.
`);
}

/** Cancelled and skipped runs carry no verdict, so they never hide an older one. */
const VERDICTS = new Set(["success", "failure", "timed_out", "startup_failure", "action_required", "neutral", "stale"]);

/**
 * @param {{ runs: Array<{ databaseId: number, status: string, conclusion: string, createdAt: string, url?: string, event?: string }>, artifactsOf: (id: number) => string[] }} input
 * @returns {{ ok: boolean, state: 'success' | 'running' | 'red' | 'partial' | 'absent', run: object | null, message: string }}
 */
export function judgeBrowserRuns({ runs, artifactsOf }) {
  const newestFirst = [...(Array.isArray(runs) ? runs : [])].sort(
    (a, b) => Date.parse(b?.createdAt ?? "") - Date.parse(a?.createdAt ?? ""),
  );
  const finished = newestFirst.find((run) => run?.status === "completed" && VERDICTS.has(run?.conclusion));
  if (!finished) {
    const running = newestFirst.find((run) => run?.status && run.status !== "completed");
    if (running) {
      return {
        ok: false,
        state: "running",
        run: running,
        message: `the browser suite on this commit is still ${running.status}${running.url ? ` (${running.url})` : ""}; wait for it to finish, then run the gate again.`,
      };
    }
    return { ok: false, state: "absent", run: null, message: "no finished browser-suite run exists on this commit." };
  }
  const where = finished.url ? ` (${finished.url})` : "";
  if (finished.conclusion !== "success") {
    return {
      ok: false,
      state: "red",
      run: finished,
      message: `the newest finished browser-suite run on this commit concluded ${finished.conclusion}${where}. Fix it, or quarantine the failing spec with that run as evidence, then run the suite again.`,
    };
  }
  if (fullBrowserRunKind(finished.conclusion, artifactsOf(finished.databaseId)) !== "full") {
    return {
      ok: false,
      state: "partial",
      run: finished,
      message: `the newest finished browser-suite run on this commit was green but ran only part of the suite${where}.`,
    };
  }
  return {
    ok: true,
    state: "success",
    run: finished,
    message: `the newest finished browser-suite run on this commit ran the whole suite and passed${where}.`,
  };
}

function fail(message) {
  console.error(`[release-browser-gate] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { repo: DEFAULT_REPO, sha: "", tag: "" };
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith("--repo=")) options.repo = arg.slice("--repo=".length).trim();
    else if (arg.startsWith("--sha=")) options.sha = arg.slice("--sha=".length).trim().toLowerCase();
    else if (arg.startsWith("--tag=")) options.tag = arg.slice("--tag=".length).trim();
    else fail(`unknown argument: ${arg}`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repo)) fail("--repo must use owner/name format.");
  if (!FULL_SHA.test(options.sha)) fail(`--sha must be a full 40-character commit SHA, got ${options.sha || "(empty)"}.`);
  if (options.tag && !/^v[0-9A-Za-z.-]+$/.test(options.tag)) fail(`--tag must be a v-prefixed tag, got ${options.tag}.`);
  return options;
}

function gh(args) {
  const result = spawnSync(process.env.OATLAS_GH_BIN || "gh", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) fail(`failed to run gh ${args.join(" ")}: ${result.error.message}`);
  if (result.status !== 0) fail(`gh ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let runs;
  try {
    runs = JSON.parse(
      gh([
        "run", "list", "--repo", options.repo, "--workflow", WORKFLOW, "--commit", options.sha,
        "--limit", String(RUN_LIMIT), "--json", "databaseId,status,conclusion,createdAt,url,event",
      ]),
    );
  } catch (error) {
    fail(`gh run list returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const artifactsOf = (id) =>
    gh(["api", `repos/${options.repo}/actions/runs/${id}/artifacts?per_page=100`, "--jq", ".artifacts[].name"])
      .split("\n")
      .filter(Boolean);
  const verdict = judgeBrowserRuns({ runs, artifactsOf });
  if (verdict.ok) {
    console.log(`[release-browser-gate] ${options.sha}: ${verdict.message}`);
    return;
  }
  const ref = options.tag || "<the release tag at this commit>";
  fail(
    `${options.sha}: ${verdict.message}\n` +
      "A stable release publishes only over a whole green browser run on its own commit. Start one with:\n" +
      `  gh workflow run ${WORKFLOW} --repo ${options.repo} --ref ${ref}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
