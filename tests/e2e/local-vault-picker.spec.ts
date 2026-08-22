import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { useDogfoodSample } from "./sample-source";

/**
 * Regression guard for the local working-folder entry policy.
 *
 * [Rewritten 2026-07] PR #435 (P1b/N1) inverted the policy: the gate looks at
 * **capability (FSA support)**, not at the runtime (web vs desktop). A web session
 * in an FSA-capable browser (including Chromium) can open a local vault directly,
 * and `?intent=local` opens the local workspace picker. The previous spec asserting
 * the old contract (hosted is read-only plus macOS download guidance) was a rotten
 * spec that should have been swept away with #435.
 *
 * ⚠️ **[2026-08-08] The source indicator lives in the vault chip menu, not a header
 * radio.** PR #987 removed the 「샘플|로컬」 radio pair on the right of the header and
 * moved that judgement into the vault chip menu. This spec was still clicking those
 * radios, so two tests died on a 2-minute timeout — **the second victim of the same
 * cause** as `docs-deeplink.spec.ts`. Use `expectSourceIs*` below to read source
 * state.
 *
 * Running it requires a separate dev server (`next dev -p 3100`).
 *   pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts
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
   * ⚠️ Do not rely on a single click. On the dev server a click landing before
   * hydration is lost, and no subsequent wait revives it — it passes on the static
   * export and dies only in dev (measured 2026-08-09).
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
    await expect(documentList.getByRole("button", { name: "Agent Graph Workflow" })).toBeVisible();
  });
});
