import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

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
 * So **today's count is pinned as the cap** (it cannot rise) and **the cap cannot
 * float above the measurement** (no free headroom). Fixing values and switching the
 * gate on are kept separate.
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
 * Repeating the baseline as a constant in this file would make two copies with
 * `package.json`, and two copies with no gate means drift is the default. So this
 * file holds no number — it **reads** it from the lint script in `package.json`.
 * Moving the cap is a one-line diff, and that line is where the "why" goes.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");

/**
 * **The only contract that actually sweeps the whole repository, so it is slow** —
 * about 26s locally (1,847 files). CI runners are slower, so the budget is
 * generous.
 *
 * The lesson `type-ramp-coverage.contract.test.ts` left behind: *"a gate that fails
 * on time is noise."* If a red light from a spec violation cannot be told apart
 * from a red light from a slow runner, the next person learns to ignore red.
 */
const ESLINT_SWEEP_TIMEOUT_MS = 300_000;

/** Floor on files swept — under a third of the measured 1,847. It measures **field of view**, not debt. */
const MIN_SCANNED_FILES = 500;

const packageJson = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

const lintScript = packageJson.scripts.lint ?? "";
const capMatch = /--max-warnings[= ](-?\d+)/.exec(lintScript);
/** `package.json` is the authority for this number; here it is only read. */
const cap = capMatch ? Number(capMatch[1]) : Number.NaN;

let census: { files: number; warnings: number; errors: number };

/** A probe that produces one real warning — proof the warn severity is alive. */
const WARNING_PROBE = "export function probe() {\n  const unusedByProbe = 1;\n  return 2;\n}\n";
const WARNING_PROBE_PATH = "src/shared/lib/__lint-warning-probe__.ts";

beforeAll(async () => {
  // Sweeps the same set as `pnpm lint` (= `eslint` with no arguments). Counting a
  // different set makes "the cap does not float above the measurement" below turn
  // red on a falsehood.
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const results = await eslint.lintFiles(["."]);
  census = {
    files: results.length,
    warnings: results.reduce((sum, result) => sum + result.warningCount, 0),
    errors: results.reduce((sum, result) => sum + result.errorCount, 0),
  };
}, ESLINT_SWEEP_TIMEOUT_MS);

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

  it("실측이 상한을 넘지 않는다 — 넘었다면 `pnpm lint` 도 이미 빨갛다", () => {
    expect(
      census.warnings,
      `경고가 ${cap} → ${census.warnings} 로 늘었다. 새로 생긴 경고를 고쳐라 — ` +
        `상한을 올리는 것은 래칫을 푸는 것이다.`,
    ).toBeLessThanOrEqual(cap);
  });

  it("상한이 실측보다 위로 뜨지 않는다 — 헐거운 멈춤쇠는 멈춤쇠가 아니다", () => {
    expect(
      census.warnings,
      `경고가 ${cap} → ${census.warnings} 로 줄었다. ` +
        `package.json 의 "lint" 스크립트도 --max-warnings ${census.warnings} 로 내려라.`,
    ).toBeGreaterThanOrEqual(cap);
  });

  it("탐지기가 빈 집합 위에서 놀지 않는다 — 저장소를 실제로 훑었다", () => {
    expect(
      census.files,
      `훑은 파일이 ${census.files}개뿐이다 — eslint 가 저장소를 다 안 보고 있다`,
    ).toBeGreaterThanOrEqual(MIN_SCANNED_FILES);
  });

  it("경고 심각도가 실재한다 — 상한이 셀 것이 있는 계량이다", async () => {
    // This must still pass on the day warnings reach 0, so it measures **whether a
    // warning can be produced**, not how many exist. A probe of 0 means the warn-level
    // rules are switched off entirely, and then even a cap of 0 is not a gate.
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const [result] = await eslint.lintText(WARNING_PROBE, { filePath: WARNING_PROBE_PATH });
    expect(
      result.warningCount,
      "일부러 심은 미사용 변수가 경고로 안 잡힌다 — warn 레벨 룰이 꺼져 있다",
    ).toBeGreaterThan(0);
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
