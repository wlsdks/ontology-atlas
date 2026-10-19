import { expect, test, type Page } from "@playwright/test";

import {
  CROWDED_SOURCE,
  HOOKLESS_SOURCE,
  UNRESOLVED_HOOK_SOURCE,
  installHarnessRuntime,
  mountHarnessVault,
} from "../harness-tab-fixture";

async function openGuides(page: Page, sourceOverrides?: Record<string, string>) {
  await page.setViewportSize({ width: 1512, height: 900 });
  await installHarnessRuntime(page, { sourceOverrides });
  await mountHarnessVault(page);
  await page.goto("/ko/architecture/?view=guides");
  await expect(page.getByTestId("harness-guide-detail")).toBeVisible({ timeout: 30_000 });
}

const claudeHookRow = (page: Page) =>
  page.getByTestId("harness-guide-list-pane").getByRole("button", { name: /\.claude\/settings\.json/ });

test.describe("harness guides workbench", () => {
  test("a hook whose command names no script file is unresolved, not wired", async ({ page }) => {
    await openGuides(page, UNRESOLVED_HOOK_SOURCE);
    const status = claudeHookRow(page).getByTestId("harness-hook-row-status");
    await expect(status).toContainText("경로 확인 안 됨");
    await expect(status).toContainText("스크립트 1개");
    await expect(status).not.toContainText("연결됨");
  });

  test("a config with permissions and no hooks claims nothing is wired", async ({ page }) => {
    await openGuides(page, HOOKLESS_SOURCE);
    const status = claudeHookRow(page).getByTestId("harness-hook-row-status");
    await expect(status).toHaveText("스크립트 0개");
  });

  test("the list and the detail each scroll on their own while the page stays put", async ({ page }) => {
    await openGuides(page, CROWDED_SOURCE);
    await expect(claudeHookRow(page)).toContainText("연결됨");
    await claudeHookRow(page).click();
    const pane = page.getByTestId("harness-guide-detail-pane");
    await expect(pane.locator("[data-harness-hook-status]")).toHaveCount(20);
    await expect(pane.locator("[inert]")).toHaveCount(0);

    const overflow = (testId: string) =>
      page.getByTestId(testId).evaluate((node) => node.scrollHeight - node.clientHeight);
    expect(await overflow("harness-guide-list-pane"), "the list does not overflow").toBeGreaterThan(0);
    expect(await overflow("harness-guide-detail-pane"), "the detail does not overflow").toBeGreaterThan(0);
    const panel = await page.locator('[role="tabpanel"]').evaluate((node) => node.scrollHeight - node.clientHeight);
    expect(panel, "the tab panel scrolls instead of the panes").toBeLessThanOrEqual(0);
  });

  test("Right and Left open and close a folder and move between it and its files", async ({ page }) => {
    await openGuides(page);
    const row = page.getByTestId("harness-guide-row-claude-skills");
    const folder = row.locator("[data-guide-item]").first();
    const chevron = row.locator("button[aria-expanded]");
    await folder.click();
    await expect(folder).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("ArrowLeft");
    await expect(chevron).toHaveAttribute("aria-expanded", "false");
    await expect(folder).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(chevron).toHaveAttribute("aria-expanded", "true");
    await expect(folder).toBeFocused();

    await page.keyboard.press("ArrowRight");
    const file = row.locator("[data-guide-item]").nth(1);
    await expect(file).toBeFocused();
    await expect(file).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("ArrowLeft");
    await expect(folder).toBeFocused();
    await expect(folder).toHaveAttribute("aria-pressed", "true");
  });

  test("the detail pane takes focus so a keyboard can scroll it", async ({ page }) => {
    await openGuides(page);
    const pane = page.getByTestId("harness-guide-detail-pane");
    await expect(pane).toHaveRole("region");
    await expect(pane).toHaveAttribute("tabindex", "0");
    await expect(page.getByRole("heading", { level: 2, name: "po-pass/SKILL.md" })).toBeVisible();
  });
});
