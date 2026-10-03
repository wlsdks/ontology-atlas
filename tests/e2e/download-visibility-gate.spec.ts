import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitFrames } from "./settle";
import { installFrameProbe, readFrameProbe, scrollHostTo } from "./download-frame-probe";

/** A drawing runs only while ≥ 20% of its section is visible; at rest nothing animates or holds a layer. */

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedFirstRunSeen(page);
  await installFrameProbe(page);
  await page.goto("/en/download/?guides=off", { waitUntil: "load" });
  await expect(page.getByTestId("gateway-hero")).toBeVisible();
}

async function showFigureShare(page: Page, ratio: number): Promise<void> {
  await page.evaluate((share) => {
    const figure = document.querySelector<HTMLElement>('[data-testid="download-conduction-figure"]')!;
    const host =
      [...document.querySelectorAll<HTMLElement>("*")].find(
        (el) =>
          el.scrollHeight - el.clientHeight > 2 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
      ) ?? document.scrollingElement!;
    const rect = figure.getBoundingClientRect();
    const viewTop = host === document.scrollingElement ? 0 : host.getBoundingClientRect().top;
    const viewBottom = viewTop + Math.min(host.clientHeight, innerHeight - viewTop);
    host.scrollTop += rect.top - (viewBottom - share * rect.height);
  }, ratio);
}

test.describe("download — every drawing stops out of view", () => {
  test("parked at the colophon, nothing draws, nothing animates and the loop has no client", async ({ page }) => {
    await open(page);
    // The hero's field starts after a second; there must be a loop to stop.
    await expect
      .poll(async () => (await readFrameProbe(page)).field, {
        message: "the field drew nothing in view — this spec would pass idle",
      })
      .toBeGreaterThan(1);

    await scrollHostTo(page, "bottom");
    await expect(page.locator("main footer")).toBeInViewport();
    await expect(page.locator('[data-showpiece-state="running"]')).toHaveCount(0, {
      timeout: 15_000,
    });
    // A few frames for the observers to report, then the parked window.
    await waitFrames(page, 4);
    const before = await readFrameProbe(page);
    // measurement window: AC-3 parks the page for 2 s and counts what draws in it.
    await page.waitForTimeout(2000);
    const after = await readFrameProbe(page);

    expect(after.hero - before.hero, "the hero drew while out of view").toBe(0);
    expect(after.field - before.field, "the field drew while the hero was out of view").toBe(0);
    expect(after.raf - before.raf, "a frame loop kept a client at the colophon").toBe(0);
    const running = await page.evaluate(() =>
      document
        .getAnimations()
            .filter((animation) => animation.playState === "running" && animation.timeline === document.timeline)
        .map((animation) => (animation as CSSAnimation).animationName || animation.id || "script"),
    );
    expect(running, "a time-based animation runs at the colophon").toEqual([]);

    await page.evaluate(() => {
      const host =
        [...document.querySelectorAll<HTMLElement>("*")].find(
          (el) =>
            el.scrollHeight - el.clientHeight > 2 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
        ) ?? document.scrollingElement!;
      host.scrollTop = 0;
    });
    await expect
      .poll(async () => (await readFrameProbe(page)).field - after.field, {
        message: "the field did not resume when the hero returned",
      })
      .toBeGreaterThan(0);
  });

  test("the conduction figure pauses at 19% visible and runs at 25%", async ({ page }) => {
    await open(page);
    const figure = page.getByTestId("download-conduction-figure");
    await showFigureShare(page, 0.25);
    await expect(figure).toHaveAttribute("data-conduction-state", "running");
    await showFigureShare(page, 0.19);
    await expect(figure).toHaveAttribute("data-conduction-state", "paused");
  });

  test("a finished figure holds no animation and no composited layer", async ({ page }) => {
    await open(page);
    const figure = page.getByTestId("download-conduction-figure");
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toHaveAttribute("data-conduction-state", "running");
    await figure.evaluate((element) => {
      for (const animation of element.getAnimations({ subtree: true })) animation.updatePlaybackRate(40);
    });
    await expect(figure).toHaveAttribute("data-conduction-state", "finished", { timeout: 30_000 });
    expect(await figure.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.getDocument", { depth: -1 });
    const tree = new Promise<{ layers?: { layerId: string; backendNodeId?: number }[] }>((resolve) =>
      cdp.once("LayerTree.layerTreeDidChange", resolve),
    );
    await cdp.send("LayerTree.enable");
    await page.evaluate(() => document.body.style.setProperty("outline", "0 solid transparent"));
    const { layers = [] } = await tree;
    const owned: string[] = [];
    for (const layer of layers) {
      if (!layer.backendNodeId) continue;
      const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: layer.backendNodeId });
      if (!object.objectId) continue;
      const { result } = await cdp.send("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration:
          "function () { const f = document.querySelector('[data-testid=\"download-conduction-figure\"]'); return f && f.contains(this) ? (this.getAttribute && (this.getAttribute('data-conduction-part') || this.tagName)) || 'node' : null; }",
        returnByValue: true,
      });
      if (!result.value) continue;
      const { compositingReasonIds = [] } = await cdp.send("LayerTree.compositingReasons", { layerId: layer.layerId });
      const held = compositingReasonIds.filter((reason) => !/overlap|squash|root|scroll|clip/i.test(reason));
      if (held.length > 0) owned.push(`${String(result.value)}: ${held.join(",")}`);
    }
    expect(layers.length, "no layer tree came back — this spec would pass idle").toBeGreaterThan(0);
    expect(owned, "the resting figure still holds a composited layer").toEqual([]);
  });
});
