import { expect, test, type Page } from "@playwright/test";

import {
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

const problem = (page: Page, kind: string) =>
  page.getByTestId("harness-problems").locator(`[data-harness-problem="${kind}"]`);

test.describe("harness Setup files and statuses", () => {
  test("a hook command that runs no script file is shown as written, with no status and no problem", async ({ page }) => {
    await openSetup(page, { source: UNRESOLVED_HOOK_SOURCE });
    await expect(page.getByTestId("harness-problems")).not.toContainText("npx prettier");
    const verification = page.locator('[data-harness-section="verification"]');
    await verification.locator('[data-harness-group="hooks"] button[aria-expanded]').click();
    const row = verification.locator("[data-harness-item]").filter({ hasText: "npx prettier --write ." });
    await expect(row).toBeVisible();
    await expect(row.locator("[data-harness-status]")).toHaveCount(0);
    await row.click();
    const detail = page.getByTestId("harness-item-detail");
    await expect(detail).toContainText("PostToolUse");
    await expect(detail.locator("[data-harness-status]")).toHaveCount(0);
  });

  test("a Codex hook says it needs approval in Codex beside its own status", async ({ page }) => {
    await openSetup(page, { source: MISSING_CODEX_HOOK_SOURCE, locale: "en" });
    const codexHooks = page.locator('[data-harness-section="guardrails"] [data-harness-item*=".codex/hooks.json"]');
    await page.locator('[data-harness-section="guardrails"] [data-harness-group="blockingHooks"] button[aria-expanded]').click();
    await expect(codexHooks).toHaveCount(2);
    for (const row of await codexHooks.all()) {
      await expect(row.locator('[data-harness-status="approval"]')).toHaveText("Needs approval in Codex");
    }
    await expect(problem(page, "hook-missing").filter({ hasText: "block-npm-publish.sh" })).toHaveCount(2);
  });

  test("Claude and Codex copies that differ are a neutral fact that opens side by side", async ({ page }) => {
    await openSetup(page, { locale: "en" });
    await expect(page.getByTestId("harness-problems").locator("[data-harness-problem]")).toHaveCount(1);
    await expect(problem(page, "hook-missing")).toHaveCount(1);
    const context = page.locator('[data-harness-section="context"]');
    await context.locator('[data-harness-group="skills"] button[aria-expanded]').click();
    await context.locator('[data-harness-item="skill:.claude/skills/po-pass"]').click();
    const detail = page.getByTestId("harness-item-detail");
    await expect(detail.locator('[data-harness-status="copy"]')).toHaveText("Differs from Codex copy");
    const diff = page.getByTestId("harness-drift-diff");
    await expect(diff).toContainText(".claude/skills/po-pass/SKILL.md");
    await expect(diff).toContainText(".agents/skills/po-pass/SKILL.md");
    await expect(diff.locator('[data-harness-drift-line="only-here"]').first()).toBeVisible();
  });

  test("at phone width a file opens in place of the lists, and the lists come back", async ({ page }) => {
    await openSetup(page, { viewport: { width: 390, height: 844 } });
    const titles = page.locator("[data-harness-section] h2");
    await expect(titles).toHaveCount(3);
    for (const title of await titles.all()) {
      const clipped = await title.evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(clipped, "a section title is clipped at 390px").toBeLessThanOrEqual(0);
    }
    await expect(page.getByTestId("harness-item-detail")).toHaveCount(0);

    await problem(page, "hook-missing").click();
    await expect(page.getByTestId("harness-item-detail")).toBeVisible();
    await expect(page.locator("[data-harness-section]")).toHaveCount(0);

    await page.getByTestId("harness-detail-back").click();
    await expect(page.locator("[data-harness-section]")).toHaveCount(3);
  });
});
