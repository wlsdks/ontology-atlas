import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedFirstRunSeen } from './first-run-seed';

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

const evidence = process.env.ATLAS_CHOOSER_EVIDENCE ?? join(tmpdir(), 'atlas-folder-chooser-proof');

async function seedChooser(page: Page) {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    (FileSystemHandle.prototype as FileSystemHandle & { queryPermission: () => Promise<'denied' | 'granted'> }).queryPermission = async function () {
      return this.name.includes('unavailable') ? 'denied' : 'granted';
    };
  });
  await page.goto('/en/?shell=desktop&guides=off');
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names = ['current-project', 'unavailable-project', 'another-project', 'long-project-name-with-a-distinct-ending-one', 'long-project-name-with-a-distinct-ending-two'];
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
  });
}

test('five folders use one page scroll and every action remains reachable', async ({ page }) => {
  await seedChooser(page);
  await mkdir(evidence, { recursive: true });
  const measurements = [];
  for (const locale of ['ko', 'en']) {
    for (const [width, height] of [[320, 844], [390, 844], [600, 900], [768, 1024], [834, 1112], [1024, 768], [1040, 720], [1440, 900], [1512, 900], [1920, 1080], [2560, 1440]]) {
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
      }));
      expect(geometry.scrollHeight - geometry.listHeight, 'folder list must not own a nested scroll').toBeLessThanOrEqual(1);
      expect(geometry.scrollWidth - geometry.listWidth).toBeLessThanOrEqual(1);
      expect(geometry.pageScrollWidth - geometry.pageWidth).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('recent-vault-name')).toHaveCount(5);
      for (const name of await page.getByTestId('recent-vault-name').all()) {
        expect(await name.evaluate(el => ({ clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1, ellipsis: getComputedStyle(el).textOverflow }))).toEqual({ clipped: false, ellipsis: 'clip' });
      }
      const controls = page.locator('main button');
      expect(await controls.count()).toBeGreaterThan(5);
      for (const control of await controls.all()) {
        await control.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        const hit = await control.evaluate(el => {
          const r = el.getBoundingClientRect(); const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          const main = document.querySelector('main')!;
          return { ok: el.contains(at), name: el.getAttribute('aria-label'), rect: r.toJSON(), hit: at?.outerHTML.slice(0,600), main: { rect: main.getBoundingClientRect().toJSON(), height: main.clientHeight, scroll: main.scrollHeight, top: main.scrollTop, padding: getComputedStyle(main).paddingBottom } };
        });
        if (!hit.ok) { await writeFile(`${evidence}/hit-${locale}-${width}.json`, JSON.stringify(hit, null, 2)); await page.screenshot({path: `${evidence}/hit-${locale}-${width}.png`}); }
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
      expect(menu!.x).toBeGreaterThanOrEqual(0);
      expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('first-run-create-menu')).toBeFocused();
      await expect(page.getByTestId('first-run-create-menu')).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByTestId('first-run-create')).toBeHidden();
      await page.locator('main').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: `${evidence}/chooser-${locale}-${width}.png` });
      measurements.push({ locale, width, height, ...geometry, scrollEnd });
    }
  }
  await writeFile(`${evidence}/responsive.json`, JSON.stringify(measurements, null, 2));
});

test('a wrapped creation trigger keeps its menu inside the narrow viewport', async ({ page }) => {
  await seedChooser(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/en/?shell=desktop&guides=off');
  await expect(page.getByTestId('recent-vault-row')).toHaveCount(5);
  await page.getByTestId('first-run-folder-actions').evaluate(el => { el.style.width = '180px'; });
  const open = await page.getByTestId('first-run-open').boundingBox();
  const trigger = page.getByTestId('first-run-create-menu');
  expect((await trigger.boundingBox())!.y).toBeGreaterThanOrEqual(open!.y + open!.height);
  await trigger.click();
  const option = page.getByTestId('first-run-create');
  await expect(option).toBeVisible();
  const menu = await page.locator('#first-run-create-options').boundingBox();
  expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(option).toBeHidden();
});

test('creation disclosure is accessible and can be cancelled without opening a folder', async ({ page }) => {
  await seedChooser(page);
  await page.goto('/ko/?shell=desktop&guides=off');
  await expect(page.getByTestId('recent-vault-row')).toHaveCount(5);
  await page.getByTestId('first-run-create-menu').click();
  await expect(page.getByTestId('first-run-create')).toBeVisible();
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const result = await page.evaluate(async () => {
    return (window as unknown as { axe: { run: (context: string, options: unknown) => Promise<{ violations: unknown[]; passes: unknown[] }> } }).axe.run('main', {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    });
  });
  expect(result.passes.length).toBeGreaterThan(10);
  expect(result.violations).toEqual([]);
  await page.getByTestId('first-run-create').click();
  await expect(page.getByTestId('first-run-shape')).toBeVisible();
  await page.getByTestId('first-run-shape-back').click();
  await expect(page.getByTestId('recent-vault-row')).toHaveCount(5);
  await expect(page.getByTestId('first-run-create-menu')).toHaveAttribute('aria-expanded', 'false');
});


test('keyboard creation returns focus without writing and coarse controls keep 44px', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: String(test.info().project.use.baseURL), hasTouch: true, reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
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
  for (const control of await page.locator('main button:visible').all()) {
    const rect = await control.boundingBox();
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.width).toBeGreaterThanOrEqual(44);
  }
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
