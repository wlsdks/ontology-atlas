import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * Scroll budget, headed at DPR 2: ≤ 2% dropped frames, nothing over 50 ms. Local only
 * (`DOWNLOAD_SCROLL_BUDGET=1`): a CI runner has no GPU. `DOWNLOAD_SCROLL_BUDGET_OUT` keeps the numbers.
 */
test.skip(!process.env.DOWNLOAD_SCROLL_BUDGET, "local headed GPU measurement; set DOWNLOAD_SCROLL_BUDGET=1");
test.use({ headless: false, deviceScaleFactor: 2 });
test.describe.configure({ timeout: 900_000 });

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1040, height: 720 },
  { width: 1920, height: 1080 },
] as const;
const RUNS = 3;
const WHEEL_PX = 30;
const WHEEL_MS = 30;

interface Leg {
  frames: number;
  dropped: number;
  droppedShare: number;
  maxIntervalMs: number;
  longTasks: number;
  maxLongTaskMs: number;
  periodMs: number;
}

async function arm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __budget: { intervals: number[]; longTasks: number[]; on: boolean; last: number };
    };
    w.__budget = { intervals: [], longTasks: [], on: true, last: 0 };
    const tick = (t: number): void => {
      if (!w.__budget.on) return;
      if (w.__budget.last) w.__budget.intervals.push(t - w.__budget.last);
      w.__budget.last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__budget.longTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: false });
  });
}

async function disarm(page: Page): Promise<Leg> {
  return page.evaluate(() => {
    const b = (window as unknown as { __budget: { intervals: number[]; longTasks: number[]; on: boolean } }).__budget;
    b.on = false;
    const sorted = [...b.intervals].sort((x, y) => x - y);
    const periodMs = sorted[Math.floor(sorted.length * 0.1)] ?? 16.7;
    let dropped = 0;
    for (const i of b.intervals) dropped += Math.max(0, Math.round(i / periodMs) - 1);
    const frames = b.intervals.length;
    return {
      frames,
      dropped,
      droppedShare: frames ? dropped / (frames + dropped) : 0,
      maxIntervalMs: Math.round(Math.max(0, ...b.intervals) * 10) / 10,
      longTasks: b.longTasks.filter((d) => d > 50).length,
      maxLongTaskMs: Math.round(Math.max(0, ...b.longTasks)),
      periodMs: Math.round(periodMs * 100) / 100,
    };
  });
}

function scrollState(page: Page) {
  return page.evaluate(() => {
    const host =
      [...document.querySelectorAll<HTMLElement>("*")].find(
        (el) => el.scrollHeight - el.clientHeight > 2 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
      ) ?? document.scrollingElement!;
    return { top: host.scrollTop, max: host.scrollHeight - host.clientHeight };
  });
}

async function wheelTo(page: Page, stop: (top: number) => boolean): Promise<void> {
  for (let i = 0; i < 2000; i += 1) {
    const { top, max } = await scrollState(page);
    if (top >= max - 1 || stop(top)) return;
    await page.mouse.wheel(0, WHEEL_PX);
    // measurement window: part of the leg
    await page.waitForTimeout(WHEEL_MS);
  }
}

async function openPage(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await seedFirstRunSeen(page);
  await page.goto("/en/download/?guides=off", { waitUntil: "load" });
  await expect(page.getByTestId("gateway-hero")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // measurement window: part of the leg
  await page.waitForTimeout(3000);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
}

async function brisk(page: Page, viewport: { width: number; height: number }): Promise<Leg> {
  await openPage(page, viewport);
  await arm(page);
  await wheelTo(page, () => false);
  // measurement window: part of the leg
  await page.waitForTimeout(300);
  return disarm(page);
}

async function parked(page: Page, viewport: { width: number; height: number }): Promise<Leg> {
  await openPage(page, viewport);
  await arm(page);
  // measurement window: part of the leg
  await page.waitForTimeout(2000);
  const figureTop = await page.evaluate(() => {
    const host =
      [...document.querySelectorAll<HTMLElement>("*")].find(
        (el) => el.scrollHeight - el.clientHeight > 2 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
      ) ?? document.scrollingElement!;
    const figure = document.querySelector('[data-testid="download-conduction-figure"]')!;
    return figure.getBoundingClientRect().top + host.scrollTop - 80;
  });
  await wheelTo(page, (top) => top >= figureTop);
  await page.getByTestId("download-conduction-figure").scrollIntoViewIfNeeded();
  const figure = page.getByTestId("download-conduction-figure");
  await expect(figure).toHaveAttribute("data-conduction-state", /finished|still/, { timeout: 150_000 });
  const demoTop = await page.evaluate(() => {
    const host =
      [...document.querySelectorAll<HTMLElement>("*")].find(
        (el) => el.scrollHeight - el.clientHeight > 2 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
      ) ?? document.scrollingElement!;
    const demo = document.querySelector('[data-testid="gateway-demo-section"]')!;
    return demo.getBoundingClientRect().top + host.scrollTop - 80;
  });
  await wheelTo(page, (top) => top >= demoTop);
  // measurement window: part of the leg
  await page.waitForTimeout(4000);
  for (const id of ["download-change-figure", "download-start-figure"]) {
    const showpiece = page.getByTestId(id);
    const top = await showpiece.evaluate((element) => {
      const host =
        [...document.querySelectorAll<HTMLElement>("*")].find(
          (el) => el.scrollHeight - el.clientHeight > 2 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
        ) ?? document.scrollingElement!;
      return element.getBoundingClientRect().top + host.scrollTop - 80;
    });
    await wheelTo(page, (scrolled) => scrolled >= top);
    await expect(showpiece).toHaveAttribute("data-showpiece-state", /finished|still/, { timeout: 60_000 });
  }
  await wheelTo(page, () => false);
  // measurement window: part of the leg
  await page.waitForTimeout(1000);
  return disarm(page);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}


for (const viewport of VIEWPORTS) {
  for (const [name, leg] of [
    ["brisk", brisk],
    ["parked", parked],
  ] as const) {
    test(`${viewport.width}×${viewport.height} ${name}: ≤ 2% dropped, nothing over 50 ms`, async ({ browser }) => {
      const runs: Leg[] = [];
      for (let run = 0; run < RUNS; run += 1) {
        const context = await browser.newContext({ deviceScaleFactor: 2, viewport });
        const page = await context.newPage();
        runs.push(await leg(page, viewport));
        await context.close();
      }
      const key = `${viewport.width}x${viewport.height}-${name}`;
      const out = process.env.DOWNLOAD_SCROLL_BUDGET_OUT;
      if (out) {
        mkdirSync(path.dirname(out), { recursive: true });
        const results = existsSync(out) ? (JSON.parse(readFileSync(out, "utf8")) as Record<string, Leg[]>) : {};
        results[key] = runs;
        writeFileSync(out, JSON.stringify(results, null, 2));
      }
      console.log(key, JSON.stringify(runs));
      expect(runs.every((r) => r.frames > 60), "too few frames sampled — this leg would pass idle").toBe(true);
      expect(median(runs.map((r) => r.droppedShare)), `${key}: dropped-frame share`).toBeLessThanOrEqual(0.02);
      expect(median(runs.map((r) => r.maxIntervalMs)), `${key}: longest frame interval`).toBeLessThanOrEqual(50);
      expect(median(runs.map((r) => r.longTasks)), `${key}: long tasks over 50 ms`).toBe(0);
    });
  }
}
