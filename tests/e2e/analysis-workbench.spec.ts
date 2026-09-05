import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { seedFirstRunSeen } from './first-run-seed';

type CaptionBox = { edgeId: string; text: string; minX: number; maxX: number; minY: number; maxY: number };

for (const width of [1280, 1440, 1512, 1680, 1728, 1920]) {
  test(`expanded INDEX keeps search and meaning reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en/topology/?e2e=1&guides=off&index=expanded');
    await expect(page.getByTestId('topology-index-panel')).toBeVisible();
    await page.getByTestId('topology-concept-search').click({ timeout: 8000 });
    await expect(page.locator('[cmdk-item]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('topology-meaning-workbench-toggle').click({ timeout: 8000 });
    await expect(page.getByTestId('analysis-workbench')).toBeVisible();
  });
}

test.beforeEach(async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => window.localStorage.setItem('demo:sample-source:v1', 'storefront'));
});

test('a selected concept opens meaning and draws bounded directional relation captions', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.goto('/en/topology/?e2e=1&guides=off&p=capability%3Acart&open=domain%3Aorder%2Cproject%3Astorefront');
  await page.getByTestId('topology-v2-detail-panel-action-meaning').click();
  const workbench = page.getByTestId('analysis-workbench');
  await expect(workbench).toBeVisible();
  await expect(workbench.getByRole('checkbox')).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlasMap?: { relationCaptions?: () => CaptionBox[] } }).__atlasMap?.relationCaptions?.().length ?? 0)).toBeGreaterThan(0);
  const proof = await page.evaluate(() => {
    const api = (window as unknown as { __atlasMap: { relationCaptions: () => CaptionBox[]; labels: () => Array<Omit<CaptionBox, 'edgeId'>> } }).__atlasMap;
    const captions = api.relationCaptions(); const labels = api.labels();
    const overlaps = (a: Omit<CaptionBox, 'edgeId'>, b: Omit<CaptionBox, 'edgeId'>) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
    return { captions, overlaps: captions.flatMap((caption) => labels.filter((label) => overlaps(caption, label))) };
  });
  expect(proof.captions.length).toBeLessThanOrEqual(24);
  expect(proof.captions.some((caption) => /[→↘↓↙←↖↑↗]/u.test(caption.text))).toBe(true);
  expect(proof.overlaps).toEqual([]);
  await workbench.getByRole('checkbox').uncheck();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlasMap?: { relationCaptions?: () => CaptionBox[] } }).__atlasMap?.relationCaptions?.().length ?? -1)).toBe(0);
});

for (const locale of ['en', 'ko'] as const) {
for (const width of [390, 744, 1023, 1024, 1040, 1280, 1512, 1920, 2560]) {
  test(`${locale}: meaning review and close remain reachable at ${width}px`, async ({ page }, info) => {
    const height = width <= 744 ? 900 : width <= 1040 ? 720 : 1080;
    await page.setViewportSize({ width, height });
    await page.goto(`/${locale}/topology/?e2e=1&guides=off&index=collapsed`);
    await page.getByTestId('topology-meaning-workbench-toggle').click();
    const panel = page.getByTestId('analysis-workbench');
    await expect(panel).toBeVisible();
    await page.waitForFunction(() => {
      const surface = document.querySelector('[data-agent-dock-surface="inset"]');
      const frame = document.querySelector('[data-agent-dock-frame]');
      return surface && frame && Number(getComputedStyle(surface).opacity) > 0.99 && [...surface.getAnimations(), ...frame.getAnimations()].every((animation) => animation.playState !== 'running');
    });
    const closeLabel = (locale === 'ko' ? ko : en).analysisWorkbench.close;
    const proof = await panel.evaluate((element, closeLabel) => {
      const box = element.getBoundingClientRect();
      const close = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.getAttribute('aria-label') === closeLabel)!;
      const button = close.getBoundingClientRect();
      const hit = document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2);
      const canvas = document.querySelector('[data-testid="topology-map-v2-canvas"]')!.getBoundingClientRect();
      return { left: box.left, right: box.right, bottom: box.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, closeReachable: !!hit && close.contains(hit), canvasWidth: canvas.width, canvasRight: canvas.right, panelFont: getComputedStyle(element).fontSize };
    }, closeLabel);
    expect(proof.left).toBeGreaterThanOrEqual(0);
    expect(proof.right).toBeLessThanOrEqual(proof.viewportWidth);
    expect(proof.bottom).toBeLessThanOrEqual(proof.viewportHeight);
    expect(proof.closeReachable).toBe(true);
    if (width >= 1024) {
      expect(proof.canvasWidth).toBeGreaterThanOrEqual(480);
      expect(proof.canvasRight).toBeLessThanOrEqual(proof.left);
    }
    const geometryPath = info.outputPath('workbench-geometry.json');
    const ariaPath = info.outputPath('workbench-aria.txt');
    const imagePath = info.outputPath('workbench-headless.png');
    await writeFile(geometryPath, JSON.stringify(proof));
    await writeFile(ariaPath, await page.locator('body').ariaSnapshot());
    await page.screenshot({ path: imagePath });
    await info.attach('workbench-geometry', { path: geometryPath, contentType: 'application/json' });
    await info.attach('workbench-aria', { path: ariaPath, contentType: 'text/plain' });
    await info.attach('workbench-headless', { path: imagePath, contentType: 'image/png' });
    await panel.getByRole('button', { name: closeLabel }).click();
    await expect(panel).toBeHidden();
  });
}
}

test('Architecture exposes version history without requiring an agent process', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.goto('/en/architecture/?guides=off');
  await page.getByTestId('architecture-review-open').click();
  await expect(page.getByTestId('analysis-workbench')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Findings & history' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('architecture-inspector')).toBeHidden();
});

test('the map meaning action returns an open history dock to meaning without closing it', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.goto('/en/topology/?e2e=1&guides=off&index=collapsed');
  await page.getByTestId('topology-meaning-workbench-toggle').click();
  const panel = page.getByTestId('analysis-workbench');
  await panel.getByRole('tab', { name: en.analysisWorkbench.history }).click();
  await expect(panel.getByRole('tab', { name: en.analysisWorkbench.history })).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('topology-meaning-workbench-toggle').click();
  await expect(panel.getByRole('tab', { name: en.analysisWorkbench.meaning })).toHaveAttribute('aria-selected', 'true');
});

test.describe('keyboard review at a coarse viewport', () => {
  test.use({ hasTouch: true, viewport: { width: 744, height: 900 } });
  for (const route of ['topology', 'architecture']) {
    test(`${route}: review takes visible focus and restores its opener`, async ({ page }) => {
      await page.goto(`/en/${route}/?e2e=1&guides=off&index=collapsed`);
      const opener = page.getByTestId(route === 'topology' ? 'topology-meaning-workbench-toggle' : 'architecture-review-open');
      await opener.focus();
      await page.keyboard.press('Enter');
      const panel = page.getByTestId('analysis-workbench');
      await expect(panel.getByRole('button', { name: en.analysisWorkbench.close })).toBeFocused();
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => {
          const focused = document.activeElement;
          if (!(focused instanceof HTMLElement) || focused === document.body) return true;
          const rect = focused.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return !!hit && focused.contains(hit) && !focused.closest('[inert]');
        })).toBe(true);
      }
      await panel.getByRole('button', { name: en.analysisWorkbench.close }).focus();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(opener).toBeFocused();
    });
  }
});

for (const width of [1040, 1512]) {
  test(`showing a relationship reveals its hidden endpoint at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en/topology/?e2e=1&guides=off&p=capability%3Acart&open=domain%3Aorder%2Cproject%3Astorefront');
    await page.getByTestId('topology-v2-detail-panel-action-meaning').click();
    const relation = page.getByTestId('analysis-workbench').locator('article').filter({ hasText: 'Product Detail Page' });
    await relation.getByRole('button', { name: en.analysisWorkbench.showConnection }).click();
    await expect.poll(() => page.evaluate(() => {
      const api = (window as unknown as { __atlasMap: {
        nodes: () => Array<{ id: string; hidden: boolean }>;
        edges: () => Array<{ sourceId: string; targetId: string }>;
        relationCaptions: () => CaptionBox[];
      } }).__atlasMap;
      return {
        endpoints: api.nodes().filter((node) => ['capability:cart', 'capability:product-detail'].includes(node.id) && !node.hidden).length,
        edges: api.edges().filter((edge) => edge.sourceId === 'capability:cart' && edge.targetId === 'capability:product-detail').length,
        caption: api.relationCaptions().some((caption) => caption.edgeId.includes('product-detail') && caption.edgeId.includes('cart')),
      };
    })).toEqual({ endpoints: 2, edges: 1, caption: true });
  });
}
