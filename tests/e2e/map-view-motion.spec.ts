import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForMapStill } from "./settle";

type ViewFrame = { views: string[]; overlay: number | null };

function sampleViewFrames(page: Page, to: string) {
  return page.evaluate(
    (arriving) =>
      new Promise<ViewFrame[]>((resolve) => {
        const frames: ViewFrame[] = [];
        let settled = 0;
        const tick = () => {
          const overlay = document.querySelector('[data-testid="map-layout-morph"]');
          const frame = {
            views: [...document.querySelectorAll('[data-testid="topology-map-view"]')].map((el) => el.getAttribute("data-map-view") ?? ""),
            overlay: overlay ? Number(getComputedStyle(overlay).opacity) : null,
          };
          frames.push(frame);
          settled = frame.overlay === null && frame.views.length === 1 && frame.views[0] === arriving ? settled + 1 : 0;
          if (settled < 6) requestAnimationFrame(tick);
          else resolve(frames);
        };
        requestAnimationFrame(tick);
      }),
    to,
  );
}

async function chooseView(page: Page, choice: string, to: string) {
  await page.getByTestId("topology-view-3d").click();
  const option = page.getByTestId(`topology-view-3d-choice-${choice}`);
  await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
  const frames = sampleViewFrames(page, to);
  await option.click();
  return frames;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.galaxy", "off");
    window.localStorage.setItem("atlas.appearance.view3d", "off");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page);
});

test("a view switch never shows a frame without a picture of the map", async ({ page }) => {
  for (const [from, to] of [["map", "territories"], ["territories", "map"]] as const) {
    const frames = await chooseView(page, to === "map" ? "flat" : to, to);
    const bare = frames.filter((frame) => frame.views.length === 0 && !(frame.overlay && frame.overlay > 0));
    expect(bare, `${from} → ${to}: frames with neither a view nor the overlay`).toEqual([]);
    expect(frames.some((frame) => frame.overlay !== null), `${from} → ${to}: the switch cut without the overlay`).toBe(true);
    expect(frames.at(-1)).toEqual({ views: [to], overlay: null });
  }
});

test("closing the inspector lands the utility lane in place, on the toolbar's one clock", async ({ page }) => {
  const transition = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('[data-testid="topology-top-toolbar"]')!);
    const list = (value: string) => value.match(/[a-z-]+\([^)]*\)|[^,\s][^,]*/g)?.map((part) => part.trim()) ?? [];
    return { durations: list(cs.transitionDuration), timings: list(cs.transitionTimingFunction) };
  });
  expect(new Set(transition.durations).size, "left and right move on different clocks").toBe(1);
  expect(new Set(transition.timings).size, "left and right move on different curves").toBe(1);

  const node = await page.evaluate(() => {
    const map = (window as unknown as { __atlasMap: { nodes: () => { kind: string; x: number; y: number; hidden: boolean }[] } }).__atlasMap;
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const target = map.nodes().find((n) => n.kind === "domain" && !n.hidden && n.x > 520 && n.x < 1000)!;
    return { x: canvas.x + target.x, y: canvas.y + target.y };
  });
  await page.mouse.click(node.x, node.y);
  await expect(page.getByTestId("map-detail-panel")).toBeVisible();
  await expect(page.getByTestId("topology-utility-action-lane")).toHaveCount(0);

  const lane = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const xs: number[] = [];
        const start = performance.now();
        const tick = () => {
          const el = document.querySelector('[data-testid="topology-utility-action-lane"]');
          if (el) {
            const box = el.getBoundingClientRect();
            xs.push(Math.round(box.left + box.width / 2));
          }
          if (performance.now() - start < 700) requestAnimationFrame(tick);
          else resolve(xs);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.getByTestId("map-detail-panel-close").click();
  const centres = await lane;
  expect(centres.length, "the utility lane never came back").toBeGreaterThan(0);
  expect(Math.max(...centres) - Math.min(...centres), `the lane slid after it appeared: ${centres.join(",")}`).toBeLessThanOrEqual(1);
});
