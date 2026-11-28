import { expect, test, type Page } from '@playwright/test';

import { installDesktopRailRuntime, listDesktopFiles } from '../desktop-rail-arrival-harness';

const concept = (path: string, kind: string, slug: string, title: string, extra: string[] = []) => [
  path,
  ['---', `kind: ${kind}`, `slug: ${slug}`, `title: ${title}`, ...extra, '---', '', `# ${title}`, '', `${title}.`, ''].join('\n'),
];

const SEED: Record<string, string> = Object.fromEntries([
  concept('project.md', 'project', 'shop', 'Shop', ['domains: [domains/orders, domains/billing]']),
  concept('domains/orders.md', 'domain', 'domains/orders', 'Orders'),
  concept('domains/billing.md', 'domain', 'domains/billing', 'Billing'),
  concept('capabilities/checkout.md', 'capability', 'capabilities/checkout', 'Checkout', ['domain: domains/orders']),
  concept('capabilities/payouts.md', 'capability', 'capabilities/payouts', 'Payouts', ['domain: domains/billing']),
  ['README.md', '---\nkind: vault-readme\ntitle: Read me\n---\n\n# Read me\n'],
]);

/** The node the map has selected, from the `?e2e=1` probe: what the committed route state drew. */
const mapSelection = (page: Page) =>
  page.evaluate(() => (window as unknown as { __atlasMap?: { selection: () => { nodeId: string | null } } }).__atlasMap?.selection().nodeId ?? null);

/** The panel's open state as the address keeps it; `null` once nothing asks for it. */
const workbench = (page: Page) => new URL(page.url()).searchParams.get('workbench');

async function openAddConcept(page: Page) {
  await page.getByTestId('ontology-map-canvas').focus();
  await page.keyboard.press('n');
  await expect(page.getByTestId('create-node-form')).toBeVisible();
  await expect.poll(() => workbench(page)).toBe('create');
}

/**
 * The router hands a written address back in a transition, after the panel's own close has
 * rendered; that render must not read the old `workbench=create` as a request to open it again.
 */
test('the add-concept panel closes with × and after a create, and stays closed', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installDesktopRailRuntime(page, SEED, undefined, { replaceFixture: true, writable: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/?guides=off&e2e=1');
  await page.getByTestId('first-run-open').click();
  await expect(page.getByTestId('topology-index-tree')).toContainText('Orders', { timeout: 30_000 });
  const panel = page.getByTestId('create-node-form');

  await openAddConcept(page);
  await page.getByTestId('create-node-cancel').click();
  await expect.poll(() => workbench(page), 'the close left the address asking for the panel').toBeNull();
  await expect(panel).toBeHidden();

  await openAddConcept(page);
  const name = page.getByTestId('create-node-title');
  await name.fill('Refunds');
  await name.press('Enter');
  await expect.poll(() => listDesktopFiles(page)).toContain('capabilities/refunds.md');
  await expect.poll(() => workbench(page), 'the create left the address asking for the panel').toBeNull();
  await expect(panel).toBeHidden();
});

/**
 * Undo deletes the concept the create selected; once the folder is read again the selection names
 * nothing and the map clears it. A render that still read the old address then reported the concept
 * as missing, and that error toast sat in front of the next create's Undo, so a click landed on it.
 */
test('Undo takes back each create and reports nothing missing', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installDesktopRailRuntime(page, SEED, undefined, { replaceFixture: true, writable: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/?guides=off&e2e=1');
  await page.getByTestId('first-run-open').click();
  await expect(page.getByTestId('topology-index-tree')).toContainText('Orders', { timeout: 30_000 });
  // Every "not found" sentence the page shows, so a toast that came and went still counts.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __missReports: string[] }).__missReports = seen;
    new MutationObserver(() => {
      for (const toast of document.querySelectorAll('[data-sonner-toast]')) {
        const text = toast.textContent ?? '';
        if (text.includes('Concept not found') && !seen.includes(text)) seen.push(text);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });

  await page.getByTestId('topology-index-row').filter({ hasText: 'Orders' }).first().click();
  await expect.poll(() => mapSelection(page)).toBe('domain:orders');
  for (const [title, slug] of [['Invoices', 'invoices'], ['Refunds', 'refunds']] as const) {
    await openAddConcept(page);
    const name = page.getByTestId('create-node-title');
    await name.fill(title);
    await name.press('Enter');
    await expect.poll(() => listDesktopFiles(page)).toContain(`capabilities/${slug}.md`);
    await expect.poll(() => mapSelection(page), 'the create selects the new concept').toBe(`capability:${slug}`);
    await page.locator('[data-sonner-toast]').filter({ hasText: `“${title}”` }).getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => listDesktopFiles(page), `Undo left ${slug} on disk`).not.toContain(`capabilities/${slug}.md`);
    // The folder was read again and the map drew the selection cleared.
    await expect.poll(() => mapSelection(page), 'the map still selects the concept Undo removed').toBeNull();
  }
  const reports = await page.evaluate(() => (window as unknown as { __missReports: string[] }).__missReports);
  expect(reports, 'a concept Undo removed was reported missing').toEqual([]);
});
