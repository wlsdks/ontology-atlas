import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * Target size in dense rows — measures WCAG 2.5.8 on **a site that only exists when
 * the data does**.
 *
 * **Why the accessibility ratchet never saw this violation.** `a11y-ratchet` opens 17
 * routes and runs axe. Its `target-size` baseline is **0** and really was 0 — but not
 * because there were no violations: **that site had never rendered**. The domain
 * coupling detail on the "boundaries" tab (a row of paired example links) appears only
 * when both conditions hold:
 *
 *   ① the vault must have **cross-domain edges** for the grid to have pressable cells,
 *   ② a person must **press** a cell for the detail to expand.
 *
 * The default sample vault lacks ①. So axe had never seen that DOM and the gate was
 * **green over an empty set**. This is a class of problem rather than one site — *a
 * gate whose eyes close depending on the data*.
 *
 * So this spec **reproduces** the violation: it mounts a vault with cross-domain edges
 * through the OPFS stub picker, presses a cell to actually render the row, and then
 * measures rects.
 *
 * **What is measured — WCAG 2.5.8 Target Size (Minimum), AA.** Either condition
 * passes (both must fail for a violation):
 *   - **The rule**: the target is at least 24×24 CSS px.
 *   - **The spacing exception**: a 24-diameter circle centred on the target meets no
 *     other target's circle → centre-to-centre distance ≥ 24.
 * (The inline exception applies only to links inside sentence flow. A list row is a
 * block occupying its own line, so it does not apply — measurement confirmed
 * `display: block`.)
 *
 * **Hit expansion (`.touch-hit-expand`) cannot fix it.** Attaching a 44px hit area
 * where the row pitch is 21px overlaps neighbours by 16px, and in DOM order **a later
 * row steals an earlier row's tap.** Turning "too small to press" into "pressed and
 * something else opened" is not an improvement. So the prescription here is the value
 * layer (row spacing), and this spec measures the visible rects.
 */

const MIN_TARGET = 24;

/** A vault with cross-domain edges — without it the DOM under test is never born. */
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
  // Three branches from orders to settlement. `insights.ts` collects up to 3 examples
  // per pair, so these three become three vertically stacked rows — the dense rows this
  // spec reproduces.
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
 * Why `relates`: it is the key the web deriver (`derive-ontology-from-vault`) reads as
 * a capability's cross edge. `depends_on` is the schema's capability key, but this
 * deriver reads `dependencies` (a project key), so writing `depends_on` on a capability
 * yields **silently zero edges** (measured: 8 relations, all containment, no grid).
 * That is not this spec's subject, so it uses the key that really becomes an edge.
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

/** Mounts the vault, expands the detail on the "boundaries" tab, and returns every target on that screen. */
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

  // A cold-start card means the vault did not load — the assertion below fails right
  // there.
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

    // Evidence ① that it is not idling on an empty set — did the thing being measured
    // actually render? This gate exists because "if that row does not appear, pass
    // quietly" was the previous behaviour.
    expect(
      examples.length,
      "예시 링크가 없다 — 볼트가 안 실렸거나 칸이 안 펼쳐졌다. 위반이 없는 게 아니라 미측정이다.",
    ).toBeGreaterThanOrEqual(4);

    // Evidence ② — do **vertically stacked neighbours** really exist among them? If the
    // dense rows flatten to a single line (a vault with only one example, say), this check
    // sees nothing.
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
