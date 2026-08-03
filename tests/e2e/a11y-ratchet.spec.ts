import { expect, test } from "@playwright/test";
import { AUDITED_ROUTES } from "./audited-routes";

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
 * 처음 등재한 14건은 **전부 갚였다** — `target-size` 1(컨트롤 정규화),
 * `aria-required-children` 1(role 반납), `color-contrast` 4(채운 인디고 위
 * 잉크 토큰), 그리고 마지막 8건은 「체계」 판정으로 `--color-text-quaternary`
 * 값 자체가 `#82828a` 로 올라가며 사라졌다(아래 `BASELINE` 주석 · 원장
 * 2026-08-03). 기준선 셋이 전부 0 이므로 **채집 가드(`passes` 하한)가 이
 * 게이트의 생사를 쥔다** — 빈 화면과 위반 없음을 가르는 것이 그것뿐이다.
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

// 라우트 목록은 **대비 래칫과 공유한다** — 두 게이트가 각자 손으로 쓴 부분집합을
// 갖고 있었고, 그 어긋남이 404 두 페이지의 AA 미달을 한 번도 못 보게 했다.
// 제외 사유와 계약 테스트 배선은 그 파일 머리 주석에 있다.
const ROUTES = AUDITED_ROUTES;

/**
 * ## 2026-08-04 — 라우트를 8 → 17 로 넓히고 다시 전수
 *
 * 정본 인벤토리 17 라우트 중 **15** + 404 두 벌 = **17 URL**. 뺀 둘은
 * 리다이렉트이고 사유는 `audited-routes.ts` 에 있다.
 *
 * 넓히면 위반이 쏟아질 것으로 봤는데 **2건**이었다(둘 다 새로 들어온
 * `/ko/git/`, 둘 다 `color-contrast`). 나머지 7개 새 라우트는 0. 404 두 벌도
 * 0 이었다 — 거기 있던 4.42:1 은 하루 전(#899)에 이미 갚였고, 이 확장은 그
 * 자리를 **처음으로 게이트 안에** 넣는다.
 *
 * `/ko/git/` 2건은 셋업 미리보기 스케치(`atlas-git-setup-preview`,
 * `aria-hidden` + `opacity-45`)의 칩 두 개가 **낱말을 들고 있어서**였다
 * (합성 2.09:1). 잉크로는 못 고친다 — 이 불투명도에서는 램프의 가장 밝은
 * 잉크도 4.30 이다(순백이 정확히 4.50). 그래서 색이 아니라 **글자를** 뺐다:
 * 스케치의 나머지 스무 남짓 자리가 이미 회색 막대라, 막대로 바꾸니 도해가
 * 자기 문법과 같아지면서 위반이 사라졌다. 기준선은 0 그대로다.
 *
 * ## 2026-08-03 전수 실측 (1512×900, 당시 8개 라우트, 두 실행 동일)
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
 * **마지막 8건(`/ko/ontology/insights/` 4 · `/ko/projects/` 4)은 전부
 * `--color-text-quaternary` 한 토큰이었고, 2026-08-03 「체계」 판정으로 값이
 * `#787c84` → `#82828a` 로 올라가며 갚였다** (원장: docs/DECISIONS.md).
 *
 * | 바탕 | before | after |
 * |---|---:|---:|
 * | `--color-canvas` #08090a | 4.76 | 5.23 |
 * | `--color-panel` #0f1011 | 4.55 | 5.00 |
 * | panel + `--color-overlay-1` | **4.37** | 4.81 |
 * | `--color-elevated` #191a1b | **4.16** | 4.57 |
 *
 * (수치는 `scripts/lib/contrast.mjs` 알파 합성 기준.) 자리별 치환이 아니라
 * 값을 올린 이유: 화면의 위반은 8곳이지만 소비처는 584곳이라, 보이는 8곳만
 * 치우면 나머지가 장전된 채 남는다. `#82828a` 는 elevated 4.5 를 넘는 사실상
 * 최소 명도(#828282 하한 4.54)라 tertiary(#8a8f98, 스텝비 1.17)와의 위계를
 * 최대한 보존하고, 지도 패널의 같은 단이 2026-07 에 도착한 값과 수렴한다.
 * ⚠️ hover/선택(overlay-2, 4.36)에서는 여전히 미달 — 누를 수 있는 행 위의
 * 글자는 tertiary 부터다.
 *
 * **이 숫자는 내려가기만 한다.**
 */
const BASELINE: Readonly<Record<string, number>> = {
  "color-contrast": 0,
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
 *
 * **라우트를 17개로 넓힌 뒤에도 바닥 15는 유효하다** (재측정 2026-08-04):
 * 가장 마른 자리가 404 두 벌의 **21** 이고 — 카드 하나뿐인 화면이라 원래 적다 —
 * 나머지는 24~30 이다. 여유가 6이라 좁아 보이지만, 빈 문서 2 와의 거리가 19 라
 * 이 가드가 가르려는 두 상태는 여전히 멀리 떨어져 있다. 404 가 더 마르면
 * 그때 바닥을 내리는 게 아니라 **그 화면이 비었는지 먼저 의심한다.**
 *
 * ⚠️ **이 가드의 사정거리는 «화면이 떴나» 까지다** (2026-08-04 프로브로 확인).
 * `<div />` 만 그리는 임시 라우트를 목록에 넣어 봤더니 이 단언은 **안 걸렸다** —
 * 셸 크롬(레일·탭바)만으로도 axe 가 15룰을 넘겨 적용하기 때문이다. 즉 «축이
 * 통째로 안 뜬 경우» 는 잡지만 «셸은 멀쩡한데 본문만 조용히 비었을 때» 는 못
 * 잡는다. 같은 프로브에서 대비 래칫의 조합 가드는 3 을 재고 걸렸다(그쪽은
 * 텍스트 조합을 세므로 본문 유무에 더 민감하다). 두 게이트가 서로의 사각지대를
 * 덮는 관계라 어느 한쪽만 두지 않는다.
 */
const MIN_RULES_PASSED_PER_ROUTE = 15;

test("접근성 래칫 — 새 룰 위반 0, 기존 개수는 늘지 않는다", async ({ page }) => {
  // 라우트가 8 → 17 로 늘었다. 라우트당 2.5초 수렴 대기 + axe 실행이라 기본 60초를 넘는다.
  test.setTimeout(240_000);
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
