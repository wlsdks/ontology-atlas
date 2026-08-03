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
 * 그 게이트는 첫날부터 빨갛고, 빨간 게이트는 곧 꺼지거나 무시된다. 그리고 오늘의
 * 14건 중 12건은 **헌장 색이 걸린 사안**이라 이 파일이 단독으로 못 고친다 —
 * 처방은 `/design-council` 의 「체계」·「도해」로 간다.
 *
 * 그래서 계약은 둘이다:
 *   1. **새 룰 위반 0** — 목록에 없는 룰이 하나라도 뜨면 실패. 새 결함은 못 들어온다.
 *   2. **개수는 늘 수 없다** — 기준선은 상한이고, 고치면 이 파일의 숫자를 내린다.
 *
 * 기준선을 **올리는 것은 diff 에 남는 사람의 결정**이다. 그게 이 형태의 요점이다 —
 * 조용히 늘어나는 것만 막고, 의도적으로 늘리는 것은 리뷰가 본다.
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
 * | `color-contrast` | 12 | 인디고 면 위 흰 글자 4.42:1 · `text-quaternary` 4.31:1 등. `scripts/measure-contrast.mjs` 가 독립적으로 같은 결함군을 지목한다 |
 * | `aria-required-children` | 1 | `role="tablist"` 가 `role="tab"` 자식을 안 갖는다 |
 * | ~~`target-size`~~ | ~~1~~ → **0** | WCAG 2.2 §2.5.8 — 24px 미만이고 여백도 부족.
 *   2026-08-03 문서함/서랍 컨트롤 정규화로 사라졌다: `p-1`/`p-0.5` 로 크기를
 *   내용에 맡기던 아이콘 컨트롤들이 `IconButton`(24/28/32 고정)으로 넘어가면서
 *   가장 작은 것이 24px 바닥을 갖게 됐다. **값 층이 바닥을 소유하면 자리마다
 *   빠뜨릴 수 없다** — 이 항목이 그 증거다 |
 *
 * **이 숫자는 내려가기만 한다.**
 */
const BASELINE: Readonly<Record<string, number>> = {
  "color-contrast": 12,
  "aria-required-children": 1,
  "target-size": 0,
};

test("접근성 래칫 — 새 룰 위반 0, 기존 개수는 늘지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  const counts = new Map<string, number>();
  const samples = new Map<string, string>();

  for (const route of ROUTES) {
    await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
    // 지도는 물리 시뮬이 수렴해야 화면이 정해진다 — 수렴 전에 재면 중간 상태를 잰다.
    await page.waitForTimeout(2500);
    await page.addScriptTag({ path: AXE_PATH });
    const violations = await page.evaluate(async (tags) => {
      const run = await (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe.run(
        document,
        { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] },
      );
      return run.violations.map((v) => ({ id: v.id, count: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") ?? "" }));
    }, WCAG_TAGS);

    for (const v of violations) {
      counts.set(v.id, (counts.get(v.id) ?? 0) + v.count);
      if (!samples.has(v.id)) samples.set(v.id, `${route} → ${v.sample}`);
    }
  }

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
