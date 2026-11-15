import { expect, test, type Page } from "@playwright/test";

import {
  installHarnessRuntime,
  installProfilelessHarnessRuntime,
  mountHarnessVault,
} from "../harness-tab-fixture";
import { waitForAnimationsDone } from "../settle";

const AXE_PATH = require.resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const MIN_AXE_RULES_PASSED = 15;

const section = (page: Page, id: string) => page.locator(`[data-harness-section="${id}"]`);
const category = (page: Page, id: string) => page.getByTestId("harness-categories").locator(`[data-harness-group="${id}"]`);
const items = (page: Page) => page.getByTestId("harness-items").locator("[role=option]");

/**
 * **The Harness Setup page, read on a repository that actually has a harness.**
 *
 * The fixture's source carries a hook script the config names and the disk does not have, and a
 * declared skill pair whose two copies differ.
 */
test.describe("harness tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installHarnessRuntime(page);
  });

  test("Setup lists what the agent reads, what stops it and what checks it, and opens a file", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByTestId("harness-setup")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("하네스");
    await expect(page.locator("#harness-tab-overview")).toHaveAttribute("aria-selected", "true");
    const detail = page.getByTestId("harness-item-detail");

    await test.step("the three areas name their totals", async () => {
      await expect(section(page, "context").locator("[data-harness-section-total]")).toContainText("15");
      await expect(section(page, "guardrails").locator("[data-harness-section-total]")).toContainText("4");
      await expect(section(page, "verification").locator("[data-harness-section-total]")).toContainText("5");
    });

    await test.step("nothing folds: categories, items and the detail sit side by side", async () => {
      await expect(page.getByTestId("harness-setup").locator("[aria-expanded]")).toHaveCount(0);
      const boxes = await Promise.all(
        ["harness-categories", "harness-items", "harness-detail-pane"].map(async (id) => (await page.getByTestId(id).boundingBox())!),
      );
      expect(boxes[0]!.x + boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x + 1);
      expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[2]!.x + 1);
      expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
    });

    await test.step("the missing hook script is where the page arrives, counted on its category", async () => {
      await expect(category(page, "blockingHooks")).toHaveAttribute("aria-selected", "true");
      await expect(category(page, "blockingHooks").locator("[data-harness-problem-count]")).toHaveAttribute("data-harness-problem-count", "1");
      await expect(section(page, "guardrails").locator("header [data-harness-problem-count]")).toHaveAttribute("data-harness-problem-count", "1");
      await expect(detail).toHaveAttribute("data-harness-item", /block-npm-publish\.sh$/);
      await expect(detail.locator('[data-harness-status="missing"]')).toBeVisible();
      await expect(detail).toContainText("PreToolUse");
      await expect(page.getByTestId("harness-problems")).toContainText(".claude/hooks/block-npm-publish.sh");
    });

    await test.step("choosing a category lists its items and shows the first one", async () => {
      await category(page, "scripts").click();
      await expect(category(page, "scripts")).toHaveAttribute("aria-selected", "true");
      await expect(items(page)).toHaveCount(4);
      await expect(items(page).first()).toHaveAttribute("aria-selected", "true");
      const first = await items(page).first().getAttribute("data-harness-item");
      await expect(detail).toHaveAttribute("data-harness-item", first!);

      await category(page, "instructions").click();
      await page.getByTestId("harness-items").locator('[data-harness-item="file:CLAUDE.md"]').click();
      await expect(detail).toHaveAttribute("data-harness-item", "file:CLAUDE.md");
      await expect(detail).toContainText("@AGENTS.md");
    });

    await test.step("arrow keys move the selection in a pane, and the problem chip returns to the problem", async () => {
      await category(page, "instructions").focus();
      await page.keyboard.press("ArrowDown");
      await expect(category(page, "rules")).toBeFocused();
      await expect(category(page, "rules")).toHaveAttribute("aria-selected", "true");
      await expect(items(page)).toHaveCount(3);

      await page.getByTestId("harness-problems").locator('[data-harness-problem="hook-missing"]').click();
      await expect(category(page, "blockingHooks")).toHaveAttribute("aria-selected", "true");
      await expect(detail).toHaveAttribute("data-harness-item", /block-npm-publish\.sh$/);
    });

    await test.step("the open detail adds no WCAG violation", async () => {
      await waitForAnimationsDone(page.getByTestId("harness-setup"));
      if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE_PATH });
      const audit = await page.evaluate(async (tags) => {
        type Run = { violations: Array<{ id: string; nodes: unknown[] }>; passes: unknown[] };
        const run = await (window as unknown as { axe: { run: (context: Element, options: unknown) => Promise<Run> } }).axe.run(
          document.querySelector('[data-testid="harness-setup"]')!,
          { runOnly: { type: "tag", values: tags }, resultTypes: ["violations", "passes"] },
        );
        return { rulesPassed: run.passes.length, violations: run.violations.map((violation) => ({ id: violation.id, count: violation.nodes.length })) };
      }, WCAG_TAGS);
      expect(audit.rulesPassed, "the Setup axe collection was empty").toBeGreaterThanOrEqual(MIN_AXE_RULES_PASSED);
      expect(audit.violations).toEqual([]);
    });

    await test.step("the tool filter changes the counts and keeps an emptied category, dimmed", async () => {
      await expect(category(page, "rules").locator("[data-harness-group-count]")).toHaveText("3");
      await page.getByTestId("harness-tool-filter").getByRole("radio", { name: "Codex" }).click();
      await expect(section(page, "context").locator("[data-harness-section-total]")).toContainText("7");
      await expect(category(page, "rules").locator("[data-harness-group-count]")).toHaveText("0");
      await expect(category(page, "rules")).toBeDisabled();
      await expect(page.getByTestId("harness-problems")).toHaveCount(0);
      await expect(section(page, "verification").locator("[data-harness-section-total]")).toContainText("5");
    });
  });

  test("the retired guides address lands on Setup, keeping the rest of the address", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides&guides=off");
    await expect(page.getByTestId("harness-setup")).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).search).toBe("?view=overview&guides=off");
  });

  test("the way to other views never disappears on any screen", async ({ page }) => {
    /* The tab set must not be a property of the panel it switches; the empty blueprint returns early. */
    await installProfilelessHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=architecture");
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tab")).toHaveCount(2);
    const labelledBy = await page.locator('[role="tabpanel"]').first().getAttribute("aria-labelledby");
    await expect(page.locator(`#${labelledBy}`)).toHaveCount(1);

    await page.locator("#harness-tab-overview").click();
    await expect(page.getByTestId("harness-setup")).toBeVisible({ timeout: 30_000 });
  });

  test("with no profile, the architecture preview draws the connected source's own folders", async ({ page }) => {
    await installProfilelessHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=architecture");
    const preview = page.getByTestId("architecture-draft-preview");
    await expect(preview).toHaveAttribute("data-preview-source", "connected");
    await expect(page.getByTestId("architecture-draft-preview-label")).toContainText("storefront");
    for (const folder of ["api", "docs", "scripts", "src"]) {
      await expect(preview.getByText(folder, { exact: true })).toBeVisible();
    }
  });

  test("under reduced motion the architecture preview is one still, finished picture", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installProfilelessHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=architecture");
    const preview = page.getByTestId("architecture-draft-preview");
    await expect(preview).toHaveAttribute("data-preview-state", "still");
    expect(await preview.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(preview.getByTestId("architecture-draft-preview-violation")).toBeVisible();
  });

  test("focus stays on the tab when the view is moved by keyboard", async ({ page }) => {
    /* One `TabBar` instance: a second one unmounted the focused tab and focus fell to `<body>`. */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await page.locator("#harness-tab-overview").focus();
    for (const key of ["ArrowRight", "ArrowLeft", "End", "Home"]) {
      await page.keyboard.press(key);
      const state = await page.evaluate(() => ({
        role: document.activeElement?.getAttribute("role"),
        selected: document.activeElement?.getAttribute("aria-selected"),
      }));
      expect(state.role, `focus left the tab set after ${key}`).toBe("tab");
      expect(state.selected, `focus landed on an unselected tab after ${key}`).toBe("true");
    }
  });
});
