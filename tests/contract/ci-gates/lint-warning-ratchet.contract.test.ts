import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { FULL_LANE_COMMANDS } from "../../../scripts/ci/classify-change.mjs";

/**
 * Lint warning ratchet — **the warning count can never rise, and when it falls the cap falls with it.**
 *
 * The repository-wide lint command has a zero-warning cap: catching things at `warn` with no
 * `--max-warnings` fails nothing, so it is not a gate (`.claude/skills/ui-proof/SKILL.md`, severity
 * blind spot). The command owns the exhaustive scan; this contract proves the cap, live
 * warning/error behavior and CI wiring without paying for the same scan again in the Vitest lane.
 *
 * The floors measured here are the scanner's field of view (files swept, whether the warning
 * severity exists), not debt, so the ratchet still passes on the day warnings reach 0: the cap
 * just moves to `--max-warnings 0`.
 *
 * The number is written in one place only: this file reads it from the lint script in
 * `package.json`, since a second copy with no gate would drift.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");

const packageJson = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

const lintScript = packageJson.scripts.lint ?? "";
const capMatch = /--max-warnings[= ](-?\d+)/.exec(lintScript);
/** `package.json` is the authority for this number; here it is only read. */
const cap = capMatch ? Number(capMatch[1]) : Number.NaN;

/** A probe that produces one real warning — proof the warn severity is alive. */
const WARNING_PROBE = "export function probe() {\n  const unusedByProbe = 1;\n  return 2;\n}\n";
/** A parser failure proves the same configured engine still reports blocking errors. */
const ERROR_PROBE = "export const broken = ;\n";

describe("lint warning ratchet — is the cap really enforced", () => {
  it("`pnpm lint` carries a warning cap — without it a warn rule is not a gate", () => {
    expect(
      capMatch,
      `The "lint" script in package.json has no --max-warnings (now: ${lintScript}).\n` +
        `Without a ceiling, a rule that only warns fails nothing.`,
    ).not.toBeNull();
    // In ESLint `-1` means unlimited — a cap that pretends to exist is worse than none.
    expect(Number.isInteger(cap) && cap >= 0, `--max-warnings ${cap} is not a cap`).toBe(true);
  });

  it("`pnpm lint` allows not a single warning", () => {
    expect(cap, `the warning cap must be 0 (now: ${cap})`).toBe(0);
  });

  it.each([
    ['warning', WARNING_PROBE, 1, 0, true],
    ['error', ERROR_PROBE, 1, 1, false],
    ['valid', 'export const probe = 1;\n', 0, 0, false],
  ] as const)('the actual lint command handles %s input', (_kind, input, status, errors, warns) => {
    const result = spawnSync('pnpm --silent lint --stdin --stdin-filename src/shared/lib/__lint-probe__.ts --format json', {
      cwd: REPO_ROOT, shell: true, input, encoding: 'utf8',
    });
    expect(result.status, result.stderr || result.stdout).toBe(status);
    const [diagnostic] = JSON.parse(result.stdout) as { errorCount: number; warningCount: number }[];
    expect(diagnostic.errorCount).toBe(errors);
    expect(diagnostic.warningCount > 0).toBe(warns);
  });

});

describe("CI passes through this cap — an unenforced gate is a comment", () => {
  const workflowDir = path.join(REPO_ROOT, ".github/workflows");
  const workflows = readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => ({ name, source: readFileSync(path.join(workflowDir, name), "utf8") }));

  it("checks.yml invokes the exhaustive registry that contains `pnpm lint`", () => {
    const checks = workflows.find((workflow) => workflow.name === "checks.yml");
    expect(checks, ".github/workflows/checks.yml is missing").toBeDefined();
    expect(FULL_LANE_COMMANDS.gates).toContain("pnpm lint");
    expect(
      checks!.source.includes("node scripts/ci/run-ci-lane.mjs --lane=gates"),
      "checks.yml does not invoke the lane containing the lint warning cap",
    ).toBe(true);
  });

  it("no workflow bypasses the cap to call eslint directly", () => {
    // Invoking via `pnpm exec eslint` / `npx eslint` drops package.json's cap.
    const bypasses = workflows.flatMap((workflow) =>
      workflow.source
        .split("\n")
        .filter((line) => /\beslint\b/.test(line) && !/--max-warnings/.test(line))
        .map((line) => `${workflow.name}: ${line.trim()}`),
    );
    expect(
      bypasses,
      `there is a line that calls eslint directly without a cap:\n${bypasses.join("\n")}`,
    ).toEqual([]);
  });
});
