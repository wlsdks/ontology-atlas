import { expect, test } from "@playwright/test";
import { stubDirectoryPicker } from "../vault-picker-stub";
import { seedFirstRunSeen } from "../first-run-seed";

const SEED: Record<string, string> = {
  "shop.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Reflect Shop\ncontains:\n  - capabilities/pay\n---\n\n# Reflect Shop\n`,
  "capabilities/pay.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n\n# Pay\n`,
};

/**
 * Edit the disk and the map follows, in both add and delete directions. No time ceiling is pinned:
 * the web polls every 5 s when idle (`.claude/rules/surfaces.md`); it asserts only that it follows.
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
