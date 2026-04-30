import { expect, test, type Page } from "@playwright/test";

/**
 * 로그인 후 공개 홈 Sigma 토폴로지에서 드래그 저장 경로를 검증한다.
 */

const TARGET_SLUG = "sandbox-core";
const POSITION_STORAGE_KEY = "aslan:sigma-node-positions:v1";

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

test("공개 홈 Sigma 토폴로지에서 드래그가 실제 위치를 저장한다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });

  await page.addInitScript((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, POSITION_STORAGE_KEY);

  await page.goto("/login/");
  const demoLogin = page.getByRole("button", { name: "데모 로그인" }).first();
  const demoClicked = await demoLogin
    .click({ timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!demoClicked, "데모 로그인 버튼 없음 — skip");

  await page.goto(`/?account=sandbox-lab&p=${TARGET_SLUG}`);
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.locator(
      `[data-testid="sigma-focus-label"][data-slug="${TARGET_SLUG}"][data-focused="true"]`,
    ),
  ).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);

  const center = await selectedNodeApproxCenter(page, TARGET_SLUG);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  for (const t of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(center.x + 120 * t, center.y + 80 * t, { steps: 4 });
  }
  await page.mouse.up();
  await page.waitForTimeout(900);

  const stored = await storedSigmaPosition(page, TARGET_SLUG);
  expect(stored, "드래그 후 Sigma 좌표가 저장되어야 한다").not.toBeNull();
  expect(errors, errors.join("\n")).toHaveLength(0);
});
