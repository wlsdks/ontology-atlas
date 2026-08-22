import { expect, test } from "@playwright/test";
import { stubDirectoryPicker } from "./vault-picker-stub";
import { seedFirstRunSeen } from "./first-run-seed";

const SEED: Record<string, string> = {
  "shop.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Reflect Shop\ncontains:\n  - capabilities/pay\n---\n\n# Reflect Shop\n`,
  "capabilities/pay.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n\n# Pay\n`,
};

/**
 * **"Fix it and the map follows"** — measures this product's core promise as a round
 * trip (2026-08-11).
 *
 * **Why this spec exists.** Walking the north-star journey revealed that **no gate at
 * all** measured this. Opening a vault is covered by web smoke ②, and drawing the map
 * by the map specs. But **the screen following after the disk changes** was watched by
 * nobody — even though that is exactly the sentence this product sells.
 *
 * Only the picker is stubbed; everything behind it is real code
 * (`vault-picker-stub`). So what this spec measures is not an imitation but **the path
 * by which the web re-reads the folder**.
 *
 * **It does not lock on time.** The measurement was 5.6 s (the web polls every 5 s
 * when idle — .claude/rules/surfaces.md), but that number is not pinned as a ceiling.
 * Making a gate out of a value that varies with machine and load measures the runner
 * rather than the product (this repository has failed that way twice). The property
 * locked is **whether it eventually follows**.
 *
 * **The deletion direction is measured too.** A file that is gone but still on screen
 * makes the user reason from a node that does not exist — worse than a missing
 * addition. Measuring one direction leaves the other half unwatched.
 */
test("고치면 지도가 따라온다 — 더할 때와 지울 때 모두", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, SEED);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  const index = page.getByTestId("topology-index-panel");
  await expect(index).toContainText("Reflect Shop", { timeout: 30_000 });
  await expect(index).toContainText("2 개념", { timeout: 20_000 });
  console.log("OPENED · 2 개념");

  // Write one more node to disk — the same as a user creating the file in an editor.
  const t0 = Date.now();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    // Find the vault folder the stub created
    let vault: FileSystemDirectoryHandle | null = null;
    for await (const [name, handle] of root.entries()) {
      if (name.startsWith("stub-vault-") && handle.kind === "directory") vault = handle as FileSystemDirectoryHandle;
    }
    if (!vault) throw new Error("stub vault not found");
    const caps = await vault.getDirectoryHandle("capabilities", { create: true });
    const file = await caps.getFileHandle("ship.md", { create: true });
    const w = await file.createWritable();
    await w.write(`---\nuid: 33333333-3333-4333-8333-333333333333\nslug: capabilities/ship\nkind: capability\ntitle: Ship\n---\n\n# Ship\n`);
    await w.close();
  });
  await expect(index).toContainText("3 개념", { timeout: 30_000 });
  console.log(`[reflect] 더하기 반영 ${Date.now() - t0}ms`);

  // It must follow on deletion too — a non-existent node left on screen is worse.
  const t1 = Date.now();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    let vault: FileSystemDirectoryHandle | null = null;
    for await (const [name, handle] of root.entries()) {
      if (name.startsWith("stub-vault-") && handle.kind === "directory") vault = handle as FileSystemDirectoryHandle;
    }
    if (!vault) throw new Error("stub vault not found");
    const caps = await vault.getDirectoryHandle("capabilities");
    await caps.removeEntry("ship.md");
  });
  await expect(index).toContainText("2 개념", { timeout: 30_000 });
  console.log(`[reflect] 지우기 반영 ${Date.now() - t1}ms`);
});
