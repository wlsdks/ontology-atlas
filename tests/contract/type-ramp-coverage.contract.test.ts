import { existsSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// **Read the original** rather than duplicating the glob list here — a copy drifts
// silently, creating the very blind spot this test exists to guard.
import {
  arbitrarySizeSelectors,
  rampCoveredGlobs,
  rampDebtExemptions,
} from "../../eslint.config.mjs";

/**
 * The contract pinning **coverage** of the type / radius / leading / motion /
 * shadow ramp specs.
 *
 * **Why this file was rewritten** (2026-08-04). It used to be a ratchet that counted,
 * by regex, whether debt grew in directories lint **did not look at**. That design
 * rested on one premise — that coverage was an **allowlist**
 * (`codexMigratedGlobs`). An allowlist has exactly one failure mode, and it happens
 * to be the thing a product does most often:
 *
 * > **A newly created directory is on no list.**
 *
 * Measured in the 2026-08-04 field trial: planting four violations
 * (`text-[13px] rounded-[5px] leading-[1.9] duration-300`) on one line of a new
 * `src/views/<name>/ui/*.tsx` and running `pnpm exec eslint` gave **0 errors, 0
 * warnings**. That path received **7** `no-restricted-syntax` selectors
 * (scale/gradient 5 + accent tint 2) and **0** ramp selectors. The owner's goal is
 * *"just give the order and a screen comes out built on the design system"* — yet **a new screen was exactly
 * where none of the spec was enforced**.
 *
 * So `eslint.config.mjs` was inverted into a **denylist**, and this file's job
 * changed with it. What it now blocks is not "a violation" but **"coverage
 * narrowing again"** — the same shape as what
 * `audited-route-coverage.contract.test.ts` does for routes.
 *
 * **What is measured:**
 *
 * 1. Whether the covering globs are still **denylist-shaped** (all of `src/**` +
 *    `app/**`).
 * 2. Whether a **path that does not exist yet** receives every ramp selector — asked
 *    directly through ESLint's `calculateConfigForFile`. No real file is needed, so
 *    "the directory somebody creates next" can be measured today.
 * 3. Whether the detector idles — do those four planted lines actually **turn red**,
 *    and do normal ramp values **pass**.
 * 4. Whether exceptions are **per file** (a directory exception drags in new files
 *    created inside it).
 * 5. Whether an exception file's debt exceeds the ledger — the ratchet only goes
 *    down.
 *
 * ⚠️ **Do not duplicate the violation verdict as a regex.** This file used to hold a
 * hand-copied regex list of the ESLint selectors, and its comment claimed "the same
 * verdict" while only 7 of 12 families were actually copied (measured 2026-07-28). A
 * copy always diverges, so **ESLint itself is run** here.
 */

/**
 * The debt ledger for exception files — **emptied on 2026-08-05.**
 *
 * Moving the last 7 files' 93 items (text 68 · radius 25) onto the ramp brought the
 * list to 0. The record up to that point is kept here, because a rollback needs to
 * know what was how much:
 *
 *   ProjectCard 16 · ProjectMetaGrid 2 · LiveActivityIndicator 23 ·
 *   FirstRunPage 14 · StudioCompass 24 · ProjectEditorPage 2 · RootEntryPage 5
 *
 * ⚠️ An empty array must not make the checks below **green for free**. So when it
 * is empty the verdict is **inverted** — instead of "is the exception a real
 * exception", it measures "does a formerly exempt file really receive the ramp
 * selectors now".
 */
const EXEMPT_DEBT: ReadonlyArray<readonly [string, number]> = [];

/**
 * Files that were once exceptions. With the list empty they are used to confirm
 * those paths **really do receive the ramp selectors** — if the exception was
 * deleted but they are still uncovered for some other reason, only the list is
 * clean while the spec is still absent.
 */
const FORMERLY_EXEMPT = [
  "src/entities/project/ui/ProjectCard.tsx",
  "src/features/vault-ontology/ui/LiveActivityIndicator.tsx",
  "src/views/root-entry/ui/RootEntryPage.tsx",
] as const;

/**
 * **Paths that do not exist yet** — one per FSD layer plus the routing root, so
 * wherever the next person puts a new surface it is covered from day one.
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

/** The single line the field trial planted. It trips four families at once. */
const FIELD_TRIAL_VIOLATION =
  'export const Probe = () => <div className="text-[13px] rounded-[5px] leading-[1.9] duration-300" />;\n';

/** The compliant form of the same line — ramp utilities only. Turning red here is a false positive. */
const RAMP_CLEAN =
  'export const Probe = () => <div className="text-body rounded-card leading-body" />;\n';

const PROBE_PATH = "src/views/brand-new-surface/ui/BrandNewPage.tsx";
const REPO_ROOT = path.resolve(__dirname, "../..");
const exemptions = rampDebtExemptions as string[];
const rampSelectors = (arbitrarySizeSelectors as { selector: string }[]).map(
  (rule) => rule.selector,
);

/**
 * **An explicit timeout for the cases that really run ESLint** (2026-08-05).
 *
 * This is the only contract in the repository that **runs real ESLint over files**,
 * so it is inherently slow with high variance. It sat right on vitest's default
 * 5,000ms — **902ms** locally versus **5,503ms** on the CI runner (about 6×) — and a
 * docs-only PR went red on the timeout.
 *
 * **A gate that fails on time is noise.** If red-because-the-spec-was-broken cannot
 * be told apart from red-because-the-runner-was-slow, the next person learns to
 * ignore the red — exactly the decay this repository warns about under "always
 * measure before switching a rule on". 30 seconds is 33× the measured 902ms, and a
 * genuine infinite loop is still caught.
 */
const ESLINT_CASE_TIMEOUT_MS = 30_000;

/** Uses the repository's real `eslint.config.mjs` as is. */
const eslint = new ESLint({ cwd: REPO_ROOT });

/**
 * An instance that **forcibly re-enables** the ramp rules on exception files.
 * `overrideConfig` is appended after the config file so it beats the exception's
 * `ignores` — measuring debt requires the rules to be on.
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
    // This assertion is the heart of the file. The moment a directory list appears
    // here, the "a newly created directory is on no list" hole returns intact.
    expect(rampCoveredGlobs).toEqual(["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"]);
  });

  it("탐지기가 빈 집합 위에서 놀지 않는다 — 램프 셀렉터가 실재한다", () => {
    // If the selector array is empty, every universal assertion below goes green for free.
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
    // text-[13px] · rounded-[5px] · leading-[1.9] · duration-300 — four.
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
    // Excluding by directory also excludes **files created inside it later**. That was
    // the allowlist era's hole and must not reopen here.
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
    // While exceptions existed the question was "is it an exception in name only".
    // With the list empty the opposite is asked — if the exception was deleted but the
    // path is still uncovered for another reason (a glob typo, block order), only the
    // list is clean while the spec is still absent.
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
    // With an empty list there is nothing to ratchet, so **whether it is really 0** is
    // measured instead — "the exception was deleted" and "there are no violations" are
    // different facts, and only the latter is the spec.
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
