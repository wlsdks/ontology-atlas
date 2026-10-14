import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every CI job declares its measured p95 as a `# budget: <n>s` comment, and `timeout-minutes` must sit
 * between the budget and 1.5x it. The 120-second floor is GitHub's whole-minute granularity. Only the
 * workflow file is read; no run is compared, so a slow runner cannot turn this red.
 */

const WORKFLOWS = path.join(process.cwd(), ".github/workflows");

/** Jobs that delegate to a reusable workflow; the callee owns the timeout. */
const DELEGATING_JOBS = new Set(["release-macos.yml:list-mcp-registry"]);

/**
 * The one exemption from the 1.5x ceiling, and it is another contract's ceiling
 * rather than an absence of one.
 *
 * A job that prepares Playwright may have to download chromium, and
 * `ci-bounded-network.contract.test.ts` requires the job timeout to leave **half**
 * the budget for the tests after the bounded install's worst case — 3 attempts x
 * 180 s plus 2 x 90 s, i.e. 12 minutes. Tightening these four to 1.5x their
 * cache-hit p95 turned that gate red, which is correct: a 3-minute ceiling on a job
 * that may legitimately spend 12 minutes downloading a browser would fail on the
 * cold path every time the cache key rolls.
 *
 * So the two gates divide the work. That one owns the ceiling of a job with a
 * network prep envelope; this one still requires the measured budget beside it, so
 * the steady-state cost is written down and a regression is visible in review.
 */
const PREPARES_PLAYWRIGHT = /\.\/\.github\/actions\/setup-playwright/;

const GRANULARITY_FLOOR_SECONDS = 120;

type Job = {
  file: string;
  key: string;
  budget: number | null;
  timeout: number | null;
  delegates: boolean;
  preparesPlaywright: boolean;
};

/**
 * A two-space-indented key under `jobs:` starts a job; the block runs to the next one.
 * Parsed as text on purpose — this repository has no YAML parser in its dependency
 * tree, and adding one to read seven files would be the larger change.
 */
function jobs(): Job[] {
  const found: Job[] = [];
  for (const file of readdirSync(WORKFLOWS).filter((name) => name.endsWith(".yml"))) {
    const lines = readFileSync(path.join(WORKFLOWS, file), "utf8").split("\n");
    const start = lines.findIndex((line) => line === "jobs:");
    expect(start, `${file} has no jobs: block`).toBeGreaterThan(-1);
    let current: Job | null = null;
    for (const line of lines.slice(start + 1)) {
      const key = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(line)?.[1];
      if (key) {
        current = {
          file,
          key,
          budget: null,
          timeout: null,
          delegates: false,
          preparesPlaywright: false,
        };
        found.push(current);
        continue;
      }
      if (!current) continue;
      // A trailing note after the number is allowed and often necessary (which p95, on
      // which path). The number is what is parsed.
      const budget = /^\s*# budget: (\d+)s\b/.exec(line)?.[1];
      if (budget) current.budget = Number(budget);
      const timeout = /^\s*timeout-minutes: (\d+)\s*$/.exec(line)?.[1];
      if (timeout) current.timeout = Number(timeout);
      if (/^\s{4}uses:\s*\.\/\.github\/workflows\//.test(line)) current.delegates = true;
      if (PREPARES_PLAYWRIGHT.test(line)) current.preparesPlaywright = true;
    }
  }
  return found;
}

describe("CI job budgets — a lane cannot grow in silence", () => {
  const all = jobs();
  const owned = all.filter((job) => !job.delegates && !DELEGATING_JOBS.has(`${job.file}:${job.key}`));

  it("finds every workflow job — a parser that finds none would pass everything", () => {
    expect(all.length, "no jobs parsed out of .github/workflows").toBeGreaterThan(15);
    expect(new Set(all.map((job) => job.file)).size, "not every workflow was read").toBeGreaterThan(5);
    expect(owned.length).toBeGreaterThan(14);
  });

  it("gives every job a timeout — GitHub's default is six hours", () => {
    const missing = owned.filter((job) => job.timeout === null).map((job) => `${job.file}:${job.key}`);
    expect(missing, `these jobs have no timeout-minutes:\n${missing.join("\n")}`).toEqual([]);
  });

  it("gives every job a measured budget beside that timeout", () => {
    const missing = owned.filter((job) => job.budget === null).map((job) => `${job.file}:${job.key}`);
    expect(
      missing,
      `these jobs declare no budget:\n${missing.join("\n")}\n` +
        "Add `# budget: <measured p95 in seconds>s` above timeout-minutes. " +
        "Measure it: gh run view <id> --json jobs.",
    ).toEqual([]);
  });

  it("exempts exactly the jobs whose ceiling another contract owns", () => {
    // If this set silently emptied, the exemption below would stop exempting and
    // this file would start contradicting ci-bounded-network.contract.test.ts.
    const exempt = owned.filter((job) => job.preparesPlaywright).map((job) => `${job.file}:${job.key}`);
    expect(exempt.sort()).toEqual([
      "e2e.yml:static-export",
      "e2e.yml:suite",
      "e2e.yml:web-smoke",
    ]);
  });

  it("keeps every timeout between its budget and 1.5x it", () => {
    const offenders: string[] = [];
    for (const job of owned) {
      if (job.budget === null || job.timeout === null) continue;
      if (job.preparesPlaywright) continue;
      const seconds = job.timeout * 60;
      const ceiling = Math.max(Math.round(job.budget * 1.5), GRANULARITY_FLOOR_SECONDS);
      if (seconds > ceiling) {
        offenders.push(
          `${job.file}:${job.key} — timeout ${job.timeout}m (${seconds}s) exceeds 1.5x its ${job.budget}s budget (${ceiling}s)`,
        );
      }
      if (seconds < job.budget) {
        offenders.push(
          `${job.file}:${job.key} — timeout ${job.timeout}m (${seconds}s) is below its own ${job.budget}s budget; it would fail every run`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  /**
   * `main` requires these contexts by exact name; a renamed job would leave a pull request waiting for
   * a check that no longer exists. The names are pinned here, not read from the API, because a test
   * must not need the network. Changing branch protection changes this list in the same pull request.
   */
  const REQUIRED_CONTEXTS = [
    "Types · Lint · Docs",
    "Unit · Contract",
    "MCP",
    "Playwright (static export)",
    "Playwright (web surface)",
    "Playwright (chromium 1/3)",
    "Playwright (chromium 2/3)",
    "Playwright (chromium 3/3)",
  ];

  it("still produces every status context main requires, by exact name", () => {
    const names = readdirSync(WORKFLOWS)
      .filter((name) => name.endsWith(".yml"))
      .flatMap((file) =>
        readFileSync(path.join(WORKFLOWS, file), "utf8")
          .split("\n")
          .map((line) => /^ {4}name: (.+)$/.exec(line)?.[1]?.trim())
          .filter((name): name is string => Boolean(name)),
      );
    expect(names.length, "no job names parsed — this test would be idling").toBeGreaterThan(15);

    /** `Playwright (chromium ${{ matrix.shard }}/3)` produces 1/3, 2/3 and 3/3. */
    const produced = new Set(
      names.flatMap((name) =>
        name.includes("${{ matrix.shard }}")
          ? [1, 2, 3].map((shard) => name.replaceAll("${{ matrix.shard }}", String(shard)))
          : [name],
      ),
    );

    const missing = REQUIRED_CONTEXTS.filter((context) => !produced.has(context));
    expect(
      missing,
      `main requires these contexts and no job produces them any more:\n${missing.join("\n")}\n` +
        "Renaming a required job blocks every merge until branch protection is edited. " +
        "Either keep the name (an aggregating job may carry it) or change both together.",
    ).toEqual([]);
  });

  /**
   * A matrix job skipped by its own `if` reports one check with the expression still in the name. That
   * phantom is tolerated: the draft guard must stay in every job header, and static jobs would
   * triplicate the YAML. `scripts/landing/pr-land.test.mjs` holds the enforcement.
   */
  it("keeps the draft guard in every matrix job header, as the draft-cost decision requires", () => {
    const guard = "github.event.pull_request.draft == false";
    for (const file of ["checks.yml", "e2e.yml"]) {
      const text = readFileSync(path.join(WORKFLOWS, file), "utf8");
      const matrixJobs = text.split(/^ {2}(?=[A-Za-z][\w-]*:\s*$)/m).filter((block) => /^ {4}strategy:/m.test(block));
      expect(matrixJobs.length, `${file}: no matrix job found — this test would be idling`).toBeGreaterThan(0);
      for (const block of matrixJobs) {
        const name = /^([A-Za-z][\w-]*):/.exec(block)?.[1] ?? "?";
        expect(block, `${file}:${name} would run on a draft`).toContain(guard);
      }
    }
  });

  it("cancels superseded runs per ref so a new push does not queue behind the old one", () => {
    for (const file of readdirSync(WORKFLOWS).filter((name) => name.endsWith(".yml"))) {
      const text = readFileSync(path.join(WORKFLOWS, file), "utf8");
      if (!/^on:/m.test(text)) continue;
      // A release is the exception and says so in its own file: cancelling a
      // half-published release is worse than paying for a duplicate run.
      if (file === "release-macos.yml") {
        expect(text, "the release must not cancel in progress").toContain("cancel-in-progress: false");
        continue;
      }
      if (!/pull_request|push:/.test(text)) continue;
      expect(text, `${file} has no concurrency group`).toMatch(/^concurrency:/m);
      expect(text, `${file} does not cancel a superseded run`).toContain("cancel-in-progress: true");
    }
  });
});
