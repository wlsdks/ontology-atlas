import { expect, test, type Page } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "../desktop-rail-arrival-harness";

/** The shortcut sheet lists cmd-K and `?`, so the shell must answer them on every rail screen. */
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

// One folder mount serves every screen: the keys belong to the shell, so walking the rail
// under one mount proves them per screen without paying the mount five times.
test("? opens the shortcut sheet and ⌘K opens the search on every rail screen", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);

  for (const id of SCREENS) {
    const tile = page.getByTestId(`app-nav-rail-item-${id}`);
    await tile.click();
    await expect(tile, `${id}: the rail did not arrive`).toHaveAttribute("aria-current", "page");

    await focusContent(page);
    await page.keyboard.press("?");
    const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(sheet, `${id}: ? did not open the sheet`).toBeVisible();
    const rows = await navigationRows(page);
    expect(rows.filter((row) => row.endsWith("⌘ K")), id).toEqual(["Open the search palette: ⌘ K"]);
    expect(rows.some((row) => row.includes("⇧")), `${id}: ⇧⌘K is the same search, not a second row`).toBe(false);
    expect(rows.some((row) => row.endsWith(": D")), `${id}: only the map binds D`).toBe(false);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);

    await focusContent(page);
    await page.keyboard.press("ControlOrMeta+k");
    const search = page.locator("[data-global-search-responsive-contract]");
    await expect(search, `${id}: ⌘K did not open the search`).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(search).toHaveCount(0);
  }
});
