import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForBoxStill, waitForMapStill } from "./settle";

/**
 * **What the map's top toolbar opens lands in the free map, and its tiles hold still**
 * (owner, 2026-09-25: "the positions are odd, the buttons differ in size, and they
 * overlap").
 *
 * Five claims, each measured rather than looked at:
 *
 * 1. The trail popover is never drawn under the INDEX panel. It hung from the chip's
 *    right edge, so with the trail chip first in the lane its left 92px landed under
 *    INDEX, which painted above it (elementFromPoint at its left edge returned the
 *    INDEX rows).
 * 2. The tool tiles and the status chips share one row, and a view change never
 *    moves that row between lines. The search lane used to wrap as a whole when the
 *    chips made it 12px too wide, and choosing Galaxy (which hides expand-all) then
 *    made it fit, so every tile jumped a line. Whether the row shares the utility
 *    lane's line is the width's decision (round 2: chips wrapped under the tools
 *    made a three-line staircase), but it is the same decision in every view.
 * 3. The path chip's copy action is the same 24px icon button as its clear action.
 *    It measured 30x14, under the 24px target floor, with a border its sibling lacks.
 * 4. Keyboard: the view picker puts focus on the checked view when it opens and
 *    gives it back to the chip after a choice; the agent dock closes on Escape and
 *    returns focus to its toggle.
 * 5. The tour's try-click card covers no toolbar control (it stood over the second
 *    line and cut the path chip mid-word), and Escape leaves an exit frame instead of
 *    removing the overlay in one frame.
 */

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

/** The owner's state: a desktop folder, a path from checkout to invoice, one visit on the trail. */
async function openOwnerState(page: Page, width = 1512) {
  await page.setViewportSize({ width, height: HEIGHT });
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
  const canvasBox = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const target = await page.evaluate(() => {
    const map = (window as unknown as { __atlasMap?: { nodes(): Array<{ id: string; x: number; y: number }> } }).__atlasMap;
    return map?.nodes().find((node) => node.id === "capability:invoice") ?? null;
  });
  expect(target, "the path target is not on the map").not.toBeNull();
  await page.mouse.click(canvasBox.x + target!.x, canvasBox.y + target!.y);
  await expect(page.getByTestId("topology-path-chip-copy-packet")).toBeVisible();
  await expect(page.getByTestId("agent-activity-bell")).toHaveCount(1, { timeout: 30_000 });
}

/** Which test id is painted at fractions of a box — the popover must answer for itself. */
async function paintedAt(page: Page, testId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const r = el.getBoundingClientRect();
    const out: string[] = [];
    for (const fx of [0.04, 0.5, 0.96]) {
      for (const fy of [0.06, 0.5, 0.94]) {
        const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        if (!hit || !el.contains(hit)) {
          out.push(`(${fx},${fy}) → ${hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? hit?.tagName ?? "nothing"}`);
        }
      }
    }
    const index = document.querySelector('[data-testid="topology-index-panel"]')?.getBoundingClientRect();
    return {
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      covered: out,
      overIndex: index ? Math.max(0, Math.round(index.right - r.left)) : 0,
      offRight: Math.max(0, Math.round(r.right - window.innerWidth)),
    };
  }, testId);
}

test("the trail popover opens in the free map, never under INDEX", async ({ page }) => {
  test.setTimeout(180_000);
  await openOwnerState(page);
  // The trail chip first in the lane: the path is cleared, the visit stays.
  await page.getByTestId("topology-path-chip-clear").click();
  await expect(page.getByTestId("topology-path-chip")).toHaveCount(0);
  const failures: string[] = [];
  for (const width of [1280, 1512, 1040]) {
    await page.setViewportSize({ width, height: HEIGHT });
    await waitForBoxStill(page.getByTestId("topology-trail-chip-trigger"), { frames: 10 });
    await page.getByTestId("topology-trail-chip-trigger").click();
    const popover = page.getByTestId("topology-trail-chip-popover");
    await expect(popover).toBeVisible();
    await waitForBoxStill(popover, { frames: 6 });
    const report = await paintedAt(page, "topology-trail-chip-popover");
    console.log(`[trail] ${width} popover=${JSON.stringify(report.rect)} covered=${report.covered.length} overIndex=${report.overIndex}`);
    if (process.env.TOOLBAR_SHOTS) {
      await page.screenshot({ path: `${process.env.TOOLBAR_SHOTS}/trail-open-${width}.png`, clip: { x: 0, y: 0, width, height: 320 } });
    }
    for (const miss of report.covered) failures.push(`${width}: the popover is not what is painted at ${miss}`);
    if (report.overIndex > 0) failures.push(`${width}: the popover reaches ${report.overIndex}px under INDEX`);
    if (report.offRight > 0) failures.push(`${width}: the popover runs ${report.offRight}px off the window`);
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("the tools and chips share one row, and a view change does not move it between lines", async ({ page }) => {
  test.setTimeout(180_000);
  await openOwnerState(page);
  const failures: string[] = [];
  const tileTop = async () =>
    page.evaluate(() => {
      const top = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? null;
      return {
        view: top("topology-view-3d"),
        search: top("topology-concept-search"),
        trail: top("topology-trail-chip"),
        utility: top("topology-utility-action-row"),
      };
    });
  for (const [width, fold] of [[1280, false], [1512, false], [1920, false], [1512, true], [1920, true]] as const) {
    if (fold) {
      const folder = page.getByTestId("topology-index-fold");
      if (await folder.isVisible()) await folder.click();
    }
    await page.setViewportSize({ width, height: HEIGHT });
    await waitForBoxStill(page.getByTestId("topology-view-3d"), { frames: 10 });
    const flat = await tileTop();
    console.log(`[tiles] ${width}${fold ? " folded" : ""} flat ${JSON.stringify(flat)}`);
    if (flat.view === null || flat.trail === null || Math.abs(flat.view - flat.trail) > 1) {
      failures.push(`${width}: the view tile sits at y=${flat.view}, the trail chip at y=${flat.trail}`);
    }
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-galaxy").click();
    await expect(page.getByTestId("topology-view-3d")).toHaveAttribute("data-map-view", "galaxy");
    await waitForBoxStill(page.getByTestId("topology-view-3d"), { frames: 10 });
    const galaxy = await tileTop();
    if (galaxy.view !== flat.view) failures.push(`${width}: choosing Galaxy moved the view tile from y=${flat.view} to y=${galaxy.view}`);
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-flat").click();
    await expect(page.getByTestId("topology-view-3d")).toHaveAttribute("data-map-view", "flat");
  }
  // Below `xl` the search lane is a second line; it starts at the free map's left, so
  // its last tile does not stack above the right rail's column.
  await page.setViewportSize({ width: 1040, height: 720 });
  await waitForBoxStill(page.getByTestId("topology-search-action-lane"), { frames: 10 });
  const narrow = await page.evaluate(() => {
    const r = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? null;
    const lane = r("topology-search-action-lane")!;
    const index = r("topology-index-panel") ?? r("topology-index-tab");
    const search = r("topology-concept-search")!;
    // The rail is `display: contents`; its column is where its tiles stand.
    const rail = r("topology-tour-button");
    return {
      laneLeft: lane.left,
      freeLeft: index ? index.right : 0,
      searchRight: search.right,
      railLeft: rail?.left ?? null,
    };
  });
  console.log(`[tiles] 1040 ${JSON.stringify(narrow)}`);
  if (narrow.laneLeft - narrow.freeLeft > 40) {
    failures.push(`1040: the wrapped search lane starts ${Math.round(narrow.laneLeft - narrow.freeLeft)}px from the free map's left`);
  }
  if (narrow.railLeft !== null && narrow.searchRight > narrow.railLeft) {
    failures.push(`1040: the search tile ends at ${Math.round(narrow.searchRight)}, inside the right rail's column (${Math.round(narrow.railLeft)})`);
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("the path chip's two actions are one 24px icon button shape", async ({ page }) => {
  test.setTimeout(180_000);
  await openOwnerState(page);
  const boxes = await page.evaluate(() => {
    const read = (id: string) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { w: Math.round(r.width), h: Math.round(r.height), border: s.borderTopWidth, radius: s.borderTopLeftRadius };
    };
    return { copy: read("topology-path-chip-copy-packet"), clear: read("topology-path-chip-clear") };
  });
  console.log(`[path-chip] ${JSON.stringify(boxes)}`);
  expect(boxes.copy.h, "copy button height").toBeGreaterThanOrEqual(24);
  expect(boxes.copy.w, "copy button width").toBeGreaterThanOrEqual(24);
  expect(boxes.copy, "copy and clear share one shape").toEqual(boxes.clear);
  // The outcome is the part the chip adds; truncation takes the endpoint names first.
  await page.setViewportSize({ width: 1040, height: 720 });
  await waitForBoxStill(page.getByTestId("topology-path-chip"), { frames: 10 });
  const outcome = page.getByTestId("topology-path-chip-outcome");
  await expect(outcome).toBeVisible();
  const clipped = await outcome.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped, "the path outcome is cut off").toBe(false);
});

test("the view picker takes focus on open and gives it back after a choice", async ({ page }) => {
  test.setTimeout(180_000);
  await openOwnerState(page);
  const chip = page.getByTestId("topology-view-3d");
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("topology-view-3d-choice-flat")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("topology-view-3d-choice-flat")).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(chip).toBeFocused();
  await chip.click();
  await page.getByTestId("topology-view-3d-choice-galaxy").click();
  await expect(chip).toHaveAttribute("data-map-view", "galaxy");
  await expect(chip).toBeFocused();
});

test("the agent dock closes on Escape and returns focus to its toggle", async ({ page }) => {
  test.setTimeout(180_000);
  await openOwnerState(page);
  const toggle = page.getByTestId("topology-vault-agent-toggle");
  await toggle.click();
  const close = page.getByTestId("vault-agent-panel-close");
  await expect(close).toBeVisible();
  await close.focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(close).toBeVisible();
  await close.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("the tour's try-click card stands clear of the toolbar, and leaves through an exit frame", async ({ page }) => {
  test.setTimeout(180_000);
  await openOwnerState(page);
  await page.getByTestId("topology-tour-button").click();
  const overlay = page.getByTestId("guided-tour-overlay");
  await expect(page.getByTestId("guided-tour-card")).toBeVisible();
  for (const step of ["nodes", "relations", "try-click"]) {
    await page.getByTestId("guided-tour-next").first().click();
    await expect(overlay).toHaveAttribute("data-tour-step", step);
  }
  await waitForMapStill(page).catch(() => {});
  await waitForBoxStill(page.getByTestId("guided-tour-card"), { frames: 6 });
  const covered = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="guided-tour-card"]')!.getBoundingClientRect();
    return [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="topology-top-toolbar"] button, [data-testid="topology-top-toolbar"] a[href], [data-testid="topology-top-toolbar"] [role="status"]',
      ),
    ]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left < card.right && r.right > card.left && r.top < card.bottom && r.bottom > card.top;
      })
      .map((el) => el.dataset.testid ?? el.getAttribute("aria-label") ?? el.tagName);
  });
  expect(covered, `the card covers ${covered.join(", ")}`).toEqual([]);
  // One Escape: the overlay is still drawn, fading and inert, in the frame after it.
  await page.keyboard.press("Escape");
  const exitFrame = await page.evaluate(() =>
    document.querySelector('[data-testid="guided-tour-overlay"]')?.getAttribute("data-state") ?? "gone",
  );
  expect(exitFrame, "the tour hard-cut out on Escape").toBe("closed");
  await expect(overlay).toHaveCount(0);
});

/** Every visible control in the toolbar, as rects. */
async function toolbarControls(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="topology-top-toolbar"] button, [data-testid="topology-top-toolbar"] a[href]',
      ),
    ]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const visible = getComputedStyle(el).visibility !== "hidden";
        return { id: el.dataset.testid ?? el.getAttribute("aria-label") ?? el.tagName, visible, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      })
      .filter((r) => r.visible && r.right - r.left > 0 && r.bottom - r.top > 0),
  );
}

/**
 * Round 2 (2026-09-25). The first fix let the search lane span the free map below
 * `xl`, but the box still started at `md:left-6`, so with INDEX folded the first
 * tile stood 2px under the collapsed tab (elementFromPoint at the seam answered
 * the tab) at 900, 1040, 1100 and 1200.
 */
test("the collapsed INDEX tab and the toolbar never share pixels, md to 2xl", async ({ page }) => {
  test.setTimeout(240_000);
  await openOwnerState(page);
  await page.getByTestId("topology-index-fold").click();
  await expect(page.getByTestId("topology-index-tab")).toBeVisible();
  const failures: string[] = [];
  for (const [width, height] of [[900, 720], [1040, 720], [1100, 760], [1200, 760], [1280, 800], [1512, 949], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await waitForBoxStill(page.getByTestId("topology-search-action-lane"), { frames: 10 });
    const tab = (await page.getByTestId("topology-index-tab").boundingBox())!;
    for (const c of await toolbarControls(page)) {
      if (c.left < tab.x + tab.width && c.right > tab.x && c.top < tab.y + tab.height && c.bottom > tab.y) {
        failures.push(`${width}: ${c.id} [${Math.round(c.left)},${Math.round(c.top)}] meets the INDEX tab (right edge ${Math.round(tab.x + tab.width)})`);
      }
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

/**
 * Round 2 (2026-09-25). Wrapping the status chips under the tools made the toolbar
 * three lines at 1040 and 1280 (bottom 156 against a 112 reserve) and put the two
 * chips side by side at 1512 but one per line at 1280. The lane is one row, the
 * chips on the tools' line, and the map's top reserve covers the toolbar's real
 * bottom — following it when the toolbar grows past the stylesheet's number.
 */
test("the toolbar is one lane row inside the map's top reserve at every width", async ({ page }) => {
  test.setTimeout(240_000);
  await openOwnerState(page);
  const failures: string[] = [];
  const read = () =>
    page.evaluate(() => {
      const r = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      const canvas = r("ontology-map-canvas");
      return {
        bottom: r("topology-top-toolbar").bottom - canvas.top,
        reserve: Number(getComputedStyle(document.documentElement).getPropertyValue("--map-safe-inset-top")),
        tools: r("topology-tool-tile-group").top,
        path: r("topology-path-chip").top,
        trail: r("topology-trail-chip").top,
      };
    });
  for (const folded of [false, true]) {
    if (folded) await page.getByTestId("topology-index-fold").click();
    for (const [width, height] of [[900, 720], [1040, 720], [1280, 800], [1512, 949], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await waitForBoxStill(page.getByTestId("topology-search-action-lane"), { frames: 10 });
      const m = await read();
      const tag = `${width}x${height}${folded ? " folded" : ""}`;
      console.log(`[reserve] ${tag} ${JSON.stringify(m)}`);
      if (m.bottom > m.reserve + 0.5) failures.push(`${tag}: the toolbar ends at ${Math.round(m.bottom)}, past the map's top reserve ${m.reserve}`);
      if (Math.abs(m.path - m.tools) > 1 || Math.abs(m.trail - m.tools) > 1) {
        failures.push(`${tag}: tools at y=${Math.round(m.tools)}, path chip at y=${Math.round(m.path)}, trail chip at y=${Math.round(m.trail)}`);
      }
    }
  }
  // A toolbar made taller than the stylesheet's reserve moves the reserve with it.
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.addStyleTag({ content: '[data-testid="topology-search-action-lane"]{padding-bottom:40px}' });
  await expect
    .poll(async () => {
      const m = await read();
      return Math.round(m.reserve) - Math.ceil(m.bottom);
    })
    .toBe(0);
  expect(failures, failures.join("\n")).toEqual([]);
});

/**
 * Round 2 (2026-09-25). At 1040x720 the three-line toolbar's path chip stood over
 * domain:catalog, the node the try-click step lights for the reader to press.
 */
test("the tour's lit node is not under the toolbar at 1040x720", async ({ page }) => {
  test.setTimeout(180_000);
  await openOwnerState(page, 1040);
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.getByTestId("topology-tour-button").click();
  const overlay = page.getByTestId("guided-tour-overlay");
  await expect(page.getByTestId("guided-tour-card")).toBeVisible();
  for (const step of ["nodes", "relations", "try-click"]) {
    await page.getByTestId("guided-tour-next").first().click();
    await expect(overlay).toHaveAttribute("data-tour-step", step);
  }
  await waitForMapStill(page).catch(() => {});
  await waitForBoxStill(page.getByTestId("topology-tour-anchor"), { frames: 6 });
  const anchor = (await page.getByTestId("topology-tour-anchor").boundingBox())!;
  const covering = (await toolbarControls(page)).filter(
    (c) => c.left < anchor.x + anchor.width && c.right > anchor.x && c.top < anchor.y + anchor.height && c.bottom > anchor.y,
  );
  expect(covering.map((c) => c.id), `the lit node at [${Math.round(anchor.x)},${Math.round(anchor.y)}] is under the toolbar`).toEqual([]);
});
