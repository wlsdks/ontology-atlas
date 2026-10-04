import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { waitForAnimationsDone, waitForBoxStill } from './settle';

test.beforeEach(async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.setViewportSize({ width: 1512, height: 900 });
});

test('browses a named membership path and returns by breadcrumb without opening inspection', async ({ page }) => {
  await page.goto('/en/topology/?guides=off&e2e=1&view=structure&index=collapsed');
  const structure = page.getByTestId('domain-structure-map');
  await expect(structure).toBeVisible();
  const domain = structure.locator('[data-structure-id]').first();
  const domainName = (await domain.innerText()).split('\n')[0]!;
  await domain.click();
  await expect(page.getByTestId('structure-scope-title')).toHaveText(domainName);
  await expect(page.getByTestId('map-detail-panel')).toHaveCount(0);
  const capability = structure.locator('[data-structure-id][aria-label^="Open "]').first();
  await expect(capability).toBeVisible();
  const capabilityName = (await capability.innerText()).split('\n')[0]!;
  await capability.click();
  await expect(page.getByTestId('structure-scope-title')).toHaveText(capabilityName);
  await structure.getByRole('navigation', { name: 'Structure path' }).getByRole('button', { name: domainName, exact: true }).click();
  await expect(page.getByTestId('structure-scope-title')).toHaveText(domainName);
  await waitForAnimationsDone(page.getByTestId('structure-children'));
  await expect(structure.getByRole('button', { name: `Read ${domainName}`, exact: true })).toBeVisible();
  await structure.getByRole('button', { name: `Read ${domainName}`, exact: true }).click();
  await expect(page.getByTestId('map-detail-panel')).toBeVisible();
});

test('keeps immediate keyboard return and reduced-motion scope changes usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/topology/?synth=120&guides=off&e2e=1&view=structure&index=collapsed');
  const structure = page.getByTestId('domain-structure-map');
  await expect(structure).toBeVisible();
  await structure.locator('[data-structure-id]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('structure-scope-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('structure-scope-title')).toHaveText('Synthetic vault');
  expect(await page.getByTestId('structure-children').evaluate(e => e.getAnimations().length)).toBe(0);
});

test('migrates the retired view and retains the other picker modes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('atlas.appearance.galaxy', 'on'));
  await page.goto('/en/topology/?synth=120&guides=off&e2e=1&view=galaxy&index=collapsed');
  await expect(page.getByTestId('domain-structure-map')).toBeVisible();
  await page.getByTestId('topology-view-3d').click();
  const menu = page.getByTestId('topology-view-3d-menu');
  await expect(menu.getByRole('radio')).toHaveCount(6);
  for (const view of ['flat', 'territories', 'hex', 'structure', 'strata', 'coupling']) await expect(page.getByTestId(`topology-view-3d-choice-${view}`)).toBeVisible();
  await page.getByTestId('topology-view-3d-choice-flat').click();
  await expect(page.getByTestId('ontology-map-canvas')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('atlas.appearance.galaxy'))).toBeNull();
});

test('bounds the rendered child list for a ten-thousand-concept graph', async ({ page }) => {
  await page.goto('/en/topology/?synth=10000&guides=off&e2e=1&view=structure&index=collapsed');
  const structure = page.getByTestId('domain-structure-map');
  await expect(structure).toBeVisible();
  await expect(structure).toContainText('10,000 concepts');
  expect(await structure.locator('[data-structure-id]').count()).toBeLessThanOrEqual(160);
  await structure.getByRole('button', { name: 'Open Domain 0', exact: true }).click();
  await expect(page.getByTestId('structure-scope-title')).toHaveText('Domain 0');
  expect(await structure.locator('[data-structure-id]').count()).toBeLessThanOrEqual(160);
  await structure.getByRole('button', { name: 'Next', exact: true }).first().click();
  await expect(structure).toContainText('2 /');
});

test('shares toolbar and content edges with balanced margins at desktop widths', async ({ page }) => {
  for (const width of [1024, 1512, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/topology/?guides=off&e2e=1&view=structure&index=collapsed');
    const root = page.getByTestId('domain-structure-map');
    await expect(root).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await waitForBoxStill(root, { frames: 4 });
    const geometry = await root.evaluate(element => {
      const body = element.querySelector('header')!.getBoundingClientRect();
      const host = element.parentElement!.getBoundingClientRect();
      const mode = document.querySelector('[data-testid="topology-view-3d"]')!.getBoundingClientRect();
      return { alignment: Math.abs(body.left - mode.left), imbalance: Math.abs(body.left - host.left - (host.right - body.right)) };
    });
    expect(geometry.alignment, `${width}px toolbar and content alignment`).toBeLessThanOrEqual(1);
    expect(geometry.imbalance, `${width}px balanced side margins`).toBeLessThanOrEqual(1);
  }
});
