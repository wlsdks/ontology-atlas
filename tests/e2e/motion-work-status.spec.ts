import { expect, test, type Page } from "@playwright/test";

import { HARNESS_SOURCE_ROOT, installHarnessRuntime, mountHarnessVault } from "./harness-tab-fixture";

async function holdSourceReads(page: Page) {
  await page.addInitScript((sourceRoot: string) => {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
    }).__TAURI_INTERNALS__;
    const inner = internals.invoke.bind(internals);
    const held: Array<() => void> = [];
    const probe = window as unknown as { __releaseSource(count: number): number };
    const holding = () => {
      try {
        return sessionStorage.getItem("motion-hold-source") === "1";
      } catch {
        return false;
      }
    };
    probe.__releaseSource = (count) => {
      const batch = held.splice(0, count);
      for (const resume of batch) resume();
      return batch.length;
    };
    internals.invoke = (command, args = {}) => {
      if (!holding() || String((args as { rootPath?: unknown }).rootPath ?? "") !== sourceRoot) {
        return inner(command, args);
      }
      return new Promise((resolve, reject) => {
        held.push(() => inner(command, args).then(resolve, reject));
      });
    };
  }, HARNESS_SOURCE_ROOT);
}

async function watchStageShifts(page: Page) {
  await page.evaluate(() => {
    const probe = window as unknown as { __stageShifts: number };
    probe.__stageShifts = 0;
    const stages = document.querySelector('[data-testid="harness-scan-progress"] ol');
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{ sources: Array<{ node: Node | null }> }>) {
        if (entry.sources.some((source) => source.node && stages?.contains(source.node))) probe.__stageShifts += 1;
      }
    }).observe({ type: "layout-shift" });
  });
}

async function openHeldScan(page: Page) {
  await installHarnessRuntime(page);
  await holdSourceReads(page);
  await mountHarnessVault(page);
  await page.evaluate(() => sessionStorage.setItem("motion-hold-source", "1"));
  await page.goto("/ko/architecture/?view=coverage&guides=off");
  const panel = page.getByTestId("harness-scan-progress");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  return panel;
}

const release = (page: Page, count: number) =>
  page.evaluate((n) => (window as unknown as { __releaseSource(count: number): number }).__releaseSource(n), count);

test.describe("WorkStatus in the harness scan", () => {
  test("a stage moves waiting to running to done in one glyph with no layout shift", async ({ page }) => {
    const panel = await openHeldScan(page);
    const item = panel.locator('[data-harness-stage="hooks"]');
    await expect(item).toHaveAttribute("data-harness-stage-state", "ahead");
    await watchStageShifts(page);
    await item.locator("[data-work-glyph]").evaluate((element) => {
      (element as unknown as { __probe: boolean }).__probe = true;
    });

    const seen = new Set<string>();
    await expect
      .poll(
        async () => {
          await release(page, 1);
          const state = (await item.getAttribute("data-harness-stage-state")) ?? "gone";
          const phase = (await item.locator("[data-work-phase]").getAttribute("data-work-phase")) ?? "gone";
          seen.add(phase);
          return state;
        },
        { timeout: 20_000, intervals: [50] },
      )
      .toBe("done");

    const settled = await item.evaluate((element) => {
      const glyph = element.querySelector("[data-work-glyph]") as unknown as { __probe?: boolean } | null;
      return {
        sameGlyph: glyph?.__probe === true,
        drawn: element.querySelector("[data-drawn]")?.getAttribute("data-drawn") ?? null,
        live: element.querySelectorAll("[role], [aria-live]").length,
        shifts: (window as unknown as { __stageShifts: number }).__stageShifts,
      };
    });
    test.info().annotations.push({ type: "work-status", description: JSON.stringify({ ...settled, seen: [...seen] }) });
    expect(seen.has("running")).toBe(true);
    expect(settled).toEqual({ sameGlyph: true, drawn: "draw", live: 0, shifts: 0 });
  });

  test("the scan bar moves on transform, never on width", async ({ page }) => {
    const panel = await openHeldScan(page);
    const fill = panel.locator("[data-work-fill]");
    const facts = await fill.evaluate((element) => ({
      transition: getComputedStyle(element).transitionProperty,
      width: (element as HTMLElement).style.width,
      laidOut: (element as HTMLElement).offsetWidth,
      track: (element.parentElement as HTMLElement).offsetWidth,
    }));
    expect(facts.transition).toContain("transform");
    expect(facts.transition).not.toContain("width");
    expect(facts.width).toBe("");
    expect(facts.laidOut).toBe(facts.track);

    await fill.evaluate((element) => {
      const probe = window as unknown as { __fillFrames: Array<{ t: number; scale: number }> };
      probe.__fillFrames = [];
      const tick = (t: number) => {
        probe.__fillFrames.push({ t, scale: new DOMMatrixReadOnly(getComputedStyle(element).transform).a });
        if (probe.__fillFrames.length < 600) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await expect
      .poll(
        async () => {
          await release(page, 1);
          return fill.evaluate((element) => {
            const frames = (window as unknown as { __fillFrames: Array<{ scale: number }> }).__fillFrames;
            return getComputedStyle(element).opacity === "1" && frames.some((frame) => frame.scale > 0.05);
          });
        },
        { timeout: 20_000, intervals: [50] },
      )
      .toBe(true);
    const frames = await page.evaluate(() => (window as unknown as { __fillFrames: Array<{ t: number; scale: number }> }).__fillFrames);
    let total = 0;
    let largest = 0;
    for (let index = 1; index < frames.length; index += 1) {
      const step = Math.abs(frames[index].scale - frames[index - 1].scale);
      const interval = frames[index].t - frames[index - 1].t;
      total += step;
      largest = Math.max(largest, interval > 0 ? step * (16.7 / interval) : step);
    }
    const mfs = total > 0 ? largest / total : 1;
    test.info().annotations.push({ type: "fill-mfs", description: mfs.toFixed(3) });
    expect(total).toBeGreaterThan(0);
    expect(mfs).toBeLessThanOrEqual(0.27);
  });
});

test.describe("WorkStatus under reduced motion", () => {
  test("the spin and the sweep stand still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const panel = await openHeldScan(page);
    const sweep = await panel.locator(".motion-work-sweep").evaluate((element) => {
      const style = getComputedStyle(element);
      return { name: style.animationName, transform: style.transform };
    });
    expect(sweep).toEqual({ name: "none", transform: "none" });
    await expect.poll(() => release(page, 1).then(() => panel.locator(".motion-work-spin").count()), { timeout: 20_000, intervals: [50] }).toBeGreaterThan(0);
    const still = await panel.evaluate((root) =>
      [...root.querySelectorAll(".motion-work-spin, .motion-work-sweep")].map((element) => {
        const style = getComputedStyle(element);
        return { name: style.animationName, transform: style.transform };
      }),
    );
    expect(still.length).toBeGreaterThan(0);
    for (const entry of still) expect(entry).toEqual({ name: "none", transform: "none" });
  });
});
