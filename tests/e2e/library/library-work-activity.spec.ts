import { expect, test } from "@playwright/test";

import { openLibraryWorkScenario } from "../library-work-harness";
import { waitFrames } from "../settle";

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
    await page.getByTestId("library-workspace-sources").click();

    /* The canvas is the home: it is on screen with nothing chosen, and choosing a document removes it. */
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
     * `Enter` opens the card and `Open` inside it selects the document; active work must not paint a
     * canvas the reader has replaced.
     */
    await canvas.press("Enter");
    await page.getByTestId("library-graph-card-open").click();
    await expect(canvas).toHaveCount(0);
    const hiddenPaints = await page.evaluate(() => (window as unknown as PaintWindow).__libraryPaintCount ?? 0);
    /*
     * The claim is an **absence** — a hidden canvas paints nothing — so something has to
     * pass before the count means anything. Thirty drawn frames is that something, and it
     * is the unit the claim is about: a painting canvas would have painted on each of
     * them, and a slow machine spends longer over the same thirty rather than being asked
     * a weaker question.
     */
    await waitFrames(page, 30);
    expect(await page.evaluate(() => (window as unknown as PaintWindow).__libraryPaintCount ?? 0)).toBe(hiddenPaints);
    // The way back to the picture is the reader's own close control.
    await page.getByTestId("library-reader-back").click();
    await page.getByTestId("library-workspace-sources").click();
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
    await page.getByTestId("library-work-history-toggle").click();
    await expect(page.getByTestId("library-work-recent")).toContainText("File changed");
    await page.getByTestId("library-work-history-toggle").click();
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-kind", "write");
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-phase", "complete");
    await harness.finish(page);
    await expect(page.getByTestId("acp-chat-panel")).toHaveAttribute("data-acp-status", "ready");
    await page.getByRole("button", { name: "Close conversation" }).click();
    await page.getByTestId("library-work-history-toggle").click();
    await page.getByRole("button", { name: "File changed · architecture", exact: true }).focus();
    await expect(page.getByRole("button", { name: "File changed · architecture", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("library-reader-back")).toBeVisible();
    // A wiki page open: still one Conversation control and one Questions control, both in the header.
    await expect(page.getByTestId("library-open-conversation")).toHaveCount(1);
    await expect(page.getByTestId("library-questions-open")).toHaveCount(1);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  /*
   * The band's work line holds its slot from the first paint, so the first event moves neither the
   * band nor the picture; and every Library state carries exactly one Conversation control and one
   * Questions control, in the page header.
   */
  test("the first event moves nothing, and each state has one Conversation and one Questions control", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 901 });
    const harness = await openLibraryWorkScenario(page);
    await page.getByRole("button", { name: "Close conversation" }).click();
    await page.getByTestId("library-workspace-sources").click();
    const band = page.getByTestId("library-progress");
    await expect(band.getByTestId("library-work-line")).toBeVisible();
    await expect(band.getByTestId("library-work-current")).toHaveCount(0);
    const geometry = () =>
      page.evaluate(() => ({
        band: document.querySelector('[data-testid="library-progress"]')!.getBoundingClientRect().height,
        picture: document.querySelector('[data-testid="library-graph-canvas"]')!.getBoundingClientRect().top,
      }));
    // The closing dock widens the pane over its exit; measure once two frames apart agree.
    let before = await geometry();
    await expect
      .poll(async () => {
        await waitFrames(page, 2);
        const now = await geometry();
        const same = now.band === before.band && now.picture === before.picture;
        before = now;
        return same;
      })
      .toBe(true);
    await harness.read(page);
    await expect(band.getByTestId("library-work-current")).toHaveAttribute("data-work-kind", "read");
    expect(await geometry()).toEqual(before);
    // The line is the kind of work and the file as a press; "Recent N" waits until there is a recent one.
    // While work runs Continue carries no ring of its own, and its label sits centred.
    const press = band.getByTestId("library-progress-continue");
    await expect(press.locator("svg")).toHaveCount(0);
    const offCentre = await press.evaluate((button) => {
      const outer = button.getBoundingClientRect();
      const label = button.querySelector("span")!.getBoundingClientRect();
      return Math.abs(label.left - outer.left - (outer.right - label.right));
    });
    expect(offCentre).toBeLessThanOrEqual(1);
    // The line names the file; its folders are the title and the accessible description.
    const target = band.getByTestId("library-work-target");
    await expect(target).toHaveText("architecture.docx");
    await expect(target).toHaveAttribute("title", "sources/architecture.docx");
    await expect(target).toHaveAccessibleDescription("sources/architecture.docx");
    await expect(band.getByText(/^Recent 0$/)).toHaveCount(0);
    await expect(page.getByText(/^(happening now|latest observation)$/i)).toHaveCount(0);
    await expect(page.getByTestId("library-reader-landing").locator("svg.lucide-chevron-down")).toHaveCount(0);

    const oneEach = async (where: string) => {
      await expect(page.getByTestId("library-open-conversation"), where).toHaveCount(1);
      await expect(page.getByTestId("library-questions-open"), where).toHaveCount(1);
    };
    await oneEach("Sources home");
    await band.getByTestId("library-work-target").click();
    await expect(page.getByTestId("library-reader-back")).toBeVisible();
    await oneEach("a source open");
    // The reader's top row carries the work line at its right.
    await expect(page.getByTestId("library-work-current")).toHaveCount(1);
    await page.getByTestId("library-reader-back").click();
    await page.getByTestId("library-workspace-wiki").click();
    await expect(page.getByTestId("library-question-desk")).toBeVisible();
    await oneEach("the question desk");
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
    await page.getByTestId("library-work-history-toggle").click();
    await expect(page.getByTestId("library-work-recent")).not.toContainText("File changed");
    await page.getByTestId("library-work-history-toggle").click();
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-kind", "error");
    await expect(page.getByTestId("library-work-current")).toHaveAttribute("data-work-phase", "complete");
  });
});
