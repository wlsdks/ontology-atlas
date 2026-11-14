import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../first-run-seed";
import { waitFrames } from "../settle";

/** Same order as the table — when the table changes this must too, and a contract test catches it. */
const DESTINATIONS = [
  { key: "m", path: "/topology" },
  { key: "r", path: "/architecture" },
  { key: "d", path: "/library" },
  { key: "l", path: "/library" },
  { key: "p", path: "/projects" },
  { key: "a", path: "/agents" },
  { key: "c", path: "/agents/?tab=mcp" },
  { key: "g", path: "/git" },
] as const;

async function go(page: import("@playwright/test").Page, key: string) {
  await page.keyboard.press("g");
  await page.keyboard.press(key);
}

/** A blocking surface appearing on arrival is dismissed with Escape, as a real user would, and the tour continues. */
async function dismissBlockingSurface(page: import("@playwright/test").Page) {
  const visibleModal = page.locator('[aria-modal="true"]:visible').first();
  if (await visibleModal.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(visibleModal).toBeHidden({ timeout: 3_000 });
  }
}

/** Move focus out of INDEX inputs without depending on a coordinate that can become a control. */
async function focusShortcutSurface(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("topology-shortcuts-help-button")).toBeVisible({ timeout: 15_000 });
  const main = page.locator("main").first();
  await main.focus();
  await expect(main).toBeFocused();
}

test.describe("destination shortcuts", () => {
  // Width is pinned so the desktop rail and expanded INDEX keep one stable shape.
  // INDEX now includes a search input at this width; `focusShortcutSurface` moves
  // focus to the content root before testing keys that intentionally pause while typing.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
  });

  test("G plus a letter reaches every destination", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");

    for (const { key, path } of DESTINATIONS) {
      // G D is the published Docs alias; await its canonical Library destination,
      // including the Ontology tab, rather than racing the intermediate /docs URL.
      const expected = key === "d"
        ? /\/ko\/library\/(?=[^#]*[?&]tab=ontology(?:&|$))/
        : key === "c"
          ? /\/ko\/agents\/(?=[^#]*[?&]tab=mcp(?:&|$))/
          : new RegExp(`/ko${path.replace(/\//g, "\\/")}/?($|\\?)`);
      /*
       * **Retry once.** Some blocking surfaces mount on arrival, so one can appear
       * between the dismissal check and the key press. The first attempt is then
       * correctly rejected and the tour breaks intermittently — that flake was actually
       * observed. The retry does not hide a defect, it **removes a race**, and a second
       * failed attempt is a real failure.
       */
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await dismissBlockingSurface(page);
        await go(page, key);
        try {
          await expect(page).toHaveURL(expected, { timeout: 3_000 });
          break;
        } catch (error) {
          if (attempt === 1) throw error;
        }
      }
      await expect(page, `G ${key.toUpperCase()} did not go to ${path}`).toHaveURL(expected);

      /* Assert the selected tab as well as the URL: a broken query parse would leave the URL right. */
      if (key === "c") {
        await expect(page.getByTestId("agents-tab-mcp")).toHaveAttribute("aria-selected", "true");
        await expect(page.getByTestId("agents-tab-agents")).toHaveAttribute(
          "aria-selected",
          "false",
        );
      }
    }
  });

  test("G A works, and the retired G K, G S and G I go nowhere", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);

    await go(page, "a");
    await expect(page, "the live shortcut must succeed first for the G K no-op verdict to be valid").toHaveURL(
      /\/ko\/agents\/?($|\?)/,
      { timeout: 5_000 },
    );

    const before = page.url();
    for (const retired of ["k", "s", "i"]) {
      await go(page, retired);
      /*
       * An **absence**: nothing positive marks "this keystroke did nothing", so the
       * wait can only be an opportunity for the navigation to happen. Counting it in
       * drawn frames rather than in milliseconds makes it the browser's own unit — a
       * loaded machine spends longer over the same thirty, where 600 ms shrank.
       */
      await waitFrames(page, 30);
      expect(page.url(), `the retired G ${retired.toUpperCase()} navigated to another screen`).toBe(before);
    }
  });

  /*
   * "Do not navigate while typing" is **not measured here**: with no vault selected
   * this app has no input on screen (measured 0 across four routes), and the input
   * obtained from the ⌘K palette is inside an `aria-modal`, so the modal condition
   * fires first and **deleting the typing condition still left it green**. Conditions
   * that mask each other are not a gate.
   * That condition is measured by `src/shared/lib/keyboard/use-destination-shortcuts.test.ts`.
   */

  /**
   * The property locked here is exactly one: **the screen behind a modal does not
   * change while it is open.** Whether the modal stays open is that surface's own key
   * handling and is not measured here — folding in someone else's property makes this
   * spec break spuriously when that surface changes.
   *
   * The modal chosen is one **opened by keyboard** (the shortcut sheet). Opening the
   * settings sheet by click failed intermittently because it has two triggers
   * depending on width — and since this spec's whole point is "keyboard alone
   * works", producing the state with a mouse would not fit.
   */
  test("does not navigate while a blocking surface is open", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await dismissBlockingSurface(page);
    await focusShortcutSurface(page);
    await page.keyboard.press("?");
    const modal = page.locator('[aria-modal="true"]:visible').first();
    await expect(modal, "the shortcuts sheet did not open").toBeVisible({ timeout: 5_000 });

    const before = page.url();
    await go(page, "p");
    // An absence again: thirty drawn frames of opportunity, counted in frames.
    await waitFrames(page, 30);
    expect(page.url(), "the screen behind changed while a modal was open").toBe(before);
  });

  test("a letter alone does not navigate once the leader key was pressed long ago", async ({ page }) => {
    /* Navigate for real first: the address also stays unchanged when the shortcuts are not attached. */
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);
    await go(page, "p");
    await expect(page, "the shortcut itself does not work, which makes the verdict below meaningless").toHaveURL(
      /\/ko\/projects\/?($|\?)/,
      { timeout: 5_000 },
    );

    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);
    const before = page.url();
    await page.keyboard.press("g");
    // ⚠️ Kept in milliseconds: this wait **is** the thing under test — it has to be
    // longer than NAV_LEADER_WINDOW_MS for the leader to have expired.
    // measurement window: real time past the leader's expiry is the claim.
    await page.waitForTimeout(2_000);
    await page.keyboard.press("p");
    await waitFrames(page, 30);
    expect(page.url(), "the time limit did not apply").toBe(before);
  });

  test("the shortcuts sheet lists every destination", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await dismissBlockingSurface(page);
    // `?` is wired by the map (HomePage) through `useTypingShortcuts`. It does not
    // fire while an input has focus, so focus the content root explicitly.
    await focusShortcutSurface(page);
    await page.keyboard.press("?");
    const sheet = page.getByTestId("shortcut-sheet-scroll");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    const text = await sheet.innerText();
    for (const { key } of DESTINATIONS) {
      expect(
        text.toUpperCase(),
        `the sheet has no entry for G ${key.toUpperCase()}; a shortcut that cannot be discovered is not a feature`,
      ).toContain(key.toUpperCase());
    }
  });
});
