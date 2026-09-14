import { expect, test, type Page } from '@playwright/test';
import { installDesktopRailRuntime } from './desktop-rail-arrival-harness';
import { waitForDomeEntered, waitForMapStill } from './settle';

async function openMap(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installDesktopRailRuntime(page, { 'notes/audit.md': '# Inspection notes\nUncataloged document for the recovery target.\n' });
  await page.addInitScript(() => {
    localStorage.setItem('atlas.appearance.view3d', 'on');
    localStorage.setItem('atlas.appearance.map-arrangement', 'coupling');
  });
  await page.goto('/ko/?guides=off&e2e=1');
  await page.getByTestId('first-run-open').click();
  await waitForDomeEntered(page);
  await waitForMapStill(page);
}

test('keyboard focus stays visible across the canvas and related concept replacement', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMap(page);
  const canvas = page.getByTestId('ontology-map-canvas');
  for (let i = 0; i < 50 && !(await canvas.evaluate(el => el === document.activeElement)); i += 1) await page.keyboard.press('Tab');
  await expect(canvas).toBeFocused();
  const focus = await canvas.evaluate(el => {
    const s = getComputedStyle(el);
    return { visible: el.matches(':focus-visible'), style: s.outlineStyle, color: s.outlineColor, offset: parseFloat(s.outlineOffset) };
  });
  expect(focus.visible).toBe(true);
  expect(focus.style).toBe('solid');
  expect(focus.offset).toBeLessThan(0);
  // Prove painted pixels, not merely a focus class on a clipped outer ring.
  const screenshot = (await canvas.screenshot()).toString('base64');
  const pixels = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const probe = document.createElement('canvas');
    probe.width = image.width; probe.height = image.height;
    const ctx = probe.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return [0.4, 0.5, 0.6].map(fraction => Array.from(ctx.getImageData(image.width - 1, Math.floor(image.height * fraction), 1, 1).data).slice(0, 3));
  }, screenshot);
  const ink = focus.color.match(/\d+/g)!.slice(0, 3).map(Number);
  for (const pixel of pixels) expect(ink.every((channel, i) => Math.abs(pixel[i] - channel) <= 4), 'canvas focus outline is clipped').toBe(true);
  const panel = page.getByTestId('map-detail-panel');
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    await page.keyboard.press(key);
    await waitForMapStill(page);
    if (await panel.getAttribute('data-selected-node-kind') === 'domain') break;
  }
  await expect(panel).toHaveAttribute('data-selected-node-kind', 'domain');
  const relation = panel.locator('[data-datasheet-connection]').first();
  await expect(relation).toBeVisible();
  const targetId = (await relation.getAttribute('data-datasheet-connection'))!;
  for (let i = 0; i < 50 && (await page.evaluate(() => document.activeElement?.getAttribute('data-datasheet-connection'))) !== targetId; i += 1) await page.keyboard.press('Tab');
  await expect(relation).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel).toHaveAttribute('data-selected-node-id', targetId);
  await expect(page.getByTestId('map-detail-panel-close')).toBeFocused();
  expect(await page.getByTestId('map-detail-panel-close').evaluate(el => el.matches(':focus-visible'))).toBe(true);
});

test.describe('touch has an explicit overview return', () => {
  test.use({ hasTouch: true });
  for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
    test(`${width}: INDEX and detail targets meet the shared floor and Fit returns`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openMap(page);
      expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);
      const assertTarget = async (id: string) => {
        const target = page.getByTestId(id);
        await expect(target).toBeVisible();
        const box = (await target.boundingBox())!;
        expect(box.width, id).toBeGreaterThanOrEqual(44);
        expect(box.height, id).toBeGreaterThanOrEqual(44);
        expect(await target.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), `${id} is covered`).toBe(true);
      };
      if (width < 768) {
        await expect(page.getByTestId('topology-fit-control')).toBeHidden();
        const chevron = (await page.getByTestId('topology-index-fold').locator('span').last().boundingBox())!;
        const settings = (await page.getByTestId('topology-mobile-settings').boundingBox())!;
        expect(chevron.x + chevron.width, 'settings covers the INDEX collapse indicator').toBeLessThanOrEqual(settings.x);
      }
      const root = page.getByTestId('topology-index-row').first();
      expect((await root.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await assertTarget('topology-index-uncataloged-docs');
      await assertTarget('topology-index-source-unbound');
      await page.locator('[data-index-row="domain:orders"]').click();
      await waitForMapStill(page);
      await assertTarget('map-detail-panel-close');
      await assertTarget('map-detail-panel-more-menu-trigger');
      await expect(page.getByTestId('topology-realm-enter-button')).toHaveCount(0);
      await page.getByTestId('map-detail-panel-more-menu-trigger').click();
      await assertTarget('map-detail-panel-action-realm');
      await page.keyboard.press('Escape');
      const panel = page.getByTestId('map-detail-panel');
      if (width < 1024) {
        const bottom = (await panel.boundingBox())!;
        const tabs = page.getByRole('navigation', { name: '주요 메뉴' });
        const bar = (await tabs.boundingBox())!;
        expect(bottom.y + bottom.height).toBeLessThanOrEqual(bar.y);
      }
      await page.getByTestId('map-detail-panel-close').click();
      await expect(panel).toBeHidden();
      if (width < 768) {
        await expect(page.getByTestId('topology-fit-control')).toBeHidden();
        await page.getByTestId('topology-index-fold').click();
      }
      const fit = page.getByTestId('topology-fit-control').getByRole('button');
      await expect(fit).toBeVisible();
      const box = (await fit.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      await fit.click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __atlasMap: { selection(): { nodeId: string | null } } }).__atlasMap.selection().nodeId)).toBeNull();
      const actionRow = page.getByTestId('topology-utility-action-row');
      await expect(actionRow).toBeVisible();
      const actionBox = (await actionRow.boundingBox())!;
      expect(actionBox.x).toBeGreaterThanOrEqual(0);
      expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(width);
    });
  }
});

test('search selection hands keyboard focus to the map, while cancellation returns to its opener', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMap(page);
  const trigger = page.getByTestId('topology-concept-search');
  await trigger.click();
  const search = page.getByRole('dialog', { name: '이 지도에서 검색' });
  await expect(search).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Meta+k');
  await expect(search).toBeVisible();
  await search.getByRole('combobox').fill('결제');
  await expect(search.locator('[role="option"][aria-selected="true"]')).toContainText('결제');
  await page.keyboard.press('Enter');
  await expect(search).toBeHidden();
  const canvas = page.getByTestId('ontology-map-canvas');
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveAttribute('data-keyboard-focus', 'true');
  expect(await canvas.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  const selected = () => page.evaluate(() => (window as unknown as { __atlasMap: { selection(): { nodeId: string | null } } }).__atlasMap.selection().nodeId);
  const original = await selected();
  expect(original).toBeTruthy();
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    await page.keyboard.press(key);
    if ((await selected()) !== original) break;
  }
  await expect.poll(selected).not.toBe(original);
  await page.keyboard.press('Meta+k');
  await expect(search).toBeVisible();
  await expect(canvas).not.toHaveAttribute('data-keyboard-focus');
  await page.keyboard.press('Escape');
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveAttribute('data-keyboard-focus', 'true');
  const rect = (await canvas.boundingBox())!;
  await page.mouse.click(rect.x + 20, rect.y + rect.height - 20);
  await expect(canvas).not.toHaveAttribute('data-keyboard-focus');
  await trigger.click();
  await search.getByRole('combobox').fill('결제');
  const option = search.locator('[role="option"][aria-selected="true"]');
  await expect(option).toContainText('결제');
  await option.click();
  await expect(search).toBeHidden();
  await expect(canvas).toBeFocused();
  await expect(canvas).not.toHaveAttribute('data-keyboard-focus');
});
