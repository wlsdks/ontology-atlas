import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { installDesktopBridge, openDocumentAutomations } from "../rounds-desktop-bridge";

/**
 * The document schedule sheet, opened from Automations' Documents lane: the scope sentence, the
 * cadence rail under a real pointer and the keyboard, and the record it writes into `rounds.json`.
 * The desktop bridge is stubbed.
 */

async function openNewDocumentSchedule(page: Page) {
  await openDocumentAutomations(page);
  await page.getByTestId("automations-new").click();
  await expect(page.getByTestId("library-rounds-sheet")).toBeVisible();
}

function storedRounds(page: Page) {
  return page.evaluate(() => {
    const files = (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles;
    return JSON.parse(files[".ontology-atlas/rounds.json"]);
  });
}

test.describe("Document schedule sheet", () => {
  test("a new schedule is registered under a stated scope and lands in rounds.json", async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: false });
    await openNewDocumentSchedule(page);
    const sheet = page.getByTestId("library-rounds-sheet");
    await expect(sheet).toHaveAttribute("aria-modal", "true");

    // The sentence above the controls says what will happen, and follows every press.
    const readback = page.getByTestId("library-rounds-readback");
    await expect(readback).toHaveText(
      "Every hour, check that every page still matches its sources, and redraft the stale ones. It runs once as soon as you save.",
    );

    const scope = page.getByTestId("library-rounds-scope");
    await expect(scope).toContainText("read this folder and its map");
    await expect(scope).toContainText("write pages under wiki/");
    await expect(scope).toContainText("nothing else");
    await expect(page.getByTestId("library-rounds-cost")).toContainText("only when a run finds something stale");

    // Mark only: no write at all, and the cost line says so.
    await page.getByTestId("library-rounds-on-stale").getByRole("radio", { name: "Flag for review" }).click();
    await expect(readback).toContainText("and only mark the stale ones");
    await expect(scope).not.toContainText("write pages under wiki/");
    await expect(page.getByTestId("library-rounds-cost")).toContainText("No agent run");

    // Naming a service place is what makes this a service round, so the bill and the connector sentence follow it.
    await page.getByTestId("library-rounds-add-place").click();
    await page.getByTestId("library-rounds-add-menu").getByRole("menuitem", { name: "Confluence" }).click();
    await expect(scope).toContainText("ask Confluence to read, never to write there");
    await expect(page.getByTestId("library-rounds-cost")).toContainText("about 24 times a day");

    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Day" }).click();
    await page.getByTestId("library-rounds-cadence-day").getByRole("radio", { name: "Weekdays" }).click();
    await expect(page.getByTestId("library-rounds-time")).toBeVisible();
    await expect(readback).toContainText("On weekdays at 09:00");
    await expect(readback).toContainText("Confluence");
    await expect(page.getByTestId("library-rounds-cost")).toContainText("about 1 a day");

    await page.getByTestId("library-rounds-allow").click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("automations-list")).toContainText("Weekdays at 09:00");

    const stored = await storedRounds(page);
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

  test("drag the cadence thumb, switch the unit, name two places, and the record says all three", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: false });
    await openNewDocumentSchedule(page);

    const readback = page.getByTestId("library-rounds-readback");
    const thumb = page.getByTestId("library-rounds-cadence-thumb");
    const rail = page.getByTestId("library-rounds-cadence-rail");
    await expect(readback).toContainText("Every hour");
    await expect(thumb).toHaveAttribute("aria-valuetext", "every hour");

    // Five detents sit at 0 / 25 / 50 / 75 / 100 percent, so a press 40% across the track is nearest ten minutes.
    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Minutes" }).click();
    const track = await rail.boundingBox();
    if (!track) throw new Error("the cadence rail was not drawn");
    await page.mouse.move(track.x + track.width * 0.4, track.y + track.height / 2);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 0.4, track.y + track.height / 2, { steps: 4 });
    await expect(readback).toContainText("Every 10 minutes");
    await page.mouse.up();
    await expect(thumb).toHaveAttribute("aria-valuetext", "every 10 minutes");

    // The thumb settles on the detent, not where the finger let go; the spring is polled, not slept past.
    const offsetFrom = async (minutes: number) => {
      const settled = await thumb.boundingBox();
      const detent = await page.locator(`[data-cadence-detent='${minutes}']`).boundingBox();
      if (!settled || !detent) throw new Error("the thumb or its detent was not drawn");
      return Math.abs(settled.x + settled.width / 2 - (detent.x + detent.width / 2));
    };
    await expect.poll(() => offsetFrom(10)).toBeLessThan(2);

    // Switching the unit carries the value onto the rail the new unit can say.
    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Hours" }).click();
    await expect(thumb).toHaveAttribute("aria-valuetext", "every hour");
    await expect.poll(() => offsetFrom(60)).toBeLessThan(2);

    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Minutes" }).click();
    await page.locator("[data-cadence-detent='10']").click();
    await expect(readback).toContainText("Every 10 minutes");

    await page.getByTestId("library-rounds-add-place").click();
    await page.getByTestId("library-rounds-add-menu").getByRole("menuitem", { name: "Confluence" }).click();
    await page.getByTestId("library-rounds-place-0-where").fill("ENG space");
    await expect(readback).toContainText("Confluence ENG space");
    await expect(page.getByTestId("library-rounds-scope")).toContainText("ask Confluence to read ENG space, never to write there");
    // 144 turns a day is past the 48 the cost line tolerates quietly.
    await expect(page.getByTestId("library-rounds-cost")).toHaveAttribute("data-cost-tone", "alarming");
    await expect(page.getByTestId("library-rounds-add-menu")).toHaveCount(0);

    await page.getByTestId("library-rounds-allow").click();
    await expect(page.getByTestId("library-rounds-sheet")).toBeHidden();
    await expect(page.getByTestId("automations-list")).toContainText("Every 10 minutes");

    const stored = await storedRounds(page);
    expect(stored.rounds).toHaveLength(1);
    expect(stored.rounds[0]).toMatchObject({
      kind: "service",
      cadence: { everyMinutes: 10 },
      connectorId: "c1",
      connectorName: "confluence",
    });
    expect(stored.rounds[0].places).toEqual([
      { kind: "vault", paths: [] },
      { kind: "service", connectorId: "c1", connectorName: "confluence", location: "ENG space" },
    ]);

    if (problems.length > 0) console.log("console during the schedule sheet:\n" + problems.join("\n"));
    // The dev server's own advice about the shell's `scroll-behavior` is not this screen's.
    const noise = /Download the React DevTools|Turbopack|hot-update|Fast Refresh|scroll-behavior/i;
    expect(problems.filter((line) => !noise.test(line))).toEqual([]);
  });

  test("the cadence rail answers the keyboard, so nobody has to drag", async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: false });
    await openNewDocumentSchedule(page);
    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Minutes" }).click();
    const thumb = page.getByTestId("library-rounds-cadence-thumb");
    await thumb.focus();
    await page.keyboard.press("Home");
    await expect(thumb).toHaveAttribute("aria-valuetext", "every minute");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(thumb).toHaveAttribute("aria-valuetext", "every 10 minutes");
    await page.keyboard.press("End");
    await expect(thumb).toHaveAttribute("aria-valuetext", "every 30 minutes");
    await expect(page.getByTestId("library-rounds-readback")).toContainText("Every 30 minutes");
  });
});
