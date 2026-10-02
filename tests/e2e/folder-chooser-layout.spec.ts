import { expect, test, type Page } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { waitForAnimationsDone } from './settle';

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

async function seedChooser(page: Page, longNames = false) {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    (FileSystemHandle.prototype as FileSystemHandle & { queryPermission: () => Promise<'denied' | 'granted'> }).queryPermission = async function () {
      return this.name.includes('unavailable') ? 'denied' : 'granted';
    };
  });
  await page.goto('/en/?shell=desktop&guides=off');
  await page.evaluate(async (longNames) => {
    const root = await navigator.storage.getDirectory();
    const names = ['current-project', 'unavailable-project', 'another-project', 'long-project-name-with-a-distinct-ending-one', 'long-project-name-with-a-distinct-ending-two']
      .map(name => longNames ? `${name}${' workspace architecture implementation review and maintenance records with source evidence'.repeat(2)}` : name);
    const records = await Promise.all(names.map(async (name, index) => ({
      id: 'current', name, handle: await root.getDirectoryHandle(name, { create: true }),
      createdAt: 1, lastAccessedAt: Date.now() - index * 3600000,
      docCount: 12, conceptCount: 7, countedAt: Date.now() - index * 3600000,
    })));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('demo-kv', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(records, 'docs-vault:fs-handle:recent');
      tx.objectStore('kv').put(records[0], 'docs-vault:fs-handle:current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, longNames);
}

test('the chooser stays fixed while its folder list scrolls and every action remains reachable', async ({ page }) => {
  // Five is the supported recent-folder limit. Long valid names exercise scrolling without the retired game card.
  await seedChooser(page, true);
  const measurements = [];
  // The app's minimum window, the owner's desk and a wide display, with English at the floor where
  // its longer labels bind.
  for (const [locale, sizes] of [['ko', [[1040, 720], [1512, 900], [2560, 1440]]], ['en', [[1040, 720]]]] as const) {
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto(`/${locale}/?shell=desktop&guides=off`);
      await expect(page.getByTestId('recent-vault-row')).toHaveCount(5);
      await expect(page.getByTestId('recent-vault-notice-blocked')).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      const list = page.getByTestId('recent-vault-list');
      const geometry = await list.evaluate(el => ({
        listHeight: el.clientHeight, scrollHeight: el.scrollHeight,
        listWidth: el.clientWidth, scrollWidth: el.scrollWidth,
        pageWidth: document.querySelector('main')!.clientWidth,
        pageScrollWidth: document.querySelector('main')!.scrollWidth,
        pageHeight: document.querySelector('main')!.clientHeight,
        pageScrollHeight: document.querySelector('main')!.scrollHeight,
      }));
      expect(geometry.pageScrollHeight - geometry.pageHeight, 'the page must stay fixed; only the folder list may scroll').toBeLessThanOrEqual(1);
      expect(geometry.listHeight, 'the folder list must keep a usable viewport').toBeGreaterThan(80);
      expect(geometry.scrollWidth - geometry.listWidth).toBeLessThanOrEqual(1);
      expect(geometry.pageScrollWidth - geometry.pageWidth).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('recent-vault-name')).toHaveCount(5);
      for (const name of await page.getByTestId('recent-vault-name').all()) {
        expect(await name.evaluate(el => ({ clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1, ellipsis: getComputedStyle(el).textOverflow }))).toEqual({ clipped: false, ellipsis: 'clip' });
      }
      const controls = page.locator('main button:visible');
      expect(await controls.count()).toBeGreaterThan(5);
      for (const control of await controls.all()) {
        await control.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await expect.poll(() => control.evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }), { message: `unreachable control at ${locale} ${width}: ${await control.getAttribute('aria-label')}` }).toBe(true);
      }
      const scrollEnd = await page.locator('main').evaluate(el => {
        el.scrollTop = el.scrollHeight;
        const bottom = el.lastElementChild!.getBoundingClientRect().bottom;
        const tab = document.querySelector('[data-tabbar=primary]');
        const tabRect = tab?.getBoundingClientRect();
        return (tabRect && tabRect.height > 0 ? tabRect.top : el.getBoundingClientRect().bottom) - bottom;
      });
      expect(scrollEnd).toBeGreaterThanOrEqual(0);
      await page.getByTestId('first-run-create-menu').scrollIntoViewIfNeeded();
      await page.getByTestId('first-run-create-menu').click();
      await expect(page.getByTestId('first-run-create')).toBeVisible();
      const menu = await page.locator('#first-run-create-options').boundingBox();
      expect(menu).not.toBeNull();
      expect(menu!.x, `menu left at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('first-run-create-menu')).toBeFocused();
      await expect(page.getByTestId('first-run-create-menu')).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByTestId('first-run-create')).toBeHidden();
      await list.evaluate(el => { el.scrollTop = 0; });
      measurements.push({ locale, width, height, ...geometry, scrollEnd });
    }
  }
  expect(measurements.some(row => row.scrollHeight > row.listHeight + 1), 'the fixture must exercise actual internal scrolling').toBe(true);
});

test('creation disclosure is accessible and can be cancelled without opening a folder', async ({ page }) => {
  await seedChooser(page);
  await page.goto('/ko/?shell=desktop&guides=off');
  await expect(page.getByTestId('recent-vault-row')).toHaveCount(5);
  await page.getByTestId('first-run-create-menu').click();
  await expect(page.getByTestId('first-run-create')).toBeVisible();
  const main = page.locator('main');
  const entrance = main.locator('.architecture-result-arrive').first();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await waitForAnimationsDone(main);
  const settledEvidence = await entrance.evaluate((element) => {
    const main = element.closest('main');
    const quaternary = [...(main?.querySelectorAll<HTMLElement>('[class]') ?? [])]
      .find((candidate) => candidate.getAttribute('class')?.includes('--color-text-quaternary'));
    const ancestorOpacities = [];
    for (let current: HTMLElement | null = quaternary ?? null; current; current = current.parentElement) {
      ancestorOpacities.push({ tag: current.tagName, testid: current.dataset.testid ?? null, opacity: getComputedStyle(current).opacity });
      if (current === main) break;
    }
    const runningFiniteAnimations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity && animation.playState === 'running')
      .map((animation) => ({ playState: animation.playState, currentTime: animation.currentTime }));
    return {
      entranceOpacity: getComputedStyle(element).opacity,
      quaternaryColor: quaternary ? getComputedStyle(quaternary).color : null,
      ancestorOpacities,
      runningFiniteAnimations,
    };
  });
  expect(settledEvidence, `creation disclosure did not reach its static contrast state: ${JSON.stringify(settledEvidence)}`).toMatchObject({
    entranceOpacity: '1',
    runningFiniteAnimations: [],
  });
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const result = await page.evaluate(async () => {
    return (window as unknown as { axe: { run: (context: string, options: unknown) => Promise<{ violations: unknown[]; passes: unknown[] }> } }).axe.run('main', {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    });
  });
  expect(result.passes.length).toBeGreaterThan(10);
  expect(result.violations, `axe measured the settled creation disclosure: ${JSON.stringify(settledEvidence)}`).toEqual([]);
  await page.getByTestId('first-run-create').click();
  await expect(page.getByTestId('first-run-shape')).toBeVisible();
  await page.getByTestId('first-run-shape-back').click();
  await expect(page.getByTestId('recent-vault-row')).toHaveCount(5);
  await expect(page.getByTestId('first-run-create-menu')).toHaveAttribute('aria-expanded', 'false');
});


test('keyboard creation returns focus without writing', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: String(test.info().project.use.baseURL), reducedMotion: 'reduce', viewport: { width: 1512, height: 900 } });
  const page = await context.newPage();
  await seedChooser(page);
  await page.goto('/ko/?shell=desktop&guides=off');
  await expect(page.getByTestId('recent-vault-row')).toHaveCount(5);
  await page.getByTestId('first-run-open').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('first-run-create-menu')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('first-run-create')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('first-run-create')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('first-run-shape')).toBeFocused();
  for (let index = 0; index < 4; index++) await page.keyboard.press('Tab');
  await expect(page.getByTestId('first-run-shape-back')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('first-run-create-menu')).toBeFocused();
  await expect(page.getByTestId('recent-vault-row')).toHaveCount(5);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('first-run-create')).toBeVisible();
  await page.locator('main').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('first-run-create-menu')).toBeFocused();
  await expect(page.getByTestId('first-run-create-menu')).toHaveAttribute('aria-expanded', 'false');
  await context.close();
});
