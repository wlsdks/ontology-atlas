import { expect, test, type CDPSession, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * Leaving `/download` gives back its WebGL context and its page. Before the hero borrowed one
 * renderer for the session, every visit kept one more context and about 1,200 DOM nodes (web
 * memory audit, 2026-09-27). Counted after a forced collection: at most one WebGL2 context after
 * five round trips, and DOM nodes within 5% of the first round trip (a leaked page is about 100%).
 * `?hero=three` forces WebGL on the software-rendered CI browser; reduced motion draws each visit
 * once instead of every frame, which a software renderer could not keep up with.
 */

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
  await cdp.send("HeapProfiler.collectGarbage");
  const { nodes } = await cdp.send("Memory.getDOMCounters");
  const { result: prototype } = await cdp.send("Runtime.evaluate", {
    expression: "WebGL2RenderingContext.prototype",
  });
  const { objects } = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.objectId! });
  const { result: count } = await cdp.send("Runtime.callFunctionOn", {
    objectId: objects.objectId!,
    functionDeclaration: "function () { return this.length; }",
    returnByValue: true,
  });
  await cdp.send("Runtime.releaseObject", { objectId: objects.objectId! });
  await cdp.send("Runtime.releaseObject", { objectId: prototype.objectId! });
  return { domNodes: nodes, webgl2Contexts: count.value as number };
}

test("round trips from /download keep one WebGL context and a flat DOM", async ({ page }) => {
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
