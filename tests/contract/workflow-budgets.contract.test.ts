import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **Every CI job declares what it costs, and its timeout cannot be a blank cheque.**
 *
 * ## Why this exists
 *
 * Measured 2026-09-12 over the last 20 runs. `Unit · Contract` averaged 437 s and hit
 * 705 s, inside a `timeout-minutes: 20` — so it could have doubled again and the only
 * signal would have been the owner's report that CI "takes far too long every single
 * time". Three other jobs carried no `timeout-minutes` at all (`deploy-pages`'s build
 * and deploy, and the registry publish), which means their ceiling was GitHub's
 * six-hour default.
 *
 * A timeout set far above the real cost is not a safety net, it is a hiding place. So
 * each job states its measured p95 as a `# budget: <n>s` comment beside its
 * `timeout-minutes`, and the timeout must sit between the budget and 1.5x it. A job
 * that grows past its budget fails on the clock **in CI, once**, and the person who
 * made it slower is the one who has to re-measure and say so — rather than the cost
 * arriving quietly in everyone else's afternoon.
 *
 * The 120-second floor is GitHub's granularity, not slack: `timeout-minutes` is whole
 * minutes, so a 30-second job cannot express a 45-second ceiling.
 *
 * ## What this does not do
 *
 * It never compares a *run* against the budget. The budget is a declared property of
 * the workflow file, checked by reading the file — nothing here measures a machine, so
 * this gate cannot go red because a runner was slow (`.claude/rules/testing.md`, "The
 * timing rule"). Only a job's own `timeout-minutes` can do that, and that is the
 * mechanism being bounded.
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
   * **A required context that stops reporting blocks every merge, forever.**
   *
   * `main` requires eight status contexts by exact name. Sharding `Unit · Contract`
   * renamed the job that produced one of them, and nothing in the repository would have
   * said so: the pull request would simply have waited for a check that no longer
   * existed. `pnpm pr:land`'s own falsifier names this — "a landing that merges while a
   * required context reads skipped".
   *
   * The names are pinned here rather than read from the API, because a test must not
   * need the network to say whether the workflows still produce what `main` asks for. If
   * branch protection changes, this list changes with it in the same pull request.
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
   * **Why a check named `Unit · Contract ${{ matrix.shard }}/3` is tolerated.**
   *
   * A matrix job skipped by its own `if` is skipped *before* the matrix expands, so
   * GitHub reports one check with the expression still in the name. Two of those sat
   * in PR #1578's rollup in `SKIPPED` state, and the landing hung — but not because
   * of them. It hung because `pr-land.mjs` resolved a name that reported twice (the
   * draft's `SKIPPED` and the real verdict) by keeping whichever came last, and read
   * a FAILED required context as "never ran". That is fixed at the lander, where the
   * defect was, and `scripts/pr-land.test.mjs` pins it with the recorded rollup —
   * both phantom names included — and asserts the verdict is order-independent.
   *
   * Removing the phantom itself would cost more than it is worth. Moving the gate
   * into the steps makes the matrix expand, and breaks
   * `workflow-security.contract.test.ts`: "skips every job on a draft, so a draft
   * costs no runner minute" requires the guard in every job **header**, which is a
   * standing decision. Writing the three shards out as static jobs instead would
   * triplicate about fifty lines of YAML each, in a repository that keeps
   * `setup-playwright` as one composite action "rather than five drifting copies".
   *
   * So the phantom stays, cannot match a required context name, and no longer
   * confuses the only thing that read it. This test records that trade rather than
   * enforcing it, and names where the enforcement actually lives.
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
