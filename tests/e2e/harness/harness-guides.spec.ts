import { expect, test, type Page } from "@playwright/test";

import {
  CROWDED_SOURCE,
  HOOKLESS_SOURCE,
  MISSING_CODEX_HOOK_SOURCE,
  UNRESOLVED_HOOK_SOURCE,
  installHarnessRuntime,
  mountHarnessVault,
} from "../harness-tab-fixture";

type SetupOptions = { source?: Record<string, string>; locale?: string; viewport?: { width: number; height: number } };

async function openSetup(page: Page, { source, locale = "ko", viewport }: SetupOptions = {}) {
  await page.setViewportSize({ width: 1512, height: 900 });
  await installHarnessRuntime(page, { sourceOverrides: source });
  await mountHarnessVault(page);
  if (viewport) await page.setViewportSize(viewport);
  await page.goto(`/${locale}/architecture/`);
  await expect(page.getByTestId("harness-setup")).toBeVisible({ timeout: 30_000 });
}

const category = (page: Page, id: string) => page.getByTestId("harness-categories").locator(`[data-harness-group="${id}"]`);
const item = (page: Page, key: string) => page.getByTestId("harness-items").locator(`[data-harness-item="${key}"]`);
const items = (page: Page) => page.getByTestId("harness-items").locator("[role=option]");
const problemChip = (page: Page, kind: string) =>
  page.getByTestId("harness-problems").locator(`[data-harness-problem="${kind}"]`);

test.describe("harness Setup files and statuses", () => {
  test("a hook command that runs no script file is shown as written, with no status and no problem", async ({ page }) => {
    await openSetup(page, { source: UNRESOLVED_HOOK_SOURCE });
    await expect(page.getByTestId("harness-problems")).toHaveCount(0);
    await category(page, "hooks").click();
    const row = items(page).filter({ hasText: "npx prettier --write ." });
    await expect(row).toBeVisible();
    await expect(row.locator("[data-harness-status]")).toHaveCount(0);
    await row.click();
    const detail = page.getByTestId("harness-item-detail");
    await expect(detail).toContainText("PostToolUse");
    await expect(detail.locator("[data-harness-status]")).toHaveCount(0);
  });

  test("a Codex hook says it needs approval in Codex beside its own status", async ({ page }) => {
    await openSetup(page, { source: MISSING_CODEX_HOOK_SOURCE, locale: "en" });
    await expect(category(page, "blockingHooks")).toHaveAttribute("aria-selected", "true");
    const codexHooks = page.getByTestId("harness-items").locator('[data-harness-item*=".codex/hooks.json"]');
    await expect(codexHooks).toHaveCount(2);
    for (const row of await codexHooks.all()) {
      await expect(row.locator('[data-harness-status="approval"]')).toHaveText("Needs approval in Codex");
    }
    await expect(category(page, "blockingHooks").locator("[data-harness-problem-count]")).toHaveAttribute("data-harness-problem-count", "2");
    await expect(page.getByTestId("harness-problems")).toContainText("2 problems");
  });

  test("a repository with no hooks has no problems and lists its scripts on disk as not wired", async ({ page }) => {
    await openSetup(page, { source: HOOKLESS_SOURCE, locale: "en" });
    await expect(page.getByTestId("harness-problems")).toHaveCount(0);
    for (const id of ["contextHooks", "blockingHooks", "hooks", "otherHooks"]) {
      await expect(category(page, id)).toHaveCount(0);
    }
    const unwired = category(page, "unwiredHooks");
    await expect(unwired.locator("[data-harness-group-count]")).toHaveText("2");
    await unwired.click();
    await expect(items(page).first().locator('[data-harness-status="unwired"]')).toHaveText("Not wired");
  });

  test("a crowded repository keeps the page inside the window and scrolls its lists", async ({ page }) => {
    await openSetup(page, { source: CROWDED_SOURCE });
    const blocking = category(page, "blockingHooks");
    await expect(blocking.locator("[data-harness-group-count]")).toHaveText("21");
    await blocking.click();
    await expect(items(page)).toHaveCount(21);
    await expect
      .poll(() => page.getByTestId("harness-items").evaluate((node) => node.scrollHeight - node.clientHeight), {
        message: "the long item list should scroll inside its pane",
      })
      .toBeGreaterThan(0);
    const box = (await page.getByTestId("harness-setup").boundingBox())!;
    expect(box.y + box.height, "the Setup slot grew past the window").toBeLessThanOrEqual(900);
  });

  test("Claude and Codex copies that differ are a neutral fact that opens side by side", async ({ page }) => {
    await openSetup(page, { locale: "en" });
    await expect(page.getByTestId("harness-problems").locator("[data-harness-problem]")).toHaveCount(1);
    await expect(problemChip(page, "hook-missing")).toHaveCount(1);
    await category(page, "skills").click();
    await item(page, "skill:.claude/skills/po-pass").click();
    const detail = page.getByTestId("harness-item-detail");
    await expect(detail.locator('[data-harness-status="copy"]')).toHaveText("Differs from Codex copy");
    const diff = page.getByTestId("harness-drift-diff");
    await expect(diff).toContainText(".claude/skills/po-pass/SKILL.md");
    await expect(diff).toContainText(".agents/skills/po-pass/SKILL.md");
    await expect(diff.locator('[data-harness-drift-line="only-here"]').first()).toBeVisible();
  });

  test("at phone width the items follow the categories and a file opens in a dialog that returns focus", async ({ page }) => {
    await openSetup(page, { viewport: { width: 390, height: 844 } });
    const titles = page.locator("[data-harness-section] h2");
    await expect(titles).toHaveCount(3);
    for (const title of await titles.all()) {
      const clipped = await title.evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(clipped, "an area title is clipped at 390px").toBeLessThanOrEqual(0);
    }
    const categories = (await page.getByTestId("harness-categories").boundingBox())!;
    const list = (await page.getByTestId("harness-items").boundingBox())!;
    expect(list.y, "the items should follow the categories").toBeGreaterThanOrEqual(categories.y + categories.height - 1);
    await expect(page.getByTestId("harness-item-detail")).toHaveCount(0);

    await problemChip(page, "hook-missing").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("harness-item-detail")).toHaveAttribute("data-harness-item", /block-npm-publish\.sh$/);
    await page.getByTestId("harness-detail-close").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(problemChip(page, "hook-missing")).toBeFocused();
  });

  test("at phone width Escape closes an opened file and returns to its row where the list stood", async ({ page }) => {
    await openSetup(page, { viewport: { width: 390, height: 844 } });
    await category(page, "scripts").click();
    const row = item(page, "script:test:cart");
    await row.scrollIntoViewIfNeeded();
    const scroll = page.getByTestId("harness-setup");
    const before = await scroll.evaluate((node) => node.scrollTop);
    expect(before, "the row should sit below the first screen").toBeGreaterThan(0);

    await row.click();
    await expect(page.getByTestId("harness-item-detail")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row).toBeFocused();
    expect(await scroll.evaluate((node) => node.scrollTop)).toBe(before);
  });
});
