import { expect, test, type Page } from "@playwright/test";

/**
 * 접근성 래칫 — **열린 표면**.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 왜 이 파일이 따로 있나 (2026-08-04)
 * ════════════════════════════════════════════════════════════════════
 *
 * `a11y-ratchet.spec.ts` 는 17개 URL 을 열고 **첫 화면만** 잰다. 그래서 오버레이·
 * 패널·시트·메뉴처럼 **눌러야 나타나는 표면**은 한 번도 측정된 적이 없다. 그 게이트의
 * 기준선 셋이 전부 0 인 것은 사실이지만, 그 0 은 «닫힌 화면의 0» 이었다 —
 * `audited-routes.ts` 머리말이 라우트에 대해 적어 둔 문장이 표면에도 그대로 적용된다:
 * **재지 않은 화면은 통과한 화면이 아니다.**
 *
 * 2026-08-04 시스템 감사가 그 사각지대에서 AA 미달을 찾아내면서 이 파일이 생겼다.
 * 첫 실행이 즉시 **7건**을 냈고, 전부 닫힌 화면에서는 존재하지 않는 원소들이다.
 *
 * ### 첫 전수 — 5개 표면, 위반 7 (2026-08-04, 1512×900)
 *
 * | 표면 | 룰 | 실측 | 무엇인가 |
 * |---|---|---:|---|
 * | 설정 시트 | `color-contrast` | 2 | `#7170ff`(표식 인디고)가 `#1f2230` 위 **4.1:1** · `#232634` 위 **3.9:1** |
 * | 글로벌 검색 | `color-contrast` | 3 | `#82828a`(`--color-text-quaternary`)가 오버레이 위 **4.38 · 4.14 · 4.38** |
 * | 다음 할 일 행 메뉴 | `target-size` | 2 | 메뉴가 행 액션을 **가려서** 남는 자리가 81.8×17 · 32×17 (요구 24×24) |
 * | 단축키 시트 · 문서 정렬 메뉴 | — | 0 | |
 *
 * **셋 다 이 라운드가 고치지 않는다 — 규격의 일이기 때문이다.**
 *
 * - 인디고 5건은 **잉크 램프 판정**이다. `--color-indigo-accent` 는 「맨 어두운
 *   바탕만」이 라이선스인데(`accent-ink-contrast.contract.test.ts`) 여기서는 틴트
 *   위에 있다. 자리마다 치환할지 값을 올릴지는 「체계」의 소집 사안이고,
 *   `design.md` 가 그 목록을 명시적으로 이름 붙여 뒀다.
 * - `#82828a` 3건은 **이미 알려진 한계**다. `a11y-ratchet.spec.ts` 머리말이
 *   *"⚠️ hover/선택(overlay-2, 4.36)에서는 여전히 미달 — 누를 수 있는 행 위의
 *   글자는 tertiary 부터다"* 라고 적어 뒀고, 이 게이트가 그 문장을 **처음으로 실제
 *   화면에서 확인**했다. 산문으로만 있던 경고가 이제 숫자를 갖는다.
 * - `target-size` 2건은 겹침이라 값이 아니라 **레이아웃** 결정이다.
 *
 * 그래서 **래칫으로 등재한다**: 오늘 수를 상한으로 잠그고, 새 위반은 못 들어오게
 * 한다. 안 치운 채 0 을 요구하면 첫날부터 빨갛고, 빨간 게이트는 곧 꺼진다.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 열 수 있는 표면은 몇 개인가 — 분모
 * ════════════════════════════════════════════════════════════════════
 *
 * 소스 전수로 **20개**다(`censusAppearingSurfaces`, 조건부로 나타나는 표면).
 * 이 파일은 그중 **5개**를 연다. 나머지가 안 열리는 이유는 대부분 **볼트가
 * 필요**하거나(문서 편집기 자동완성 · 에이전트 패널) 캔버스 좌표를 짚어야 해서다
 * (지도 노드 팝오버 · 우클릭 메뉴 — `?e2e=1` 의 `window.__atlasMap` 으로 여는
 * 경로는 이 라운드에서 좌표 변환까지 갔으나 클릭이 노드에 안 닿아 보류했다).
 *
 * **분모를 코드에 적어 두는 이유**: 5/20 이라고 쓰면 다음 사람이 «나머지 15는
 * 왜 안 재나» 를 물을 수 있다. 그냥 5개를 열고 말면 그 질문 자체가 사라진다.
 * 분모가 늘어나면 `surface-motion-ratchet` 의 「열 수 있는 표면이 늘지 않는다」가
 * 먼저 빨개진다 — 그때 이 목록도 같이 본다.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 이 게이트가 공회전하지 않는다는 증명
 * ════════════════════════════════════════════════════════════════════
 *
 * 「열린 표면에서 위반 0」과 「사실은 아무것도 안 열렸다」는 화면에서 구별되지
 * 않는다 — 그게 이 라운드가 존재하는 이유 자체다. 그래서 표면마다 **두 겹**을 건다:
 *
 * 1. **열렸다는 증거** — 트리거를 누른 뒤 그 표면의 셀렉터가 실제로 보여야 한다.
 *    testid 가 컴포넌트보다 오래 살아남는 사고(2026-08 릴리스)를 여기서 막는다.
 * 2. **채집이 살아 있다** — axe 가 내용에 적용해 통과시킨 룰이 바닥 위여야 한다.
 *    빈 문서에서 이 값은 2 다.
 */

const AXE_PATH = require.resolve("axe-core/axe.min.js");

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** `a11y-ratchet.spec.ts` 와 같은 바닥. 빈 문서는 2, 실제 화면은 25~30. */
const MIN_RULES_PASSED = 15;

/** 소스 전수 — `censusAppearingSurfaces()` 가 낸 수. 위 「분모」 절. */
const APPEARING_SURFACES_IN_SOURCE = 20;

interface Opener {
  readonly name: string;
  readonly route: string;
  /** 누를 트리거의 testid. */
  readonly trigger: string;
  /** 눌린 뒤 **반드시 보여야 하는** 것. 안 보이면 이 게이트는 아무것도 안 잰 것이다. */
  readonly surface: string;
}

const OPENERS: readonly Opener[] = [
  {
    name: "설정 시트",
    route: "/ko/topology/",
    trigger: "app-settings-trigger",
    surface: '[data-testid="app-settings-popover"]',
  },
  {
    name: "단축키 시트",
    route: "/ko/topology/",
    trigger: "topology-shortcuts-help-button",
    surface: '[role="dialog"]',
  },
  {
    name: "글로벌 검색",
    route: "/ko/topology/",
    trigger: "topology-concept-search",
    surface: '[role="dialog"]',
  },
  {
    name: "문서 정렬 메뉴",
    route: "/ko/docs/",
    trigger: "docs-sidebar-order-toggle",
    surface: '[data-testid="docs-sidebar-order-menu"]',
  },
  {
    name: "다음 할 일 행 메뉴",
    route: "/ko/ontology/insights/",
    trigger: "do-next-row-menu",
    surface: '[data-testid="do-next-row-menu-popover"]',
  },
];

/**
 * **이 숫자는 내려가기만 한다.** 리터럴이다 — 실측에서 파생하면 「늘지 않는다」가
 * 원리적으로 실패 불가가 된다(하드컷 래칫이 정확히 그렇게 죽었다).
 */
const BASELINE: Readonly<Record<string, number>> = {
  "color-contrast": 5,
  "target-size": 2,
};

async function openAndAudit(page: Page, o: Opener) {
  await page.goto(`${o.route}?guides=off`, { waitUntil: "domcontentloaded" });
  // 지도는 물리 시뮬이 수렴해야 화면이 정해진다.
  await page.waitForTimeout(2500);

  await page.getByTestId(o.trigger).first().click({ timeout: 8000 });
  await page.waitForTimeout(800);

  // ★ 열렸다는 증거. 이게 없으면 아래 axe 는 «닫힌 화면» 을 한 번 더 재는 것이고,
  //   그 결과는 첫 화면 래칫과 중복이면서 «열린 표면 위반 0» 이라고 거짓 보고한다.
  await expect(
    page.locator(o.surface).first(),
    `«${o.name}» 트리거를 눌렀는데 표면이 안 열렸다 — 이 게이트는 아무것도 재지 않았다. ` +
      `트리거 testid(${o.trigger})가 컴포넌트보다 오래 살아남았는지 먼저 의심하라.`,
  ).toBeVisible({ timeout: 5000 });

  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (tags) => {
    type Run = {
      violations: Array<{ id: string; nodes: Array<{ target: string[] }> }>;
      passes: Array<unknown>;
    };
    const run = await (
      window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<Run> } }
    ).axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return {
      rulesPassed: run.passes.length,
      violations: run.violations.map((v) => ({
        id: v.id,
        count: v.nodes.length,
        sample: v.nodes[0]?.target?.join(" ") ?? "",
      })),
    };
  }, WCAG_TAGS);
}

test("접근성 래칫(열린 표면) — 새 룰 위반 0, 기존 개수는 늘지 않는다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  const counts = new Map<string, number>();
  const samples = new Map<string, string>();
  const thin: string[] = [];

  for (const o of OPENERS) {
    const r = await openAndAudit(page, o);
    if (r.rulesPassed < MIN_RULES_PASSED) {
      thin.push(`  ${o.name}: 내용에 적용돼 통과한 룰 ${r.rulesPassed}`);
    }
    for (const v of r.violations) {
      counts.set(v.id, (counts.get(v.id) ?? 0) + v.count);
      if (!samples.has(v.id)) samples.set(v.id, `${o.name} → ${v.sample}`);
    }
  }

  // ★ 「위반 0」과 「아무것도 안 쟀다」를 가른다.
  expect(
    thin,
    `axe 가 표면당 ${MIN_RULES_PASSED}개 룰도 내용에 적용하지 못했다 — 위반이 없는 게 아니라 ` +
      `화면이 안 떴거나 채집이 깨진 것이다.\n${thin.join("\n")}`,
  ).toEqual([]);

  const unknown = [...counts.keys()].filter((id) => !(id in BASELINE)).sort();
  expect(
    unknown,
    `열린 표면에서 기준선에 없는 접근성 룰이 떴다 — 새 결함이다.\n` +
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
  const slack = Object.entries(BASELINE)
    .filter(([id, max]) => (counts.get(id) ?? 0) < max)
    .map(([id, max]) => `  ${id}: 기준선 ${max} · 실측 ${counts.get(id) ?? 0}`);
  expect(
    slack,
    `열린 표면의 위반이 줄었다 — 이 파일의 BASELINE 도 같이 내려라.\n${slack.join("\n")}`,
  ).toEqual([]);
});

test("측정 목록이 분모를 잃지 않는다 — 5/20 이라고 말할 수 있어야 한다", async () => {
  expect(OPENERS.length, "열 표면 목록이 비면 위 시험은 공집합 위에서 전부 초록이다").toBeGreaterThanOrEqual(5);
  expect(
    new Set(OPENERS.map((o) => o.route)).size,
    "전부 한 라우트에서만 열면 다른 축의 표면은 여전히 아무도 안 본다",
  ).toBeGreaterThanOrEqual(3);
  // 분모가 코드에 남아 있어야 «나머지는 왜 안 재나» 를 물을 수 있다.
  expect(APPEARING_SURFACES_IN_SOURCE).toBeGreaterThan(OPENERS.length);
});
