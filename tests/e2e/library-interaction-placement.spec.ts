import { expect, test, type Locator, type Page } from "@playwright/test";

import { waitForAnimationsDone, waitForBoxStill, waitFrames } from "./settle";
import { seedFirstRunSeen } from "./first-run-seed";
import { installDesktopBridge, openRounds } from "./rounds-desktop-bridge";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **Where the Library's transient surfaces land, and what they cover** (2026-09-25 sweep).
 *
 * Each case is a measured defect from the interaction audit, asserted on rects,
 * `elementFromPoint` and computed style rather than on a screenshot:
 *
 * - the Rounds column's help sentence was a 288px panel in a 280px `overflow-hidden`
 *   column, clipped mid-word and lying on the door it explains;
 * - the index chips' tooltips ran as one 449px line from x 44 across the nav rail and the
 *   search box, and their accessible names replaced the visible label;
 * - at 1040 the guide popover lay 34px across the index column;
 * - below `xl` the conversation dock covered the index, ignored Escape and left focus on
 *   `body`;
 * - the questions popover mixed a 12px/14px button with the 6px/11px chip grammar;
 * - Find documents with nothing to suggest offered a dead primary and no corner close;
 * - the new-page dialog moved its field 9px under the caret on the first keystroke;
 * - the graph card cut a long page name to one line, the only place it could be read whole;
 * - the morning card's page presses wore two shapes, and its refused line had no press.
 *
 * The desktop bridge is the Rounds specs' stub: the installed app is a WKWebView running
 * this same export, and it answers `discover_source_candidates` with nothing, which is
 * the empty Find documents state measured here.
 */

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("no box");
  return rect;
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
}

async function openLibrary(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await seedFirstRunSeen(page);
  await installDesktopBridge(page, { seedRounds: true });
  await openRounds(page);
  await page.getByTestId("library-workspace-sources").click();
  await page.getByTestId("library-find-documents").waitFor({ timeout: 30_000 });
  /* The guide may raise itself on a first visit; this spec opens it on purpose. */
  const guide = page.getByTestId("library-guide-popover");
  if (await guide.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(guide).toBeHidden();
  }
}

test.describe("Library interaction placement", () => {
  test("nothing covers the Rounds section's door to Automations", async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 720 });
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: true });
    await openRounds(page);
    await expect(page.getByTestId("library-rounds")).toHaveAttribute("data-rounds-state", "ready");

    const index = page.getByTestId("library-rounds-index");
    const door = page.getByTestId("library-rounds-new");
    /* Hover and focus everything in the column head, the way a person reaching for help would. */
    const head = index.locator("> div").first();
    for (const control of await head.locator("button, a").all()) {
      await control.hover();
      await control.focus();
    }
    const indexBox = await box(index);
    const doorBox = await box(door);
    const shown = await index.evaluate((element) =>
      [...element.querySelectorAll('[role="tooltip"]')]
        .filter((node) => Number(getComputedStyle(node).opacity) > 0.01)
        .map((node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
    );
    for (const panel of shown) {
      expect(panel.x + panel.width, "a help panel ran past the column's clipping edge").toBeLessThanOrEqual(indexBox.x + indexBox.width + 0.5);
      expect(intersects(panel, doorBox), "a help panel lies on the door it explains").toBe(false);
    }
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="library-rounds-new"]') !== null,
      { x: doorBox.x + doorBox.width / 2, y: doorBox.y + doorBox.height / 2 },
    );
    expect(hit).toBe(true);
  });

  for (const size of [
    { width: 1512, height: 949 },
    { width: 1040, height: 720 },
  ]) {
    test(`index chip tooltips open into the reader and the chips are named by their label at ${size.width}`, async ({ page }) => {
      await openLibrary(page, size);
      /* The column's controls end at its `px-3` edge; a panel beside them covers none. */
      const findBox = await box(page.getByTestId("library-find-documents"));
      const controlsEnd = findBox.x + findBox.width;
      const rail = await box(page.getByTestId("app-nav-rail"));
      const search = page.getByTestId("library-index").getByRole("searchbox");
      const searchBox = (await search.count()) > 0 ? await box(search.first()) : null;

      for (const [id, label] of [
        ["library-add-files", "Add files"],
        ["library-find-documents", "Find documents"],
        ["library-import-open", "Bring from a service"],
      ] as const) {
        const chip = page.getByTestId(id);
        await expect(chip).toHaveText(new RegExp(label));
        // WCAG 2.5.3: the accessible name contains the visible label.
        expect(await chip.getAttribute("aria-label")).toBeNull();
        await expect(chip).toHaveAccessibleName(new RegExp(label));
        await chip.hover();
        const tip = page.locator("[data-radix-popper-content-wrapper]").last();
        await expect(tip).toBeVisible();
        await waitForAnimationsDone(tip);
        await waitForBoxStill(tip.locator("> *").first());
        const tipBox = await box(tip.locator("> *").first());
        expect(tipBox.x, `${id} tooltip lies on the index controls`).toBeGreaterThanOrEqual(controlsEnd);
        expect(intersects(tipBox, rail), `${id} tooltip crosses the nav rail`).toBe(false);
        if (searchBox) expect(intersects(tipBox, searchBox), `${id} tooltip covers the search box`).toBe(false);
        expect(tipBox.width).toBeLessThanOrEqual(321);
        expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(size.width);
        await page.keyboard.press("Escape");
        await page.mouse.move(rail.x + rail.width / 2, size.height / 2);
        await expect(page.locator("[data-radix-popper-content-wrapper]")).toHaveCount(0);
      }
    });
  }

  test("at 1040 the guide popover stays in the reader pane", async ({ page }) => {
    await openLibrary(page, { width: 1040, height: 720 });
    await page.getByTestId("library-guide-open").click();
    const popover = page.getByTestId("library-guide-popover");
    await expect(popover).toBeVisible();
    await waitForAnimationsDone(popover);
    await waitForBoxStill(popover);
    const index = await box(page.getByTestId("library-index"));
    const panel = await box(popover);
    expect(panel.x, "the guide lies across the index").toBeGreaterThanOrEqual(index.x + index.width);
    expect(panel.x + panel.width).toBeLessThanOrEqual(1040);
  });

  test("at 1040 the graph counts drop whole clauses, never half of one", async ({ page }) => {
    await openLibrary(page, { width: 1040, height: 720 });
    const counts = page.getByTestId("library-graph-counts");
    await expect(counts).toBeVisible();
    const read = () =>
      counts.evaluate((element) => {
        const row = element.getBoundingClientRect();
        const clauses = [...element.querySelectorAll("[data-counts-clause]")].map((clause) => {
          const r = clause.getBoundingClientRect();
          return { top: r.top, right: r.right, bottom: r.bottom };
        });
        return {
          overflow: getComputedStyle(element).overflow,
          rowRight: row.right,
          rowBottom: row.bottom,
          lineHeight: parseFloat(getComputedStyle(element).lineHeight),
          height: row.height,
          clauses,
        };
      });
    const probe = await read();
    expect(probe.height).toBeLessThanOrEqual(probe.lineHeight + 0.5);
    /* Every clause is either wholly on the row or wholly under it; none is cut at the edge. */
    for (const clause of probe.clauses.slice(1)) {
      const onRow = clause.bottom <= probe.rowBottom + 0.5;
      if (onRow) expect(clause.right).toBeLessThanOrEqual(probe.rowRight + 0.5);
    }
    expect(probe.clauses[0]!.bottom).toBeLessThanOrEqual(probe.rowBottom + 0.5);
  });

  test("below xl the dock leaves the index, takes focus, and Escape puts it away", async ({ page }) => {
    await openLibrary(page, { width: 1040, height: 720 });
    const door = page.getByTestId("library-open-conversation");
    await door.click();
    const dock = page.getByTestId("library-agent-dock");
    await expect(dock).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("library-agent-dock-frame")).toHaveAttribute("data-dock-state", "open");
    await expect(dock).toHaveAttribute("aria-label", /.+/);
    await expect
      .poll(() => dock.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await waitForAnimationsDone(page.getByTestId("library-agent-dock-frame"));
    await waitForBoxStill(page.getByTestId("library-agent-dock-frame"));
    const index = await box(page.getByTestId("library-index"));
    const frame = await box(page.getByTestId("library-agent-dock-frame"));
    expect(frame.x, "the overlay covers the index").toBeGreaterThanOrEqual(index.x + index.width - 1);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("library-agent-dock-frame")).not.toHaveAttribute("data-dock-state", "open");
    await expect
      .poll(() => page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null))
      .toBe(true);
  });

  test("the questions popover's ask control wears the chip grammar of its trigger", async ({ page }) => {
    await openLibrary(page, { width: 1512, height: 949 });
    const trigger = page.getByTestId("library-questions-open");
    await trigger.click();
    const ask = page.getByTestId("library-questions-ask");
    await expect(ask).toBeVisible();
    const read = (locator: Locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return { radius: style.borderTopLeftRadius, size: style.fontSize, height: element.getBoundingClientRect().height };
      });
    const [a, b] = [await read(trigger), await read(ask)];
    expect(b.radius).toBe(a.radius);
    expect(b.size).toBe(a.size);
    expect(Math.abs(b.height - a.height)).toBeLessThan(1);
  });

  test("Find documents with nothing to suggest is an empty state with a corner close", async ({ page }) => {
    await openLibrary(page, { width: 1512, height: 949 });
    await page.getByTestId("library-find-documents").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("find-documents-empty")).toBeVisible();
    await expect(dialog.getByTestId("find-documents-add")).toHaveCount(0);
    await expect(dialog.getByTestId("find-documents-add-files")).toBeVisible();
    await dialog.getByTestId("find-documents-close").click();
    await expect(dialog).toBeHidden();
  });

  test("the new-page dialog does not move its field on the first keystroke", async ({ page }) => {
    await openLibrary(page, { width: 1512, height: 949 });
    await page.getByTestId("library-workspace-wiki").click();
    await page.getByTestId("library-new-page").click();
    const field = page.getByTestId("library-new-page-title");
    await expect(field).toBeVisible();
    await waitForAnimationsDone(page.getByRole("dialog").filter({ has: field }));
    await waitForBoxStill(field);
    const before = await box(field);
    await field.pressSequentially("a");
    await expect(field).toHaveValue(/a$/);
    await waitFrames(page, 2);
    await waitForAnimationsDone(page.getByRole("dialog").filter({ has: field }));
    await waitForBoxStill(field);
    const after = await box(field);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
  });

  test("the morning card's presses share one shape, and the refused line reaches its entry", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: true });
    await openRounds(page);
    const since = page.getByTestId("library-rounds-since");
    await expect(since).toHaveAttribute("data-since-changed", "true");

    const chips = since.locator("ul button");
    /* One stale page, one redraft, and the refused line's press. */
    await expect(chips).toHaveCount(3);
    const shapes = await chips.evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        return {
          height: Math.round(node.getBoundingClientRect().height),
          font: style.fontSize,
          padding: `${style.paddingLeft} ${style.paddingRight}`,
          radius: style.borderTopLeftRadius,
          glyph: node.querySelectorAll("svg").length,
        };
      }),
    );
    for (const shape of shapes) expect(shape).toEqual(shapes[0]);
    expect(shapes[0]!.glyph).toBe(1);

    await page.getByTestId("library-rounds-since-refused").click();
    const entry = page.getByTestId("library-rounds-pass-p3");
    await expect(entry).toBeFocused();
    await expect(entry).toContainText("mcp__confluence__create_page");
    await expect(entry).toBeInViewport();
  });

  test("the graph card reads a long page name whole, beside no kind label", async ({ page }) => {
    const title = "Settlement schedules and fees, a page with a rather long name";
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, {
      "project.md": ["---", "kind: project", "slug: card-name", "title: Card name", "---", "", "# Card name", ""].join("\n"),
      "sources/fees.md": "fees\n",
      "wiki/settlement.md": [
        "---",
        `title: ${title}`,
        "created_by: agent:claude",
        "compiled_at: 2026-09-12T04:20:00Z",
        "sources:",
        "  - sources/fees.md",
        "status: draft",
        "summary: Fees in one line.",
        "---",
        "",
        "## Summary",
        "",
        "Fees settle nightly.",
        "",
        "## Facts",
        "",
        "- Recorded in [[src:sources/fees.md]].",
        "",
      ].join("\n"),
    });
    await page.goto("/en/library/?guides=off&e2e=1");
    await page.getByTestId("library-open-vault").click();
    await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.arriving() ?? true), { timeout: 20_000 })
      .toBe(false);
    const mark = await page.evaluate(() => window.__atlasLibraryGraph!.nodes().find((node) => node.kind === "page")!);
    const canvas = await box(page.getByTestId("library-graph-canvas"));
    await page.mouse.click(canvas.x + mark.x, canvas.y + mark.y);

    const card = page.getByTestId("library-graph-card");
    const name = page.getByTestId("library-graph-card-title");
    await expect(card).toBeVisible();
    await expect(name).toHaveText(title);
    const fit = await name.evaluate((node) => ({
      clippedX: node.scrollWidth > node.clientWidth + 1,
      clippedY: node.scrollHeight > node.clientHeight + 1,
      lines: Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)),
    }));
    expect(fit.clippedX, "the name was cut sideways").toBe(false);
    expect(fit.clippedY, "the name was cut below its lines").toBe(false);
    expect(fit.lines).toBeLessThanOrEqual(2);
    /* The kind sits under the name, not beside it, so the name has the row's width. Both
       rects are read in one frame: the card enters with a transform, and two reads a frame
       apart disagree by a pixel. */
    const stack = await card.evaluate((element) => {
      const nameRect = element.querySelector('[data-testid="library-graph-card-title"]')!.getBoundingClientRect();
      const kindRect = element.querySelector('[data-testid="library-graph-card-kind"]')!.getBoundingClientRect();
      return { nameBottom: nameRect.bottom, kindTop: kindRect.top };
    });
    expect(stack.kindTop).toBeGreaterThanOrEqual(stack.nameBottom - 0.5);
  });
});
