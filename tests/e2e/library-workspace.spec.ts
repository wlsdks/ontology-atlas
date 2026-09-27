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
