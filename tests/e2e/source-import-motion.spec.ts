import { expect, test } from '@playwright/test';
import { openEmptyLibrary, visibleAdd, run } from './source-import-fixture';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`source import separates picker waiting from real work and completion with ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await openEmptyLibrary(page);
    const button = page.getByTestId('library-start-add-files');
    const before = await button.boundingBox();
    await button.click();
    await page.waitForFunction(() => typeof (window as unknown as { __finishPicker?: unknown }).__finishPicker === 'function');
    await expect(button.locator('.motion-work-spin')).toHaveCount(0);
    await expect(button).not.toHaveAttribute('aria-busy', 'true');
    await run(page, '__finishPicker');
    await page.waitForFunction(() => (window as unknown as { __writing?: boolean }).__writing === true);
    await expect(button.locator('[data-action-feedback="working"]')).toBeVisible();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toHaveText('Add files');
    const during = await button.boundingBox();
    expect(during).toEqual(before);
    const seat = await button.locator('[data-action-feedback]').boundingBox();
    const glyph = await button.locator('[data-work-glyph]').boundingBox();
    expect(glyph).toEqual(seat);
    expect(glyph!.y + glyph!.height / 2).toBe(during!.y + during!.height / 2);
    if (reducedMotion === 'reduce') {
      expect(await button.locator('.motion-work-spin').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    }
    await run(page, '__finishWrite');
    await expect(page.getByTestId('library-add-files')).toBeEnabled();
    await expect(page.getByTestId('library-add-files').locator('[data-action-feedback="done"]')).toBeVisible();
    await expect(page.getByTestId('library-source-sources/motion.txt')).toBeVisible();
    await expect(page.getByTestId('library-add-files').locator('[data-action-feedback="idle"]')).toBeVisible();
    await page.getByTestId('library-add-files').click();
    await run(page, '__finishPicker');
    await expect(page.getByTestId('library-add-files')).toBeEnabled();
    await expect(page.getByTestId('library-add-files').locator('[data-action-feedback="idle"]')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __writes: number }).__writes)).toBe(1);
  });
}

test('cancelled source selection remains neutral without a false completed action', async ({ page }) => {
  await openEmptyLibrary(page);
  await page.getByTestId('library-start-add-files').click();
  await page.waitForFunction(() => typeof (window as unknown as { __cancelPicker?: unknown }).__cancelPicker === 'function');
  await run(page, '__cancelPicker');
  await expect(visibleAdd(page)).toBeEnabled();
  await expect(visibleAdd(page).locator('[data-action-feedback="idle"]')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __writes: number }).__writes)).toBe(0);
});

test('failed source writes show failure and never a success glyph', async ({ page }) => {
  await openEmptyLibrary(page, true);
  await page.getByTestId('library-start-add-files').click();
  await page.waitForFunction(() => typeof (window as unknown as { __finishPicker?: unknown }).__finishPicker === 'function');
  await run(page, '__finishPicker');
  await page.waitForFunction(() => (window as unknown as { __writing?: boolean }).__writing === true);
  await run(page, '__finishWrite');
  await expect(visibleAdd(page)).toBeEnabled();
  await expect(visibleAdd(page).locator('[data-action-feedback="failed"]')).toBeVisible();
  await expect(visibleAdd(page).locator('.motion-check-draw')).toHaveCount(0);
});
