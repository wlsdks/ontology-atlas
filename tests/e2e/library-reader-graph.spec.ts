import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installLibraryWorkHarness } from "./library-work-harness";

const LONG_PAGE = [
  "---", "title: Workshop notes", "created_by: human", "sources: []", "status: draft", "---", "",
  "## Summary", "", "A long document keeps a real reading position while inspecting connections.", "",
  ...Array.from({ length: 45 }, (_, i) => `Paragraph ${i + 1}. The workshop has a question, supporting evidence, and a decision still to review.\n`),
  "## Facts", "", "## Decisions", "", "## Open questions", "", "## Not in sources", "",
].join("\n");

/**
 * **A home popup returns focus to its door, and the picture behind it does not move.**
 *
 * This case used to measure the `Graph` dialog opened from an open page: whether it gave
 * the reading position and the opener back, including on an immediate reopen. Half of that
 * subject is gone with the dialog — the picture is the Library's home and a document
 * *replaces* it (owner, 2026-09-12; `docs/DECISIONS.md` 2026-09-06 `:587`, restored), so
 * there is no longer a surface a person can raise **over** an open page and come back
 * from. Measured on the rewrite: leaving the page for the home and reopening it starts the
 * reader at the top, because the pane unmounted; no record ever promised otherwise, and
 * inventing a scroll memory here would be a feature, not a repair.
 *
 * What survives is the invariant this file was really written for — an immediate reopen
 * must not lose the surface's owner — read where the surfaces now are:
 *
 *  1. every home popup hands focus back to its own door, on Escape, on its `✕`, and on an
 *     outside press, and an immediate reopen from the door the keyboard just took back
 *     works;
 *  2. the canvas keeps its camera and its marks throughout, because "the Library graph
 *     stands still" (2026-09-08) is about every state, not just hover.
 */
test("a home popup returns its door on every close, and the canvas stands still", async ({ page }) => {
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { files: {
    "wiki/workshop.md": LONG_PAGE,
    "sources/notes.txt": "Workshop source notes.\n",
  } });
  await page.goto("/en/docs/");
  await page.getByRole("button", { name: /Open my folder/i }).click();
  await expect(page.getByTestId("library-page")).toBeVisible();

  // 1 — a page replaces the picture and gives it back; the index row keeps its edge.
  await page.getByTestId("library-index-segment-wiki").click();
  const selectedRow = page.getByTestId("library-wiki-wiki/workshop");
  const canvas = page.getByTestId("library-graph-canvas");
  await expect(canvas).toBeVisible();
  await selectedRow.click();
  await expect(selectedRow).toHaveAttribute("aria-current", "true");
  // A border colour alone does not draw a selected edge on the row primitive.
  await expect.poll(() => selectedRow.evaluate((el) => parseFloat(getComputedStyle(el).borderLeftWidth))).toBeGreaterThan(0);
  await expect(page.getByTestId("library-reading-pane")).toBeVisible();
  await expect(canvas).toHaveCount(0);
  await page.getByTestId("library-reader-back").click();
  await expect(canvas).toBeVisible();

  // 2 — the anchored contract, three ways out and one immediate reopen.
  const camera = async () => ({
    scale: await canvas.getAttribute("data-view-scale"),
    aspect: await canvas.getAttribute("data-picture-aspect"),
  });
  // The aspect is published by the loop only once the simulation comes to rest, so the
  // comparison starts from a settled picture rather than from one still arriving.
  await expect.poll(() => canvas.getAttribute("data-picture-aspect")).not.toBe("");
  const before = await camera();
  const door = page.getByTestId("library-guide-open");
  const guide = page.getByTestId("library-guide-popover");
  await door.click();
  await expect(guide).toBeVisible();
  await expect.poll(() => guide.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(door).toBeFocused();
  // Immediately again, from the keyboard the door just took back.
  await page.keyboard.press("Enter");
  await expect(guide).toBeVisible();
  await guide.getByTestId("library-guide-popover-close").click();
  await expect(guide).toHaveCount(0);
  await expect(door).toBeFocused();
  // Two closes in, two doors back, and the picture has not moved for either.
  expect(await camera()).toEqual(before);

  await door.click();
  await expect(guide).toBeVisible();
  /*
   * An outside press is the third way out. **Near the canvas's bottom edge, not its
   * top-left**: the panel hangs from a door above the picture, so it covers the canvas's
   * first corner — Playwright reported its header intercepting the press for fifteen
   * seconds. Low and to the left is canvas the panel cannot reach and, on this folder,
   * holds no mark to select.
   */
  const canvasBox = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: 8, y: canvasBox.height - 8 } });
  await expect(guide).toHaveCount(0);
  /*
   * And here the keyboard stays where the press put it. The canvas is `tabIndex=0`, so
   * pressing it both closes the panel and focuses the picture; pulling focus back to a chip
   * nobody touched would be the surface arguing with the gesture. Escape and the `✕` are
   * the two closes that leave focus nowhere, and those are the two that hand the door back.
   */
  await expect(canvas).toBeFocused();
});
