import { expect, test, type Page } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';
import {
  MIXED_LIBRARY_VAULT,
  WIKI_ONLY_LIBRARY_VAULT,
} from './fixtures/library-ontology-scope';

async function loadVault(page: Page, seed: Record<string, string>) {
  await stubDirectoryPicker(page, seed);
  await seedFirstRunSeen(page);
  await page.goto('/en/topology/?guides=off');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('first-run-starter')).toHaveCount(0);
}

async function openOntology(page: Page, slug?: string) {
  const query = new URLSearchParams({ tab: 'ontology', guides: 'off' });
  if (slug) query.set('slug', slug);
  await page.goto(`/en/library/?${query}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Ontology' })).toBeVisible();
}

async function pinCurrentDocument(page: Page) {
  await page.getByRole('button', { name: 'Open palette (search · commands · tags)' }).click();
  const palette = page.getByRole('dialog', { name: 'Ontology workspace palette' });
  const search = palette.getByRole('combobox', {
    name: 'Ontology workspace search, command, tag',
  });
  await search.fill('> Pin this doc');
  await expect(palette.getByRole('option', { name: /Pin this doc/ })).toHaveCount(1);
  await search.press('Enter');
  await expect(palette).toHaveCount(0);
}

test('Library Ontology exposes only the five explicit schema kinds', async ({ page }) => {
  await loadVault(page, MIXED_LIBRARY_VAULT);
  await openOntology(page);

  await expect(page.getByTestId('vault-chip-menu-trigger')).toContainText('5 documents');
  for (const id of ['all', 'guides', 'ontology']) {
    await expect(page.getByTestId(`docs-sidebar-collection-${id}`)).toHaveCount(0);
  }

  for (const folder of ['capabilities', 'domains', 'elements']) {
    await page.getByRole('button', { name: new RegExp(folder) }).first().click();
  }
  for (const title of [
    'Ontology boundary fixture',
    'Settlement',
    'Payments',
    'Settlement worker',
    'Settlement decision',
  ]) {
    await expect(page.getByRole('button', { name: title, exact: true }).first()).toBeVisible();
  }
  for (const title of [
    'Vault instructions',
    'Architecture profile',
    'Plain note in ontology folder',
    'Describes-only note',
    'Ordinary wiki note',
  ]) {
    await expect(
      page.getByTestId('docs-vault-doc-list').getByRole('button', { name: title, exact: true }),
    ).toHaveCount(0);
  }

  await page.getByTestId('docs-sidebar-search-toggle').click();
  await page.getByPlaceholder('Find by name or path').fill('Plain note in ontology folder');
  await expect(page.getByText('0 results').first()).toBeVisible();

  await page.getByTestId('docs-sidebar-new-doc').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (const kind of ['Domain', 'Capability', 'Element', 'Document']) {
    await expect(dialog.getByRole('button', { name: kind, exact: true })).toBeVisible();
  }
  await expect(dialog.getByRole('button')).toHaveCount(5);
});

test('out-of-scope URLs and crosslinks use one exact Document reader and return cleanly', async ({ page }) => {
  await loadVault(page, MIXED_LIBRARY_VAULT);
  await openOntology(page, 'capabilities/settlement');
  await expect(page.locator('[data-docs-viewer]')).toContainText('Schedules funds after capture');
  await expect(page.getByRole('link', { name: 'Vault instructions', exact: true })).toHaveAttribute(
    'href',
    /\/docs\/.+slug=README/,
  );
  await expect(
    page.getByRole('link', { name: 'Plain note in ontology folder', exact: true }),
  ).toHaveAttribute('href', /\/docs\/.+slug=docs%2Fontology%2Fplain-note/);

  await page.getByRole('link', { name: 'Ordinary wiki note', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/docs\/.+slug=wiki%2Fsettlement-note/);
  await expect(page.getByRole('heading', { level: 1, name: 'Document' })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Ontology' })).toHaveCount(0);
  await expect(page.locator('[data-docs-viewer]')).toContainText(
    'General knowledge must stay outside the Ontology tab',
  );
  await expect(page.getByTestId('docs-sidebar-new-doc')).toHaveCount(0);
  await expect(page.locator('[data-docs-header-zone="tabs"]')).not.toContainText('Settlement');

  await page.getByTestId('docs-compatibility-library-return').click();
  await expect(page).toHaveURL((url) =>
    url.pathname === '/en/library/' &&
    url.searchParams.get('tab') === 'ontology' &&
    url.searchParams.get('slug') === 'capabilities/settlement'
  );
  await expect(page.locator('[data-docs-viewer]')).toContainText('Schedules funds after capture');
  expect(new URL(page.url()).searchParams.get('slug')).toBe('capabilities/settlement');
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.getByRole('heading', { level: 1, name: 'Ontology' })).toHaveCount(1);
  await expect(page.locator('[data-docs-header-zone="tabs"]')).toContainText('Settlement');
  await expect(page.locator('[data-docs-header-zone="tabs"]')).not.toContainText('Ordinary wiki note');

  await page.goto('/en/library/?tab=ontology&slug=README&view=raw&source=local#details');
  await expect(page).toHaveURL(/\/en\/docs\/.+slug=README/);
  expect(new URL(page.url()).searchParams.get('view')).toBe('raw');
  expect(new URL(page.url()).hash).toBe('#details');
  await expect(page.getByRole('heading', { level: 1, name: 'Document' })).toHaveCount(1);
});

test('pinned, recent, and restored tabs stay inside the ontology scope', async ({ page }) => {
  await loadVault(page, MIXED_LIBRARY_VAULT);
  await openOntology(page, 'capabilities/settlement');

  await page.getByRole('button', { name: /domains/ }).first().click();
  await page
    .getByTestId('docs-vault-doc-list')
    .getByRole('button', { name: 'Payments', exact: true })
    .click();
  await page.locator('#main').getByRole('button', { name: 'Settlement', exact: true }).click();
  await pinCurrentDocument(page);

  await page.getByRole('link', { name: 'Vault instructions', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Document' })).toHaveCount(1);
  await pinCurrentDocument(page);
  await page.getByTestId('docs-compatibility-library-return').click();

  await expect(page.getByText('Pinned · 1')).toBeVisible();
  // Recent lists the way back to the others: the open document is the tab, not a Recent row.
  await expect(page.getByText('Recent · 1')).toBeVisible();
  await expect(page.getByTestId('docs-vault-doc-list').getByText('Vault instructions')).toHaveCount(0);
  await expect(page.locator('[data-docs-header-zone="tabs"]')).toContainText('Settlement');
  await expect(page.locator('[data-docs-header-zone="tabs"]')).toContainText('Payments');
  await expect(page.locator('[data-docs-header-zone="tabs"]')).not.toContainText('Vault instructions');
});

test('a wiki-only vault leaves Ontology empty and restores no ordinary tab', async ({ page }) => {
  await loadVault(page, WIKI_ONLY_LIBRARY_VAULT);
  await page.goto('/en/docs/?source=local&slug=README');
  await expect(page.getByRole('heading', { level: 1, name: 'Document' })).toHaveCount(1);
  await expect(page.locator('[data-docs-header-zone="tabs"]')).toContainText('Vault instructions');
  await openOntology(page);
  await expect(page.getByTestId('vault-chip-menu-trigger')).toContainText('0 documents');
  await expect(page.locator('[data-docs-header-zone="tabs"]')).not.toContainText('Vault instructions');
  await expect(page.getByRole('heading', { level: 1, name: 'Ontology' })).toHaveCount(1);
});
