import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * 밀집 행의 타깃 크기 — **데이터가 있어야만 존재하는 자리**를 WCAG 2.5.8 로 잰다.
 *
 * ## 왜 접근성 래칫이 이 위반을 한 번도 못 봤나
 *
 * `a11y-ratchet` 은 17 라우트를 열고 axe 를 돌린다. 그 게이트의 `target-size`
 * 기준선은 **0** 이고 실제로 0 이었다 — 그런데 그건 위반이 없어서가 아니라
 * **그 자리가 렌더된 적이 없어서**다. 「경계」 탭의 도메인 결합 상세(짝을 이룬
 * 예시 링크 줄)는 두 조건을 모두 만족해야 화면에 나온다:
 *
 *   ① 볼트에 **교차 도메인 엣지**가 있어야 격자에 누를 수 있는 칸이 생기고,
 *   ② 사람이 그 칸을 **눌러야** 상세가 펼쳐진다.
 *
 * 기본 샘플 볼트에는 ①이 없다. 그래서 axe 는 그 DOM 을 한 번도 본 적이 없고,
 * 게이트는 **빈 집합 위에서 초록**이었다. 이건 이 한 자리의 문제가 아니라
 * 부류의 문제다 — *데이터에 의존해 눈이 감기는 게이트*.
 *
 * 그래서 이 스펙은 위반을 **재현**한다: OPFS 스텁 픽커로 교차 도메인 엣지가
 * 있는 볼트를 물리고, 칸을 눌러 그 행을 실제로 그린 다음 rect 를 잰다.
 *
 * ## 무엇을 재는가 — WCAG 2.5.8 Target Size (Minimum), AA
 *
 * 통과 조건은 둘 중 하나다(둘 다 실패해야 위반):
 *   - **본칙**: 타깃이 24×24 CSS px 이상이다.
 *   - **Spacing 예외**: 타깃 중심의 지름 24 원이 다른 어떤 타깃의 원과도 만나지
 *     않는다 → 중심 간 거리 ≥ 24.
 * (Inline 예외는 문장 흐름 안의 링크에만 붙는다. 목록 행은 자기 줄을 차지하는
 * 블록이라 해당 없음 — 실측에서도 `display: block` 이었다.)
 *
 * ## 히트 확장(`.touch-hit-expand`)으로는 못 고친다
 *
 * 행 피치가 21px 인 자리에 44px 히트 영역을 붙이면 이웃과 16px 겹치고, DOM
 * 순서상 **뒤 행이 앞 행의 탭을 훔친다.** 「작아서 못 누름」이 「눌렀는데 다른
 * 게 열림」이 되는 것은 개선이 아니다. 그래서 이 자리의 처방은 값 층(행 간격)
 * 이고, 이 스펙은 보이는 rect 를 잰다.
 */

const MIN_TARGET = 24;

/** 교차 도메인 엣지가 있는 볼트 — 이게 없으면 검사 대상 DOM 이 태어나지 않는다. */
const CROSS_DOMAIN_VAULT: Record<string, string> = {
  "project.md": [
    "---",
    "kind: project",
    "slug: coupling-platform",
    "title: Coupling Platform",
    "contains:",
    "  - coupling-orders",
    "  - coupling-settlement",
    "---",
    "",
    "# Coupling Platform",
    "",
    "교차 도메인 엣지를 가진 최소 볼트 — 밀집 행 재현용.",
    "",
  ].join("\n"),
  "domains/orders.md": [
    "---",
    "kind: domain",
    "slug: coupling-orders",
    "title: Orders",
    "contains:",
    "  - coupling-checkout",
    "  - coupling-cart-pricing",
    "  - coupling-order-history",
    "---",
    "",
    "# Orders",
    "",
    "주문 도메인.",
    "",
  ].join("\n"),
  "domains/settlement.md": [
    "---",
    "kind: domain",
    "slug: coupling-settlement",
    "title: Settlement",
    "contains:",
    "  - coupling-invoice",
    "  - coupling-payout-ledger",
    "  - coupling-tax-report",
    "---",
    "",
    "# Settlement",
    "",
    "정산 도메인.",
    "",
  ].join("\n"),
  // 주문 → 정산 세 갈래. `insights.ts` 가 쌍마다 예시를 3개까지 모으므로
  // 이 셋이 그대로 세로로 쌓인 세 줄이 된다 — 재현하려는 밀집 행이 그것이다.
  "capabilities/checkout.md": capability("coupling-checkout", "Checkout", "coupling-orders", [
    "coupling-invoice",
  ]),
  "capabilities/cart-pricing.md": capability(
    "coupling-cart-pricing",
    "Cart pricing",
    "coupling-orders",
    ["coupling-payout-ledger"],
  ),
  "capabilities/order-history.md": capability(
    "coupling-order-history",
    "Order history",
    "coupling-orders",
    ["coupling-tax-report"],
  ),
  "capabilities/invoice.md": capability("coupling-invoice", "Invoice", "coupling-settlement", []),
  "capabilities/payout-ledger.md": capability(
    "coupling-payout-ledger",
    "Payout ledger",
    "coupling-settlement",
    [],
  ),
  "capabilities/tax-report.md": capability(
    "coupling-tax-report",
    "Tax report",
    "coupling-settlement",
    [],
  ),
};

/**
 * `relates` 를 쓰는 이유 — 웹 파생기(`derive-ontology-from-vault`)가 역량의
 * 교차 엣지로 읽는 키가 그것이다. `depends_on` 은 스키마의 역량 키지만 이
 * 파생기가 읽는 것은 `dependencies`(프로젝트 키)라, 역량에 `depends_on` 을
 * 적으면 **엣지가 조용히 0개**가 된다(실측: 관계 8 = 컨테인먼트뿐, 격자 없음).
 * 이 스펙의 주제가 아니므로 여기서는 실제로 엣지가 되는 키를 쓴다.
 */
function capability(slug: string, title: string, domain: string, relates: string[]): string {
  return [
    "---",
    "kind: capability",
    `slug: ${slug}`,
    `title: ${title}`,
    `domain: ${domain}`,
    ...(relates.length ? ["relates:", ...relates.map((d) => `  - ${d}`)] : []),
    "---",
    "",
    `# ${title}`,
    "",
    `${title} 역량.`,
    "",
  ].join("\n");
}

interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isExampleLink: boolean;
}

/** 볼트를 물리고 「경계」 탭의 상세를 펼친 뒤, 그 화면의 타깃 전수를 돌려준다. */
async function openCouplingDetail(page: Page): Promise<Target[]> {
  await stubDirectoryPicker(page, CROSS_DOMAIN_VAULT);
  await seedFirstRunSeen(page);

  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 20_000 });

  await page.goto("/ko/ontology/insights/?tab=boundaries&guides=off");
  await page.waitForLoadState("networkidle");

  // 콜드스타트 카드가 떴다면 볼트가 안 실린 것이다 — 아래 단언이 그 자리에서 터진다.
  await expect(page.getByTestId("domain-coupling-grid")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("domain-coupling-cell").first().click();
  await expect(page.getByTestId("domain-coupling-pair")).toBeVisible();

  return page.evaluate(() => {
    const panel =
      document.querySelector('[id^="insights-tabpanel"]') ?? document.body;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden";
    };
    return Array.from(panel.querySelectorAll('a[href], button:not([disabled])'))
      .filter(visible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id:
            el.getAttribute("data-testid") ||
            (el.textContent || "").trim().slice(0, 24) ||
            el.tagName,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          isExampleLink:
            el.getAttribute("data-testid") === "domain-coupling-example-link",
        };
      });
  });
}

const centerDistance = (a: Target, b: Target) =>
  Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2));

test.describe("밀집 행 타깃 크기 (WCAG 2.5.8 AA)", () => {
  test("도메인 결합 상세의 예시 링크가 24px 본칙 또는 간격 예외를 만족한다", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1512, height: 900 });
    const targets = await openCouplingDetail(page);
    const examples = targets.filter((t) => t.isExampleLink);

    // ★ 빈 집합 위에서 놀지 않는다는 증거 ① — 잴 것이 실제로 렌더됐는가.
    //   이 게이트가 태어난 이유가 «그 행이 안 뜨면 조용히 통과» 였다.
    expect(
      examples.length,
      "예시 링크가 없다 — 볼트가 안 실렸거나 칸이 안 펼쳐졌다. 위반이 없는 게 아니라 미측정이다.",
    ).toBeGreaterThanOrEqual(4);

    // ★ 증거 ② — 그중 **세로로 겹쳐 쌓인 이웃**이 실제로 있는가. 밀집 행이
    //   한 줄로 펴지면(예: 예시가 1건뿐인 볼트) 이 검사는 아무것도 안 본다.
    const stacked = examples.some((a) =>
      examples.some(
        (b) =>
          a !== b &&
          Math.abs(a.x - b.x) < 1 &&
          Math.abs(a.y - b.y) > 1 &&
          Math.abs(a.y - b.y) < 60,
      ),
    );
    expect(stacked, "세로로 쌓인 예시 링크 이웃이 없다 — 밀집 행을 재고 있지 않다.").toBe(true);

    const violations = examples
      .map((target) => {
        if (target.w >= MIN_TARGET && target.h >= MIN_TARGET) return null;
        const nearest = targets
          .filter((other) => other !== target)
          .reduce<{ other: Target; d: number } | null>((best, other) => {
            const d = centerDistance(target, other);
            return !best || d < best.d ? { other, d } : best;
          }, null);
        if (nearest && nearest.d >= MIN_TARGET) return null;
        return (
          `  "${target.id}" ${target.w.toFixed(1)}×${target.h.toFixed(1)}px · ` +
          `가장 가까운 타깃("${nearest?.other.id ?? "-"}") 중심 거리 ` +
          `${nearest?.d.toFixed(1) ?? "-"}px (필요 ≥ ${MIN_TARGET})`
        );
      })
      .filter((line): line is string => line !== null);

    expect(
      violations,
      `WCAG 2.5.8 미달 — 24×24 본칙도, 중심 거리 ${MIN_TARGET}px 간격 예외도 못 넘겼다.\n` +
        `히트 확장(.touch-hit-expand)으로 덮지 말 것 — 행 피치보다 큰 확장은 뒤 행이 ` +
        `앞 행의 탭을 훔친다.\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
