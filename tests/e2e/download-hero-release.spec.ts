import { expect, test, type CDPSession, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { liveInstances } from "./heap-census";

async function heroOnCanvas(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const stage = document.querySelector('[data-testid="gateway-hero-object"]');
    return stage?.getAttribute("data-hero-engine") === "three" && stage.querySelector("canvas") !== null;
  });
}

async function roundTripToGuide(page: Page): Promise<void> {
  await page.getByTestId("gateway-nav-guide").click();
  await page.getByTestId("gateway-doc-body").waitFor();
  await page.goBack();
  await heroOnCanvas(page);
}

async function census(cdp: CDPSession): Promise<{ domNodes: number; webgl2Contexts: number }> {
  const webgl2Contexts = await liveInstances(cdp, "WebGL2RenderingContext");
  const { nodes } = await cdp.send("Memory.getDOMCounters");
  return { domNodes: nodes, webgl2Contexts };
}

test("five visits to /download keep one WebGL context and leave no page behind", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFirstRunSeen(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/en/download/?hero=three", { waitUntil: "load" });
  await heroOnCanvas(page);

  await roundTripToGuide(page);
  const first = await census(cdp);
  for (let trip = 2; trip <= 5; trip += 1) await roundTripToGuide(page);
  const fifth = await census(cdp);

  expect(fifth.webgl2Contexts, "live WebGL2 contexts after five visits").toBeLessThanOrEqual(1);
  expect(
    fifth.domNodes,
    `DOM nodes after the first round trip ${first.domNodes}, after the fifth ${fifth.domNodes}`,
  ).toBeLessThanOrEqual(Math.ceil(first.domNodes * 1.05));
});
