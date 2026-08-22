import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * Locks the first screen of the MCP connect pane (formerly "connect from the
 * terminal") against becoming complicated again.
 *
 * **Why** (2026-08-17). Owner: *"사용하기 복잡하지는 않을까"* (isn't this
 * complicated to use?). Answering from the source alone was wrong — the file is
 * 1,468 lines with 11 copy-state hooks, which read as "11 copy buttons in a row",
 * but **opening it and measuring found 4 copy buttons on screen and 1 on the first
 * screen**, because the advanced block was already collapsed (`advancedOpen`
 * defaults to false).
 *
 * > **A hook count is not a screen.** Conditional renders and collapsed blocks are
 * > all visible when counted in source and invisible on screen. Same lesson this
 * > repository has learned several times: to judge, measure **what was drawn**.
 *
 * So this spec is a **ratchet**, not a record of the current state. It turns red on
 * anything worse than today's values — growth is blocked, shrinking is free.
 *
 * ⚠️ **This is the web screen.** In the installed app the connect button actually
 * writes files, so something different is drawn. Proof of desktop-only behaviour is
 * accepted only from an installed build (`.claude/rules/surfaces.md`) — this spec
 * locks the web side only.
 */

/** Measured today (1512×900, fixture vault). Shrinking is allowed; growing is not. */
const CEILING = {
  /** Copy buttons visible at once on the first screen */
  copyVisibleFirstScreen: 1,
  /** Copy buttons in the whole pane */
  copyTotal: 4,
  /** How many screens of scrolling — 2.0 means two screens */
  scrollRatio: 2.0,
};

/**
 * When the pane does not scroll itself (as a destination, where the page scrolls),
 * the scroll multiple is measured as **pane height ÷ viewport** — the intended
 * meaning was always "how many screens until the end".
 */
test("「MCP 연결」 칸의 첫 화면 인구조사", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(
    page.getByTestId("first-run-starter"),
    "볼트가 안 물렸다 — 아래 측정은 전부 무의미하다.",
  ).toHaveCount(0, { timeout: 30_000 });

  /*
   * ⚠️ **Re-aimed 2026-08-21** (ledger 90). This pane left the settings sheet and
   * became the Agents destination. It used to open the sheet and click
   * `app-settings-nav-agent`; that control no longer exists and this check broke in
   * CI — **the check was right.**
   *
   * An attached vault is still required (otherwise the settings panel is not drawn).
   * After attaching, it navigates via the rail's Agents tile — the same path a user
   * takes.
   */
  await page.getByTestId("app-nav-rail").getByRole("link", { name: "에이전트" }).click();
  await expect(page.getByTestId("agents-page")).toBeVisible({ timeout: 10_000 });

  const pane = page.getByTestId("agent-setup-section");
  await expect(pane).toBeVisible({ timeout: 10_000 });

  const census = await pane.evaluate((root) => {
    /*
     * ⚠️ **The reference for "first screen" changed on 2026-08-21** (ledger 90).
     *
     * As a sheet, **the pane scrolled**, so intersecting the pane's visible area was
     * the same as "visible without scrolling". As a destination **the page scrolls**
     * and the pane grows to its content — with the pane as the reference, everything
     * inside it counts as the first screen (measured: 4/4 were reported visible while
     * actually outside the viewport).
     *
     * The intended measurement is unchanged: **what a user meets without scrolling.**
     * Only the reference moves to the viewport.
     */
    const viewportHeight = window.innerHeight;
    const visibleInPane = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      return r.bottom > 0 && r.top < viewportHeight;
    };
    const buttons = [...root.querySelectorAll("button")];
    const copyish = buttons.filter((b) =>
      /복사|copy/i.test(`${b.textContent ?? ""} ${b.getAttribute("aria-label") ?? ""}`),
    );
    const filled = buttons.filter((b) => {
      const bg = getComputedStyle(b).backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const parts = m[1].split(",").map((n) => Number.parseFloat(n));
      const alpha = parts.length > 3 ? parts[3] : 1;
      // A filled brand surface = near-opaque with blue clearly dominant.
      return alpha > 0.9 && parts[2] > parts[0] + 30 && parts[2] > 120;
    });
    return {
      buttonsTotal: buttons.length,
      buttonsVisible: buttons.filter(visibleInPane).length,
      copyTotal: copyish.length,
      copyVisibleFirstScreen: copyish.filter(visibleInPane).length,
      filledPrimary: filled.length,
      sectionLabels: [...root.querySelectorAll("h2, h3, [class*='SectionLabel']")]
        .map((el) => (el.textContent ?? "").trim())
        .filter(Boolean),
      scrollHeight: Math.round(root.scrollHeight),
      clientHeight: Math.round(root.clientHeight),
    };
  });

  await testInfo.attach("agent-connect-census.json", {
    body: JSON.stringify(census, null, 2),
    contentType: "application/json",
  });
  await pane.screenshot({ path: testInfo.outputPath("agent-connect-panel.png") });
  console.log("[census]", JSON.stringify(census));

  // Idling guard — finding nothing and passing green makes this ratchet the same as no ratchet.
  expect(census.buttonsTotal, "칸에서 버튼을 하나도 못 찾았다 — 셀렉터가 죽었다").toBeGreaterThan(3);
  expect(census.copyTotal, "복사 버튼을 하나도 못 찾았다 — 판별식이 죽었다").toBeGreaterThan(0);

  expect(
    census.copyVisibleFirstScreen,
    "첫 화면의 복사 버튼이 늘었다. 늘려야 한다면 접는 것을 먼저 검토하라",
  ).toBeLessThanOrEqual(CEILING.copyVisibleFirstScreen);
  expect(census.copyTotal).toBeLessThanOrEqual(CEILING.copyTotal);
  expect(
    census.scrollHeight / census.clientHeight,
    "칸이 더 길어졌다 — 새 내용은 접힌 블록으로 간다",
  ).toBeLessThanOrEqual(CEILING.scrollRatio);
});
