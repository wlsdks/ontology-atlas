import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installDesktopBridge, openRounds } from "./rounds-desktop-bridge";

/**
 * **The cadence is dragged, and the scope names its places.**
 *
 * Spec: `docs/superpowers/specs/2026-09-21-round-cadence-and-scope.md` §2.2 ("Ratchet": the
 * thumb's travel is measured, not assumed) and §3.3. The owner asked for this on the installed
 * app — "1, 5, 10, 30 minutes, 1 hour; pick minutes or hours at the top and a different drag
 * comes out" — and ten minutes is exactly the value four chips could not say.
 *
 * What is proven here is the real thumb under a real pointer: `page.mouse` presses the track
 * 40% across, the sentence above the form says the new interval, the unit switch carries the
 * value onto the other rail, and what the index row says afterwards is what the store holds.
 */

test.describe("Library rounds — the cadence rail", () => {
  test("drag the thumb, switch the unit, name a place, and the index says all three", async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: false });
    await openRounds(page);

    await page.getByTestId("library-rounds-new").click();
    const sheet = page.getByTestId("library-rounds-sheet");
    await expect(sheet).toBeVisible();

    const readback = page.getByTestId("library-rounds-readback");
    const thumb = page.getByTestId("library-rounds-cadence-thumb");
    const rail = page.getByTestId("library-rounds-cadence-rail");

    // It opens on the cadence every round had before the rail existed.
    await expect(readback).toContainText("Every hour");
    await expect(thumb).toHaveAttribute("aria-valuetext", "every 1 hours");
    await page.screenshot({ path: ".claude/shots-2026-09-21/rounds-sheet-default.png" });

    /*
     * Minutes, then a real drag. Five detents sit at 0 / 25 / 50 / 75 / 100 percent, so 40%
     * across is nearest the third — ten minutes. The press is on the track rather than the
     * thumb because pressing anywhere on the track is the behaviour the spec asks for.
     */
    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Minutes" }).click();
    const track = await rail.boundingBox();
    if (!track) throw new Error("the cadence rail was not drawn");
    await page.mouse.move(track.x + track.width * 0.4, track.y + track.height / 2);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 0.4, track.y + track.height / 2, { steps: 4 });
    await expect(readback).toContainText("Every 10 minutes");
    await page.mouse.up();
    await expect(thumb).toHaveAttribute("aria-valuetext", "every 10 minutes");

    // The thumb ends where the third detent is drawn, not where the finger let go.
    const settled = await thumb.boundingBox();
    const detent = await page.locator("[data-cadence-detent='10']").boundingBox();
    if (!settled || !detent) throw new Error("the thumb or its detent was not drawn");
    expect(Math.abs(settled.x + settled.width / 2 - (detent.x + detent.width / 2))).toBeLessThan(2);

    // Switching the unit carries the value onto the rail the new unit can say.
    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Hours" }).click();
    await expect(thumb).toHaveAttribute("aria-valuetext", "every 1 hours");
    const hourThumb = await thumb.boundingBox();
    const hourDetent = await page.locator("[data-cadence-detent='60']").boundingBox();
    if (!hourThumb || !hourDetent) throw new Error("the hour thumb or its detent was not drawn");
    expect(Math.abs(hourThumb.x + hourThumb.width / 2 - (hourDetent.x + hourDetent.width / 2))).toBeLessThan(2);

    // Back to ten minutes for the round that is actually saved.
    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Minutes" }).click();
    await page.locator("[data-cadence-detent='10']").click();
    await expect(readback).toContainText("Every 10 minutes");

    /*
     * A place, with a location. Two of them: the scope sentence and the readback must name
     * each one, and the record must carry both while its legacy fields carry the first.
     */
    await page.getByTestId("library-rounds-add-place").click();
    await page.getByTestId("library-rounds-add-menu").getByRole("menuitem", { name: "Confluence" }).click();
    await page.getByTestId("library-rounds-place-0-where").fill("ENG space");
    await expect(readback).toContainText("Confluence ENG space");
    await expect(page.getByTestId("library-rounds-scope")).toContainText("call Confluence to read ENG space, never to write there");
    // 144 turns a day is past the 48 the cost line tolerates quietly.
    await expect(page.getByTestId("library-rounds-cost")).toHaveAttribute("data-cost-tone", "alarming");
    await page.screenshot({ path: ".claude/shots-2026-09-21/rounds-sheet-two-places.png" });

    await page.getByTestId("library-rounds-allow").click();
    await expect(sheet).toBeHidden();

    // The index row names where before how often.
    const list = page.getByTestId("library-rounds-list");
    await expect(list).toContainText("confluence · ENG space");
    await expect(list).toContainText("Every 10 minutes");
    await page.screenshot({ path: ".claude/shots-2026-09-21/rounds-index-ten-minutes.png" });

    const stored = await page.evaluate(() => {
      const files = (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles;
      return JSON.parse(files[".ontology-atlas/rounds.json"]);
    });
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
  });

  test("the rail answers the keyboard, so nobody has to drag", async ({ page }) => {
    await seedFirstRunSeen(page);
    await installDesktopBridge(page, { seedRounds: false });
    await openRounds(page);

    await page.getByTestId("library-rounds-new").click();
    await page.getByTestId("library-rounds-cadence-unit").getByRole("radio", { name: "Minutes" }).click();
    const thumb = page.getByTestId("library-rounds-cadence-thumb");
    await thumb.focus();
    await page.keyboard.press("Home");
    await expect(thumb).toHaveAttribute("aria-valuetext", "every 1 minutes");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(thumb).toHaveAttribute("aria-valuetext", "every 10 minutes");
    await page.keyboard.press("End");
    await expect(thumb).toHaveAttribute("aria-valuetext", "every 30 minutes");
    await expect(page.getByTestId("library-rounds-readback")).toContainText("Every 30 minutes");
  });
});
