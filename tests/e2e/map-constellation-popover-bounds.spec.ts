import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForBoxStill, waitForMapStill } from "./settle";

/**
 * **The constellation popover hangs from its trigger and stays in the free map**
 * (owner report, 2026-09-25, installed app at 1512).
 *
 * The popover was pinned to the trigger's right edge at a fixed 320px. From `xl` the
 * search lane that holds the trigger sits at the free map's left edge, so the popover ran
 * about 284px left of its trigger: measured 260-580 with the trigger at 544-580 and the
 * INDEX panel ending at 388, and over the collapsed INDEX tab when INDEX was folded. The
 * same screen said "could not read your saved constellations" for a vault that had never
 * saved one, because this harness (like every capture made through it) left
 * `read_library_collections` unstubbed.
 *
 * Claims, at 1040, 1280 and 1512 with INDEX open and collapsed:
 * - the popover stays inside the free map (right of INDEX or its tab, inside the canvas),
 * - it intersects neither the INDEX panel nor the INDEX tab,
 * - its top hangs under the trigger and its horizontal span covers the trigger's centre,
 * - an absent constellations file reads as the empty state, not a read failure.
 */

const WIDTHS = [1040, 1280, 1512] as const;
const HEIGHT = 900;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
    };
    return {
      canvas: box('[data-testid="ontology-map-canvas"]'),
      indexPanel: box('[data-testid="topology-index-panel"]'),
      indexTab: box('[data-testid="topology-index-tab"]'),
      trigger: box('[data-testid="saved-constellations-open"]'),
      popover: box('[data-testid="saved-constellations-list"]'),
    };
  });
}

const intersects = (a: Box, b: Box) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
const fmt = (b: Box | null) => (b ? `[${Math.round(b.left)}-${Math.round(b.right)} × ${Math.round(b.top)}-${Math.round(b.bottom)}]` : "none");

test("the constellation popover stays in the free map beside INDEX, open and collapsed", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: HEIGHT });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page).catch(() => {});

  const failures: string[] = [];
  for (const index of ["expanded", "collapsed"] as const) {
    await page.goto(`/ko/topology/?guides=off&e2e=1${index === "collapsed" ? "&index=collapsed" : ""}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId(index === "expanded" ? "topology-index-panel" : "topology-index-tab")).toBeVisible({
      timeout: 30_000,
    });
    await waitForMapStill(page).catch(() => {});
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      const trigger = page.getByTestId("saved-constellations-open");
      await waitForBoxStill(trigger, { frames: 10 });
      await trigger.click();
      const popover = page.getByTestId("saved-constellations-list");
      await expect(popover).toBeVisible();
      await waitForBoxStill(popover, { frames: 6 });
      const where = `${width} index=${index}`;

      // An absent file is the empty state, never the read-failure notice.
      await expect(page.getByTestId("saved-constellations-load-error"), `${where}: read failure shown`).toHaveCount(0);
      await expect(popover.getByText("이 우주에 작업 범위를 남기세요")).toBeVisible();

      const m = await measure(page);
      console.log(
        `[constellation-popover] ${where} trigger=${fmt(m.trigger)} popover=${fmt(m.popover)} ` +
          `indexPanel=${fmt(m.indexPanel)} indexTab=${fmt(m.indexTab)} canvas=${fmt(m.canvas)}`,
      );
      if (process.env.CONSTELLATION_SHOTS) {
        await page.screenshot({ path: `${process.env.CONSTELLATION_SHOTS}/constellation-popover-${index}-${width}.png` });
      }
      if (!m.popover || !m.trigger || !m.canvas) {
        failures.push(`${where}: popover, trigger or canvas not drawn`);
      } else {
        const index = m.indexPanel ?? m.indexTab;
        const freeLeft = Math.max(m.canvas.left, index ? index.right : m.canvas.left);
        if (m.popover.left < freeLeft - 0.5) failures.push(`${where}: popover starts at ${Math.round(m.popover.left)}, left of the free map (${Math.round(freeLeft)})`);
        if (m.popover.right > m.canvas.right + 0.5) failures.push(`${where}: popover ends past the canvas`);
        if (m.indexPanel && intersects(m.popover, m.indexPanel)) failures.push(`${where}: popover covers the INDEX panel`);
        if (m.indexTab && intersects(m.popover, m.indexTab)) failures.push(`${where}: popover covers the INDEX tab`);
        const centre = (m.trigger.left + m.trigger.right) / 2;
        if (centre < m.popover.left || centre > m.popover.right) failures.push(`${where}: popover does not hang under its trigger`);
        if (m.popover.top < m.trigger.bottom - 0.5) failures.push(`${where}: popover starts above the trigger's bottom`);
      }
      await page.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});
