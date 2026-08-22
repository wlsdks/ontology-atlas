import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The trail round trip** (promoted from the 2026-08-13 walkthrough — zero gates
 * measured this journey).
 *
 * The map's visit trail is a feature the owner chose personally (footprint numbers,
 * the trail popover), yet no check measured "it accumulates → the list is right →
 * jumping back works → clearing works" end to end. The keyboard walk spec covers
 * arrow-key movement only and never looks at the trail UI.
 *
 * Three steps are accumulated by moving through popover rows (re-clicking the same
 * node is a separate contract that opens the document, so it is not used — the first
 * attempt exited to the docs view that way, measured).
 */
test("걸어온 길 — 쌓이고, 목록이 맞고, 뒤로 점프하고, 지워진다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);

  const selection = () =>
    page.evaluate(
      () => (window as unknown as { __atlasMap: { selection: () => { nodeId: string | null } } }).__atlasMap.selection().nodeId,
    );

  // Step 1 — click the orders domain (canvas coordinates)
  const t = await page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: { nodes: () => Array<{ hidden: boolean; label: string; x: number; y: number }> } }).__atlasMap;
    const box = document.querySelector('[data-testid="topology-map-v2-canvas"]')?.getBoundingClientRect();
    const n = m?.nodes().find((n) => !n.hidden && n.label === "주문");
    return n && box ? { px: box.left + n.x, py: box.top + n.y } : null;
  });
  expect(t, "주문 도메인을 못 찾았다 — 공회전").not.toBeNull();
  await page.mouse.click(t!.px, t!.py);
  await expect
    .poll(selection, { timeout: 15_000, message: "domain:order 로 안 걸어갔다" })
    .toBe("domain:order");

  // Steps 2 and 3 — move via popover rows
  await page.getByText("장바구니", { exact: true }).first().click();
  await expect
    .poll(selection, { timeout: 15_000, message: "capability:cart 로 안 걸어갔다" })
    .toBe("capability:cart");
  await page.getByText("주문서 작성", { exact: true }).first().click();
  await expect
    .poll(selection, { timeout: 15_000, message: "capability:checkout 로 안 걸어갔다" })
    .toBe("capability:checkout");

  // The chip counts three steps
  const chip = page.getByText(/걸어온 길 · 3/);
  await expect(chip, "자취 칩이 걸음 수를 안 센다").toBeVisible();
  await chip.click();
  await page.waitForTimeout(700);

  // The list — here now, one step back, two steps back
  await expect(page.getByText("지금 여기")).toBeVisible();
  await expect(page.getByText("1걸음 전")).toBeVisible();
  await expect(page.getByText("2걸음 전")).toBeVisible();

  // Jump back — pressing the two-steps-back (orders) row returns the selection
  await page.getByText("주문", { exact: true }).last().click();
  await page.waitForTimeout(900);
  expect(await selection(), "자취 행이 그 노드로 데려가지 않았다").toBe("domain:order");

  // Clear — the chip disappears
  await page.getByText(/걸어온 길 · \d/).click();
  await page.waitForTimeout(500);
  await page.getByText("지우기", { exact: true }).click();
  await page.waitForTimeout(700);
  await expect(page.getByText(/걸어온 길 · \d/)).toHaveCount(0);
});
