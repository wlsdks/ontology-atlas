import { expect, test, type Page } from "@playwright/test";

import { SPRING, springEasing, springSettleMs } from "../../src/shared/motion/spring";

const TABS = "/en/agents/?guides=off";

async function installSampler(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __indicatorShifts: number;
      __sampleIndicator: (selector: string, frames: number) => Promise<{ t: number; x: number }[]>;
    };
    w.__indicatorShifts = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { sources?: { node?: Node | null }[] }[]) {
        const strip = document.querySelector("[role=tablist]");
        if (entry.sources?.some((source) => source.node && strip?.contains(source.node))) w.__indicatorShifts += 1;
      }
    }).observe({ type: "layout-shift" });
    w.__sampleIndicator = (selector, frames) =>
      new Promise((resolve) => {
        const out: { t: number; x: number }[] = [];
        const tick = (t: number) => {
          const el = document.querySelector<HTMLElement>(selector);
          out.push({ t, x: el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m41 : NaN });
          if (out.length < frames) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      });
  });
}

function shares(samples: { t: number; x: number }[]) {
  const start = samples[0]!.x;
  const end = samples[samples.length - 1]!.x;
  const travel = Math.abs(end - start);
  const steps = samples.slice(1).map((s, i) => {
    const interval = s.t - samples[i]!.t || 16.7;
    return (Math.abs(s.x - samples[i]!.x) / travel) * (16.7 / interval);
  });
  const first = steps.findIndex((v) => v > 0);
  const jump = Math.max(...samples.slice(1).map((s, i) => Math.abs(s.x - samples[i]!.x))) / travel;
  return { travel, jump, ffs: first < 0 ? 0 : steps[first]!, mfs: Math.max(...steps), moving: steps.filter((v) => v > 0).length };
}

async function switchAndSample(page: Page) {
  const strip = page.getByRole("tablist").first();
  await expect(strip.locator("[data-selection-indicator]")).toHaveAttribute("data-animated", "true");
  expect(await page.evaluate(() => (window as never as { __indicatorShifts: number }).__indicatorShifts)).toBe(0);
  const indicator = "[role=tablist] [data-selection-indicator]";
  const next = strip.getByRole("tab", { selected: false }).last();
  const sampling = page.evaluate((s) => (window as never as { __sampleIndicator: (s: string, n: number) => Promise<{ t: number; x: number }[]> }).__sampleIndicator(s, 40), indicator);
  await next.click();
  const samples = await sampling;
  test.info().annotations.push({ type: "samples", description: samples.map((s) => s.x.toFixed(1)).join(" ") });
  return shares(samples);
}

test.describe("selection indicator", () => {
  test("places without a layout shift, then slides between tabs on the control spring", async ({ page }) => {
    await installSampler(page);
    await page.goto(TABS);
    const strip = page.getByRole("tablist").first();
    await expect(strip.locator("[data-selection-indicator]")).toHaveCount(1);

    const timing = await strip.locator("[data-selection-indicator]").evaluate((el, easing) => {
      const probe = document.createElement("div");
      probe.style.transitionTimingFunction = easing;
      document.body.append(probe);
      const expected = getComputedStyle(probe).transitionTimingFunction;
      probe.remove();
      const style = getComputedStyle(el);
      return { actual: style.transitionTimingFunction, expected, duration: style.transitionDuration };
    }, springEasing(SPRING.control));
    expect(timing.actual).toBe(timing.expected);
    expect(timing.duration).toBe(`${springSettleMs(SPRING.control) / 1000}s`);

    const measured = await switchAndSample(page);
    test.info().annotations.push({ type: "indicator", description: JSON.stringify(measured) });
    expect(measured.travel).toBeGreaterThan(0);
    expect(measured.moving).toBeGreaterThan(1);
    expect(measured.ffs).toBeLessThanOrEqual(0.15);
    expect(measured.mfs).toBeLessThanOrEqual(0.27);
  });

  test("jumps without intermediate positions under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installSampler(page);
    await page.goto(TABS);
    const measured = await switchAndSample(page);
    expect(measured.travel).toBeGreaterThan(0);
    expect(measured.jump).toBeGreaterThan(0.95);
  });
});
