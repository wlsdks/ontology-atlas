import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForAnimationsDone, waitForMapStill } from "../../settle";

type ViewFrame = { views: string[]; overlay: number | null;
};

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
    to);
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
        window.localStorage.setItem("atlas.appearance.structure", "off");
        window.localStorage.setItem("atlas.appearance.view3d", "off");
    });
    await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
    await waitForMapStill(page);
});
test("a view switch never shows a frame without a picture of the map", async ({ page }) => {
    for (const [from, to] of [["map", "hex"], ["hex", "map"]] as const) {
        const frames = await chooseView(page, to === "map" ? "flat" : to, to);
        const bare = frames.filter((frame) => frame.views.length === 0 && !(frame.overlay && frame.overlay > 0));
        expect(bare, `${from} → ${to}: frames with neither a view nor the overlay`).toEqual([]);
        expect(frames.some((frame) => frame.overlay !== null), `${from} → ${to}: the switch cut without the overlay`).toBe(true);
        expect(frames.at(-1)).toEqual({ views: [to], overlay: null });
    }
});
test("the chrome under the inspector fades where it stands and returns in place, on the toolbar's one clock", async ({ page }) => {
    const transition = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('[data-testid="topology-top-toolbar"]')!);
        const list = (value: string) => value.match(/[a-z-]+\([^)]*\)|[^,\s][^,]*/g)?.map((part) => part.trim()) ?? [];
        return { durations: list(cs.transitionDuration), timings: list(cs.transitionTimingFunction) };
    });
    expect(new Set(transition.durations).size, "left and right move on different clocks").toBe(1);
    expect(new Set(transition.timings).size, "left and right move on different curves").toBe(1);
    const chrome = ["topology-utility-action-lane", "map-analysis-status-entry", "topology-fit-control", "topology-shortcuts-help-button"];
    const read = () => page.evaluate((ids) => ids.map((id) => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
        if (!el) return { id, box: null, opacity: null, inert: false };
        const b = el.getBoundingClientRect();
        return { id, box: [b.x, b.y, b.width, b.height].map(Math.round), opacity: Number(getComputedStyle(el).opacity), inert: el.closest("[inert]") !== null };
    }), chrome);
    const resting = await read();
    expect(resting.filter((r) => r.box === null).map((r) => r.id), "chrome missing at rest, so the spec measures nothing").toEqual([]);
    const node = await page.evaluate(() => {
        const map = window.__atlasMap!;
        const dial = map.dial!();
        if (!("texts" in dial)) throw new Error("the branch frame is not drawn");
        const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
        const target = dial.texts.find((text) => text.role === "domain" && text.box.minX > 520 && text.box.maxX < 1000)!;
        return { x: canvas.x + (target.box.minX + target.box.maxX) / 2, y: canvas.y + (target.box.minY + target.box.maxY) / 2 };
    });
    await page.mouse.click(node.x, node.y);
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await expect.poll(async () => (await read()).map((r) => r.opacity), { message: "a piece of chrome under the panel did not fade out" }).toEqual(chrome.map(() => 0));
    const receded = await read();
    for (const [i, r] of receded.entries()) {
        expect(r.inert, `${r.id} still takes input while faded`).toBe(true);
        expect(r.box, `${r.id} moved when the inspector opened`).toEqual(resting[i]!.box);
    }
    const lane = page.evaluate(() => new Promise<number[]>((resolve) => {
        const xs: number[] = [];
        const start = performance.now();
        const tick = () => {
            const el = document.querySelector('[data-testid="topology-utility-action-lane"]');
            if (el) {
                const box = el.getBoundingClientRect();
                xs.push(Math.round(box.left + box.width / 2));
            }
            if (performance.now() - start < 700)
                requestAnimationFrame(tick);
            else
                resolve(xs);
        };
        requestAnimationFrame(tick);
    }));
    await page.getByTestId("map-detail-panel-close").click();
    const centres = await lane;
    expect(centres.length, "the utility lane never came back").toBeGreaterThan(0);
    expect(Math.max(...centres) - Math.min(...centres), `the lane slid after it appeared: ${centres.join(",")}`).toBeLessThanOrEqual(1);
    await expect.poll(async () => (await read()).map((r) => r.opacity), { message: "the chrome did not come back" }).toEqual(chrome.map(() => 1));
    expect((await read()).map((r) => r.box)).toEqual(resting.map((r) => r.box));
});
