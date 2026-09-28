import { expect, test, type Page } from "@playwright/test";

import { buttonVariants } from "@/shared/ui/button";
import { controlClass } from "@/shared/ui/control-class";

import { colorDistance, motionShares, rotationDegrees, startSampling, stopSampling, translateY } from "./motion-sampler";
import { waitFrames } from "./settle";

const DETACHED = {
  button: buttonVariants({ variant: "outline", size: "sm" }),
  chip: controlClass({ shape: "chip", hoverSurface: "lift" }),
  icon: controlClass({ shape: "icon", hoverSurface: "lift" }),
};
const FLUSH = {
  row: controlClass({ shape: "row", hoverSurface: "lift" }),
  tab: controlClass({ shape: "segment", hoverSurface: "lift" }),
};
const CHEVRON = "select-chevron size-4 flex-none data-[open=true]:[transform:rotate(180deg)]";

async function mountProbes(page: Page) {
  await page.goto("/en/changelog/");
  await page.evaluate(
    ({ detached, flush, chevron }) => {
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;inset:auto 0 0 0;z-index:2147483647;display:flex;gap:16px;padding:24px;background:var(--color-canvas)";
      for (const [name, cls] of Object.entries({ ...detached, ...flush })) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.style.width = "96px";
        b.dataset.probe = name;
        b.textContent = name;
        host.append(b);
      }
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", chevron);
      svg.dataset.probe = "chevron";
      svg.dataset.open = "false";
      host.append(svg);
      document.body.append(host);
    },
    { detached: DETACHED, flush: FLUSH, chevron: CHEVRON },
  );
  await waitFrames(page, 4);
}

async function fastMs(page: Page) {
  return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-fast")));
}

async function press(page: Page, name: string) {
  const sel = `[data-probe="${name}"]`;
  const box = (await page.locator(sel).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await waitFrames(page, 12);
  await startSampling(page, { tracks: [{ name, selector: sel }] });
  await waitFrames(page, 2);
  const t0 = await page.evaluate(() => performance.now());
  await page.mouse.down();
  await waitFrames(page, 30);
  await page.mouse.up();
  await waitFrames(page, 30);
  const rec = await stopSampling(page);
  const values = rec.tracks[name].map((v) => v!);
  return { rec, t0, values };
}

test.describe("press and hover motion", () => {
  test("detached controls travel 1px on the translate clock and return", async ({ page }) => {
    await mountProbes(page);
    const fast = await fastMs(page);
    for (const name of Object.keys(DETACHED)) {
      const { rec, t0, values } = await press(page, name);
      const ys = values.map((v) => translateY(v.translate));
      const shares = motionShares(ys, rec.frames, t0);
      test.info().annotations.push({ type: `press:${name}`, description: JSON.stringify({ ...shares, fast }) });
      expect(Math.max(...ys), name).toBe(1);
      expect(ys.at(-1), name).toBe(0);
      expect(shares.ffs, name).toBeGreaterThan(0);
      expect(shares.ffs, name).toBeLessThanOrEqual(0.25);
      expect(shares.mfs, name).toBeLessThanOrEqual(0.35);
      expect(rec.layoutShifts, name).toHaveLength(0);
    }
  });

  test("flush controls answer with a surface step in the first frame and no travel", async ({ page }) => {
    await mountProbes(page);
    for (const name of Object.keys(FLUSH)) {
      const { rec, t0, values } = await press(page, name);
      const start = rec.frames.findIndex((t) => t >= t0);
      const surface = values.map((v) => colorDistance(v.backgroundColor, values[0].backgroundColor));
      expect(Math.max(...values.map((v) => translateY(v.translate))), name).toBe(0);
      expect(Math.max(...surface.slice(start, start + 3)), name).toBeGreaterThan(0);
    }
  });

  test("the select chevron rotates through intermediate values", async ({ page }) => {
    await mountProbes(page);
    await startSampling(page, { tracks: [{ name: "chevron", selector: '[data-probe="chevron"]' }] });
    await waitFrames(page, 2);
    const t0 = await page.evaluate(() => performance.now());
    await page.evaluate(() => ((document.querySelector('[data-probe="chevron"]') as SVGElement).dataset.open = "true"));
    await waitFrames(page, 30);
    const rec = await stopSampling(page);
    const degrees = rec.tracks.chevron.map((v) => Math.abs(rotationDegrees(v!)));
    const shares = motionShares(degrees, rec.frames, t0);
    test.info().annotations.push({ type: "press:chevron", description: JSON.stringify(shares) });
    expect(Math.max(...degrees)).toBeCloseTo(180, 0);
    expect(shares.intermediate).toBeGreaterThan(0);
  });

  test.describe("reduced motion", () => {
    test("translate stays none while the colour still changes", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await mountProbes(page);
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
      for (const name of Object.keys(DETACHED)) {
        const { values } = await press(page, name);
        const first = values[0];
        expect([...new Set(values.map((v) => v.translate))], name).toEqual(["none"]);
        expect(values.some((v) => colorDistance(v.backgroundColor, first.backgroundColor) > 0 || v.boxShadow !== first.boxShadow), name).toBe(true);
      }
    });
  });
});
