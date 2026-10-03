import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **A double-click never undoes the click** (map round, 2026-09-19).
 *
 * Measured before the fix on the order domain: two pointer taps within the
 * double-click window selected the node and then deselected it — the map ended
 * with nothing selected, and the person's most natural "open this" gesture had
 * done nothing. A repeated click never becomes an undo. On the flat dial
 * (2026-10-02) the overview folds nothing, so a double-click there selects and
 * opens nothing; folding and its double-click live inside a realm.
 */
type Probe = {
  dial: () => { owns: boolean; clusters: Array<{ domainId: string; chip: { x: number; y: number } }> };
  selection: () => { nodeId: string | null };
};

test("더블클릭은 선택을 지키지, 선택을 되돌리지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapStill(page);
  const chip = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __atlasMap: Probe }).__atlasMap;
      const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
      const dial = m.dial();
      const c = dial.owns ? dial.clusters.find((cluster) => cluster.domainId === "domain:order") : undefined;
      return c ? { px: box.left + c.chip.x, py: box.top + c.chip.y } : null;
    });
  const selected = () => page.evaluate(() => (window as unknown as { __atlasMap: Probe }).__atlasMap.selection().nodeId);

  const at = await chip();
  expect(at, "주문 도메인을 다이얼에서 못 찾았다").not.toBeNull();
  const openBefore = new URL(page.url()).searchParams.get("open");
  await page.mouse.dblclick(at!.px, at!.py);
  await expect.poll(selected, { timeout: 20_000, message: "더블클릭의 두 번째 탭이 선택을 되돌렸다" }).toBe("domain:order");
  // The overview opens nothing: the expanded parents in the address stay as they were.
  expect(new URL(page.url()).searchParams.get("open")).toBe(openBefore);

  // A second double-click on the same domain keeps it selected too.
  await waitForMapStill(page, { what: "camera" });
  const again = await chip();
  await page.mouse.dblclick(again!.px, again!.py);
  await waitForMapStill(page, { what: "camera" });
  expect(await selected()).toBe("domain:order");
});
