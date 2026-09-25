import { expect, test, type Page } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";

/**
 * **The keys the shortcut sheet teaches answer on every rail screen** (2026-09-26).
 *
 * The sheet's Navigation section — the one it shows on every tab of every screen — lists ⌘K and
 * `?` beside the `G` keys. The `G` keys are the shell's and always worked; ⌘K and `?` were wired
 * only by screens that drew their own dialog. Measured against a real folder on 2026-09-25, both
 * did nothing on Library, Git, Automations, Agents and the harness (0 of 5), so the keyboard's
 * own reference could not be opened on five of eight destinations. The shell answers them now.
 *
 * Also held here: the sheet teaches one search key (not ⌘K and ⇧⌘K as two searches that opened
 * one dialog), and it does not list `D`, which only the map binds, outside the map.
 */
const SCREENS = ["library", "git", "automations", "agents", "architecture"] as const;

async function focusContent(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.querySelector<HTMLElement>("main#main")?.focus({ preventScroll: true });
  });
}

/** The Navigation section's rows as "label: keys". */
async function navigationRows(page: Page): Promise<string[]> {
  return page.getByRole("dialog", { name: "Keyboard shortcuts" }).evaluate((root) => {
    const heading = Array.from(root.querySelectorAll("p")).find((p) => p.textContent === "Navigation");
    return Array.from(heading?.closest("section")?.querySelectorAll("dl > div") ?? []).map((row) => {
      const label = row.querySelector("dt")?.textContent ?? "";
      const keys = Array.from(row.querySelectorAll("kbd")).map((kbd) => kbd.textContent).join(" ");
      return `${label}: ${keys}`;
    });
  });
}

test.describe("? and ⌘K on every rail screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
  });

  for (const id of SCREENS) {
    test(`${id}: ? opens the shortcut sheet and ⌘K opens the search`, async ({ page }) => {
      const tile = page.getByTestId(`app-nav-rail-item-${id}`);
      await tile.click();
      await expect(tile).toHaveAttribute("aria-current", "page");

      await focusContent(page);
      await page.keyboard.press("?");
      const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
      await expect(sheet).toBeVisible();
      const rows = await navigationRows(page);
      expect(rows.filter((row) => row.endsWith("⌘ K"))).toEqual(["Open the search palette: ⌘ K"]);
      expect(rows.some((row) => row.includes("⇧")), "⇧⌘K is the same search, not a second row").toBe(false);
      expect(rows.some((row) => row.endsWith(": D")), "only the map binds D").toBe(false);
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);

      await focusContent(page);
      await page.keyboard.press("ControlOrMeta+k");
      const search = page.locator("[data-global-search-responsive-contract]");
      await expect(search).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(search).toHaveCount(0);
    });
  }
});
