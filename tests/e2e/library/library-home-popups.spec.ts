import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { installLibraryWorkHarness } from "../library-work-harness";

const LONG_PAGE = [
  "---", "title: Workshop notes", "created_by: human", "sources: []", "status: draft", "---", "",
  "## Summary", "", "A long document keeps a real reading position while inspecting connections.", "",
  ...Array.from({ length: 45 }, (_, i) => `Paragraph ${i + 1}. The workshop has a question, supporting evidence, and a decision still to review.\n`),
  "## Facts", "", "## Decisions", "", "## Open questions", "", "## Not in sources", "",
].join("\n");

/**
 * Every home popup hands focus back to its door on Escape and its close button, and an immediate
 * reopen works; an outside press closes it and leaves focus where the press put it.
 */
test("a home popup returns its door on every close", async ({ page }) => {
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { files: {
    "wiki/workshop.md": LONG_PAGE,
    "sources/notes.txt": "Workshop source notes.\n",
  } });
  await page.goto("/en/");
  await page.getByRole("button", { name: /Open (?:a|my) folder/i }).click();
  await expect(page.getByTestId("library-page")).toBeVisible();

  await page.getByTestId("library-workspace-wiki").click();
  const selectedRow = page.getByTestId("library-wiki-wiki/workshop");
  await expect(page.getByTestId("library-question-desk")).toBeVisible();
  await selectedRow.click();
  await expect(selectedRow).toHaveAttribute("aria-current", "true");
  // A border colour alone does not draw a selected edge on the row primitive.
  await expect.poll(() => selectedRow.evaluate((el) => parseFloat(getComputedStyle(el).borderLeftWidth))).toBeGreaterThan(0);
  await expect(page.getByTestId("library-reading-pane")).toBeVisible();
  await page.getByTestId("library-reader-back").click();
  await expect(page.getByTestId("library-question-desk")).toBeVisible();
  await page.getByTestId("library-workspace-sources").click();
  const overview = page.getByTestId("sources-overview");
  await expect(overview).toBeVisible();

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

  // An outside press, low on the overview where the panel hanging from its door cannot reach.
  await door.click();
  await expect(guide).toBeVisible();
  const box = (await overview.boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height - 8);
  await expect(guide).toHaveCount(0);
});
