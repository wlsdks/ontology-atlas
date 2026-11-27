import { expect, test } from '@playwright/test';
import { writeDesktopFile } from '../desktop-rail-arrival-harness';
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
    /* Layout floats differ by 1e-4 px between reads; the button moving is a whole-pixel event. */
    for (const side of ['x', 'y', 'width', 'height'] as const) {
      expect(during![side], `the button's ${side} changed when work began`).toBeCloseTo(before![side], 2);
    }
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
    await expect(page.getByTestId('library-page')).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('main')?.contains(document.activeElement))).toBe(true);
    await expect(page.getByTestId('library-add-files').locator('[data-action-feedback="idle"]')).toBeVisible();
    await page.getByTestId('library-add-files').click();
    await page.waitForFunction(() => typeof (window as unknown as { __finishPicker?: unknown }).__finishPicker === 'function');
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

test('a source poll cannot publish an unfinished copy or move its working control', async ({ page }) => {
  await openEmptyLibrary(page);
  const button = page.getByTestId('library-start-add-files');
  await button.click();
  await page.waitForFunction(() => typeof (window as unknown as { __finishPicker?: unknown }).__finishPicker === 'function');
  await run(page, '__finishPicker');
  await page.waitForFunction(() => (window as unknown as { __writing?: boolean }).__writing === true);
  const before = await button.boundingBox();
  // The listings the app asked the native side for, from the fake's own record of every call.
  const listings = () => page.evaluate(() => (window as unknown as { __nativeCalls: { command: string }[] }).__nativeCalls.filter((call) => call.command === 'list_vault_directory').length);
  const walk = await listings();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(listings).toBeGreaterThan(walk);
  const samples = await page.evaluate(() => new Promise<Array<{ box: Pick<DOMRect, 'x' | 'y' | 'width' | 'height'> | null; text: string }>>(resolve => {
    const frames: Array<{ box: Pick<DOMRect, 'x' | 'y' | 'width' | 'height'> | null; text: string }> = [];
    const tick = () => {
      const button = document.querySelector('[data-testid="library-start-add-files"]');
      frames.push({ box: button?.getBoundingClientRect().toJSON() ?? null, text: document.body.innerText });
      if (frames.length === 120) resolve(frames);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  try {
    for (const sample of samples) {
      expect(sample.box).toMatchObject(before!);
      expect(sample.text).not.toContain('motion.txt');
    }
  } finally { await run(page, '__finishWrite'); }
  await expect(page.getByTestId('library-source-sources/motion.txt')).toBeVisible();
  await expect(page.getByTestId('library-add-files')).toBeEnabled();
});

test('unrelated source and Wiki changes remain visible while an original is being copied', async ({ page }) => {
  await openEmptyLibrary(page);
  await page.getByTestId('library-start-add-files').click();
  await page.waitForFunction(() => typeof (window as unknown as { __finishPicker?: unknown }).__finishPicker === 'function');
  await run(page, '__finishPicker');
  await page.waitForFunction(() => (window as unknown as { __writing?: boolean }).__writing === true);
  await writeDesktopFile(page, 'sources/external.txt', 'Externally gathered original\n');
  await writeDesktopFile(page, 'wiki/external.md', '---\ndoc_type: wiki\nslug: wiki/external\ntitle: External page\n---\n# External page\n');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  try {
    await expect(page.getByTestId('library-source-sources/external.txt')).toBeVisible();
    await expect(page.getByTestId('library-workspace-sources')).toHaveText(/Sources\s*1/);
    await expect(page.getByTestId('library-workspace-wiki')).toHaveText(/Wiki\s*1/);
    await expect(page.getByTestId('library-source-sources/motion.txt')).toHaveCount(0);
  } finally { await run(page, '__finishWrite'); }
  await expect(page.getByTestId('library-source-sources/motion.txt')).toBeVisible();
  await expect(page.getByTestId('library-workspace-sources')).toHaveText(/Sources\s*2/);
});
