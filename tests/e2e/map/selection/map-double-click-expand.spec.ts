import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { openMapOnApp } from "../open-map-on-app";
import { storefrontSampleFiles } from "../storefront-sample-files";
import { waitForMapStill } from "../../settle";

/** A repeated click never becomes an undo: two taps in the double-click window must not deselect. */
type Probe = {
  dial: () => { owns: boolean; clusters: Array<{ domainId: string; chip: { x: number; y: number } }> };
  selection: () => { nodeId: string | null };
};

test("a double-click keeps the selection and does not undo it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await installDesktopRailRuntime(page, storefrontSampleFiles(), undefined, { replaceFixture: true });
  await openMapOnApp(page, "/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
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
  expect(at, "the order domain was not found in the dial").not.toBeNull();
  const openBefore = new URL(page.url()).searchParams.get("open");
  await page.mouse.dblclick(at!.px, at!.py);
  await expect.poll(selected, { timeout: 20_000, message: "the second tap of the double-click undid the selection" }).toBe("domain:order");
  // The overview opens nothing: the expanded parents in the address stay as they were.
  expect(new URL(page.url()).searchParams.get("open")).toBe(openBefore);

  // A second double-click on the same domain keeps it selected too.
  await waitForMapStill(page, { what: "camera" });
  const again = await chip();
  await page.mouse.dblclick(again!.px, again!.py);
  await waitForMapStill(page, { what: "camera" });
  expect(await selected()).toBe("domain:order");
});
