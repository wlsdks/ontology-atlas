import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

/**
 * Three steps accumulate by moving through popover rows; re-clicking the same node opens the
 * document and exits to the docs view, so it is not used.
 */
test("the trail accumulates, lists correctly, jumps back and clears", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapStill(page);

  const selection = () =>
    page.evaluate(
      () => (window as unknown as { __atlasMap: { selection: () => { nodeId: string | null } } }).__atlasMap.selection().nodeId,
    );

  const clickNode = async (label: string) => {
    await waitForMapStill(page);
    const at = await page.evaluate((name) => {
      const m = (window as unknown as { __atlasMap?: { nodes: () => Array<{ hidden: boolean; label: string; x: number; y: number }> } }).__atlasMap;
      const box = document.querySelector('[data-testid="ontology-map-canvas"]')?.getBoundingClientRect();
      const n = m?.nodes().find((n) => !n.hidden && n.label === name);
      return n && box ? { px: box.left + n.x, py: box.top + n.y } : null;
    }, label);
    expect(at, `${label} was not found on the map, so the spec spins idle`).not.toBeNull();
    await page.mouse.click(at!.px, at!.py);
  };

  // Step 1 — click the orders domain (canvas coordinates)
  await clickNode("주문");
  await expect
    .poll(selection, { timeout: 15_000, message: "did not walk to domain:order" })
    .toBe("domain:order");

  // Step 2 — a domain's panel only counts what it contains, so the cart is clicked on the map.
  await clickNode("장바구니");
  await expect
    .poll(selection, { timeout: 15_000, message: "did not walk to capability:cart" })
    .toBe("capability:cart");
  // Step 3 — move via the panel's rows.
  await page.getByText("주문서 작성", { exact: true }).first().click();
  await expect
    .poll(selection, { timeout: 15_000, message: "did not walk to capability:checkout" })
    .toBe("capability:checkout");

  // The chip counts three steps
  const chip = page.getByText(/방문 기록 · 3/);
  await expect(chip, "the trail chip does not count steps").toBeVisible();
  await chip.click();
  // The rows below are `toBeVisible` assertions, which retry on their own — the
  // popover's reveal needs no sleep in front of them.

  // The list — here now, one step back, two steps back
  await expect(page.getByText("지금 여기")).toBeVisible();
  await expect(page.getByText("1개 전")).toBeVisible();
  await expect(page.getByText("2개 전")).toBeVisible();

  // Jump back — pressing the two-steps-back (orders) row returns the selection
  await page.getByText("주문", { exact: true }).last().click();
  await expect
    .poll(selection, { timeout: 15_000, message: "the trail row did not take us to that node" })
    .toBe("domain:order");

  /*
   * Clear — the chip disappears, and it now takes **two** presses. Discarding a walked trail
   * asks again before it throws the walk away (`topology.footprint.clearConfirmLabel`), which
   * landed with the map batch. This spec still pressed once and
   * then waited fifteen seconds for a chip that was never going to leave, so the failure read as
   * "clear is broken" when the product had grown a confirmation the walk did not answer.
   */
  await page.getByText(/방문 기록 · \d/).click();
  await page.getByText("지우기", { exact: true }).click();
  await page.getByText("한 번 더 누르면 지워요", { exact: true }).click();
  await expect(page.getByText(/방문 기록 · \d/)).toHaveCount(0);
});
