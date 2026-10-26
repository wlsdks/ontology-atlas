import { expect, test, type Page } from "@playwright/test";
import { waitForFiniteAnimations } from "../visual-ready";

import {
  CODEX_ONLY_BRIEF_SOURCE,
  CROWDED_SOURCE,
  HOOKLESS_SOURCE,
  MISSING_CODEX_HOOK_SOURCE,
  ONE_SIDED_BRIEF_SOURCE,
  UNRESOLVED_HOOK_SOURCE,
  installHarnessRuntime,
  mountHarnessVault,
} from "../harness-tab-fixture";

type GuidesOptions = { source?: Record<string, string>; locale?: string; viewport?: { width: number; height: number } };

async function openGuides(page: Page, { source, locale = "ko", viewport }: GuidesOptions = {}) {
  await page.setViewportSize({ width: 1512, height: 900 });
  await installHarnessRuntime(page, { sourceOverrides: source });
  await mountHarnessVault(page);
  if (viewport) await page.setViewportSize(viewport);
  await page.goto(`/${locale}/architecture/?view=guides`);
  await expect(page.getByTestId("harness-guide-detail")).toBeVisible({ timeout: 30_000 });
}

const claudeHookRow = (page: Page) =>
  page.getByTestId("harness-guide-list-pane").getByRole("button", { name: /\.claude\/settings\.json/ });

test.describe("harness guides workbench", () => {
  test("a hook whose command names no script file is unresolved, not wired", async ({ page }) => {
    await openGuides(page, { source: UNRESOLVED_HOOK_SOURCE });
    const status = claudeHookRow(page).getByTestId("harness-hook-row-status");
    await expect(status).toContainText("경로 확인 안 됨");
    await expect(status).toContainText("스크립트 1개");
    await expect(status).not.toContainText("연결됨");
  });

  test("a config with permissions and no hooks claims nothing is wired", async ({ page }) => {
    await openGuides(page, { source: HOOKLESS_SOURCE });
    const status = claudeHookRow(page).getByTestId("harness-hook-row-status");
    await expect(status).toHaveText("스크립트 0개");
  });

  test("a hook row's status tags wrap below the config path instead of truncating it", async ({ page }) => {
    await openGuides(page, { source: MISSING_CODEX_HOOK_SOURCE, locale: "en" });
    const row = page.getByTestId("harness-guide-list-pane").getByRole("button", { name: /\.codex\/hooks\.json/ });
    await expect(row).toContainText("Script missing");
    await expect(row).toContainText("Needs approval inside the tool");
    const name = row.getByText(".codex/hooks.json", { exact: true });
    const clipped = await name.evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(clipped, "the config path is truncated by its status tags").toBeLessThanOrEqual(0);
  });

  test("a file on one side only is listed once, and the folder lacking it counts it as missing", async ({ page }) => {
    await openGuides(page, { source: ONE_SIDED_BRIEF_SOURCE, locale: "en" });
    const list = page.getByTestId("harness-guide-list-pane");
    await page.getByTestId("harness-guide-row-claude-agents").locator("button[aria-expanded]").click();
    await expect(list.locator("[data-guide-item]", { hasText: "scout.md" })).toHaveCount(1);
    const holding = page.getByTestId("harness-guide-row-claude-agents").locator("[data-guide-item]");
    await expect(holding.first()).toContainText("1 file has no twin");
    await expect(holding.filter({ hasText: "scout.md" })).toContainText("No twin");

    const lacking = page.getByTestId("harness-guide-row-agents-agents").locator("[data-guide-item]");
    await expect(lacking).toContainText("1 file missing");
    await expect(lacking).not.toContainText("No twin");
    await lacking.click();
    const detail = page.getByTestId("harness-guide-detail");
    await expect(detail).not.toContainText("Same content");
    await expect(detail).not.toContainText("No twin");
    await expect(detail.getByTestId("harness-pair-missing")).toHaveText("scout.md");
    const pair = detail.locator("dd").filter({ has: page.getByTestId("harness-pair-missing") });
    expect((await pair.innerText()).split(".claude/agents/").length - 1, "the twin folder is named twice").toBe(1);
  });

  test("the view opens on a file that differs from its twin, past a folder of one-sided files", async ({ page }) => {
    await openGuides(page, { source: CODEX_ONLY_BRIEF_SOURCE });
    const other = page.getByTestId("harness-guide-row-agents-agents");
    const toggle = other.locator("button[aria-expanded]");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(other.locator("[data-guide-item]", { hasText: "lookout.md" })).toBeHidden();
    await expect(page.getByTestId("harness-guide-list-pane").locator('button[aria-expanded="true"]')).toHaveCount(1);
    const diff = page.getByTestId("harness-drift-diff");
    await expect(diff).toContainText("Claude Code");
    await expect(diff).toContainText("Codex");
    await expect(diff).toContainText(".agents/skills/po-pass/SKILL.md");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await other.locator("[data-guide-item]").first().click();
    await page.keyboard.press("ArrowRight");
    const file = other.locator("[data-guide-item]", { hasText: "lookout.md" });
    await expect(file).toBeFocused();
    await expect(file).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("harness-guide-list-pane").locator('[data-guide-item="AGENTS.md"]').click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(file).toBeVisible();
  });

  test("a line both files share sits on one y, and a line only one file has faces an empty cell", async ({ page }) => {
    const wrapped = `Wraps on the claude side only. ${"word ".repeat(60)}`;
    await openGuides(page, {
      source: {
        ".claude/skills/po-pass/SKILL.md": ["# po-pass", "", "Route the work.", wrapped, "Second shared line.", ""].join("\n"),
        ".agents/skills/po-pass/SKILL.md": ["# po-pass", "", "Inserted before the shared line.", "Route the work.", "Wraps on the claude side only.", "Second shared line.", ""].join("\n"),
      },
    });
    const diff = page.getByTestId("harness-drift-diff");
    await expect(diff).toBeVisible();
    await waitForFiniteAnimations(page);
    const yOf = (text: string) =>
      diff.getByText(text, { exact: true }).evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().y)));
    const routeYs = await yOf("Route the work.");
    expect(routeYs).toHaveLength(2);
    expect(routeYs[0]).toBe(routeYs[1]);
    const secondYs = await yOf("Second shared line.");
    expect(secondYs).toHaveLength(2);
    expect(secondYs[0]).toBe(secondYs[1]);

    const only = diff.locator('[data-harness-drift-line="only-here"]', { hasText: "Inserted before the shared line." });
    await expect(only).toHaveCount(1);
    const onlyY = Math.round((await only.boundingBox())!.y);
    const gap = await diff.locator("[data-harness-drift-gap]").evaluateAll((nodes) =>
      nodes.map((node) => ({ y: Math.round(node.getBoundingClientRect().y), text: node.textContent })),
    );
    expect(gap.filter((cell) => cell.y === onlyY)).toEqual([{ y: onlyY, text: "" }]);
  });

  test("at 1040 the list and the detail stay side by side, with the diff on screen", async ({ page }) => {
    await openGuides(page, { viewport: { width: 1040, height: 720 } });
    await waitForFiniteAnimations(page);
    const list = await page.getByTestId("harness-guide-list-pane").boundingBox();
    const detail = await page.getByTestId("harness-guide-detail-pane").boundingBox();
    expect(Math.abs(detail!.y - list!.y), "the detail stacks under the list").toBeLessThan(1);
    expect(detail!.x).toBeGreaterThanOrEqual(list!.x + list!.width - 1);
    await expect(page.getByTestId("harness-drift-diff")).toBeInViewport({ ratio: 1 });
  });

  test("the headline's hint stays on the line of its last word in every locale", async ({ page }) => {
    await openGuides(page);
    for (const locale of ["en", "ko", "ja", "zh"]) {
      await page.goto(`/${locale}/architecture/?view=guides`);
      await expect(page.getByTestId("harness-guide-detail")).toBeVisible({ timeout: 30_000 });
      const offset = await page.getByTestId("harness-sentence").evaluate((root) => {
        const line = root.firstElementChild!;
        const rects = line.firstElementChild!.getClientRects();
        const last = rects[rects.length - 1]!;
        const hint = line.querySelector("button")!.getBoundingClientRect();
        return Math.abs((hint.top + hint.bottom) / 2 - (last.top + last.bottom) / 2);
      });
      expect(offset, `${locale}: the hint wrapped onto a line of its own`).toBeLessThan(8);
    }
  });

  test("the list and the detail each scroll on their own while the page stays put", async ({ page }) => {
    await openGuides(page, { source: CROWDED_SOURCE });
    const skills = page.getByTestId("harness-guide-row-claude-skills").locator("button[aria-expanded]");
    if (await skills.getAttribute("aria-expanded") === "false") await skills.click();
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
