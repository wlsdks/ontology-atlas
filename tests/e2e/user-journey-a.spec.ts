import { expect, test } from "@playwright/test";
import { useDogfoodSample } from "./sample-source";

/**
 * Replays the public-visitor journey (guide §2.A) as one flow.
 *
 * Fatal breaks (the detail page not opening, Cmd+K not opening) fail the test;
 * perceived latency and missing copy are reported to the console as candidates for
 * the next cycle.
 *
 * Segments covered:
 *   A1. Enter via a shared link (`/en/project/ontology-atlas/`) → the detail reads immediately
 *   A2. Enter at the root (`/en/`) → the map (HomePage) is the first screen — the
 *       INDEX / brand pill appears within 10s with no marketing-landing detour.
 *   A5. Cmd+K opens and closes the search palette from the detail page
 *
 * A3/A4 topology interaction is covered by topology-drag.
 */

const FINDING_LIMIT = 15;

test("A1·A2·A5 공개 여정 한 플로우", async ({ page }) => {
  // This journey walks the dogfood project (`/project/ontology-atlas/`) — the default
  // sample became an example business on 2026-07-26, so it is selected explicitly.
  await useDogfoodSample(page);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  /** Time budgets — machine-dependent, so they are **reported only**. */
  const findings: string[] = [];
  /*
   * **Deterministic facts — these fail the test** (check inventory, 2026-08-17).
   *
   * This spec is named for a journey, yet every journey assertion was a
   * `console.log`. A sentence like *"A2 root map INDEX panel missing — landing detour
   * regression?"* is a fact independent of machine speed, and it was printed while
   * passing. Only the machine-dependent parts (TTFB budgets) stay as reports;
   * presence-or-absence is raised to a failure.
   */
  const defects: string[] = [];

  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // ── A1. Shared link → detail ────────────────────────────────────────────
  // The URL slug is `ontology-atlas`; the on-screen name is `Ontology Atlas`. What
  // matters here is whether that project rendered, not the notation.
  const EXPECTED_DETAIL_NAME = "Ontology Atlas";
  const DETAIL_NAME_RE = /ontology[- ]atlas/i;
  const detailStart = Date.now();
  await page.goto("/en/project/ontology-atlas/", { waitUntil: "domcontentloaded" });
  const detailHeading = page.getByRole("heading").first();
  await expect(detailHeading).toBeVisible({ timeout: 10_000 });
  const detailTtfb = Date.now() - detailStart;
  const detailTitle = await page.title();
  if (!detailTitle || !DETAIL_NAME_RE.test(detailTitle)) {
    defects.push(`A1 title 에 프로젝트 이름 "${EXPECTED_DETAIL_NAME}" 누락: "${detailTitle}"`);
  }
  if (detailTtfb > 5_000) {
    findings.push(`A1 상세 첫 heading까지 ${detailTtfb}ms (5s 초과)`);
  }
  // Confirms the detail body really hydrated and the project name appears in it. The
  // server HTML is empty because rendering is client-side, so it appears only after
  // hydration. This assertion catches the "metadata present, body empty"
  // regression.
  const nameInBody = await page
    .getByText(EXPECTED_DETAIL_NAME)
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!nameInBody) {
    defects.push(
      `A1 hydration 후에도 body 에 "${EXPECTED_DETAIL_NAME}" 텍스트가 나타나지 않음 — client-side render 실패 가능`,
    );
  }

  // ── A2. Root = the map (no separate marketing landing) ──────────────────
  // `getByText("Ontology Atlas", { exact: true })` used to match visible
  // hero copy on the old marketing LandingPage. Root-first-open moved that
  // copy to `/download` — the only surviving "Ontology Atlas" mark on `/`
  // is the persistent AppNavRail brand link (`title`/`aria-label`, icon-only,
  // no text child), so assert via its accessible name instead.
  const landingStart = Date.now();
  await page.goto("/en/", { waitUntil: "domcontentloaded" });
  const productName = page.getByRole("link", { name: "Ontology Atlas", exact: true }).first();
  await expect(productName).toBeVisible({ timeout: 10_000 });
  const landingTtfb = Date.now() - landingStart;
  if (landingTtfb > 5_000) {
    findings.push(`A2 root map product mark까지 ${landingTtfb}ms (5s 초과)`);
  }
  /*
   * **The check that demanded INDEX here was deleted** (check inventory,
   * 2026-08-17).
   *
   * It used to print *"landing detour regression?"* when `/` had no map INDEX. That
   * expectation is **an inverted contract** — by the 2026-07-30 decision, `/` for a
   * web visitor who has not chosen a vault is the gateway (the same face as
   * `/download`), and having no INDEX is correct
   * (`.claude/rules/architecture.md` 「URL 계약」 — the URL contract). A separate
   * check guards that contract now: `ontology-ui.spec.ts`'s "root renders the gateway
   * face", where `download-gnb` is visible and `topology-index-panel` count is 0.
   *
   * Because this line **only ever printed to the log**, it kept calling correct
   * behaviour a defect long after the contract was inverted, and nobody saw it. The
   * moment it was raised to a failure, that became visible. Another check's contract
   * is not re-measured here.
   */

  // ── A5. Cmd+K on the detail page → the search palette, in place ─────────
  // Cmd+K on a detail page opens the SearchPalette inside that page rather than
  // bouncing to `/`. The URL stays put, Escape closes it, and Cmd+K toggles it
  // again.
  await page.goto("/en/project/ontology-atlas/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(600); // hydration + useTypingShortcuts bind
  const isMac = process.platform === "darwin";
  const detailPathBefore = new URL(page.url()).pathname;
  await page.keyboard.press(isMac ? "Meta+k" : "Control+k");
  const paletteInput = page.locator("input#project-search-input");
  await expect(paletteInput).toBeVisible({ timeout: 3_000 });
  // The URL must not leave the detail page.
  expect(new URL(page.url()).pathname).toBe(detailPathBefore);
  await page.keyboard.press("Escape");
  await expect(paletteInput).toHaveCount(0, { timeout: 3_000 });

  // ── A5'. `?` on the detail page → toggles the ShortcutSheet in place ────
  // `useTypingShortcuts` matches on `event.key === '?'`, so a KeyboardEvent is
  // dispatched directly to avoid depending on Playwright's keymap.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
  });
  const shortcutDialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(shortcutDialog).toBeVisible({ timeout: 3_000 });
  expect(new URL(page.url()).pathname).toBe(detailPathBefore);
  await page.keyboard.press("Escape");
  await expect(shortcutDialog).toHaveCount(0, { timeout: 3_000 });

  // ── Report ─────────────────────────────────────────────────────────────
  console.log(`[JOURNEY-A] A1 detail heading ${detailTtfb}ms`);
  console.log(`[JOURNEY-A] A2 root map product mark ${landingTtfb}ms`);
  console.log(`[JOURNEY-A] findings=${findings.length} pageerror=${pageErrors.length} console.error=${consoleErrors.length}`);
  for (const f of findings.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   • ${f}`);
  for (const e of pageErrors.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   ! pageerror: ${e}`);
  for (const e of consoleErrors.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   ! console.error: ${e}`);

  console.log(`[JOURNEY-A] defects=${defects.length}`);
  for (const d of defects) console.log(`[JOURNEY-A]   ✗ ${d}`);

  // pageerror and **deterministic facts** fail. Time budgets (findings) and console.error are reports.
  expect(pageErrors, `공개 여정 중 pageerror ${pageErrors.length}건:\n${pageErrors.slice(0, 5).join("\n")}`).toHaveLength(0);
  expect(
    defects,
    `공개 여정이 약속한 것이 화면에 없다 ${defects.length}건:\n${defects.join("\n")}`,
  ).toEqual([]);
});
