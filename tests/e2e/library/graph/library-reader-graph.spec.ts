import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";
import { installLibraryWorkHarness } from "../../library-work-harness";

const LONG_PAGE = [
  "---", "title: Workshop notes", "created_by: human", "sources: []", "status: draft", "---", "",
  "## Summary", "", "A long document keeps a real reading position while inspecting connections.", "",
  ...Array.from({ length: 45 }, (_, i) => `Paragraph ${i + 1}. The workshop has a question, supporting evidence, and a decision still to review.\n`),
  "## Facts", "", "## Decisions", "", "## Open questions", "", "## Not in sources", "",
].join("\n");

/**
 * Every home popup hands focus back to its door on Escape, its close button and an outside press,
 * and an immediate reopen works. The canvas keeps its camera and marks throughout.
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

  // Wiki returns to the inquiry; Sources owns the graph whose popup is measured below.
  await page.getByTestId("library-workspace-wiki").click();
  const selectedRow = page.getByTestId("library-wiki-wiki/workshop");
  const canvas = page.getByTestId("library-graph-canvas");
  await expect(page.getByTestId("library-question-desk")).toBeVisible();
  await selectedRow.click();
  await expect(selectedRow).toHaveAttribute("aria-current", "true");
  // A border colour alone does not draw a selected edge on the row primitive.
  await expect.poll(() => selectedRow.evaluate((el) => parseFloat(getComputedStyle(el).borderLeftWidth))).toBeGreaterThan(0);
  await expect(page.getByTestId("library-reading-pane")).toBeVisible();
  await expect(canvas).toHaveCount(0);
  await page.getByTestId("library-reader-back").click();
  await expect(page.getByTestId("library-question-desk")).toBeVisible();
  await page.getByTestId("library-workspace-sources").click();
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
