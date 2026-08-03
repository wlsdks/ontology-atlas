import { expect, test } from "@playwright/test";

/**
 * 접근성 래칫 — axe-core 105룰 중 **WCAG 2.x A/AA** 만.
 *
 * ## 왜 손으로 만든 다섯 스펙 위에 이걸 얹는가
 *
 * `a11y-structure` · `aria-audit` · `keyboard-path` · `touch-target-contract` ·
 * `mobile-keyboard-audit` 는 전부 **사람이 알아챈 결함을 하나씩 못박은 것**이다.
 * 좋은 검사지만 알아챈 것만 덮는다 — 15 케이스가 105룰 중 대여섯을 본다.
 * 실제로 이 래칫이 처음 돌자마자 그 다섯이 한 번도 못 본 결함 셋이 나왔다
 * (`aria-required-children` · `target-size` · `color-contrast` 12건).
 *
 * ## 왜 「위반 0」이 아니라 래칫인가
 *
 * `/gate-probe`: **룰을 켜기 전에 위반을 전수 측정한다.** 안 치운 채 0 을 요구하면
 * 그 게이트는 첫날부터 빨갛고, 빨간 게이트는 곧 꺼지거나 무시된다.
 *
 * 처음 등재한 14건 중 **6건이 갚였다** — `target-size` 1(컨트롤 정규화),
 * `aria-required-children` 1(role 반납), `color-contrast` 4(채운 인디고 위
 * 잉크 토큰). 남은 8건은 **토큰 값 한 개**라 이 파일이 단독으로 못 고친다 —
 * 처방은 `/design-council` 의 「체계」로 간다(아래 `BASELINE` 주석).
 *
 * 그래서 계약은 셋이다:
 *   1. **채집이 살아 있다** — 라우트마다 axe 가 내용에 적용한 룰이 바닥 위여야
 *      한다. 세 룰 중 둘이 이미 0이라, 이게 없으면 «빈 화면»과 «위반 없음»이
 *      같은 초록이 된다.
 *   2. **새 룰 위반 0** — 목록에 없는 룰이 하나라도 뜨면 실패. 새 결함은 못 들어온다.
 *   3. **개수는 늘 수 없다** — 기준선은 상한이고, 고치면 이 파일의 숫자를 내린다.
 *
 * 기준선을 **올리는 것은 diff 에 남는 사람의 결정**이다. 그게 이 형태의 요점이다 —
 * 조용히 늘어나는 것만 막고, 의도적으로 늘리는 것은 리뷰가 본다.
 *
 * ## 이 게이트는 실제로 빨개진다 (2026-08-03 프로브 4종)
 *
 * | 일부러 만든 결함 | 결과 |
 * |---|---|
 * | CTA 잉크를 `--color-text-primary` 로 되돌림 | `color-contrast` 8 → 12 실패 |
 * | 사이드바 줄에 `role="tablist"` 복원 | `aria-required-children` 0 → 1 실패 |
 * | 고친 채 `BASELINE` 만 9로 둠 | 여유 단언 실패(기준선 9 · 실측 8) |
 * | 빈 문서만 서빙하는 서버에 물림 | 채집 단언 실패(통과 룰 4 < 15) |
 *
 * 센서스를 다시 뜨려면: `node scripts/measure-a11y.mjs`(빌드 + 정적 서버 필요).
 */

// Playwright 스펙은 CJS 로 로드된다 — `import.meta` 를 쓰면 파일 자체가 안 실린다
// (증상이 «No tests found» 라 검사가 없는 것과 구별되지 않는다).
const AXE_PATH = require.resolve("axe-core/axe.min.js");

/** 「best-practice」 태그는 규격이 아니라 권고다 — 섞으면 규격 위반과 취향이 한 숫자가 된다. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const ROUTES = [
  "/ko/",
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/studio/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/download/",
  "/ko/guide/",
];

/**
 * 2026-08-03 전수 실측 (1512×900, 위 8개 라우트, 두 실행 동일).
 *
 * | 룰 | 원소 | 무엇인가 |
 * |---|---|---|
 * | `color-contrast` | 12 → **8** | 아래 절 참고. 남은 8은 **토큰 한 개**다 |
 * | ~~`aria-required-children`~~ | ~~1~~ → **0** | 문서함 사이드바 상단 줄이
 *   `role="tablist"` 였는데 그 안에 컬렉션 3개 말고 검색·정렬·새 문서가 같이
 *   있었다. 고침은 **자식을 `tab` 으로 바꾸는 쪽이 아니라 role 을 반납하는
 *   쪽**이다 — `tabpanel`·`aria-controls`·roving tabindex 없이 role 만 빌리면
 *   AT 에게 지키지 못할 약속을 한다. 형제 `DocsVaultTabStrip` 이 같은 판단을
 *   먼저 적어 뒀고 이제 둘이 같은 계약을 쓴다 |
 * | ~~`target-size`~~ | ~~1~~ → **0** | WCAG 2.2 §2.5.8 — 24px 미만이고 여백도 부족.
 *   2026-08-03 문서함/서랍 컨트롤 정규화로 사라졌다: `p-1`/`p-0.5` 로 크기를
 *   내용에 맡기던 아이콘 컨트롤들이 `IconButton`(24/28/32 고정)으로 넘어가면서
 *   가장 작은 것이 24px 바닥을 갖게 됐다. **값 층이 바닥을 소유하면 자리마다
 *   빠뜨릴 수 없다** — 이 항목이 그 증거다 |
 *
 * ## `color-contrast` 12 → 8 — 무엇이 갚였고 무엇이 남았나
 *
 * **갚은 4건**: 관문/다운로드의 주 CTA(`/ko/` ×2 · `/ko/download/` ×2). 채운
 * 인디고(`#5e6ad2`) 위의 잉크가 `--color-text-primary`(#f7f8f8, **4.42:1**)
 * 였다. `--color-text-on-accent`(#ffffff, **4.70:1**)로 옮겼다 — 이 토큰은
 * 2026-08-03 에 「채운 인디고 위의 잉크」 라는 이름으로 이미 만들어져
 * `control-class.ts` 가 쓰고 있었고, `button.tsx` 의 `primary` 만 이관에서
 * 빠져 있었다. 새 값 0개.
 *
 * **남은 8건은 전부 `--color-text-quaternary`(#787c84) 한 토큰이다.**
 * 자리: `/ko/ontology/insights/` 4 · `/ko/projects/` 4.
 *
 * | 바탕 | 현재 | 필요 |
 * |---|---:|---:|
 * | `--color-canvas` #08090a | 4.76 | — |
 * | `--color-panel` #0f1011 | 4.55 | — |
 * | panel + `--color-overlay-1` #151617 | **4.33** | 4.5 |
 * | `--color-elevated` #191a1b | **4.16** | 4.5 |
 *
 * 즉 이 잉크는 **캔버스/패널에서만 AA 를 넘고, 한 단 올라선 표면에서 뚫린다.**
 * 소비처는 652곳이라 자리별 치환은 오늘 보이는 8곳만 지우고 644곳을 장전된
 * 채로 남긴다 — 그건 수를 내리는 것이지 고치는 것이 아니다. 값 하나를
 * **`#82828a`** 로 올리면 네 바탕 전부 통과하고(5.23 / 5.00 / 4.75 / 4.57)
 * tertiary(#8a8f98)와의 명도 순서도 보존된다. 무채 명도만 움직이므로 새 hue 는
 * 없다 — 지도 패널의 같은 이름 잉크(`--topology-v2-panel-text-quaternary`)가
 * 2026-07 에 `#55555d` → `#82828a` 로 **정확히 같은 사유로** 이미 올라갔다.
 * 그 처방은 `app/globals.css` 의 램프라 「체계」석의 자리다(`design.md`
 * "규격을 바꾸려면 「체계」를 부른다").
 *
 * **이 숫자는 내려가기만 한다.**
 */
const BASELINE: Readonly<Record<string, number>> = {
  "color-contrast": 8,
  "aria-required-children": 0,
  "target-size": 0,
};

/**
 * 탐지기가 놀고 있지 않다는 증거 — **기준선이 0에 가까워질수록 필요해진다.**
 *
 * axe 를 못 실었거나 페이지가 빈 채로 떠도 «위반 0» 은 나온다. 그건 통과가
 * 아니라 **미측정**이고, 아래 단언 셋은 그 둘을 구별하지 못한다
 * (`target-size` 와 `aria-required-children` 이 이미 0이라 그 자리에서는 어떤
 * 신호도 안 나온다).
 *
 * ⚠️ **세는 대상을 틀리면 이 가드도 장식이 된다.** 처음엔 «평가된 룰 수»
 * (violations+passes+incomplete+inapplicable)를 세려 했는데, 실측해 보니 실제
 * 라우트가 **64** 이고 빈 문서도 **63** 이었다 — `inapplicable` 이 총계를
 * 지배해서 빈 화면과 진짜 화면이 구별되지 않는다. 그건 켜도 절대 안 빨개지는
 * 가드다.
 *
 * 가르는 것은 `passes` 다: **실제 내용에 적용돼 통과한 룰**의 수. 실측
 * 2026-08-03 — `/ko/` 26 · `/ko/topology/` 27 · `/ko/projects/` 26 ·
 * `/ko/docs/` 25 vs **빈 문서 2**. 바닥 15는 그 사이의 빈 구간이다.
 */
const MIN_RULES_PASSED_PER_ROUTE = 15;

test("접근성 래칫 — 새 룰 위반 0, 기존 개수는 늘지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  const counts = new Map<string, number>();
  const samples = new Map<string, string>();
  const thinRuns: string[] = [];

  for (const route of ROUTES) {
    await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
    // 지도는 물리 시뮬이 수렴해야 화면이 정해진다 — 수렴 전에 재면 중간 상태를 잰다.
    await page.waitForTimeout(2500);
    await page.addScriptTag({ path: AXE_PATH });
    const result = await page.evaluate(async (tags) => {
      type Run = {
        violations: Array<{ id: string; nodes: Array<{ target: string[] }> }>;
        passes: Array<unknown>;
        incomplete: Array<unknown>;
        inapplicable: Array<unknown>;
      };
      const run = await (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<Run> } }).axe.run(
        document,
        { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] },
      );
      return {
        // `resultTypes` 는 **노드 상세**만 줄인다 — 배열의 길이는 그대로다.
        // 그래서 «내용에 실제로 적용된 룰» 수를 추가 비용 없이 셀 수 있다.
        rulesPassed: run.passes.length,
        violations: run.violations.map((v) => ({
          id: v.id,
          count: v.nodes.length,
          sample: v.nodes[0]?.target?.join(" ") ?? "",
        })),
      };
    }, WCAG_TAGS);

    if (result.rulesPassed < MIN_RULES_PASSED_PER_ROUTE) {
      thinRuns.push(`  ${route}: 내용에 적용돼 통과한 룰 ${result.rulesPassed}`);
    }
    for (const v of result.violations) {
      counts.set(v.id, (counts.get(v.id) ?? 0) + v.count);
      if (!samples.has(v.id)) samples.set(v.id, `${route} → ${v.sample}`);
    }
  }

  // ★ 「위반 0」과 「아무것도 안 쟀다」를 가른다. 이게 없으면 아래 단언 셋은
  //   빈 집합 위에서 전부 초록이고, 그건 게이트가 없는 것과 같다.
  expect(
    thinRuns,
    `axe 가 라우트당 ${MIN_RULES_PASSED_PER_ROUTE}개 룰도 내용에 적용하지 못했다 — ` +
      `위반이 없는 게 아니라 화면이 안 떴거나 채집이 깨진 것이다.\n${thinRuns.join("\n")}`,
  ).toEqual([]);

  const unknown = [...counts.keys()].filter((id) => !(id in BASELINE)).sort();
  expect(
    unknown,
    `기준선에 없는 접근성 룰이 떴다 — 새 결함이다. 고쳐라. 정말 등재해야 한다면 ` +
      `BASELINE 을 올리는 커밋이 리뷰에 보여야 한다.\n` +
      unknown.map((id) => `  ${id}: ${samples.get(id)}`).join("\n"),
  ).toEqual([]);

  for (const [id, max] of Object.entries(BASELINE)) {
    const actual = counts.get(id) ?? 0;
    expect(
      actual,
      `\`${id}\` 위반이 ${max} → ${actual} 로 늘었다. 래칫은 내려가기만 한다.\n` +
        `  예: ${samples.get(id) ?? "(없음)"}`,
    ).toBeLessThanOrEqual(max);
  }

  // ★ 고쳤는데 기준선을 안 내리면 그만큼이 **다시 나빠질 여유**로 남는다.
  //   여유를 무료로 두지 않는 것이 래칫의 나머지 절반이다.
  const slack = Object.entries(BASELINE)
    .filter(([id, max]) => (counts.get(id) ?? 0) < max)
    .map(([id, max]) => `  ${id}: 기준선 ${max} · 실측 ${counts.get(id) ?? 0}`);
  expect(
    slack,
    `접근성 위반이 줄었다 — 이 파일의 BASELINE 도 같이 내려라. 안 내리면 그 차이가 ` +
      `다시 나빠질 여유로 남는다.\n${slack.join("\n")}`,
  ).toEqual([]);
});
