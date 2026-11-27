import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime, removeDesktopFile, writeDesktopFile } from "../desktop-rail-arrival-harness";

const SEED: Record<string, string> = {
  "shop.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Reflect Shop\ncontains:\n  - capabilities/pay\n---\n\n# Reflect Shop\n`,
  "capabilities/pay.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n\n# Pay\n`,
};

/**
 * Edit the disk and the map follows, in both add and delete directions. No time ceiling is pinned:
 * the app compares the folder's fingerprint while it is idle; it asserts only that it follows.
 */
test("the map follows an edit, both on add and on delete", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await installDesktopRailRuntime(page, SEED, undefined, { replaceFixture: true, writable: true });
  await page.goto("/ko/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  const index = page.getByTestId("topology-index-panel");
  await expect(index).toContainText("Reflect Shop", { timeout: 30_000 });
  await expect(index).toContainText("2 개념", { timeout: 20_000 });
  console.log("OPENED · 2 concepts");

  // Write one more node to disk — the same as a user creating the file in an editor.
  const t0 = Date.now();
  await writeDesktopFile(
    page,
    "capabilities/ship.md",
    `---\nuid: 33333333-3333-4333-8333-333333333333\nslug: capabilities/ship\nkind: capability\ntitle: Ship\n---\n\n# Ship\n`,
  );
  await expect(index).toContainText("3 개념", { timeout: 30_000 });
  console.log(`[reflect] add reflected ${Date.now() - t0}ms`);

  // It must follow on deletion too — a non-existent node left on screen is worse.
  const t1 = Date.now();
  await removeDesktopFile(page, "capabilities/ship.md");
  await expect(index).toContainText("2 개념", { timeout: 30_000 });
  console.log(`[reflect] delete reflected ${Date.now() - t1}ms`);
});
