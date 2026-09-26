import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installDesktopBridge, openRounds } from "./rounds-desktop-bridge";

async function openNewDocumentSchedule(page: import("@playwright/test").Page) {
  await page.getByTestId("library-rounds-new").click();
  await expect(page.getByTestId("automations")).toHaveAttribute("data-automations-lane", "documents");
  await page.getByTestId("automations-new").click();
}

/**
 * **The Rounds tab draws what the ledger holds, and a round is registered under a stated scope.**
 *
 * Spec: `docs/specs/2026-09-17-library-rounds-design.md`. What this spec proves is
 * the screen half: the fifth tab exists, the morning card sums the seeded night, the axis draws a
 * held pass as a line and a change as a card and sleep as a gap, and the registration sheet writes
 * one round into `.ontology-atlas/rounds.json` with the scope sentences shown above the press.
 * What stays with installed-app measurement is a real pass: the adapter, the turn, the writes.
 *
 * The desktop bridge is stubbed the way `library-compile-dock.spec.ts` stubs it: the app is a
 * WKWebView running this same static export, so answering the commands the walk calls from a map
 * exercises the real handle, the real store, and the real presentation.
 */

test.describe("Library rounds", () => {
  test("the morning card and the axis draw the seeded night", async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: true });
    await openRounds(page);

    await expect(page.getByTestId("library-rounds")).toHaveAttribute("data-rounds-state", "ready");
    await expect(page.getByTestId("library-workspace-rounds")).toContainText("2");

    const since = page.getByTestId("library-rounds-since");
    await expect(since).toHaveAttribute("data-since-kind", "away");
    await expect(since).toHaveAttribute("data-since-changed", "true");
    await expect(since).toContainText("1 page went stale");
    await expect(since).toContainText("1 redraft waits for you");
    await expect(since).toContainText("1 request was refused");
    await expect(since).toContainText("3 passes with no change");
    // The chip names the page the way the person named it, not the file it lives in.
    await expect(since.getByRole("button", { name: "Open Design system in Wiki" })).toBeVisible();
    // The sleep gap is the ledger's row; the card above it does not say it again.
    await expect(since).not.toContainText("asleep");

    // The rounds are a section of the page's one centred frame, not a column beside it: the
    // headline starts where Work scope's does, and the section sits above the ledger it filters.
    const index = page.getByTestId("library-rounds-index");
    await expect(index).toContainText("Scheduled checks");
    const headline = await page.locator("#main h1").boundingBox();
    const indexBox = await index.boundingBox();
    const ledgerBox = await page.getByTestId("library-rounds-ledger").boundingBox();
    expect(indexBox && headline && Math.abs(indexBox.x - headline.x)).toBeLessThanOrEqual(1);
    expect(indexBox && ledgerBox && indexBox.y < ledgerBox.y).toBe(true);

    const ledger = page.getByTestId("library-rounds-ledger");
    await expect(ledger.locator("[data-outcome='held']")).toHaveCount(3);
    await expect(ledger.locator("[data-outcome='asleep']")).toHaveCount(1);
    await expect(ledger.locator("[data-outcome='redrafted']")).toContainText("1 agent turn");
    await expect(ledger.locator("[data-outcome='redrafted']")).toContainText("mcp__confluence__create_page");
    await expect(ledger.locator("[data-outcome='stale']")).toContainText("no agent turn");

    // A held pass is a line, a change is a card: the card has a border, the line does not.
    const heldHeight = await ledger.locator("[data-outcome='held']").first().evaluate((el) => el.getBoundingClientRect().height);
    const cardHeight = await ledger.locator("[data-outcome='redrafted']").first().evaluate((el) => el.getBoundingClientRect().height);
    expect(cardHeight).toBeGreaterThan(heldHeight * 2);

    // Selecting a round filters the axis; its schedule is managed in Automations, through the
    // rounds section's one door — the stage does not add a second link to the same place.
    await page.getByTestId("library-round-r-confluence").click();
    await expect(page.getByTestId("library-rounds-run-now")).toHaveCount(0);
    await expect(page.getByTestId("library-rounds-new")).toBeVisible();
    await expect(page.getByTestId("library-rounds-manage-automations")).toHaveCount(0);
    await expect(ledger.locator("[data-outcome='held']")).toHaveCount(0);
    await expect(ledger.locator("[data-outcome='redrafted']")).toHaveCount(1);
  });

  test("a new round is registered under a stated scope and lands in rounds.json", async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: false });
    await openRounds(page);

    await expect(page.getByTestId("library-rounds")).toHaveAttribute("data-rounds-state", "empty");
    // Before the first round there is no rounds section: the empty sheet holds the one door.
    await expect(page.getByTestId("library-rounds-index")).toHaveCount(0);
    await openNewDocumentSchedule(page);
    const sheet = page.getByTestId("library-rounds-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("aria-modal", "true");

    // The sentence above the controls says what will happen, and follows every press.
    const readback = page.getByTestId("library-rounds-readback");
    await expect(readback).toHaveText(
      "Every hour, check that every page still matches its originals, and redraft the stale ones. It runs once as soon as you save.",
    );

    const scope = page.getByTestId("library-rounds-scope");
    await expect(scope).toContainText("read this folder and its map");
    await expect(scope).toContainText("write pages under wiki/");
    await expect(scope).toContainText("nothing else");
    await expect(page.getByTestId("library-rounds-cost")).toContainText("only on a pass that finds something stale");

    // Mark only: no write at all, and the cost line says so.
    await page.getByTestId("library-rounds-on-stale").getByRole("radio", { name: "Flag for review" }).click();
    await expect(readback).toContainText("and only mark the stale ones");
    await expect(scope).not.toContainText("write pages under wiki/");
    await expect(page.getByTestId("library-rounds-cost")).toContainText("No agent turn");

    /*
     * Naming a service place is what makes this a service round — the sheet never asks which
     * kind it is (spec §3.2), so the daily bill and the connector sentence follow the place.
     */
    await page.getByTestId("library-rounds-add-place").click();
    await page.getByTestId("library-rounds-add-menu").getByRole("menuitem", { name: "Confluence" }).click();
    await expect(scope).toContainText("ask Confluence to read, never to write there");
    await expect(page.getByTestId("library-rounds-cost")).toContainText("about 24 a day");

    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Day" }).click();
    await page.getByTestId("library-rounds-cadence-day").getByRole("radio", { name: "Weekdays" }).click();
    await expect(page.getByTestId("library-rounds-time")).toBeVisible();
    await expect(readback).toContainText("On weekdays at 09:00");
    await expect(readback).toContainText("Confluence");
    await expect(page.getByTestId("library-rounds-cost")).toContainText("about 1 a day");

    await page.getByTestId("library-rounds-allow").click();
    await expect(sheet).toBeHidden();
    await page.getByTestId("automations-open-library-rounds").click();
    await expect(page.getByTestId("library-rounds")).toHaveAttribute("data-rounds-state", "ready");
    await expect(page.getByTestId("library-rounds-list")).toContainText("Confluence");
    await expect(page.getByTestId("library-rounds-list")).toContainText("Weekdays at 09:00");

    const stored = await page.evaluate(() => {
      const files = (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles;
      return JSON.parse(files[".ontology-atlas/rounds.json"]);
    });
    expect(stored.v).toBe(1);
    expect(stored.rounds).toHaveLength(1);
    expect(stored.rounds[0]).toMatchObject({
      kind: "service",
      connectorId: "c1",
      connectorName: "confluence",
      enabled: true,
      cadence: { daily: "09:00", weekdaysOnly: true },
    });
  });

  test("a local check runs once as it is saved, so the first result stands before the clock", async ({ page }) => {
    /*
     * Owner, 2026-09-19: the screen was "hard to operate". Measured on the installed app, a
     * check saved at 21:35 showed nothing until its 22:00 boundary or until a person found
     * "run now". A consistency pass costs no agent turn, so it runs as the sheet closes.
     */
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: false });
    await openRounds(page);
    await openNewDocumentSchedule(page);
    await expect(page.getByTestId("library-rounds-sheet")).toBeVisible();
    // The defaults are the local check, hourly, redraft on stale.
    await page.getByTestId("library-rounds-allow").click();
    await expect(page.getByTestId("library-rounds-sheet")).toBeHidden();
    await page.getByTestId("automations-open-library-rounds").click();

    const ledger = page.getByTestId("library-rounds-ledger");
    await expect(ledger.locator("[data-outcome='held']")).toHaveCount(1);
    await expect(ledger).toContainText("run by hand");
    const stored = await page.evaluate(() => {
      const files = (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles;
      return (files[".ontology-atlas/rounds-ledger.jsonl"] ?? "").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ kind: "consistency", outcome: "held", trigger: "manual", agentTurns: 0 });
  });

  test("the web build explains and points at the app", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/en/library/?tab=rounds");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("library-rounds")).toHaveAttribute("data-rounds-state", "app-required");
    await expect(page.getByTestId("library-rounds").getByRole("link", { name: "Get the app" })).toHaveAttribute("href", /\/download\/$/);
  });
});
