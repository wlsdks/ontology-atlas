import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "../first-run-seed";
import { useDogfoodSample } from "../sample-source";

/**
 * The gate looks at capability (File System Access support), not runtime, so a web session in a
 * capable browser opens a local vault and `?intent=local` opens the picker. Needs `next dev -p 3100`.
 */

/**
 * Opens the vault chip menu, reads which source is selected, and closes it.
 *
 * The menu items are `menuitemradio`, so selection appears as `aria-checked` — that
 * attribute is read rather than the label text, so the contract survives a locale
 * change.
 */
async function expectSourceIs(page: import("@playwright/test").Page, which: "sample" | "local") {
  /*
   * Do not rely on a single click: on the dev server a click before hydration is lost and no later wait
   * revives it, so this passes on the static export and fails only in dev.
   */
  // Take only what is visible — during a transition the same testid matches twice (same reason as above).
  const trigger = page.locator('[data-testid="vault-chip-menu-trigger"]:visible');
  const picked = page.locator(`[data-testid="vault-chip-use-${which}"]:visible`);
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () => {
        if (await picked.isVisible().catch(() => false)) return true;
        await trigger.click({ timeout: 5_000 }).catch(() => undefined);
        return picked.isVisible().catch(() => false);
      },
      { timeout: 20_000, message: "볼트 칩 메뉴가 열리지 않았다 — 다시 눌러야 한다" },
    )
    .toBe(true);
  await expect(picked).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  /*
   * **Wait for the exit.** A `Surface` stays in the DOM as `inert` while leaving
   * (EXIT_WINDOW_MS in `use-presence.ts`), and Playwright's text selectors still find
   * inert elements — which really did kill the very next assertion with a strict-mode
   * conflict (the menu's "Built-in sample (this tool's own documents)" matched a
   * second time). Without waiting for the close, this helper contaminates the
   * assertions that follow.
   */
  await expect(picked).toBeHidden();
}

const PRESET_LOCAL_SOURCE = `
  try { window.localStorage.setItem('demo:docs-vault:source', 'local'); }
  catch (_) { /* private mode */ }
`;

test.describe("local workspace capability gate (N1)", () => {
  // This spec verifies the docs chrome for a **returning** user — with the
  // first-visit guidance overlay up, its scrim swallows clicks (the guidance itself
  // has its own spec).
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
  });

  test("browser local intent opens the local workspace picker", async ({ page }) => {
    await page.addInitScript(PRESET_LOCAL_SOURCE);

    await page.goto("/en/docs/?intent=local");

    // FSA-capable browser: the Local source is selected and the picker surface appears.
    await expectSourceIs(page, "local");
    await expect(
      page.getByRole("heading", { name: /Open or create a local workspace/ }),
    ).toBeVisible();
    // The old read-only gate copy must not return.
    await expect(
      page.getByText(/Editing a local ontology workspace now starts in the installed macOS app/),
    ).toHaveCount(0);
  });

  test("sample source keeps the document tree browsable", async ({ page }) => {
    // This spec runs on dogfood data — the source is selected explicitly rather than assumed.
    await useDogfoodSample(page);
    await page.goto("/en/docs/");

    await expectSourceIs(page, "sample");
    // Since #987 the document count lives on the vault chip — sweeping the whole
    // banner would also catch the menu's copy, so it is measured where the fact
    // actually lives.
    await expect(page.getByTestId("vault-chip-menu-trigger")).toHaveText(
      /\d+ documents/,
    );
    // Contract: on desktop (lg+) the document list is expanded by default, and the
    // header's PanelLeft tile collapses and expands it to 0px, persisted in
    // localStorage.
    await expect(page.getByRole("navigation", { name: "Document list" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse document list" }).click();
    await expect(page.getByRole("navigation", { name: "Document list" })).toBeHidden();
    await page.getByRole("button", { name: "Expand document list" }).click();
    const documentList = page.getByRole("navigation", { name: "Document list" });
    await expect(documentList).toBeVisible();
    const expandFolder = async (name: RegExp) => {
      const folder = documentList.getByRole("button", { name });
      if ((await folder.getAttribute("aria-expanded")) !== "true") await folder.click();
      await expect(folder).toHaveAttribute("aria-expanded", "true");
    };
    await expandFolder(/^ontology \d+$/);
    await expandFolder(/^capabilities \d+$/);
    const current = documentList.locator('button[aria-current="page"]');
    await expect(current).toBeVisible();
    const other = documentList.locator('button:not([aria-expanded]):not([aria-current="page"])').first();
    await expect(other).toBeVisible();
    const otherTitle = (await other.innerText()).trim();
    await other.click();
    await expect(
      documentList.getByRole("button", { name: otherTitle, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator("main")).toContainText(otherTitle);
  });
});
