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
    const nodes = probe.nodes();
    const lit = nodes.find((n) => n.kind === "domain") ?? nodes.find((n) => n.kind === "project");
    if (!lit) return null;
    const cutBox = cut?.getBoundingClientRect();
    const targetX = canvas.left + lit.x;
    const targetY = canvas.top + lit.y;
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
      cutout: cutBox?.toJSON() ?? null,
      targetInCutout: Boolean(cutBox && targetX >= cutBox.left && targetX <= cutBox.right &&
        targetY >= cutBox.top && targetY <= cutBox.bottom),
      hasName: Boolean(name),
      node,
      card: { left: card.left, right: card.right, top: card.top, bottom: card.bottom },
      overlaps:
        card.left < node.right && card.right > node.left && card.top < node.bottom && card.bottom > node.top,
    };
  });
}

test("tour clearance identifies the requested domain even when the cutout points elsewhere", async ({ page }) => {
  await page.setContent(`<main>
    <canvas data-testid="ontology-map-canvas" style="position:fixed;inset:0"></canvas>
    <div data-testid="guided-tour-card" style="position:fixed;left:200px;top:200px;width:100px;height:100px"></div>
    <div data-testid="guided-tour-cutout" style="position:fixed;left:80px;top:80px;width:40px;height:40px"></div>
  </main>`);
  await page.evaluate(() => {
    Object.defineProperty(window, "__atlasMap", { value: {
      nodes: () => [
        { id: "project:shop", kind: "project", label: "Shop", x: 100, y: 100, radius: 10 },
        { id: "domain:catalog", kind: "domain", label: "Catalog", x: 250, y: 250, radius: 10 },
      ],
      labels: () => [],
    } });
  });
  const covered = await readCardAgainstLitNode(page);
  expect(covered?.lit).toBe("Catalog");
  expect(covered?.overlaps).toBe(true);
  expect(covered?.targetInCutout).toBe(false);
  await page.getByTestId("guided-tour-cutout").evaluate((el) => {
    el.style.left = "230px";
    el.style.top = "230px";
  });
  await page.getByTestId("guided-tour-card").evaluate((el) => { el.style.left = "400px"; });
  const clear = await readCardAgainstLitNode(page);
  expect(clear?.lit).toBe("Catalog");
  expect(clear?.targetInCutout).toBe(true);
  expect(clear?.overlaps).toBe(false);
});

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
  expect(opening, "The map target and card must be measurable").not.toBeNull();
  expect(opening!.targetInCutout, JSON.stringify(opening)).toBe(true);
  expect(
    opening!.overlaps,
    `단계가 열리는 순간 카드(${JSON.stringify(opening!.card)})가 켜진 노드 ${opening!.lit}(${JSON.stringify(opening!.node)})를 덮는다`,
  ).toBe(false);

  // And once the camera has come to rest.
  await waitForMapStill(page);
  const settled = await readCardAgainstLitNode(page);
  expect(settled!.targetInCutout, JSON.stringify(settled)).toBe(true);
  expect(settled!.hasName, `켜진 노드 ${settled!.lit} 의 이름이 안 그려졌다`).toBe(true);
  expect(
    settled!.overlaps,
    `지도가 멈춘 뒤에도 카드(${JSON.stringify(settled!.card)})가 켜진 노드 ${settled!.lit}(${JSON.stringify(settled!.node)})를 덮는다`,
  ).toBe(false);
});
