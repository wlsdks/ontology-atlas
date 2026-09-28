import { expect, test, type Page } from "@playwright/test";

import type { AtlasMapProbe } from "./atlas-map-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled } from "./settle";

async function kilobytesPerFrame(page: Page, concepts: number): Promise<number> {
  await page.goto(`/ko/topology?synth=${concepts}&guides=off&e2e=1`);
  const canvas = page.getByTestId("ontology-map-canvas");
  await expect(canvas).toBeVisible();
  await waitForMapSettled(page);
  const domain = await page.evaluate(() => {
    const probe = (window as unknown as { __atlasMap?: AtlasMapProbe }).__atlasMap;
    const surface = document.querySelector('[data-testid="ontology-map-canvas"]');
    const rect = surface!.getBoundingClientRect();
    return (
      probe?.nodes().find(
        (n) => !n.hidden && n.kind === "domain" && document.elementFromPoint(rect.left + n.x, rect.top + n.y) === surface,
      ) ?? null
    );
  });
  expect(domain, `no domain in view at ${concepts} concepts`).not.toBeNull();
  const box = await canvas.boundingBox();
  await page.mouse.move(box!.x + domain!.x, box!.y + domain!.y, { steps: 3 });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __atlasMap?: AtlasMapProbe }).__atlasMap?.hover()))
    .toBe(domain!.id);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  const samples: number[] = [];
  for (let round = 0; round < 2; round += 1) {
    const framesBefore = await page.evaluate(() => (window as unknown as { __rafFrames: number }).__rafFrames);
    await cdp.send("HeapProfiler.startSampling", {
      samplingInterval: 4096,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    // measurement window: 3 s of hovered frames.
    await page.waitForTimeout(3_000);
    const { profile } = await cdp.send("HeapProfiler.stopSampling");
    const frames = (await page.evaluate(() => (window as unknown as { __rafFrames: number }).__rafFrames)) - framesBefore;
    let bytes = 0;
    const visit = (node: typeof profile.head) => {
      bytes += node.selfSize;
      node.children.forEach(visit);
    };
    visit(profile.head);
    expect(frames, `${concepts} concepts drew no frames while awake`).toBeGreaterThan(30);
    samples.push(bytes / 1024 / frames);
  }
  await cdp.detach();
  return Math.min(...samples);
}

test("an awake map allocates per frame far slower than its graph grows", async ({ page }) => {
  test.setTimeout(120_000);
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __rafFrames: number };
    w.__rafFrames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) =>
      raf((time) => {
        w.__rafFrames += 1;
        callback(time);
      });
  });
  const small = await kilobytesPerFrame(page, 300);
  const large = await kilobytesPerFrame(page, 3000);
  // Measured 2026-09-28: 2.3–3.0 healthy, 6.2–6.8 with per-frame graph rebuilds.
  expect(large / small, `KB per frame: ${small.toFixed(1)} at 300 concepts, ${large.toFixed(1)} at 3,000`).toBeLessThan(4);
});
