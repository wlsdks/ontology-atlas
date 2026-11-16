import { expect, test, type Page } from "@playwright/test";

import {
  deselect, describeStar, elementsByContainer, openDogfoodFlat, openRadiusFloors, overlappingMarks, pressAt, readDial, readOpenTokens, readStar, tokenOf,
} from "./domain-star";

/** Share of the free map's limiting side a selected domain's star spans. */
const STAR_FILL_SHARE = 0.6;
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
        const elementsOf = await elementsByContainer(page);
        const open = await readOpenTokens(page);
        const apartMax = await tokenOf(page, "--map-graph-domain-apart-max-px");
        expect(apartMax, "the widest the closest members may stand apart").toBeGreaterThan(0);
        const rest = await readDial(page);
        const home = rest.discs.find((d) => d.id === domainId)!;
        const restStar = readStar(rest, domainId, elementsOf);
        await pressDomain(page, domainId);
        const owned = new Set([domainId, ...rest.clusters.find((c) => c.domainId === domainId)!.capabilityIds].flatMap((id) => elementsOf.get(id) ?? []));
        const elementsRead = async () => readStar(await readDial(page), domainId, elementsOf).marks.filter((m) => m.kind === "element").length;
        // The dock's lens may hide an element outside what it reviews; without it every element draws.
        if (!dock) await expect.poll(elementsRead, `every element of the ${domainId} star is read`).toBe(owned.size);
        const star = readStar(await readDial(page), domainId, elementsOf);
        const said = describeStar(star);
        const read = star.marks.filter((m) => m.kind === "element").length;
        if (dock) expect(read, `the star's elements are read: ${said}`).toBeGreaterThan(owned.size > 0 ? 0 : -1);
        expect(star.fillShare >= STAR_FILL_SHARE || star.nearestMembersPx >= apartMax - 0.5, `the star fills the free map or its members stand the widest apart: ${said}`).toBe(true);
        const floors = openRadiusFloors(star, elementsOf, open);
        const under = star.marks.filter((m) => m.kind !== "domain" && m.r < floors.get(m.id)!).map((m) => `${m.id} ${m.r.toFixed(2)} < ${floors.get(m.id)!.toFixed(2)}`);
        expect(under, `every member and element opens into the room around it: ${said}`).toEqual([]);
        const restR = new Map(restStar.marks.map((m) => [m.id, m.r]));
        const unopened = star.marks.filter((m) => m.kind !== "domain" && !(m.r > (restR.get(m.id) ?? 0))).map((m) => m.id);
        expect(unopened, `every member and element is drawn larger than it rests: ${said}`).toEqual([]);
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
          const landed = await readDial(page);
          await pressAt(page, id, landed.discs.find((d) => d.id === id)!);
          expect((await readDial(page)).zoomRatio, `${id} pressed in the opened star keeps its zoom`).toBeGreaterThanOrEqual(landed.zoomRatio * (1 - 1e-3));
        }
      }
    });
  }
}
