import { expect, test } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";
import { RUNTIME, activeTestId, box } from "./ix-projects-agents-git-harness";
import { waitForBoxStill } from "./settle";

test.describe("interaction sweep — projects, agents, git layout", () => {
  test.beforeEach(async ({ page }) => {
    await installDesktopRailRuntime(page, {}, { fast: [RUNTIME], probed: [RUNTIME] });
    await mountDesktopVault(page);
  });

  // Below `xl` (1280) the dock is a full-width overlay; it used to be `absolute top-0` against a
  // row as tall as the page (1389 at 1040x806), so it never fitted the window there either.
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1512, height: 949 },
    { width: 1280, height: 800 },
    { width: 1279, height: 800 },
    { width: 1040, height: 806 },
    { width: 900, height: 800 },
  ]) {
    test(`project agent dock is one window tall at ${viewport.width}, header and composer both on screen`, async ({ page }) => {
      const overlay = viewport.width < 1280;
      await page.setViewportSize(viewport);
      await page.goto("/ko/project/fallback/?slug=storefront&guides=off");
      const open = page.getByTestId("project-detail-brief-ask-open");
      await expect(open).toBeVisible({ timeout: 30_000 });
      await open.focus();
      await page.keyboard.press("Enter");
      const frame = page.getByTestId("project-agent-dock-frame");
      await expect(frame).toHaveAttribute("data-dock-state", "open");
      await frame.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
      const dock = page.getByTestId("project-agent-dock");
      const composer = dock.getByTestId("acp-chat-composer");
      const close = dock.getByTestId("acp-dock-close");
      await expect(composer).toBeVisible({ timeout: 30_000 });

      const measure = async () => ({
        frame: await box(frame),
        composer: await box(composer),
        close: await box(close),
      });
      const onOpen = await measure();
      expect(onOpen.frame.height, "the dock frame is taller than the window").toBeLessThanOrEqual(viewport.height);
      expect(onOpen.frame.y, "the dock frame starts above the window").toBeGreaterThanOrEqual(0);
      expect(onOpen.composer.y + onOpen.composer.height, "the composer starts below the fold").toBeLessThanOrEqual(viewport.height);
      expect(onOpen.close.y, "the close button is above the window").toBeGreaterThanOrEqual(0);
      await page.screenshot({ path: `output/ix/dock-${viewport.width}.png` });

      // Scrolling the page beside it does not carry the dock away.
      await page.getByTestId("app-shell-body-slot").evaluate((el) => el.scrollBy(0, 600));
      // Measure once the scroll has finished moving the page under the dock.
      await waitForBoxStill(page.getByTestId("app-shell-body-slot").locator("> *").first());
      await waitForBoxStill(close);
      const scrolled = await measure();
      expect(scrolled.close.y, "the dock header scrolled away with the page").toBeGreaterThanOrEqual(0);
      expect(scrolled.composer.y + scrolled.composer.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: `output/ix/dock-scrolled-${viewport.width}.png` });

      if (overlay) {
        // The overlay hides the opener, so the keyboard goes into the dock, and Escape puts it away.
        await expect
          .poll(() => frame.evaluate((el) => el.contains(document.activeElement)), {
            message: "focus stayed on the opener the overlay now covers",
          })
          .toBe(true);
        // The page the overlay covers is out of the Tab order while it is covered.
        expect(await page.locator("main#main").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
        await page.keyboard.press("Escape");
        await expect(frame).toHaveAttribute("data-dock-state", "put-away");
        expect(await activeTestId(page), "Escape dropped focus").toBe("project-detail-brief-ask-open");
        return;
      }
      await close.click();
      await expect(frame).toHaveAttribute("data-dock-state", "put-away");
      expect(await activeTestId(page), "closing the dock dropped focus").toBe("project-detail-brief-ask-open");
    });
  }

  test("project quick edit names the two names in the reader's words, not schema keys", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ko/project/fallback/?slug=storefront&guides=off");
    const toggle = page.getByTestId("public-quick-edit-toggle");
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();
    const hint = page.getByTestId("public-quick-edit-name-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("온라인 상점");
    const dialog = page.getByRole("dialog");
    await expect(dialog).not.toContainText(/display_|\(title\)/);
  });

  test("commit detail shows the reader's clock, not the ISO instant", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto("/ko/git/?guides=off");
    const item = page.getByTestId("atlas-git-history-item").first();
    await expect(item).toBeVisible({ timeout: 30_000 });
    await item.click();
    const detail = page.getByTestId("atlas-git-history-detail").locator("header").first();
    await expect(detail).toBeVisible();
    await expect(detail).not.toContainText(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    await expect(detail.locator("time[datetime]")).toHaveCount(1);
  });

  test("agents and MCP header actions and row actions share one step", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto("/ko/agents/?guides=off");
    const recheck = page.getByTestId("app-settings-runtimes-recheck");
    await expect(recheck).toBeVisible({ timeout: 30_000 });
    const recheckBox = await box(recheck);
    const chat = await box(page.getByTestId("app-settings-runtime-chat-claude-code"));
    const scan = await box(page.getByTestId("agent-doctor-scan").first());
    expect([chat.height, scan.height]).toEqual([32, 32]);
    expect(scan.fontSize, "the row's two actions use two type sizes").toBe(chat.fontSize);

    await page.getByTestId("agents-tab-mcp").click();
    const verify = page.getByTestId("agent-setup-verify-open");
    await expect(verify).toBeVisible({ timeout: 10_000 });
    const verifyBox = await box(verify);
    expect(verifyBox.height, "the MCP header action is a different height from the Agents one").toBe(recheckBox.height);
    expect(verifyBox.fontSize).toBe(recheckBox.fontSize);
  });

  test("a catalogue card's add and its other ways in stand on one step", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ko/agents/?tab=mcp&mcp=connectors&guides=off");
    await page.getByTestId("connectors-add-open").click({ timeout: 30_000 });
    await page.getByTestId("connectors-search").fill("context7");
    const row = page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="context7"]');
    await expect(row).toBeVisible();
    const add = await box(row.getByTestId("connectors-catalogue-add"));
    const other = await box(row.getByTestId("connectors-catalogue-other").first());
    expect([other.height, other.fontSize], "one card, two type sizes at one height").toEqual([add.height, add.fontSize]);
  });
});
