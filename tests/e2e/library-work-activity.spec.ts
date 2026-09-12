import { expect, test } from "@playwright/test";

import { openLibraryWorkScenario } from "./library-work-harness";

interface PaintWindow extends Window {
  __libraryPaintCount?: number;
}

test.describe("Library live work activity", () => {
  test("visualizes a real ACP read, permission wait, and observed file revision", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const harness = await openLibraryWorkScenario(page);

    /*
     * The canvas is the home now (2026-09-12), so there is nothing to open: the picture is
     * already on screen with nothing chosen, and choosing a document is what takes it away.
     */
    const canvas = page.getByTestId("library-graph-canvas");
    await expect(canvas).toBeVisible();

    await harness.read(page);
    await expect(page.getByTestId("acp-chat-tool-target")).toContainText("sources/architecture.docx");
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-kind", "read");

    // Selecting a document replaces the canvas; active work cannot paint a removed canvas.
    await page.evaluate(() => {
      (window as unknown as PaintWindow).__libraryPaintCount = 0;
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
        if (this.canvas.dataset.testid === "library-graph-canvas") {
          const fixtureWindow = window as unknown as PaintWindow;
          fixtureWindow.__libraryPaintCount = (fixtureWindow.__libraryPaintCount ?? 0) + 1;
        }
        return fill.call(this, x, y, width, height);
      };
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as PaintWindow).__libraryPaintCount ?? 0)).toBeGreaterThan(5);
    await canvas.press("ArrowRight");
    /*
     * ⚠️ **`Enter` opens the card, and `Open` inside it is what selects the document**
     * (2026-09-12, "a press opens a card beside the mark"). Before that, `Enter` *was* the
     * commit; the claim this case makes — active work cannot paint a canvas that has been
     * replaced by the reader — is unchanged, only the press that replaces it is.
     */
    await canvas.press("Enter");
    await page.getByTestId("library-graph-card-open").click();
    await expect(canvas).toHaveCount(0);
    const hiddenPaints = await page.evaluate(() => (window as unknown as PaintWindow).__libraryPaintCount ?? 0);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as PaintWindow).__libraryPaintCount ?? 0)).toBe(hiddenPaints);
    // The way back to the picture is the reader's own close control.
    await page.getByTestId("library-reader-back").click();
    await expect(canvas).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as PaintWindow).__libraryPaintCount ?? 0)).toBeGreaterThan(hiddenPaints);

    await harness.wait(page);
    await expect(page.getByTestId("acp-permission-card")).toBeVisible();
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-kind", "waiting");
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-phase", "active");

    /*
     * Permission belongs to the conversation, and nothing blocks it any more: the picture
     * is the pane rather than a modal over it, so the card is reachable where it stands.
     */
    await page.getByTestId("acp-permission-allow").click();
    await harness.write(page);
    await expect.poll(async () => (await harness.snapshot(page)).writes.some((write) => write.relativePath === "wiki/architecture.md")).toBe(true);
    await expect(page.getByTestId("library-work-recent")).toContainText("File changed");
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-kind", "write");
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-phase", "complete");
    await harness.finish(page);
    await expect(page.getByTestId("acp-chat-panel")).toHaveAttribute("data-acp-status", "ready");
    await page.getByRole("button", { name: "Close conversation" }).click();
    await page.getByRole("button", { name: "File changed · wiki/architecture", exact: true }).focus();
    await expect(page.getByRole("button", { name: "File changed · wiki/architecture", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("library-reader-back")).toBeVisible();
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  test("rejected unknown target never becomes a saved-file receipt", async ({ page }) => {
    const harness = await openLibraryWorkScenario(page, { scenario: "failed-unknown-target" });
    await harness.read(page);
    await harness.wait(page);
    await expect(page.getByTestId("acp-permission-card")).toBeVisible();
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-kind", "waiting");

    await page.getByTestId("acp-permission-reject").click();
    await expect.poll(async () => (await harness.snapshot(page)).writes.length).toBe(0);
    await harness.finish(page);
    await expect(page.getByTestId("library-work-recent")).not.toContainText("File changed");
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-kind", "error");
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-phase", "complete");
  });
});

test.describe("Library work receipts on touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("keeps changed-file receipts reachable without the conversation", async ({ page }) => {
    const harness = await openLibraryWorkScenario(page);
    await harness.read(page);
    await harness.wait(page);
    await page.getByTestId("acp-permission-allow").click();
    await harness.write(page);
    await expect(page.getByTestId("library-work-recent")).toContainText("File changed");
    await harness.finish(page);
    await page.getByRole("button", { name: "Close conversation" }).click();
    const receipt = page.getByRole("button", { name: "File changed · wiki/architecture", exact: true });
    await expect(receipt).toBeVisible();
    const box = await receipt.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await receipt.tap();
    await expect(page.getByTestId("library-reader-back")).toBeVisible();
  });
});
