import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * lint 경고 래칫 — **경고 수는 늘 수 없고, 줄면 상한도 같이 내려간다.**
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 왜 이 파일이 있나 — 이 저장소가 자기 규율을 자기가 안 지키고 있었다
 * ════════════════════════════════════════════════════════════════════
 *
 * `.claude/skills/design-system-audit/SKILL.md` 의 「레벨 사각지대」가 이미
 * 못박아 뒀다:
 *
 * > *"경고(`warn`)로만 잡는데 경고 상한(`--max-warnings`)이 없으면 **아무것도
 * > 실패시키지 않으니 게이트가 아니다**."*
 *
 * 그런데 정작 `package.json` 의 `"lint": "eslint"` 에 그 상한이 없었다. 2026-08-06
 * 실측으로 **경고 91건**(0 error)이 CI 를 초록으로 통과하고 있었고, 92번째가
 * 들어와도 아무 일도 일어나지 않았다. 감사 문서가 남을 향해 적어 둔 결함을
 * 자기가 지고 있었던 것이다.
 *
 * ### 왜 「전부 없애기」가 아니라 래칫인가
 *
 * 91건의 성분(2026-08-06 실측):
 *
 * | 룰 | 수 |
 * |---|---:|
 * | `react-hooks/refs` | 41 |
 * | `@typescript-eslint/no-unused-vars` | 25 |
 * | `react-hooks/set-state-in-effect` | 12 |
 * | `react-hooks/exhaustive-deps` | 8 |
 * | 안 쓰이는 `eslint-disable` 지시문(ruleId 없음) | 3 |
 * | `@typescript-eslint/no-unused-expressions` | 1 |
 * | `react-hooks/immutability` | 1 |
 *
 * 최다인 `react-hooks/refs` 41건은 **렌더 중 ref 접근**이고, 지도 루프
 * (`use-topology-loop.ts`)처럼 프레임마다 도는 코드에 몰려 있다. 손대면 동작이
 * 바뀔 수 있고 — 그건 lint PR 이 아니라 렌더링 작업의 몫이다. 이 저장소가
 * 램프 커버리지에서 내린 것과 같은 판단이다(`.claude/rules/design-gates.md`
 * *"125건을 같은 PR 에서 안 치운 이유는 양이 아니라 성격이다"*).
 *
 * 그래서 **오늘 수를 상한으로 박고**(위로 못 가게) **상한이 실측 위로 뜨지
 * 못하게**(공짜 여유 없이) 한다. 값을 고치는 것과 게이트를 켜는 것을 갈랐다.
 *
 * ### 이 래칫은 **경고가 0이 되는 날에도 통과한다**
 *
 * 이 저장소가 2026-08-06 하루에만 다섯 번 밟은 함정이 「분모가 N 이상이어야
 * 한다」류의 하한이다 — 부채가 줄었는데 게이트가 빨개지고, 그러면 다음 사람은
 * **게이트 대신 규격 쪽을 되돌린다**. 여기서 재는 하한은 **부채가 아니라
 * 스캐너의 시야**(훑은 파일 수 · 경고 심각도가 실재하는가)다. 경고가 0이 되면
 * `--max-warnings 0` 으로 내리면 되고, 그때 네 단언 모두 초록이다.
 *
 * ### 수는 **한 곳에만** 적는다
 *
 * 기준선을 이 파일에 상수로 또 적으면 `package.json` 과 두 벌이 되고, 두 벌인데
 * 게이트가 없으면 어긋나는 쪽이 기본값이다. 그래서 이 파일은 수를 갖지 않는다 —
 * `package.json` 의 lint 스크립트에서 **읽어 온다**. 상한을 옮기는 diff 는
 * 한 줄이고, 그 한 줄이 「왜 움직였나」를 적을 자리다.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");

/**
 * **저장소 전체를 실제로 훑는 유일한 계약이라 느리다** — 로컬 실측 약 26초
 * (1,847 파일). CI 러너는 더 느리므로 넉넉히 잡는다.
 *
 * `type-ramp-coverage.contract.test.ts` 가 남긴 교훈 그대로다: *"시간으로
 * 실패하는 게이트는 소음이다."* 규격을 어겨서 빨개진 것과 러너가 느려서
 * 빨개진 것을 구별할 수 없으면 다음 사람은 빨간불을 무시하는 법을 배운다.
 */
const ESLINT_SWEEP_TIMEOUT_MS = 300_000;

/** 훑은 파일 수의 바닥 — 실측 1,847 의 1/3 도 안 된다. 부채가 아니라 **시야**를 잰다. */
const MIN_SCANNED_FILES = 500;

const packageJson = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

const lintScript = packageJson.scripts.lint ?? "";
const capMatch = /--max-warnings[= ](-?\d+)/.exec(lintScript);
/** `package.json` 이 이 수의 정본이다. 여기서 읽기만 한다. */
const cap = capMatch ? Number(capMatch[1]) : Number.NaN;

let census: { files: number; warnings: number; errors: number };

/** 실제로 걸린 경고 한 건을 만들어 내는 프로브 — 경고 심각도가 살아 있음을 증명한다. */
const WARNING_PROBE = "export function probe() {\n  const unusedByProbe = 1;\n  return 2;\n}\n";
const WARNING_PROBE_PATH = "src/shared/lib/__lint-warning-probe__.ts";

beforeAll(async () => {
  // `pnpm lint`(= 인자 없는 `eslint`)와 같은 집합을 훑는다. 다른 집합을 세면
  // 아래 「상한이 실측 위로 뜨지 않는다」가 거짓으로 빨개진다.
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
    // `-1` 은 ESLint 에서 「무제한」이다 — 있는 척하는 상한이 없는 것보다 나쁘다.
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
    // 경고가 0이 되는 날에도 통과해야 하므로, 실측 경고 수가 아니라
    // **경고를 만들어 낼 수 있는가**를 잰다. 이 프로브가 0이면 warn 레벨 룰이
    // 통째로 꺼진 것이고, 그러면 상한 0도 게이트가 아니다.
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

  it("checks.yml 이 `pnpm lint` 를 스텝으로 돌린다", () => {
    const checks = workflows.find((workflow) => workflow.name === "checks.yml");
    expect(checks, ".github/workflows/checks.yml 이 없다").toBeDefined();
    expect(
      /^\s*run:\s*pnpm lint\s*$/m.test(checks!.source),
      "checks.yml 에 `run: pnpm lint` 스텝이 없다 — 상한이 CI 경로를 안 지난다",
    ).toBe(true);
  });

  it("어느 워크플로도 상한을 우회해 eslint 를 직접 부르지 않는다", () => {
    // `pnpm exec eslint` / `npx eslint` 로 부르면 package.json 의 상한이 빠진다.
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
