import { expect, test, type Page } from "@playwright/test";

/**
 * Sigma/WebGL 토폴로지 드래그 회귀 방지 spec.
 *
 * Sigma는 노드별 DOM 엘리먼트를 만들지 않으므로 선택 노드의 DOM focus label을
 * 기준으로 대략적인 노드 중심을 계산하고, 드래그 후 localStorage에 저장된
 * Sigma 좌표가 생겼는지 확인한다.
 */

const DRAG_TARGET_SLUG = "aslan-maps";
const POSITION_STORAGE_KEY = "aslan:sigma-node-positions:v1";

async function openHomeWithFocusedNode(page: Page) {
  await page.addInitScript((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, POSITION_STORAGE_KEY);
  await page.goto(`/?p=${DRAG_TARGET_SLUG}`);
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.locator(
      `[data-testid="sigma-focus-label"][data-slug="${DRAG_TARGET_SLUG}"][data-focused="true"]`,
    ),
  ).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
}

async function selectedNodeApproxCenter(page: Page, slug: string) {
  const label = page.locator(
    `[data-testid="sigma-focus-label"][data-slug="${slug}"][data-focused="true"]`,
  );
  const box = await label.boundingBox();
  if (!box) throw new Error(`focus label for ${slug} is missing`);
  return { x: box.x - 22, y: box.y + box.height / 2 };
}

async function storedSigmaPosition(page: Page, slug: string) {
  return page.evaluate(
    ({ storageKey, targetSlug }) => {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
      return parsed[targetSlug] ?? null;
    },
    { storageKey: POSITION_STORAGE_KEY, targetSlug: slug },
  );
}

test("Sigma 토폴로지에서 드래그가 노드 위치를 저장한다", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await openHomeWithFocusedNode(page);
  expect(await storedSigmaPosition(page, DRAG_TARGET_SLUG)).toBeNull();

  const center = await selectedNodeApproxCenter(page, DRAG_TARGET_SLUG);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  for (const t of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(center.x + 120 * t, center.y + 80 * t, { steps: 4 });
  }
  await page.mouse.up();
  await page.waitForTimeout(900);

  const stored = await storedSigmaPosition(page, DRAG_TARGET_SLUG);
  expect(stored, "드래그 후 Sigma 좌표가 저장되어야 한다").not.toBeNull();
  expect(Number.isFinite(stored?.x)).toBe(true);
  expect(Number.isFinite(stored?.y)).toBe(true);
  expect(consoleErrors, consoleErrors.join("\n")).toHaveLength(0);
});
