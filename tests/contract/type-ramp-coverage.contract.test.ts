import { existsSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// 글로브 목록을 여기에 복제하지 않고 **원본을 읽는다** — 복제본은 조용히 드리프트
// 하고, 그러면 이 테스트가 지키려는 사각지대를 스스로 만든다.
import {
  arbitrarySizeSelectors,
  rampCoveredGlobs,
  rampDebtExemptions,
} from "../../eslint.config.mjs";

/**
 * 타입/반경/행간/모션/그림자 램프 규격의 **커버리지**를 고정하는 계약.
 *
 * ## 왜 이 파일이 다시 쓰였나 (2026-08-04)
 *
 * 종전 이 테스트는 「lint 가 **안 보는** 디렉터리의 부채가 자라지 않는지」를
 * 정규식으로 세는 래칫이었다. 그 설계에는 전제가 하나 있었다 — 커버리지가
 * **허용목록**(`codexMigratedGlobs`)이라는 것. 허용목록의 실패 모드는 하나뿐이고
 * 그게 하필 제품이 가장 자주 하는 일이었다:
 *
 * > **새로 만든 디렉터리는 어느 목록에도 없다.**
 *
 * 2026-08-04 실사용 시험 실측 — 새 `src/views/<name>/ui/*.tsx` 한 줄에
 * `text-[13px] rounded-[5px] leading-[1.9] duration-300` 네 위반을 심고
 * `pnpm exec eslint` 를 돌리니 **0 errors, 0 warnings**. 그 경로가 받는
 * `no-restricted-syntax` 셀렉터는 **7개**(scale/gradient 5 + accent 틴트 2)뿐
 * 이었고 램프 셀렉터는 **0개**였다. 소유자 목표가 *"명령만 하면 디자인 시스템
 * 기반으로 화면이 나온다"* 인데 **새 화면이야말로 규격이 하나도 강제되지 않는
 * 자리**였다.
 *
 * 그래서 `eslint.config.mjs` 를 **거부목록**으로 뒤집었고, 이 파일의 일도
 * 바뀌었다. 이제 막는 것은 「위반」이 아니라 **「커버리지가 다시 좁아지는 것」**
 * 이다 — `audited-route-coverage.contract.test.ts` 가 라우트에 대해 하는 일과
 * 같은 모양이다.
 *
 * ## 무엇을 재나
 *
 * 1. 커버 글롭이 여전히 **거부목록 모양**인가 (`src/**` + `app/**` 전부).
 * 2. **아직 존재하지 않는 경로**가 램프 셀렉터를 전부 받는가 — ESLint 의
 *    `calculateConfigForFile` 로 직접 묻는다. 실제 파일이 필요 없으므로
 *    "다음에 누가 만들 디렉터리"를 오늘 잴 수 있다.
 * 3. 탐지기가 공회전하지 않는가 — 시험이 심었던 그 네 줄이 실제로 **빨개지는지**,
 *    정상 램프 값은 **통과하는지**.
 * 4. 예외가 **파일 단위**인가 (디렉터리 예외는 그 안의 새 파일까지 데려간다).
 * 5. 예외 파일의 부채가 장부를 넘지 않는가 — 래칫은 내려가기만 한다.
 *
 * ⚠️ 위반 판정을 정규식으로 **복제하지 않는다.** 종전 이 파일은 ESLint 셀렉터를
 * 손으로 옮긴 정규식 목록을 갖고 있었고, 주석은 "같은 판정" 이라 적어 놨는데
 * 실제로는 12 패밀리 중 7종만 복제돼 있었다(2026-07-28 실측). 복제본은 반드시
 * 갈라진다. 그래서 여기서는 **ESLint 자신을 돌린다**.
 */

/**
 * 예외 파일의 부채 장부 — **2026-08-05 에 비었다.**
 *
 * 마지막까지 남아 있던 7개 파일 93건(text 68 · radius 25)을 램프로 옮기면서
 * 목록이 0이 됐다. 그때까지의 기록을 여기 남겨 둔다 — 되돌아갈 때 무엇이
 * 얼마였는지 알아야 하기 때문이다:
 *
 *   ProjectCard 16 · ProjectMetaGrid 2 · LiveActivityIndicator 23 ·
 *   FirstRunPage 14 · StudioCompass 24 · ProjectEditorPage 2 · RootEntryPage 5
 *
 * ⚠️ 이 배열이 비었다고 아래 검사들이 **공짜 초록**이 되면 안 된다. 그래서
 * 비었을 때는 판정을 **뒤집는다** — 「예외가 진짜 예외인가」 대신 「예전에
 * 예외였던 파일이 이제 정말로 램프 셀렉터를 받는가」 를 잰다.
 */
const EXEMPT_DEBT: ReadonlyArray<readonly [string, number]> = [];

/**
 * 한때 예외였던 파일들. 목록이 빈 지금, 이 경로들이 **실제로 램프 셀렉터를
 * 받는지** 확인하는 데 쓴다 — 예외를 지웠는데 다른 이유로 여전히 안 걸리면
 * 목록만 깨끗하고 규격은 그대로 없는 것이다.
 */
const FORMERLY_EXEMPT = [
  "src/entities/project/ui/ProjectCard.tsx",
  "src/features/vault-ontology/ui/LiveActivityIndicator.tsx",
  "src/views/root-entry/ui/RootEntryPage.tsx",
] as const;

/**
 * **아직 없는 경로**들. FSD 다섯 층 + 라우팅 루트를 하나씩 짚는다 — 다음 사람이
 * 새 표면을 어디에 놓든 첫날부터 덮여야 한다.
 */
const FUTURE_PATHS = [
  "src/views/brand-new-surface/ui/BrandNewPage.tsx",
  "src/widgets/brand-new-widget/ui/BrandNewWidget.tsx",
  "src/features/brand-new-feature/ui/BrandNewControl.tsx",
  "src/entities/brand-new-entity/ui/BrandNewCard.tsx",
  "src/shared/ui/brand-new-primitive.tsx",
  "src/shared/lib/brand-new-helper.ts",
  "src/app/brand-new-provider.tsx",
  "app/[locale]/brand-new/page.tsx",
];

/** 실사용 시험이 심었던 그 한 줄. 네 패밀리가 한 번에 걸린다. */
const FIELD_TRIAL_VIOLATION =
  'export const Probe = () => <div className="text-[13px] rounded-[5px] leading-[1.9] duration-300" />;\n';

/** 같은 자리의 정상형 — 램프 유틸리티만 쓴다. 여기서 빨개지면 오탐이다. */
const RAMP_CLEAN =
  'export const Probe = () => <div className="text-body rounded-card leading-body" />;\n';

const PROBE_PATH = "src/views/brand-new-surface/ui/BrandNewPage.tsx";
const REPO_ROOT = path.resolve(__dirname, "../..");
const exemptions = rampDebtExemptions as string[];
const rampSelectors = (arbitrarySizeSelectors as { selector: string }[]).map(
  (rule) => rule.selector,
);

/**
 * **ESLint 를 실제로 돌리는 케이스의 명시 타임아웃** (2026-08-05).
 *
 * 이 파일은 저장소 전체에서 **유일하게 진짜 ESLint 를 파일에 돌리는 계약**이라
 * 본질적으로 느리고 실행 시간의 분산이 크다. vitest 기본 5,000ms 에 딱 걸쳐
 * 있었고 — 로컬 **902ms**, CI 러너 **5,503ms** (약 6배) — 문서만 바꾼 PR 이
 * 타임아웃으로 빨개졌다.
 *
 * **시간으로 실패하는 게이트는 소음이다.** 규격을 어겨서 빨개진 것과 러너가
 * 느려서 빨개진 것을 구별할 수 없으면, 다음 사람은 빨간불을 무시하는 법을
 * 배운다 — 이 저장소가 「룰을 켜기 전 반드시 측정한다」에서 경계한 바로 그
 * 부패다. 30초는 실측(902ms)의 33배이고, 진짜 무한 루프는 여전히 잡힌다.
 */
const ESLINT_CASE_TIMEOUT_MS = 30_000;

/** 저장소의 진짜 `eslint.config.mjs` 를 그대로 쓴다. */
const eslint = new ESLint({ cwd: REPO_ROOT });

/**
 * 예외 파일에 램프 룰을 **강제로 되켠** 인스턴스. `overrideConfig` 는 설정 파일
 * 뒤에 붙으므로 예외의 `ignores` 를 이긴다 — 부채를 재려면 규칙이 켜져 있어야
 * 한다.
 */
const eslintForcingRamp = new ESLint({
  cwd: REPO_ROOT,
  overrideConfig: [
    {
      files: [...exemptions],
      rules: { "no-restricted-syntax": ["error", ...(arbitrarySizeSelectors as object[])] },
    },
  ],
});

function selectorsFor(config: { rules?: Record<string, unknown> }): string[] {
  const entry = config.rules?.["no-restricted-syntax"];
  if (!Array.isArray(entry)) return [];
  return entry
    .slice(1)
    .map((option) => (option as { selector?: string }).selector)
    .filter((selector): selector is string => typeof selector === "string");
}

async function measureExemptDebt(): Promise<Map<string, number>> {
  const results = await eslintForcingRamp.lintFiles([...exemptions]);
  return new Map(
    results.map((result) => [
      path.relative(REPO_ROOT, result.filePath),
      result.messages.filter((message) => message.ruleId === "no-restricted-syntax").length,
    ]),
  );
}

describe("램프 lint 커버리지 — 새 표면이 첫날부터 덮이는가", () => {
  it("커버리지는 거부목록이다 — 허용목록으로 되돌아가지 않았다", () => {
    // 이 단언이 이 파일의 심장이다. 여기 디렉터리 목록이 등장하는 순간
    // 「새로 만든 디렉터리는 어디에도 없다」는 그 구멍이 그대로 돌아온다.
    expect(rampCoveredGlobs).toEqual(["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"]);
  });

  it("탐지기가 빈 집합 위에서 놀지 않는다 — 램프 셀렉터가 실재한다", () => {
    // 셀렉터 배열이 비면 아래 전칭 단언이 전부 공짜로 초록이 된다.
    expect(rampSelectors.length).toBeGreaterThanOrEqual(20);
    expect(rampSelectors.some((selector) => selector.includes("text-\\[[0-9.]+px"))).toBe(true);
  });

  it("아직 없는 경로도 램프 셀렉터를 전부 받는다", async () => {
    const uncovered: string[] = [];
    for (const futurePath of FUTURE_PATHS) {
      const config = await eslint.calculateConfigForFile(futurePath);
      const applied = new Set(selectorsFor(config));
      const missing = rampSelectors.filter((selector) => !applied.has(selector));
      if (missing.length > 0) uncovered.push(`  ${futurePath}: 셀렉터 ${missing.length}개 누락`);
    }

    expect(
      uncovered,
      `아직 만들지 않은 경로가 램프 룰 밖에 있다. 이건 정확히 2026-08-04 실사용\n` +
        `시험이 잡은 결함이다 — 새 화면이 규격을 하나도 안 받는 자리였다.\n` +
        `eslint.config.mjs 의 rampCoveredGlobs 를 좁히지 마라.\n` +
        uncovered.join("\n"),
    ).toEqual([]);
  }, ESLINT_CASE_TIMEOUT_MS);

  it("프로브 — 새 디렉터리에 위반 넷을 심으면 빨개진다", async () => {
    const [result] = await eslint.lintText(FIELD_TRIAL_VIOLATION, { filePath: PROBE_PATH });
    const ramp = result.messages.filter((message) => message.ruleId === "no-restricted-syntax");
    // text-[13px] · rounded-[5px] · leading-[1.9] · duration-300 — 넷.
    expect(
      ramp.length,
      `새 디렉터리에 심은 램프 위반이 안 잡혔다. 게이트가 항상 통과하기만 하면\n` +
        `게이트가 없는 것과 구별되지 않는다.`,
    ).toBe(4);
    expect(result.errorCount).toBeGreaterThanOrEqual(4);
  }, ESLINT_CASE_TIMEOUT_MS);

  it("프로브 — 같은 자리의 정상 램프 값은 통과한다", async () => {
    const [result] = await eslint.lintText(RAMP_CLEAN, { filePath: PROBE_PATH });
    const ramp = result.messages.filter((message) => message.ruleId === "no-restricted-syntax");
    expect(
      ramp.map((message) => message.message),
      "정상 램프 유틸리티가 위반으로 잡힌다 — 오탐은 소음이고 소음은 신호를 덮는다.",
    ).toEqual([]);
  }, ESLINT_CASE_TIMEOUT_MS);
});

describe("램프 부채 예외 장부", () => {
  it("예외는 파일 단위다 — 디렉터리 글롭이 아니다", () => {
    // 디렉터리로 빼면 그 안에 **새로 만드는 파일**까지 같이 빠진다. 그게
    // 허용목록 시절의 구멍이고, 여기서 다시 열리면 안 된다.
    const globby = exemptions.filter((entry) => /[*?[\]]/.test(entry));
    expect(
      globby,
      `예외에 글롭이 들어왔다. 부채를 진 **파일**을 하나씩 적어라 — 그래야\n` +
        `그 옆에 새로 만드는 파일이 첫날부터 덮인다.\n${globby.join("\n")}`,
    ).toEqual([]);
  });

  it("예외 경로가 전부 실재한다 — 유령 예외는 유령 예산이다", () => {
    const missing = exemptions.filter((entry) => !existsSync(path.join(REPO_ROOT, entry)));
    expect(missing, `없는 파일의 예외가 남아 있다: ${missing.join(", ")}`).toEqual([]);
  });

  it("장부와 예외 목록이 같은 집합이다", () => {
    expect([...exemptions].sort()).toEqual(EXEMPT_DEBT.map(([file]) => file).sort());
  });

  it("예외 목록이 비었으면 «예전에 예외였던 파일» 이 램프 셀렉터를 전부 받는다", async () => {
    // 예외가 있을 때는 «이름만 예외가 아닌가» 를 물었다. 목록이 빈 지금은
    // 반대를 묻는다 — 예외를 지웠는데 다른 이유(글롭 오타·블록 순서)로 여전히
    // 안 걸리면, 목록만 깨끗하고 규격은 그대로 없는 것이다.
    if (exemptions.length > 0) {
      const config = await eslint.calculateConfigForFile(exemptions[0]);
      const applied = new Set(selectorsFor(config));
      expect(rampSelectors.some((selector) => applied.has(selector))).toBe(false);
      expect(applied.has('MemberExpression[property.name="shadowBlur"]')).toBe(true);
      return;
    }
    for (const file of FORMERLY_EXEMPT) {
      const applied = new Set(selectorsFor(await eslint.calculateConfigForFile(file)));
      const missing = rampSelectors.filter((selector) => !applied.has(selector));
      expect(missing, `${file} 가 램프 셀렉터를 못 받는다: ${missing.length}종`).toEqual([]);
    }
  }, ESLINT_CASE_TIMEOUT_MS);

  it("예외 파일의 부채가 장부를 넘지 않고, 0이 된 파일은 예외에서 뺀다", async () => {
    // 목록이 비었으면 래칫할 것이 없다. 대신 **정말로 0인지**를 실측한다 —
    // 「예외를 지웠다」와 「위반이 없다」는 다른 사실이고, 후자만이 규격이다.
    if (EXEMPT_DEBT.length === 0) {
      const results = await eslint.lintFiles([...FORMERLY_EXEMPT]);
      const left = results
        .map((r) => [
          path.relative(REPO_ROOT, r.filePath),
          r.messages.filter((m) => m.ruleId === "no-restricted-syntax").length,
        ] as const)
        .filter(([, n]) => n > 0);
      expect(left, `예외를 지웠는데 위반이 남아 있다: ${JSON.stringify(left)}`).toEqual([]);
      return;
    }
    const actual = await measureExemptDebt();
    const grown: string[] = [];
    const cleared: string[] = [];

    for (const [file, budget] of EXEMPT_DEBT) {
      const count = actual.get(file) ?? 0;
      if (count > budget) grown.push(`  ${file}: ${budget} → ${count} (늘었다)`);
      if (count === 0) cleared.push(`  ${file}: 장부 ${budget} → 실측 0 (예외에서 빼라)`);
    }

    expect(
      [...grown, ...cleared],
      `램프 예외 장부가 어긋났다.\n` +
        `- 늘었다면: 이 파일들은 유산 부채 때문에 lint 에서 한시적으로 빠져 있을\n` +
        `  뿐이고 래칫은 **내려가기만** 한다. text-caption/label/body/body-lg/\n` +
        `  title/display/hero · rounded-micro/chip/card/panel/sheet · leading-* ·\n` +
        `  --motion-* 를 쓰고, 램프에 없는 값이 필요하면 토큰 신설 PR 을 먼저 내라.\n` +
        `- 0이 됐다면: eslint.config.mjs 의 rampDebtExemptions 와 이 파일의 장부\n` +
        `  에서 빼라 — 예외는 한시적인 것이고 진짜 게이트는 lint 다.\n` +
        `${[...grown, ...cleared].join("\n")}`,
    ).toEqual([]);
  }, ESLINT_CASE_TIMEOUT_MS);
});
