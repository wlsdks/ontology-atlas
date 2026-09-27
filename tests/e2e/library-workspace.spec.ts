import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_VAULT } from './fixture-vault';
import { DAY_ONE_TEXT } from './library-day-one-fixture';
import { stubDirectoryPicker } from './vault-picker-stub';

async function openLibrary(page: Page) {
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT, ...DAY_ONE_TEXT });
  await page.goto('/en/topology/?guides=off&e2e=1');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('first-run-starter')).toBeHidden();
  await page.goto('/en/library/?guides=off&e2e=1');
  await expect(page.getByTestId('library-workspace-tabs')).toBeVisible();
}

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
  await page.getByTestId('library-workspace-sources').click();
  await expect(page.getByTestId('library-index')).toBeVisible();
  await page.getByTestId('library-workspace-ontology').click();
  await expect(page).toHaveURL(/tab=ontology/);
  expect(new URL(page.url()).searchParams.get('slug')).toBe('capabilities/checkout');
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveValue(`${original}\n\nUnsaved Library round trip.`);
});
