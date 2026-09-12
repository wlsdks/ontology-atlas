import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { FULL_LANE_COMMANDS } from "../../scripts/classify-change.mjs";

/**
 * Lint warning ratchet — **the warning count can never rise, and when it falls the cap falls with it.**
 *
 * ════════════════════════════════════════════════════════════════════
 * ## Why this file exists — the repository was breaking its own discipline
 * ════════════════════════════════════════════════════════════════════
 *
 * `.claude/skills/design-system-audit/SKILL.md`'s 「Level blind spot」 (the severity
 * blind spot) section already pinned it:
 *
 * > *"Catching things at `warn` with no warning cap (`--max-warnings`) **fails
 * > nothing, so it is not a gate**."*
 *
 * Yet `package.json`'s own `"lint": "eslint"` had no such cap. Measured 2026-08-06:
 * **91 warnings** (0 errors) were passing CI green, and a 92nd would have changed
 * nothing. The audit document was carrying the very defect it described to others.
 *
 * ### Why a ratchet rather than clearing them all
 *
 * Composition of the 91 (measured 2026-08-06):
 *
 * | Rule | Count |
 * |---|---:|
 * | `react-hooks/refs` | 41 |
 * | `@typescript-eslint/no-unused-vars` | 25 |
 * | `react-hooks/set-state-in-effect` | 12 |
 * | `react-hooks/exhaustive-deps` | 8 |
 * | unused `eslint-disable` directives (no ruleId) | 3 |
 * | `@typescript-eslint/no-unused-expressions` | 1 |
 * | `react-hooks/immutability` | 1 |
 *
 * The largest group, 41 `react-hooks/refs`, is **ref access during render**,
 * concentrated in per-frame code such as the map loop (`use-topology-loop.ts`).
 * Touching it can change behaviour, and that belongs to rendering work rather than
 * a lint PR. The same judgement this repository made about ramp coverage
 * (`.claude/rules/design-gates.md`: *"the 125 were not cleared in the same PR
 * because of their nature, not their number"*).
 *
 * So the repository-wide command has a zero-warning cap. The command itself owns the
 * exhaustive scan; this contract proves the cap, live warning/error behavior, and CI
 * wiring without paying for the same scan a second time inside the full Vitest lane.
 *
 * ### This ratchet **still passes on the day warnings reach 0**
 *
 * The trap this repository stepped on five times in one day on 2026-08-06 is the
 * "the denominator must be at least N" kind of floor — debt falls, the gate turns
 * red, and the next person **reverts the spec instead of the gate**. The floors
 * measured here are **the scanner's field of view, not debt** (files swept, whether
 * the warning severity exists at all). When warnings reach 0 the cap simply moves to
 * `--max-warnings 0`, and all four assertions stay green.
 *
 * ### The number is written in **one place only**
 *
 * Repeating the cap as a constant in this file would make two copies with
 * `package.json`, and two copies with no gate means drift is the default. So this
 * file holds no number — it **reads** it from the lint script in `package.json`.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");

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

describe("lint 경고 래칫 — 상한이 실제로 물려 있는가", () => {
  it("`pnpm lint` 가 경고 상한을 지고 있다 — 없으면 warn 룰은 게이트가 아니다", () => {
    expect(
      capMatch,
      `package.json 의 "lint" 스크립트에 --max-warnings 가 없다 (지금: ${lintScript}).\n` +
        `경고로만 잡는 룰은 상한이 없으면 아무것도 실패시키지 않는다.`,
    ).not.toBeNull();
    // In ESLint `-1` means unlimited — a cap that pretends to exist is worse than none.
    expect(Number.isInteger(cap) && cap >= 0, `--max-warnings ${cap} 은 상한이 아니다`).toBe(true);
  });

  it("`pnpm lint` 는 경고 하나도 허용하지 않는다", () => {
    expect(cap, `경고 상한은 0 이어야 한다 (지금: ${cap})`).toBe(0);
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

describe("CI 가 이 상한을 지나간다 — 안 물린 게이트는 주석이다", () => {
  const workflowDir = path.join(REPO_ROOT, ".github/workflows");
  const workflows = readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => ({ name, source: readFileSync(path.join(workflowDir, name), "utf8") }));

  it("checks.yml invokes the exhaustive registry that contains `pnpm lint`", () => {
    const checks = workflows.find((workflow) => workflow.name === "checks.yml");
    expect(checks, ".github/workflows/checks.yml 이 없다").toBeDefined();
    expect(FULL_LANE_COMMANDS.gates).toContain("pnpm lint");
    expect(
      checks!.source.includes("node scripts/run-ci-lane.mjs --lane=gates"),
      "checks.yml does not invoke the lane containing the lint warning cap",
    ).toBe(true);
  });

  it("어느 워크플로도 상한을 우회해 eslint 를 직접 부르지 않는다", () => {
    // Invoking via `pnpm exec eslint` / `npx eslint` drops package.json's cap.
    const bypasses = workflows.flatMap((workflow) =>
      workflow.source
        .split("\n")
        .filter((line) => /\beslint\b/.test(line) && !/--max-warnings/.test(line))
        .map((line) => `${workflow.name}: ${line.trim()}`),
    );
    expect(
      bypasses,
      `상한 없이 eslint 를 직접 부르는 줄이 있다:\n${bypasses.join("\n")}`,
    ).toEqual([]);
  });
});
