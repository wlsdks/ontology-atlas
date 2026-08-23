import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * Destination shortcuts — **all six destinations reachable by keyboard alone.**
 *
 * This spec is the feature's worth. The owner asked for *"Able to move everywhere and be tested with shortcuts
 * alone."* (able to move everywhere and be tested with shortcuts
 * alone), and this is where that sentence is proven. Passing means a person or an
 * agent can move through this app without clicking a coordinate.
 *
 * ⚠️ **Never verify by clicking coordinates.** Doing so would prove this spec's
 * claim by the very means it exists to rule out.
 */

/** Same order as the table — when the table changes this must too, and a contract test catches it. */
const DESTINATIONS = [
  { key: "m", path: "/topology" },
  { key: "d", path: "/docs" },
  { key: "i", path: "/ontology/insights" },
  { key: "p", path: "/projects" },
  { key: "a", path: "/agents" },
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

test.describe("목적지 이동 단축키", () => {
  // Width is pinned so the desktop rail and expanded INDEX keep one stable shape.
  // INDEX now includes a search input at this width; `focusShortcutSurface` moves
  // focus to the content root before testing keys that intentionally pause while typing.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
  });

  test("G + 글자로 여섯 목적지를 전부 간다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");

    for (const { key, path } of DESTINATIONS) {
      const expected = new RegExp(`/ko${path.replace(/\//g, "\\/")}/?($|\\?)`);
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
      await expect(page, `G ${key.toUpperCase()} 가 ${path} 로 가지 않았다`).toHaveURL(expected);
    }
  });

  /**
   * Idling guard — the test above could pass simply because it was already at that
   * address. This pins, once, that it really moved from one destination to a
   * **different** one.
   */
  test("이동 전후의 주소가 실제로 다르다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    /*
     * ⚠️ **Do not press a key before the screen has settled** (full check audit,
     * 2026-08-17).
     *
     * This test alone lacked the two things the tour test above already had —
     * dismissing blocking surfaces and retrying. It therefore raced surfaces that mount
     * on arrival and failed intermittently in CI (run at 2026-08-17 06:54Z). The
     * neighbouring test's comment had already written the reason: *"the retry does not
     * hide a defect, it removes a race"*. The same prescription applies.
     */
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);
    const before = page.url();
    const expected = /\/ko\/projects\/?($|\?)/;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await dismissBlockingSurface(page);
      await go(page, "p");
      try {
        await expect(page).toHaveURL(expected, { timeout: 3_000 });
        break;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
    await expect(page).toHaveURL(expected);
    expect(page.url(), "주소가 안 바뀌었다").not.toBe(before);
  });

  test("G A 는 살아 있고, 은퇴한 G K · G S 는 어디에도 가지 않는다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);

    await go(page, "a");
    await expect(page, "살아 있는 단축키가 먼저 성공해야 G K 무동작 판정이 유효하다").toHaveURL(
      /\/ko\/agents\/?($|\?)/,
      { timeout: 5_000 },
    );

    const before = page.url();
    for (const retired of ["k", "s"]) {
      await go(page, retired);
      await page.waitForTimeout(600);
      expect(page.url(), `은퇴한 G ${retired.toUpperCase()} 가 다른 화면으로 이동했다`).toBe(before);
    }
  });

  /*
   * "Do not navigate while typing" is **not measured here**: with no vault selected
   * this app has no input on screen (measured 0 across four routes), and the input
   * obtained from the ⌘K palette is inside an `aria-modal`, so the modal condition
   * fires first and **deleting the typing condition still left it green**. Conditions
   * that mask each other are not a gate.
   * That condition is measured by `src/shared/lib/use-destination-shortcuts.test.ts`.
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
  test("막는 표면이 열려 있으면 이동하지 않는다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await dismissBlockingSurface(page);
    await focusShortcutSurface(page);
    await page.keyboard.press("?");
    const modal = page.locator('[aria-modal="true"]:visible').first();
    await expect(modal, "단축키 시트가 안 열렸다").toBeVisible({ timeout: 5_000 });

    const before = page.url();
    await go(page, "p");
    await page.waitForTimeout(600);
    expect(page.url(), "모달이 떠 있는데 뒤 화면이 바뀌었다").toBe(before);
  });

  test("리더를 누른 지 오래되면 글자만으로는 이동하지 않는다", async ({ page }) => {
    /*
     * ⚠️ **To measure "it does not navigate" you must first prove "it navigates"**
     * (full check audit, 2026-08-17).
     *
     * This test measures that the address does not change — but the address also does
     * not change when the shortcuts are **not attached at all**. So it stayed green even
     * with the feature entirely dead: the classic hole in a check that measures a
     * negative. It now navigates for real first in the same session, then measures the
     * time limit.
     */
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);
    await go(page, "p");
    await expect(page, "단축키 자체가 안 먹는다 — 아래 판정이 무의미해진다").toHaveURL(
      /\/ko\/projects\/?($|\?)/,
      { timeout: 5_000 },
    );

    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingSurface(page);
    const before = page.url();
    await page.keyboard.press("g");
    await page.waitForTimeout(2_000); // Longer than NAV_LEADER_WINDOW_MS — this wait is the thing under test
    await page.keyboard.press("p");
    await page.waitForTimeout(600);
    expect(page.url(), "시간 제한이 안 걸렸다").toBe(before);
  });

  test("단축키 시트가 여섯 목적지를 전부 안내한다", async ({ page }) => {
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
        `시트에 G ${key.toUpperCase()} 안내가 없다 — 발견할 수 없는 단축키는 기능이 아니다`,
      ).toContain(key.toUpperCase());
    }
  });
});
