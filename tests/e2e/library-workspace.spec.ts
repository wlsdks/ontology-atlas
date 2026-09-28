import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_VAULT } from './fixture-vault';
import { DAY_ONE_TEXT } from './library-day-one-fixture';
import { stubDirectoryPicker } from './vault-picker-stub';

async function openLibrary(page: Page, files = { ...FIXTURE_VAULT, ...DAY_ONE_TEXT }) {
  await stubDirectoryPicker(page, files);
  await page.goto('/en/topology/?guides=off&e2e=1');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('first-run-starter')).toBeHidden();
  await page.goto('/en/library/?guides=off&e2e=1');
  await expect(page.getByTestId('library-workspace-tabs')).toBeVisible();
}

test('legacy concept sets remain reachable with no current nodes and retain saved identity and URL context', async ({ page }) => {
  const folderId = '33333333-3333-4333-8333-333333333333';
  const itemId = '44444444-4444-4444-8444-444444444444';
  await openLibrary(page, {
    'sources/notes.md': '# Notes\nKeep evidence before changing meaning.\n',
    '.ontology-atlas/library-collections.json': JSON.stringify({
      schema: 'ontology-atlas/library-collections/v1',
      folders: [{ id: folderId, name: 'Review saved evidence', parentId: null, order: 0,
        presentation: 'constellation', purpose: 'Recover the prior review scope.',
        createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z' }],
      items: [{ id: itemId, folderId, order: 0, label: 'Missing review concept',
        target: { kind: 'ontology', uid: '11111111-1111-4111-8111-111111111111', lastKnownPath: 'capabilities/review.md' } }],
    }),
  });
  await page.goto(`/en/library/?tab=collections&view=edit&constellation=${folderId}&context=original&guides=off&e2e=1#saved-review`);
  await expect(page.getByTestId('library-workspace-ontology')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('library-ontology-sets')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('ontology');
  const url = new URL(page.url());
  expect(url.searchParams.get('ontologyView')).toBe('sets');
  expect(url.searchParams.get('view')).toBe('edit');
  expect(url.searchParams.get('constellation')).toBe(folderId);
  expect(url.searchParams.get('context')).toBe('original');
  expect(url.hash).toBe('#saved-review');
  await expect(page.getByTestId(`library-constellation-${folderId}`)).toBeVisible();
  await expect(page.getByTestId(`library-constellation-unresolved-${itemId}`)).toContainText('capabilities/review.md');
  await page.getByTestId('library-ontology-sets').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('library-ontology-documents')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId(`library-constellation-${folderId}`)).toBeVisible();
  await page.getByRole('button', { name: 'View Review saved evidence on the map' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('constellation')).toBe(folderId);
  await expect(page).toHaveURL(/\/topology\//);
});

async function expectSingleLibraryPageHeading(page: Page, name: string | RegExp) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name })).toHaveCount(1);
}

test('a no-slug Ontology entry opens graph-backed evidence instead of a Wiki guide', async ({ page }) => {
  await openLibrary(page);
  await page.getByTestId('library-workspace-ontology').click();
  // One page title per tab: the tab's own name, never a second heading from the viewer.
  await expectSingleLibraryPageHeading(page, 'Ontology');
  await expect(page.getByTestId('docs-sidebar-collection-all')).toHaveCount(0);
  await expect(page.getByTestId('docs-sidebar-collection-guides')).toHaveCount(0);
  await expect(page.getByTestId('docs-sidebar-collection-ontology')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get('slug')).toMatch(
    /^(?:projects|domains|capabilities|elements)\//,
  );
  await expect(page.locator('[data-docs-viewer]')).toBeVisible();
  await expect(page.locator('[data-docs-viewer]')).not.toContainText('<the page name>');
});

test('an empty concept set starts the ontology in a documents-only folder', async ({ page }) => {
  await openLibrary(page, { 'sources/notes.md': '# Notes\nKeep the source as evidence.\n' });
  await page.goto('/en/library/?tab=ontology&ontologyView=sets&guides=off&e2e=1');
  await page.getByTestId('library-collections-add-concepts').click();
  await expect(page.getByTestId('library-workspace-ontology')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('library-ontology-documents')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Create starter seed', exact: true })).toBeVisible();
  await expect(page.getByTestId('library-collections')).toHaveCount(0);
});

test('closing New wiki page preserves the source passage underneath', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: /settlement-policy\.md/ }).first().click();
  await page.getByRole('button', { name: 'Settlement cycle', exact: true }).click();
  await expect(page.getByTestId('library-source-passage')).toBeVisible();
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-new-page').click();
  await expect(page.getByRole('dialog', { name: 'New wiki page' })).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog', { name: 'New wiki page' })).toHaveCount(0);
  await expect(page.getByTestId('library-source-passage')).toBeVisible();
});

async function listEdges(page: Page) {
  return page.getByTestId('docs-vault-doc-list').evaluate((aside) => {
    const textX = (button: Element) => {
      const span = [...button.querySelectorAll('span')].find((node) => node.textContent?.trim() && !node.querySelector('span'));
      return span ? span.getBoundingClientRect().x : null;
    };
    const header = aside.querySelector('[data-testid="docs-sidebar-recently-changed-toggle"] svg')?.getBoundingClientRect().x ?? null;
    const rows = [...aside.querySelectorAll('nav > *')].map((row) => {
      const button = row.matches('button') ? row : row.querySelector(':scope > button');
      return button ? { glyph: button.querySelector('svg')!.getBoundingClientRect().x, text: textX(button), folder: button.hasAttribute('aria-expanded') } : null;
    }).filter((row) => row !== null);
    return { header, rows };
  });
}

test('the ontology list keeps one glyph column and one text line, and its fold moves the page once', async ({ page }) => {
  await openLibrary(page);
  await page.getByTestId('library-workspace-ontology').click();
  await expect(page.getByTestId('docs-vault-doc-list')).toBeVisible();
  const edges = await listEdges(page);
  const folders = edges.rows.filter((row) => row.folder);
  const leaves = edges.rows.filter((row) => !row.folder);
  expect(folders.length).toBeGreaterThan(0);
  expect(leaves.length).toBeGreaterThan(0);
  expect(edges.header).not.toBeNull();
  for (const row of edges.rows) expect(Math.abs(row.glyph - edges.header!)).toBeLessThanOrEqual(0.5);
  for (const leaf of leaves) expect(Math.abs(leaf.text! - folders[0].text!)).toBeLessThanOrEqual(0.5);

  const fold = page.locator('[data-docs-header-zone="identity"] button[aria-expanded]').first();
  const openX = await page.locator('#main').evaluate((element) => element.getBoundingClientRect().x);
  await fold.click();
  const xs = await page.locator('#main').evaluate((element) => new Promise<number[]>((resolve) => {
    const seen: number[] = [];
    const sample = () => {
      seen.push(Math.round(element.getBoundingClientRect().x));
      if (seen.length < 12) requestAnimationFrame(sample);
      else resolve(seen);
    };
    requestAnimationFrame(sample);
  }));
  expect(new Set(xs).size).toBe(1);
  expect(xs[0]).toBeLessThan(openX);
  await expect(page.getByTestId('docs-vault-doc-list')).toHaveAttribute('data-doc-list-state', 'collapsed');

  await page.getByTestId('library-workspace-sources').click();
  await expect(page.getByTestId('library-index')).toBeVisible();
  await page.evaluate(() => {
    const seen: Array<string | null> = [];
    (window as unknown as { __listStates: Array<string | null> }).__listStates = seen;
    const sample = () => {
      const aside = document.querySelector('[data-testid="docs-vault-doc-list"]');
      if (aside) seen.push(aside.getAttribute('data-doc-list-state'));
      if (seen.length < 20) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByTestId('library-workspace-ontology').click();
  await expect(page.getByTestId('docs-vault-doc-list')).toHaveAttribute('data-doc-list-state', 'collapsed');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __listStates: string[] }).__listStates.length)).toBeGreaterThan(5);
  const states = await page.evaluate(() => (window as unknown as { __listStates: string[] }).__listStates);
  expect(new Set(states)).toEqual(new Set(['collapsed']));

  await fold.click();
  await expect(page.getByTestId('docs-vault-doc-list')).toHaveAttribute('data-doc-list-state', 'open');
  await expect(page.getByTestId('docs-vault-doc-list')).toHaveCSS('animation-name', 'panelCrossfadeIn');
});

test('a legacy document link and the last unsaved keystroke survive a Library tab round trip', async ({ page }) => {
  await openLibrary(page);
  await page.goto('/en/docs/?slug=capabilities/checkout&guides=off&e2e=1#checkout');
  await expect(page).toHaveURL(/\/library\//);
  await expect(page.getByTestId('library-workspace-ontology')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-docs-viewer]')).toContainText('결제 승인');
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  const editor = page.locator('textarea').filter({ visible: true });
  await expect(editor).toHaveCount(1);
  const original = await editor.inputValue();
  await editor.fill(`${original}\n\nUnsaved Library round trip.`);
  const documentView = new URL(page.url()).searchParams.get('view');
  await page.getByTestId('library-ontology-sets').click();
  await expect(page.getByTestId('library-collections')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('view')).toBe(documentView);
  await page.getByTestId('library-ontology-documents').click();
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveValue(`${original}\n\nUnsaved Library round trip.`);
  await page.getByTestId('library-workspace-sources').click();
  await expect(page.getByTestId('library-index')).toBeVisible();
  await page.getByTestId('library-workspace-ontology').click();
  await expect(page).toHaveURL(/tab=ontology/);
  expect(new URL(page.url()).searchParams.get('slug')).toBe('capabilities/checkout');
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveValue(`${original}\n\nUnsaved Library round trip.`);
});
