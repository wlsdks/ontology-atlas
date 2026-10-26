import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from '../first-run-seed';
import { stubDirectoryPicker } from '../vault-picker-stub';

for (const {failure, width} of [
  {failure: 'all', width: 1512},
  {failure: 'element-only', width: 1512},
  {failure: 'element-only', width: 390},
] as const) {
 test(`starter ${failure} write failure at ${width} stays recoverable without overwriting saved documents`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 982 });
  await stubDirectoryPicker(page, {});
  await seedFirstRunSeen(page);
  await page.goto('/en/topology/?guides=off');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('vault-start-steps')).toBeVisible();
  await page.getByTestId('start-step-skip').click();
  await page.getByTestId('start-step-skip').click();
  await expect(page.getByTestId('vault-start-steps')).toHaveAttribute('data-step', 'starter');
  // Plant a real file-system failure after opening. Reads and permission probes
  // still work; the app must observe the outcome of its attempted writes.
  await page.evaluate((failure) => {
    const original = FileSystemDirectoryHandle.prototype.getFileHandle;
    FileSystemDirectoryHandle.prototype.getFileHandle = async function(name, options) {
      if (options?.create && (failure === 'all' || name === 'example-element.md')) throw new DOMException('QA write denied', 'NotAllowedError');
      return original.call(this, name, options);
    };
    (window as unknown as { restoreStarterWrites: () => void }).restoreStarterWrites = () => {
      FileSystemDirectoryHandle.prototype.getFileHandle = original;
    };
  }, failure);
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
  const preserved = failure === 'element-only' ? await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for await (const dir of root.values()) {
      if (dir.kind !== 'directory' || !dir.name.startsWith('stub-vault-')) continue;
      const file = await (dir as FileSystemDirectoryHandle).getFileHandle('project.md');
      const saved = `${await (await file.getFile()).text()}\nExisting work must survive retry.\n`;
      const writable = await file.createWritable();
      await writable.write(saved);
      await writable.close();
      return { folder: dir.name, saved };
    }
    throw new Error('The partially written folder was not found');
  }) : null;
  await page.evaluate(() => (window as unknown as { restoreStarterWrites: () => void }).restoreStarterWrites());
  await page.getByTestId('start-step-cta-starter').click();
  await expect(page.getByTestId('vault-start-steps')).toHaveCount(0);
  await expect(page.locator('canvas[data-surface-role="map-canvas"]')).toBeVisible();
  await expect(page.getByTestId('start-step-scaffold-error')).toHaveCount(0);
  if (preserved) {
    const actual = await page.evaluate(async ({ folder }) => {
      const root = await navigator.storage.getDirectory();
      const file = await (await root.getDirectoryHandle(folder)).getFileHandle('project.md');
      return (await file.getFile()).text();
    }, preserved);
    expect(actual).toBe(preserved.saved);
  }
  await expect.poll(() => page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    let count = 0;
    const walk = async (dir: FileSystemDirectoryHandle) => {
      for await (const child of dir.values()) {
        if (child.kind === 'directory') await walk(child as FileSystemDirectoryHandle);
        else if (child.name.endsWith('.md')) {
          const text = await (await (child as FileSystemFileHandle).getFile()).text();
          if (/^kind: (project|domain|capability|element|vault-readme)$/m.test(text)) count += 1;
        }
      }
    };
    await walk(root);
    return count;
  })).toBe(5);
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
    await stubDirectoryPicker(page, {});
    await seedFirstRunSeen(page);
    await page.goto('/ko/topology/?guides=off');
    await page.getByTestId('first-run-starter-open').click();
    await page.getByTestId('vault-guide-pick-existing').click();
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
