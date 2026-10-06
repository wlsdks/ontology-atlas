import { expect, test } from "@playwright/test";
import { waitForPageSettled } from "./settle";

test("returning from Library releases retired renderers and their detached panes", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "DOM ownership is measured through Chromium CDP");
  const cdp = await page.context().newCDPSession(page);
  await page.goto("/en/topology/?guides=off");
  let visits = 0;
  const cycle = async () => {
    await page.locator('nav a[href*="/en/library/"]').first().click();
    await expect(page.getByTestId("library-constellation")).toBeVisible();
    await page.waitForFunction(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="library-constellation"]');
      const gl = canvas?.getContext("webgl2");
      return gl !== null && gl !== undefined && gl.getParameter(gl.CURRENT_PROGRAM) !== null;
    });
    visits += 1;
    await page.locator('nav a[href*="/en/topology/"]').first().click();
    await waitForPageSettled(page);
    await expect(page.getByTestId("library-constellation")).toHaveCount(0);
  };
  const retained = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    const counters = await cdp.send("Memory.getDOMCounters");
    const attached = await page.evaluate(() => {
      const count = (node: Node): number => 1 + [...node.childNodes].reduce((sum, child) => sum + count(child), 0)
        + (node instanceof Element && node.shadowRoot ? count(node.shadowRoot) : 0);
      return count(document);
    });
    return { ...counters, attached, retired: counters.nodes - attached };
  };
  await cycle();
  await cycle();
  const before = await retained();
  for (let visit = 0; visit < 5; visit++) await cycle();
  const after = await retained();
  expect(visits).toBe(7);
  expect(before.nodes).toBeGreaterThan(0);
  console.log(`[library-disposal] ${JSON.stringify({ before, after })}`);
  expect(after.retired - before.retired).toBeLessThanOrEqual(16);
  expect(after.jsEventListeners - before.jsEventListeners).toBeLessThanOrEqual(2);
});
