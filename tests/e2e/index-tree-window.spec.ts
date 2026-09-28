import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker, writeFolderBeforePick } from "./vault-picker-stub";

const TREE = '[data-testid="topology-index-tree"]';
const LOOSE_CONCEPTS = 120;

function folderWithLooseConcepts(): Record<string, string> {
  const files: Record<string, string> = {
    "shop.md": "---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Shop\n---\n",
  };
  for (let i = 0; i < LOOSE_CONCEPTS; i += 1) {
    const uid = `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
    files[`elements/loose-${i}.md`] = `---\nuid: ${uid}\nslug: elements/loose-${i}\nkind: element\ntitle: Loose ${i}\n---\n`;
  }
  return files;
}

const topLevel = (page: Page) =>
  page.evaluate((tree) => {
    const rows = [...document.querySelectorAll<HTMLElement>(`${tree} [role="treeitem"][aria-level="1"]`)];
    return { rendered: rows.length, total: Number(rows[0]?.getAttribute("aria-setsize") ?? 0) };
  }, TREE);

const focusedRow = (page: Page) =>
  page.evaluate(() => {
    const row = document.activeElement as HTMLElement | null;
    return {
      level: row?.getAttribute("aria-level"),
      position: Number(row?.getAttribute("aria-posinset")),
      id: row?.dataset.indexRow ?? null,
    };
  });

test("the INDEX renders the rows in view and still reaches every row", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, {});
  await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await writeFolderBeforePick(page, folderWithLooseConcepts());
  // The probe attaches after mount: press a hydrated button.
  await page.waitForFunction(() => "__atlasMap" in window);
  await page.getByTestId("topology-switch-to-my-data").click();
  await expect.poll(async () => (await topLevel(page)).total).toBeGreaterThan(LOOSE_CONCEPTS);

  const first = await topLevel(page);
  expect(first.rendered, "every top-level row is in the DOM").toBeLessThan(first.total);

  await page.locator(`${TREE} [role="treeitem"]`).first().focus();
  await page.keyboard.press("End");
  await expect.poll(async () => (await focusedRow(page)).position).toBe(first.total);
  const last = await focusedRow(page);
  expect(last.level).toBe("1");

  await page.keyboard.press("Home");
  await expect.poll(async () => (await focusedRow(page)).position).toBe(1);

  await page.locator(TREE).evaluate((tree) => tree.scrollTo({ top: tree.scrollHeight }));
  await expect
    .poll(() => page.locator(`${TREE} [role="treeitem"][tabindex="0"]`).count(), { message: "a scrolled tree lost its tab stop" })
    .toBe(1);

  await page.locator(TREE).evaluate((tree) => tree.scrollTo({ top: 0 }));
  await page.evaluate(
    (id) => (window as unknown as { next: { router: { push: (url: string) => void } } }).next.router.push(`/en/topology/?e2e=1&guides=off&p=${encodeURIComponent(id)}`),
    last.id!,
  );
  await expect(page.locator(`${TREE} [data-index-row="${last.id}"]`)).toBeInViewport();
});
