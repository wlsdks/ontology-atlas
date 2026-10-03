import { expect, test, type CDPSession, type Page } from "@playwright/test";

import "./atlas-map-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { liveInstances } from "./heap-census";
import { syntheticVault } from "./hex-board-vaults";
import { waitForDomQuiet, waitForMapStill } from "./settle";
import { stubDirectoryPicker } from "./vault-picker-stub";

const DOCS = syntheticVault(990, 10);
const LARGE = 900;

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

async function retained(cdp: CDPSession) {
  return {
    fileHandles: await liveInstances(cdp, "FileSystemFileHandle"),
    largeArrays: await liveInstances(cdp, "Array", `item.length >= ${LARGE}`),
    largeMaps: await liveInstances(cdp, "Map", `item.size >= ${LARGE}`),
  };
}

test("two folder switches leave no earlier folder alive", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await stubDirectoryPicker(page, DOCS);
  await seedFirstRunSeen(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/en/topology/?guides=off&e2e=1");
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  let label = await folderOpen(page, null);
  const oneFolder = await retained(cdp);
  expect(oneFolder.fileHandles, "the open folder's files were read through handles").toBeGreaterThan(0);
  expect(oneFolder.largeArrays, "the open folder's graph is made of arrays this large").toBeGreaterThan(0);

  for (let switchCount = 1; switchCount <= 2; switchCount += 1) {
    await page.getByTestId("vault-switch-rail-tile").click();
    await page.getByTestId("vault-switch-pick-other").click();
    label = await folderOpen(page, label);
  }

  const afterSwitches = await retained(cdp);
  const summary = `one folder open: ${JSON.stringify(oneFolder)}; after two switches: ${JSON.stringify(afterSwitches)}`;
  expect(afterSwitches.fileHandles, summary).toBeLessThanOrEqual(oneFolder.fileHandles);
  expect(afterSwitches.largeArrays, summary).toBeLessThanOrEqual(oneFolder.largeArrays);
  expect(afterSwitches.largeMaps, summary).toBeLessThanOrEqual(oneFolder.largeMaps);
});
