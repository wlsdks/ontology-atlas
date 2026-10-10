import { expect, test } from '@playwright/test';
import { stubDirectoryPicker } from './vault-picker-stub';
import { seedFirstRunSeen } from './first-run-seed';

const carrier = '/ko/ontology/insights/?tab=do-next&review=analysis%3Acapability%3Acarrier-integration&guides=off';

for (const width of [1512, 1040, 390]) {
  test(`each implementation element has a connected, reachable document at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(carrier);
    const diagram = page.getByTestId('analysis-implementation-diagram');
    const links = diagram.getByTestId('analysis-implementation-link');
    await expect(links).toHaveCount(4);
    await expect(diagram.locator('[data-implementation-edge]')).toHaveCount(4);
    if (width < 1024) {
      const main = (await page.locator('main').boundingBox())!;
      const menu = (await page.getByRole('navigation', { name: '주요 메뉴', exact: true }).boundingBox())!;
      expect(main.y + main.height).toBeLessThanOrEqual(menu.y);
    }
    if (width === 1040) await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await expect.poll(() => diagram.evaluate(host => {
      const origin = host.querySelector('[data-implementation-source]')!.getBoundingClientRect();
      return [...host.querySelectorAll<SVGPathElement>('[data-implementation-edge]')].every(path => {
        const role = [...host.querySelectorAll<HTMLElement>('[data-implementation-role]')].find(node => node.dataset.implementationRole === path.dataset.implementationEdge)!;
        const target = role.getBoundingClientRect();
        const end = path.getPointAtLength(path.getTotalLength());
        const start = path.getPointAtLength(0);
        const matrix = path.getScreenCTM()!;
        const endScreen = new DOMPoint(end.x, end.y).matrixTransform(matrix);
        const startScreen = new DOMPoint(start.x, start.y).matrixTransform(matrix);
        const startTouchesSource = startScreen.x >= origin.left - 1 && startScreen.x <= origin.right + 1 && startScreen.y >= origin.top - 1 && startScreen.y <= origin.bottom + 1 && Math.min(Math.abs(startScreen.x - origin.right), Math.abs(startScreen.y - origin.bottom)) <= 1;
        return startTouchesSource && Math.abs(endScreen.x - target.left) <= 1 && Math.abs(endScreen.y - (target.top + target.height / 2)) <= 1;
      });
    })).toBe(true);
    expect(await page.locator('main').evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    const href = await links.first().getAttribute('href');
    expect(href).toContain('slug=elements');
    expect(href).toContain('review=analysis%3Acapability%3Acarrier-integration');
    await links.first().click();
    await expect(page).toHaveURL(/slug=elements%2Fcj-logistics/);
    await expect(page.getByRole('heading', { name: /CJ Logistics Integration/ })).toBeVisible();
    await page.locator('a[href*="/ontology/insights/"][href*="review=analysis"]').filter({ visible: true }).first().click();
    const selected = page.locator('[data-analysis-claim-id="capability:carrier-integration"]');
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(selected).toBeFocused();
    await expect(links).toHaveCount(4);
    expect(errors).toEqual([]);
  });
}

test('a missing implementation link does not draw a relationship to an empty state', async ({ page }) => {
  await page.goto('/en/ontology/insights/?tab=do-next&review=analysis%3Acapability%3Aaccount-closure&guides=off');
  const diagram = page.getByTestId('analysis-implementation-diagram');
  await expect(diagram.getByTestId('analysis-implementation-empty')).toBeVisible();
  await expect(diagram.locator('[data-implementation-edge]')).toHaveCount(0);
  await expect(diagram.getByTestId('analysis-implementation-link')).toHaveCount(0);
});

test('additional elements remain bounded and source paths never become invented element links', async ({ page }) => {
  const doc = (n: number, kind: string, slug: string, title: string, fields = '') => `---\nuid: f0000000-0000-4000-8000-${String(n).padStart(12, '0')}\nkind: ${kind}\nslug: ${slug}\ntitle: ${title}\n${fields}\n---\n${title} records the example responsibility.\n`;
  const files: Record<string, string> = {
    'project.md': doc(1, 'project', 'example', 'Example', 'domains: [domains/orders]'),
    'domains/orders.md': doc(2, 'domain', 'domains/orders', 'Orders', 'capabilities: [capabilities/checkout, capabilities/path-only]'),
    'capabilities/checkout.md': doc(3, 'capability', 'capabilities/checkout', 'Checkout', `domain: domains/orders\nelements: [${Array.from({ length: 8 }, (_, i) => `elements/part-${i}`).join(', ')}]`),
    'capabilities/path-only.md': doc(4, 'capability', 'capabilities/path-only', 'Path only', 'domain: domains/orders\npath: src/path-only.ts'),
  };
  for (let i = 0; i < 8; i++) files[`elements/part-${i}.md`] = doc(i + 10, 'element', `elements/part-${i}`, `Part ${i}`);
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, files);
  await page.goto('/en/topology/?guides=off');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('topology-index-panel')).toContainText('Example');
  await page.goto('/en/ontology/insights/?tab=do-next&review=analysis%3Acapability%3Acheckout&guides=off');
  const links = page.getByTestId('analysis-implementation-link');
  await expect(links).toHaveCount(6);
  await expect(page.locator('[data-implementation-edge]')).toHaveCount(6);
  await page.getByTestId('analysis-implementation-more').click();
  await expect(links).toHaveCount(8);
  await expect(page.locator('[data-implementation-edge]')).toHaveCount(8);
  await expect(links.nth(6)).toBeFocused();
  await expect(page.getByTestId('analysis-implementation-more')).toHaveCount(0);
  await page.goto('/en/ontology/insights/?tab=do-next&review=analysis%3Acapability%3Apath-only&guides=off');
  await expect(page.getByTestId('analysis-implementation-empty')).toBeVisible();
  await expect(page.locator('[data-implementation-edge]')).toHaveCount(0);
  await expect(links).toHaveCount(0);
  await expect(page.getByTestId('analysis-evidence')).toContainText('src/path-only.ts');
});
