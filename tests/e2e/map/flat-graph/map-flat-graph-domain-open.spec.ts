import { expect, test, type Page } from "@playwright/test";

import {
  deselect, describeStar, elementsByCapability, openDogfoodFlat, overlappingMarks, pressAt, readDial, readStar, tokenOf,
} from "./domain-star";

/** Share of the free map's limiting side a selected domain's star spans. */
const STAR_FILL_SHARE = 0.6;
const CAPABILITY_MIN_PX = 12;
const ELEMENT_MIN_PX = 5;
/** Members pressed per domain, the smallest drawn first. */
const PRESSED_MEMBERS = 3;
const SAME_VIEW_PX = 1;

/** Presses a domain where the map draws it now. */
async function pressDomain(page: Page, domainId: string): Promise<void> {
  const disc = (await readDial(page)).discs.find((d) => d.id === domainId);
  expect(disc, `${domainId} is drawn to press`).toBeDefined();
  await pressAt(page, domainId, disc!);
}

for (const viewport of [{ width: 1410, height: 840 }, { width: 1280, height: 800 }]) {
  for (const dock of [false, true]) {
    test(`at ${viewport.width}x${viewport.height} with the agent dock ${dock ? "open" : "closed"}, a pressed domain opens its star across the free map with marks big enough to press`, async ({ page }) => {
      test.setTimeout(600_000);
      await openDogfoodFlat(page, viewport, dock);
      const domainIds = (await readDial(page)).clusters.map((c) => c.domainId);
      for (const domainId of domainIds) {
        // Each domain from a fresh overview: with the dock open, Escape closes the dock before it clears a selection.
        if (domainId !== domainIds[0]) await openDogfoodFlat(page, viewport, dock);
        const elementsOf = await elementsByCapability(page);
        const apartMax = await tokenOf(page, "--map-graph-domain-apart-max-px");
        expect(apartMax, "the widest the closest members may stand apart").toBeGreaterThan(0);
        const rest = await readDial(page);
        const home = rest.discs.find((d) => d.id === domainId)!;
        await pressDomain(page, domainId);
        const star = readStar(await readDial(page), domainId, elementsOf);
        const said = describeStar(star);
        expect(star.fillShare >= STAR_FILL_SHARE || star.nearestMembersPx >= apartMax - 0.5, `the star fills the free map or its members stand the widest apart: ${said}`).toBe(true);
        expect(star.minCapabilityPx, `every member capability is drawn big enough to press: ${said}`).toBeGreaterThanOrEqual(CAPABILITY_MIN_PX);
        expect(star.minElementPx, `every element of the star is drawn big enough to press: ${said}`).toBeGreaterThanOrEqual(ELEMENT_MIN_PX);
        expect(overlappingMarks(star), `no two marks of the star overlap: ${said}`).toEqual([]);
        const missed = await page.evaluate((marks) => marks.filter((m) => m.kind !== "domain" && window.__atlasMap!.nodeAt!(m.x, m.y) !== m.id).map((m) => m.id), star.marks);
        expect(missed, `every member and element answers a press at its centre: ${said}`).toEqual([]);

        if (!dock) {
          await deselect(page);
          const back = await readDial(page);
          const returned = back.discs.find((d) => d.id === domainId)!;
          expect(back.zoomRatio, "a deselect returns the zoom the reader left").toBeCloseTo(rest.zoomRatio, 4);
          expect(Math.hypot(returned.x - home.x, returned.y - home.y), "a deselect returns the domain to where it stood").toBeLessThan(SAME_VIEW_PX);
        }

        const smallest = star.marks.filter((m) => m.kind === "capability").sort((a, b) => a.r - b.r).slice(0, PRESSED_MEMBERS);
        for (const { id } of smallest) {
          if (await page.evaluate(() => window.__atlasMap!.selection().nodeId) !== domainId) await pressDomain(page, domainId);
          const member = (await readDial(page)).discs.find((d) => d.id === id)!;
          await pressAt(page, id, member);
        }
      }
    });
  }
}
