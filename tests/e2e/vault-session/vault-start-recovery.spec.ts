import { expect, test, type Page } from '@playwright/test';
import {
  installDesktopRailRuntime,
  listDesktopFiles,
  readDesktopFile,
  refuseDesktopWrites,
  writeDesktopFile,
} from '../desktop-rail-arrival-harness';

/** Opens an empty folder through the native picker, from the first-run screen. */
async function openEmptyFolder(page: Page, locale: 'en' | 'ko') {
  await installDesktopRailRuntime(page, {}, undefined, { replaceFixture: true, writable: true });
  await page.goto(`/${locale}/?guides=off`);
  await page.getByTestId('first-run-open').click();
}

for (const {failure, width} of [
  {failure: 'all', width: 1512},
  {failure: 'element-only', width: 1512},
  {failure: 'element-only', width: 390},
] as const) {
 test(`starter ${failure} write failure at ${width} stays recoverable without overwriting saved documents`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 982 });
  await openEmptyFolder(page, 'en');
  await expect(page.getByTestId('vault-start-steps')).toBeVisible();
  await page.getByTestId('start-step-skip').click();
  await page.getByTestId('start-step-skip').click();
  await expect(page.getByTestId('vault-start-steps')).toHaveAttribute('data-step', 'starter');
  // Plant a real file-system failure after opening. Reads and permission probes
  // still work; the app must observe the outcome of its attempted writes.
  await refuseDesktopWrites(page, failure === 'all' ? [/.*/] : [/(^|\/)example-element\.md$/]);
  await page.getByTestId('start-step-cta-starter').click();
  await expect(page.getByTestId('start-step-scaffold-error')).toBeVisible();
  await expect(page.getByTestId('topology-index-panel')).toHaveCount(0);
  await expect(page.getByTestId('vault-start-steps')).toHaveAttribute('data-step', 'starter');
  await expect(page.getByTestId('start-step-cta-starter')).toBeEnabled();
  const navigation = (id: string, label: string) => width === 390
    ? page.locator('[data-tabbar="primary"]').getByRole('link', { name: label, exact: true })
    : page.getByTestId(`app-nav-rail-item-${id}`);
  await navigation('library', 'Library').click();
  await expect(page).toHaveURL(/\/library\//);
  await navigation('map', 'Map').click();
  await expect(page.getByTestId('start-step-scaffold-error')).toBeVisible();
  await expect(page.getByTestId('topology-index-panel')).toHaveCount(0);
  await expect(page.getByTestId('start-step-cta-starter')).toBeEnabled();
  let saved: string | null = null;
  if (failure === 'element-only') {
    saved = `${await readDesktopFile(page, 'project.md')}\nExisting work must survive retry.\n`;
    await writeDesktopFile(page, 'project.md', saved);
  }
  await refuseDesktopWrites(page, []);
  await page.getByTestId('start-step-cta-starter').click();
  await expect(page.getByTestId('vault-start-steps')).toHaveCount(0);
  await expect(page.locator('canvas[data-surface-role="map-canvas"]')).toBeVisible();
  await expect(page.getByTestId('start-step-scaffold-error')).toHaveCount(0);
  if (saved !== null) expect(await readDesktopFile(page, 'project.md')).toBe(saved);
  await expect.poll(async () => {
    let count = 0;
    for (const path of (await listDesktopFiles(page)) ?? []) {
      if (!path.endsWith('.md')) continue;
      if (/^kind: (project|domain|capability|element|vault-readme)$/m.test((await readDesktopFile(page, path)) ?? '')) count += 1;
    }
    return count;
  }).toBe(5);
  if (failure === 'all') {
    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toHaveCount(1);
    await expect(page.locator('[data-sonner-toast][data-type="info"]')).toHaveCount(0);
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  }
});

}

test.describe('empty map controls', () => {
  test.use({ isMobile: true, hasTouch: true });

  test('waits for concepts before offering map exploration controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEmptyFolder(page, 'ko');
    await expect(page.getByTestId('vault-start-steps')).toHaveAttribute('data-step', 'agent');
    await expect(page.getByTestId('topology-index-tab')).toHaveCount(0);
    await expect(page.getByTestId('topology-index-panel')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: '두 손가락으로' })).toHaveCount(0);
    await page.getByTestId('start-step-skip').click();
    await page.getByTestId('start-step-skip').click();
    await page.getByTestId('start-step-cta-starter').click();
    await expect(page.locator('canvas[data-surface-role="map-canvas"]')).toBeVisible();
    await expect(page.getByTestId('topology-index-panel')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '두 손가락으로' })).toBeVisible();
  });
});
