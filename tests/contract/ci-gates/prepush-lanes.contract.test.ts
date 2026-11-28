import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { FULL_LANE_COMMANDS } from "../../../scripts/ci/classify-change.mjs";

/**
 * The pre-push hook is a **fast, path-scoped mirror of CI** — this locks the four
 * properties that make it survivable, because losing any one of them is what
 * killed the previous version.
 *
 * ## The history this encodes
 *
 * The first hook ran `checks:changed --run` over the whole pushed range, serially.
 * On a 1,536-file branch that was **657 checks, 40 minutes for 35 of them** —
 * twelve hours against CI's eight minutes. It was deleted (ledger 94), then
 * restored in Buzz's shape (ledger 95) after finding that `block/buzz` — the
 * project this repository benchmarks against — does ship one, built from
 * glob-filtered parallel lanes with e2e left to CI.
 *
 * The predecessor of this file (`local-ci-parity.contract.test.ts`) had already
 * written the failure mode down: *"one route took over 10 minutes to open. At that
 * point a person switches the hook off. And the moment it is switched off, this
 * hook may as well not exist."* It was right, so what is pinned here is speed
 * structure, not command parity.
 */

const ROOT = process.cwd();
const HOOK_PATH = ".githooks/pre-push";
const hook = readFileSync(path.join(ROOT, HOOK_PATH), "utf8");

/** Executed lines only — the same word inside a comment must not satisfy a check. */
const executable = hook
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

describe("pre-push hook — a fast mirror of CI", () => {
  it("the hook exists and is executable", () => {
    expect(statSync(path.join(ROOT, HOOK_PATH)).mode & 0o111).toBeGreaterThan(0);
  });



  it("lanes run in parallel — if serial this hook becomes 12 hours again", () => {
    // A lane is backgrounded and then joined; both halves have to be present.
    expect(executable, "lanes are not launched in the background").toMatch(/\)\s*&\s*$/m);
    expect(executable, "lanes are not joined — results cannot be seen").toMatch(/^\s*wait\s*$/m);
  });

  it("the scope is a three-dot diff — merging main does not turn on lanes for others' changes", () => {
    expect(executable).toMatch(/\$BASE_REF\.\.\.HEAD/);
    expect(executable, "the base is not origin/main").toMatch(/BASE_REF="origin\/main"/);
  });

  /**
   * e2e is CI's, and its absence is the single biggest reason this hook is fast.
   * CI shards Playwright three ways; here it would be serial, and that is exactly
   * the shape that got the last hook deleted.
   */
  it("e2e is not in the hook — CI runs it in three branches", () => {
    expect(executable, "the hook runs playwright — it becomes slow again at that moment").not.toMatch(
      /playwright/i,
    );
  });

  /**
   * Timing ratios cannot be measured on a machine this hook is deliberately
   * saturating. A `*.perf.test.*` file compares a fast path against a naive one and
   * reads the clock; under parallel lanes (~900% CPU measured) one went red on a
   * push whose diff could not have touched it, and passed on a rerun. CI runs the
   * same files on a quiet runner, where the number means something.
   *
   * The exclusion is scoped to this lane. Removing it re-introduces a flake that
   * looks like a real failure, which is worse than no gate — people learn to retry.
   */
  it("the performance test is taken out of the hook — a ratio measured on a busy machine means nothing", () => {
    const unitLane = executable.split("\n").find((line) => /lane unit /.test(line)) ?? "";
    expect(unitLane, "could not find the unit lane — this test idles").not.toBe("");
    // The planner's emitted command excludes `*.perf.test.*`; `scripts/ci/prepush.test.mjs`
    // proves that on its output, so only the hook's use of the planner is pinned here.
    expect(executable).toContain('node scripts/ci/prepush-unit-plan.mjs');

    // CI must still run them; the exclusion is local-only.
    const ci = readFileSync(path.join(ROOT, ".github/workflows/checks.yml"), "utf8");
    expect(ci, "CI excludes the performance test — then nobody measures it").not.toContain(
      "perf.test",
    );
  });

  /**
   * No lane may buy quiet with the clock: a worker cap or stretched per-test timeout in this hook
   * marks a test that reads the clock, and the fix belongs in that test (`.claude/rules/testing.md`).
   */
  it("correctness lanes do not buy quiet with a clock — no worker cap and no raised timeout", () => {
    const laneLine = (name: string) =>
      executable.split("\n").find((line) => new RegExp(`lane ${name} `).test(line)) ?? "";

    for (const name of ["unit"]) {
      const lane = laneLine(name);
      expect(lane, `could not find the ${name} lane — this test idles`).not.toBe("");
      expect(lane, "a worker cap is a value that hides clock-dependent tests — fix those tests").not.toContain(
        "--maxWorkers",
      );
      expect(lane, "a raised per-test timeout is the same screen").not.toContain("--testTimeout");
    }

    // The unit lane is selected by Vitest's module graph from the same three-dot
    // base the lane filters use. Running all 759 files to judge a leaf change is
    // what made this hook 367 s for a one-file diff.
    // `--changed=<merge base>` in the emitted command is proved by `scripts/ci/prepush.test.mjs`.
    const planner = readFileSync(path.join(ROOT, 'scripts/ci/prepush-unit-plan.mjs'), 'utf8');
    expect(planner).not.toMatch(/--maxWorkers|--testTimeout/);
    expect(executable, "the unit lane's base is not the three-dot merge base").toMatch(
      /merge-base "\$BASE_REF" HEAD/,
    );

    // CI stays authoritative and keeps its normal pool and timeout on a quiet runner.
    const ci = readFileSync(path.join(ROOT, ".github/workflows/checks.yml"), "utf8");
    expect(ci).not.toContain("--testTimeout");
    expect(ci).not.toContain("--maxWorkers");
  });

  /**
   * The repo-wide ESLint pass is CI's: the hook lints only changed files, which
   * is safe only while CI's exhaustive gates still run the whole tree.
   */
  it("whole-repository lint stays in CI's exhaustive gates", () => {
    expect(FULL_LANE_COMMANDS.gates).toContain("pnpm lint");
  });

  /**
   * The budget is reported, never enforced: refusing a green push because the machine was busy is
   * forbidden by `.claude/rules/testing.md`, so the budget line must not change the push's fate.
   */
  it("the budget only reports — it does not block a push by budget", () => {
    expect(executable, "no line compares against the budget").toMatch(/\$total.*-gt.*\$BUDGET_SECONDS/);

    // The budget comparison must not reach an exit. Only the lane verdicts may.
    const budgetBlock = executable.slice(executable.indexOf("BUDGET_SECONDS"));
    const budgetCompare = budgetBlock.slice(budgetBlock.indexOf('"$total" -gt'));
    const guard = budgetCompare.slice(0, budgetCompare.indexOf("\nfi"));
    expect(guard, "exceeding the budget blocks the push — the clock was used as a gate").not.toMatch(/exit\s+1/);
  });

  /**
   * Every command a lane runs must exist as a script (or a real file). A typo here
   * fails at push time on someone else's machine, which is the worst place to find
   * it.
   */
  it("every pnpm script the lanes call exists", () => {
    const scripts = Object.keys(
      (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
        scripts?: Record<string, string>;
      }).scripts ?? {},
    );
    // The class must span the whole token, uppercase included, or a narrower class truncates a typo
    // like `docs:surface:checkX` back into a valid name.
    const named = [...executable.matchAll(/pnpm\s+([A-Za-z][A-Za-z0-9:_-]*)/g)]
      .map((m) => m[1])
      .filter((name) => name !== "exec");
    expect(named.length, "could not find a single pnpm script in the lanes — this test idles").toBeGreaterThan(3);
    expect(named.filter((n) => !scripts.includes(n))).toEqual([]);
  });

  /**
   * The lane picker is shell `grep -E` against the changed-file list. These cases
   * run the hook's own patterns so a mis-anchored regex is caught here rather than
   * by a lane silently never firing.
   */
  it("path globs turn on only what is intended", () => {
    const patterns = {
      ts: /\.tsx?$|\.mjs$|tsconfig.*\.json$|next\.config\.ts$/,
      app: /^src\/|^app\//,
      docs: /^docs\/|^[A-Z0-9_-]+\.md$|^\.claude\/|^\.agents\//,
      mcpCli: /^mcp\/|^cli\//,
      messages: /^messages\/|^scripts\/i18n\/validate-messages/,
    };
    /*
     * Each pattern must appear in the hook — otherwise this test measures its own
     * copy rather than the hook's behaviour. JS regex literals escape `/`, shell
     * `grep -E` does not, so compare with those escapes removed.
     */
    for (const source of Object.values(patterns)) {
      const asShell = source.source.replace(/\\\//g, "/");
      expect(executable, `testing a glob that is not in the hook: ${asShell}`).toContain(asShell);
    }

    expect(patterns.app.test("src/views/home/ui/HomePage.tsx")).toBe(true);
    expect(patterns.app.test("docs/GLOSSARY.md")).toBe(false);
    expect(patterns.docs.test("docs/GLOSSARY.md")).toBe(true);
    expect(patterns.docs.test("AGENTS.md")).toBe(true);
    // A vault node is data, not documentation — but it does live under docs/, so
    // the docs lane covering it is correct and cheap.
    expect(patterns.docs.test("docs/ontology/ontology-atlas.md")).toBe(true);
    expect(patterns.docs.test("src/shared/ui/toast/toast.tsx")).toBe(false);
    expect(patterns.mcpCli.test("mcp/src/index.js")).toBe(true);
    expect(patterns.mcpCli.test("src/mcp-thing.ts")).toBe(false);
    expect(patterns.messages.test("messages/ko.json")).toBe(true);
    expect(patterns.ts.test("vite.config.ts")).toBe(true);
    expect(patterns.ts.test("README.md")).toBe(false);
  });

  /**
   * The hook is a shell script and a syntax error in it blocks every push in the
   * repository. `sh -n` parses without executing.
   */
  it("the shell syntax is valid — if this breaks nobody can push", () => {
    expect(() =>
      execFileSync("sh", ["-n", path.join(ROOT, HOOK_PATH)], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
