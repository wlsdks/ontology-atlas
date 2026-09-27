import { expect, test, type CDPSession, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { FIXTURE_VAULT, FIXTURE_VAULT_NODE_COUNT } from "./fixture-vault";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * Switching folders lets the previous folders go. Callbacks that outlived their render kept the
 * folder open at that render: two 5k switches held two earlier folders whole (web memory audit,
 * 2026-09-27). Every folder the stub hands out has the same files, and the app holds one
 * `FileSystemFileHandle` per file it read, so after two switches the page may hold no more
 * handles than with the first folder open.
 */

async function liveFileHandles(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  const { result: prototype } = await cdp.send("Runtime.evaluate", {
    expression: "FileSystemFileHandle.prototype",
  });
  const { objects } = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.objectId! });
  const { result: count } = await cdp.send("Runtime.callFunctionOn", {
    objectId: objects.objectId!,
    functionDeclaration: "function () { return this.length; }",
    returnByValue: true,
  });
  await cdp.send("Runtime.releaseObject", { objectId: objects.objectId! });
  await cdp.send("Runtime.releaseObject", { objectId: prototype.objectId! });
  return count.value as number;
}

/** The chip has named a folder other than `previous` and finished opening it, and the map holds it. */
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

test("switching folders twice keeps no more of them than one open folder", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/en/topology/?guides=off");
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  let label = await folderOpen(page, null);
  const oneFolder = await liveFileHandles(cdp);
  expect(oneFolder, "the open folder's files were read through handles").toBeGreaterThan(0);

  for (let switchCount = 1; switchCount <= 2; switchCount += 1) {
    await page.getByTestId("vault-switch-rail-tile").click();
    await page.getByTestId("vault-switch-pick-other").click();
    label = await folderOpen(page, label);
  }

  expect(await liveFileHandles(cdp), `file handles with one folder open: ${oneFolder}`).toBeLessThanOrEqual(oneFolder);
});
