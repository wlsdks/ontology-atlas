import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForBoxStill, waitForMapStill } from "./settle";

/**
 * **No control in the map's top toolbar is drawn over another** (owner report,
 * 2026-09-24, installed app at 1512x949).
 *
 * With the meaning-review panel open (about 430px of the window), a path chosen and
 * one node visited, the right half of the toolbar collapsed into itself: refresh,
 * focus, automations, conversation, history, search and the mascot were painted on
 * top of one another with stray glyph fragments between them. The cause was
 * structural: the search lane centred itself on the map and the utility lane pinned
 * itself to the right edge, as two absolute boxes that never measured each other.
 *
 * The invariant is written per control rather than per lane: every button, link and
 * status chip in the toolbar keeps its own rectangle, stays inside the map it sits
 * on (not under the rail, not under the panel), and every tile keeps the chrome
 * tile height. It runs with the panel closed and open, because opening the panel is
 * what takes the width away.
 */

const WIDTHS = [1040, 1280, 1512, 1920, 2560] as const;
const HEIGHT = 949;

const ACTIVITY_LINE = JSON.stringify({
  v: 1,
  at: new Date(Date.now() - 20 * 60_000).toISOString(),
  tool: "add_concept",
  target: "capabilities/checkout",
  summary: "add_concept capability:capabilities/checkout",
  agent: "codex-acp",
  why: null,
});

interface ToolbarReport {
  controls: number;
  overlaps: string[];
  outside: string[];
  offTile: string[];
  pathLabelWidth: number | null;
}

async function measureToolbar(page: Page): Promise<ToolbarReport> {
  return page.evaluate(() => {
    const lanes = [
      ...document.querySelectorAll<HTMLElement>(
        // The two lanes, plus the right rail under them (fit, tour, shortcuts, replay):
        // a second toolbar line that grows too tall lands on the rail.
        '[data-testid="topology-search-action-lane"], [data-testid="topology-utility-action-lane"], [data-testid="topology-utility-rail"]',
      ),
    ];
    const canvas = document.querySelector<HTMLElement>('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const name = (el: Element) =>
      (el as HTMLElement).dataset.testid ??
      el.getAttribute("aria-label") ??
      el.closest("[data-testid]")?.getAttribute("data-testid") ??
      el.tagName;
    // Every pressable thing, plus each status chip's own box. A chip holds pressables
    // of its own, so a pair where one contains the other is not an overlap.
    const controls = lanes
      .flatMap((lane) => [...lane.querySelectorAll<HTMLElement>('button, a[href], [role="status"]')])
      .filter(shown);
    const overlaps: string[] = [];
    for (let i = 0; i < controls.length; i += 1) {
      for (let j = i + 1; j < controls.length; j += 1) {
        const a = controls[i]!;
        const b = controls[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ix > 0.5 && iy > 0.5) overlaps.push(`${name(a)} x ${name(b)} (${Math.round(ix)}px)`);
      }
    }
    const outside = controls
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < canvas.left - 0.5 || r.right > canvas.right + 0.5 || r.top < -0.5;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${name(el)} [${Math.round(r.left)}, ${Math.round(r.right)}] map [${Math.round(canvas.left)}, ${Math.round(canvas.right)}]`;
      });
    // The row's own boxes: one tile height for all of them.
    const probe = document.createElement("div");
    probe.style.height = "var(--chrome-tile-size)";
    document.querySelector("[data-testid=\"topology-search-action-lane\"]")!.appendChild(probe);
    const tile = probe.getBoundingClientRect().height;
    probe.remove();
    const rowBoxes = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="topology-utility-action-row"] > *, [data-testid="topology-status-chip-group"] > *',
      ),
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="topology-search-action-lane"] button[data-utility-action-token-contract]',
      ),
    ]
      .filter(shown)
      .filter((el) => getComputedStyle(el).position !== "absolute");
    const offTile = rowBoxes
      .filter((el) => Math.abs(el.getBoundingClientRect().height - tile) > 1)
      .map((el) => `${name(el)} ${Math.round(el.getBoundingClientRect().height)}px (tile ${Math.round(tile)}px)`);
    const label = document.querySelector('[data-testid="topology-path-chip-label"]');
    return {
      controls: controls.length,
      overlaps,
      outside,
      offTile,
      // A label folded away in a narrow toolbar (the outcome speaks alone,
      // `TopologyPathChip`) is not a crushed one; a shown label must be readable.
      pathLabelWidth:
        label && getComputedStyle(label).display !== "none" ? Math.round(label.getBoundingClientRect().width) : null,
    };
  });
}

test("the map's top toolbar never draws one control over another, with or without the review panel", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: HEIGHT });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, { ".ontology-atlas/activity.jsonl": `${ACTIVITY_LINE}\n` });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page).catch(() => {});

  // The owner's state: a path source chosen (which is also the first visit on the
  // trail), then its target picked on the map.
  await page.goto("/ko/topology/?guides=off&e2e=1&mode=path&pathFrom=capabilities/checkout&p=capabilities/checkout", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("topology-trail-chip")).toBeVisible({ timeout: 30_000 });
  await waitForMapStill(page).catch(() => {});
  const canvasBox = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const target = await page.evaluate(() => {
    const map = (window as unknown as { __atlasMap?: { nodes(): Array<{ id: string; x: number; y: number }> } }).__atlasMap;
    return map?.nodes().find((node) => node.id === "capability:invoice") ?? null;
  });
  expect(target, "the path target is not on the map").not.toBeNull();
  await page.mouse.click(canvasBox.x + target!.x, canvasBox.y + target!.y);
  await expect(page.getByTestId("topology-path-chip-copy-packet")).toBeVisible();
  await expect(page.getByTestId("agent-activity-bell")).toBeVisible({ timeout: 30_000 });

  const failures: string[] = [];
  for (const panel of ["closed", "open"] as const) {
    if (panel === "open") {
      await page.setViewportSize({ width: 1512, height: HEIGHT });
      await page.getByTestId("topology-meaning-workbench-toggle").click();
      await expect(page.getByTestId("topology-meaning-workbench-toggle")).toHaveAttribute("aria-pressed", "true");
    }
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      await page.waitForTimeout(500);
      // The status row re-lays itself out with a layout animation when its share of
      // the line changes; measure the resting toolbar, not a frame of that motion.
      for (const testId of ["topology-search-action-lane", "agent-activity-status-trigger"]) {
        const locator = page.getByTestId(testId);
        if (await locator.isVisible()) await waitForBoxStill(locator, { frames: 10 });
      }
      const report = await measureToolbar(page);
      expect(report.controls, `${width} panel=${panel}: no toolbar controls measured`).toBeGreaterThan(8);
      console.log(
        `[toolbar] ${width} panel=${panel} controls=${report.controls} overlaps=${report.overlaps.length} outside=${report.outside.length} offTile=${report.offTile.length} pathLabel=${report.pathLabelWidth}px`,
      );
      if (process.env.TOOLBAR_SHOTS) {
        await page.screenshot({
          path: `${process.env.TOOLBAR_SHOTS}/toolbar-${panel}-${width}.png`,
          clip: { x: 0, y: 0, width, height: 180 },
        });
      }
      for (const overlap of report.overlaps) failures.push(`${width} panel=${panel}: overlap ${overlap}`);
      for (const outside of report.outside) failures.push(`${width} panel=${panel}: outside the map ${outside}`);
      for (const off of report.offTile) failures.push(`${width} panel=${panel}: off the tile height ${off}`);
      if (report.pathLabelWidth !== null && report.pathLabelWidth < 40) {
        failures.push(`${width} panel=${panel}: the path label has ${report.pathLabelWidth}px left to be read`);
      }
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

/*
 * **The toolbar comes to rest at every width, not only at the five above** (2026-09-24).
 *
 * When the agent status joined the bell inside the utility row, a reserve that hid the
 * status whenever the search lane did not fit beside it became a loop: hiding it
 * shrank the row, so the lane fit, so the status came back, so the lane no longer
 * fit. It oscillated only in a band a few pixels wide where the lane's text width sat
 * on that edge, which is why the five widths above passed locally and one of them
 * failed on CI's fonts ("box never stopped moving"). A sweep across the band where
 * the lanes meet with the panel open finds the edge whatever the fonts measure.
 */
test("the toolbar settles at every width while the panel is open — no lane reflows forever", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: HEIGHT });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, { ".ontology-atlas/activity.jsonl": `${ACTIVITY_LINE}\n` });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page).catch(() => {});
  await page.goto("/ko/topology/?guides=off&e2e=1&mode=path&pathFrom=capabilities/checkout&p=capabilities/checkout", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("topology-trail-chip")).toBeVisible({ timeout: 30_000 });
  await waitForMapStill(page).catch(() => {});
  // The owner's state, as above: the path's target picked on the map.
  const canvasBox = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const target = await page.evaluate(() => {
    const map = (window as unknown as { __atlasMap?: { nodes(): Array<{ id: string; x: number; y: number }> } }).__atlasMap;
    return map?.nodes().find((node) => node.id === "capability:invoice") ?? null;
  });
  expect(target, "the path target is not on the map").not.toBeNull();
  await page.mouse.click(canvasBox.x + target!.x, canvasBox.y + target!.y);
  await expect(page.getByTestId("topology-path-chip-copy-packet")).toBeVisible();
  // Attached, not visible: the loop this guards against hid the bell with the status.
  await expect(page.getByTestId("agent-activity-bell")).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId("topology-meaning-workbench-toggle").click();
  await expect(page.getByTestId("topology-meaning-workbench-toggle")).toHaveAttribute("aria-pressed", "true");

  const restless: string[] = [];
  for (let width = 1240; width <= 1720; width += 6) {
    await page.setViewportSize({ width, height: HEIGHT });
    // Count layout changes of the two lanes over 30 frames, after 10 to settle.
    const changes = await page.evaluate(async () => {
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const read = () =>
        ["topology-search-action-lane", "topology-utility-action-row"]
          .map((id) => {
            const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
            if (!el) return "none";
            const r = el.getBoundingClientRect();
            return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}`;
          })
          .join("|");
      for (let i = 0; i < 10; i += 1) await frame();
      let last = read();
      let count = 0;
      for (let i = 0; i < 30; i += 1) {
        await frame();
        const next = read();
        if (next !== last) count += 1;
        last = next;
      }
      return count;
    });
    if (changes > 0) {
      restless.push(`${width}: ${changes} layout changes in 30 frames`);
      continue;
    }
    // At rest, the same per-control invariant as the five widths above.
    const report = await measureToolbar(page);
    for (const overlap of report.overlaps) restless.push(`${width}: overlap ${overlap}`);
    for (const outside of report.outside) restless.push(`${width}: outside the map ${outside}`);
    for (const off of report.offTile) restless.push(`${width}: off the tile height ${off}`);
  }
  expect(restless, restless.join("\n")).toEqual([]);
});
