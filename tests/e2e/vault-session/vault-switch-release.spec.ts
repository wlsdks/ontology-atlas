import { expect, test, type CDPSession, type Page } from "@playwright/test";

import "../atlas-map-probe";
import { chooseDesktopFolder, holdDesktopReads, installDesktopRailRuntime, releaseDesktopReads } from "../desktop-rail-arrival-harness";
import { liveInstances } from "../heap-census";
import { syntheticVault } from "../hex-board-vaults";
import { waitForDomQuiet, waitForMapStill } from "../settle";

const DOCS = syntheticVault(990, 10);
const LARGE = 900;
/** The same documents in three folders, so each switch reads a folder the page has not read before. */
const FOLDERS = ["/Users/probe/release-one", "/Users/probe/release-two", "/Users/probe/release-three"] as const;

async function folderOpen(page: Page, previous: string | null): Promise<string> {
  const tile = page.getByTestId("vault-switch-rail-tile");
  if (previous !== null) await expect(tile).not.toHaveAttribute("aria-label", previous, { timeout: 60_000 });
  await page.waitForFunction(
    (count) =>
      Number(document.querySelector('[data-testid="ontology-map"]')?.getAttribute("data-source-node-count")) >= count,
    Math.floor(Object.keys(DOCS).length * 0.9),
    { timeout: 60_000 },
  );
  await expect(tile).not.toHaveAttribute("data-busy", "true");
  await waitForDomQuiet(page);
  await page.waitForFunction(
    () => {
      const map = window.__atlasMap;
      const dial = map?.dial?.();
      return !!dial && dial.owns && dial.placement.state === "settled" && map!.nodes().some((node) => node.draggable);
    },
    undefined,
    { polling: "raf", timeout: 60_000 },
  );
  await waitForMapStill(page);
  return (await tile.getAttribute("aria-label")) ?? "";
}

/** The documents each folder withholds until it has been seen arriving in parts. */
const UNREAD_UNTIL_SEEN_ARRIVING = Object.keys(DOCS).slice(Math.ceil(Object.keys(DOCS).length / 2));

const partialArrivals = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vaultPartialArrivalCount: number }).__vaultPartialArrivalCount);

/** Presses `open` with half the folder's documents unread, waits until the page has drawn it in parts, then reads the rest. */
async function openArrivingInParts(page: Page, open: () => Promise<void>): Promise<void> {
  const before = await partialArrivals(page);
  await holdDesktopReads(page, UNREAD_UNTIL_SEEN_ARRIVING);
  await open();
  await expect.poll(() => partialArrivals(page), { message: "the folder never drew in parts", timeout: 60_000 }).toBeGreaterThan(before);
  await releaseDesktopReads(page);
}

async function routerPush(page: Page, url: string): Promise<void> {
  await page.evaluate((to) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(to), url);
}

/** Opens one document, so the document store reads through this folder's handles, then returns to the map. */
async function readOneDocument(page: Page): Promise<void> {
  await routerPush(page, "/en/docs/?slug=capabilities/synthetic-001");
  await expect(page.getByTestId("doc-word-count")).toBeVisible({ timeout: 60_000 });
  await routerPush(page, "/en/topology/?guides=off&e2e=1");
  await page.waitForFunction(
    (count) =>
      Number(document.querySelector('[data-testid="ontology-map"]')?.getAttribute("data-source-node-count")) >= count,
    Math.floor(Object.keys(DOCS).length * 0.9),
    { timeout: 60_000 },
  );
  await waitForDomQuiet(page);
  await waitForMapStill(page);
}

// A text-width memo (keys join font and text with NUL) passes LARGE only as names draw, and its model owns it.
const LARGE_MAP = `item.size >= ${LARGE} && !String(item.keys().next().value).includes("\\u0000")`;
const LARGE_ARRAY = `item.length >= ${LARGE}`;

async function retained(cdp: CDPSession) {
  return {
    largeArrays: await liveInstances(cdp, "Array", LARGE_ARRAY),
    largeMaps: await liveInstances(cdp, "Map", LARGE_MAP),
  };
}

test("two folder switches leave no earlier folder alive", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page, {}, undefined, {
    replaceFixture: true,
    folders: Object.fromEntries(FOLDERS.map((folder) => [folder, DOCS])),
    vaultPick: FOLDERS[0],
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const probe = window as unknown as { __vaultPartialArrivalCount: number };
    probe.__vaultPartialArrivalCount = 0;
    const observe = (value: string | null) => {
      const match = /^(\d+)\/(\d+)$/.exec(value ?? '');
      if (match && Number(match[1]) > 0 && Number(match[1]) < Number(match[2])) probe.__vaultPartialArrivalCount += 1;
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') observe(record.oldValue);
      }
      observe(document.querySelector('[data-vault-load-progress]')?.getAttribute('data-vault-load-progress') ?? null);
    }).observe(document, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-vault-load-progress'], attributeOldValue: true });
  });
  await page.goto("/en/?guides=off&e2e=1");
  await openArrivingInParts(page, () => page.getByTestId("first-run-open").click());
  let label = await folderOpen(page, null);
  await readOneDocument(page);
  const oneFolder = await retained(cdp);
  expect(oneFolder.largeArrays, "the open folder's graph is made of arrays this large").toBeGreaterThan(0);
  expect(oneFolder.largeMaps, "the open folder has indexed maps this large").toBeGreaterThan(0);

  // The frame's reused mark lists reach their high-water length during a switch, so arrays are
  // compared between the two switches; maps are held to the first open.
  let arraysAfterOneSwitch = oneFolder.largeArrays;
  for (let switchCount = 1; switchCount <= 2; switchCount += 1) {
    await chooseDesktopFolder(page, FOLDERS[switchCount]);
    await page.getByTestId("vault-switch-rail-tile").click();
    await openArrivingInParts(page, () => page.getByTestId("vault-switch-pick-other").click());
    label = await folderOpen(page, label);
    await readOneDocument(page);
    if (switchCount === 1) arraysAfterOneSwitch = await liveInstances(cdp, "Array", LARGE_ARRAY);
  }

  const afterSwitches = await retained(cdp);
  const summary = `one folder open: ${JSON.stringify(oneFolder)}; arrays after one switch: ${arraysAfterOneSwitch}; after two switches: ${JSON.stringify(afterSwitches)}`;
  // Work still in flight when the map goes still can hold one more collection; a kept folder never lets go.
  await expect.poll(() => liveInstances(cdp, "Array", LARGE_ARRAY), summary).toBeLessThanOrEqual(arraysAfterOneSwitch);
  await expect.poll(() => liveInstances(cdp, "Map", LARGE_MAP), summary).toBeLessThanOrEqual(oneFolder.largeMaps);
});
