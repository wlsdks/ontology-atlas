import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **The step that says "press this dot" may not cover the dot.**
 *
 * Measured at 1200×863: entering the interactive step painted the tour card at x 420–780,
 * y 307–555 — the centred "no anchor yet" placement — with the lit node inside that rectangle.
 * It moved aside on the next animation frame, so every earlier gate, which measured after the
 * map had settled, read a card that cleared the node.
 *
 * Two fixes meet here and this spec is the barrier for both: the step's opening paint now seeds
 * its anchor from the map's own probe (`GuidedTourOverlay`), and the placement accepts a side
 * only when the placed card clears the node plus the name it wears under itself
 * (`computeCardPlacement`, `avoidTarget`). The measurement is taken twice for that reason —
 * the moment the step appears, and again once the map is still.
 *
 * 1200×863 is not an arbitrary window: it is the app at a laptop-sized window, where the card
 * (360 wide, ~250 tall) and the map's centre are close enough that a wrong side lands on the
 * node. `guided-tour.spec.ts` covers the same step at 1440×900 against the node's *name*.
 */
const VIEWPORT = { width: 1200, height: 863 };

/** The card's box, and the lit node's box in the same viewport coordinates. */
async function readCardAgainstLitNode(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const probe = window.__atlasMap;
    const cardEl = document.querySelector<HTMLElement>('[data-testid="guided-tour-card"]');
    const canvasEl = document.querySelector<HTMLElement>('[data-testid="ontology-map-canvas"]');
    if (!probe || !cardEl || !canvasEl) return null;
    const canvas = canvasEl.getBoundingClientRect();
    const cut = document.querySelector<HTMLElement>('[data-testid="guided-tour-cutout"]');
    // The lit node is the one under the cutout when there is one; otherwise the project node,
    // which is what this step's anchor resolves to when a folder holds no domain.
    const nodes = probe.nodes();
    let lit = nodes.find((n) => n.id.startsWith("project:")) ?? nodes[0];
    if (cut) {
      const box = cut.getBoundingClientRect();
      const cx = box.left + box.width / 2 - canvas.left;
      const cy = box.top + box.height / 2 - canvas.top;
      lit = nodes.reduce((best, n) =>
        Math.hypot(n.x - cx, n.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? n : best,
      );
    }
    const name = probe.labels().find((l) => l.nodeId === lit.id);
    const card = cardEl.getBoundingClientRect();
    // The node plus the name hanging under it — what the card has to clear.
    const node = {
      left: canvas.left + lit.x - lit.radius,
      right: canvas.left + lit.x + lit.radius,
      top: canvas.top + lit.y - lit.radius,
      bottom: canvas.top + (name ? Math.max(lit.y + lit.radius, name.maxY) : lit.y + lit.radius),
    };
    return {
      lit: lit.label,
      hasName: Boolean(name),
      node,
      card: { left: card.left, right: card.right, top: card.top, bottom: card.bottom },
      overlaps:
        card.left < node.right && card.right > node.left && card.top < node.bottom && card.bottom > node.top,
    };
  });
}

test("the interactive tour card never sits on the node it asks you to press (1200×863)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORT);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page);

  await page.getByTestId("topology-tour-button").click();
  const overlay = page.getByTestId("guided-tour-overlay");
  await expect(page.getByTestId("guided-tour-card")).toBeVisible();

  // welcome → nodes → relations → try-click
  for (const step of ["nodes", "relations", "try-click"]) {
    await page.getByTestId("guided-tour-next").first().click();
    await expect(overlay).toHaveAttribute("data-tour-step", step);
  }
  await expect(page.getByTestId("guided-tour-waiting")).toBeVisible();

  // The opening paint — no settling wait, because the defect lived in the first frames.
  const opening = await readCardAgainstLitNode(page);
  expect(opening, "지도 계기나 카드를 못 읽었다").not.toBeNull();
  expect(
    opening!.overlaps,
    `단계가 열리는 순간 카드(${JSON.stringify(opening!.card)})가 켜진 노드 ${opening!.lit}(${JSON.stringify(opening!.node)})를 덮는다`,
  ).toBe(false);

  // And once the camera has come to rest.
  await waitForMapStill(page);
  const settled = await readCardAgainstLitNode(page);
  expect(settled!.hasName, `켜진 노드 ${settled!.lit} 의 이름이 안 그려졌다`).toBe(true);
  expect(
    settled!.overlaps,
    `지도가 멈춘 뒤에도 카드(${JSON.stringify(settled!.card)})가 켜진 노드 ${settled!.lit}(${JSON.stringify(settled!.node)})를 덮는다`,
  ).toBe(false);
});
