import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { FIXTURE_VAULT, FIXTURE_VAULT_NODE_COUNT } from "./fixture-vault";
import { liveInstances } from "./heap-census";
import { stubDirectoryPicker } from "./vault-picker-stub";

async function folderOpen(page: Page, previous: string | null): Promise<string> {
  const tile = page.getByTestId("vault-switch-rail-tile");
  await expect(tile).not.toHaveAttribute("data-busy", "true");
  if (previous !== null) await expect(tile).not.toHaveAttribute("aria-label", previous);
  await page.waitForFunction(
    (count) =>
      Number(document.querySelector('[data-testid="ontology-map"]')?.getAttribute("data-source-node-count")) >= count,
    FIXTURE_VAULT_NODE_COUNT,
  );
  return (await tile.getAttribute("aria-label")) ?? "";
}

test("two folder switches leave no earlier folder alive", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/en/topology/?guides=off");
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  let label = await folderOpen(page, null);
  const oneFolder = await liveInstances(cdp, "FileSystemFileHandle");
  expect(oneFolder, "the open folder's files were read through handles").toBeGreaterThan(0);

  for (let switchCount = 1; switchCount <= 2; switchCount += 1) {
    await page.getByTestId("vault-switch-rail-tile").click();
    await page.getByTestId("vault-switch-pick-other").click();
    label = await folderOpen(page, label);
  }

  expect(await liveInstances(cdp, "FileSystemFileHandle"), `file handles with one folder open: ${oneFolder}`).toBeLessThanOrEqual(oneFolder);
});
