import { expect, test, type Page } from '@playwright/test';

import { parseFrontmatter } from '../../../src/shared/lib/vault-document/parse-frontmatter';
import { seedFirstRunSeen } from '../first-run-seed';
import { stubDirectoryPicker } from '../vault-picker-stub';

const concept = (path: string, kind: string, slug: string, title: string, extra: string[] = []) => [
  path,
  ['---', `kind: ${kind}`, `slug: ${slug}`, `title: ${title}`, ...extra, '---', '', `# ${title}`, '', `${title}.`, ''].join('\n'),
];

const SEED: Record<string, string> = Object.fromEntries([
  concept('project.md', 'project', 'shop', 'Shop', ['domains: [domains/orders]']),
  concept('domains/orders.md', 'domain', 'domains/orders', 'Orders'),
  ['README.md', '---\nkind: vault-readme\ntitle: Read me\n---\n\n# Read me\n'],
]);

/** One file of the picked OPFS folder, read from disk rather than from the screen; null when absent. */
async function readFile(page: Page, path: string): Promise<string | null> {
  return page.evaluate(async (target) => {
    const root = await navigator.storage.getDirectory();
    const folders: string[] = [];
    for await (const [name] of (root as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
      if (name.startsWith('stub-vault-')) folders.push(name);
    }
    const picked = folders.sort().at(-1);
    if (!picked) return null;
    let dir = await root.getDirectoryHandle(picked);
    const segments = target.split('/');
    try {
      for (const segment of segments.slice(0, -1)) dir = await dir.getDirectoryHandle(segment);
      return await (await (await dir.getFileHandle(segments.at(-1)!)).getFile()).text();
    } catch {
      return null;
    }
  }, path);
}

async function frontmatterOf(page: Page, path: string): Promise<Record<string, unknown> | null> {
  const text = await readFile(page, path);
  return text === null ? null : parseFrontmatter(text).frontmatter;
}

const keysOf = (frontmatter: Record<string, unknown> | null) => (frontmatter ? Object.keys(frontmatter).sort() : null);

async function undoLatest(page: Page) {
  await page.getByRole('button', { name: 'Undo' }).last().click();
}

async function openEditMenuItem(page: Page, testId: string) {
  const panel = page.getByTestId('map-detail-panel');
  await panel.getByTestId('map-detail-panel-edit-menu-trigger').click();
  await page.getByTestId(testId).click();
}

async function selectInList(page: Page, title: string) {
  const search = page.getByTestId('topology-index-search');
  await search.fill(title);
  await page.getByTestId('topology-index-row').filter({ hasText: title }).first().click();
  await expect(page.getByTestId('map-detail-panel')).toHaveAttribute('data-selected-node-title', title, { timeout: 15_000 });
  await search.fill('');
}

test('a person builds a small ontology by hand on the map, and takes changes back', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, SEED);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/topology/?guides=off&e2e=1');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('topology-index-tree')).toContainText('Orders', { timeout: 30_000 });

  // A domain from the concept list's add row.
  await page.locator('[data-testid="topology-index-add-row"][data-add-kind="domain"] [data-testid="topology-index-add"]').click();
  const addField = page.getByTestId('topology-index-add-field');
  await addField.fill('Billing');
  await addField.press('Enter');
  await expect.poll(() => frontmatterOf(page, 'domains/billing.md'), { timeout: 15_000 }).toMatchObject({
    kind: 'domain',
    title: 'Billing',
    created_by: 'human',
  });
  expect(keysOf(await frontmatterOf(page, 'domains/billing.md'))).toEqual(['created_by', 'display_en', 'kind', 'slug', 'title', 'uid']);
  await addField.press('Escape');

  // Two capabilities from the card, the place prefilled from the selected domain.
  await expect(page.getByTestId('topology-index-tree')).toContainText('Billing', { timeout: 15_000 });
  await selectInList(page, 'Billing');
  await page.getByTestId('map-detail-panel-close').focus();
  await page.keyboard.press('n');
  const card = page.getByTestId('create-node-form');
  await expect(card).toHaveAttribute('data-create-kind', 'capability');
  await expect(page.getByTestId('create-node-parent')).toHaveValue('Billing');
  const name = page.getByTestId('create-node-title');
  for (const title of ['Invoices', 'Refunds']) {
    await name.fill(title);
    await name.press('ControlOrMeta+Enter');
    await expect(name).toHaveValue('');
  }
  await expect(card, 'the card stays for the next concept').toBeVisible();
  await name.press('Escape');
  for (const slug of ['invoices', 'refunds']) {
    const frontmatter = await frontmatterOf(page, `capabilities/${slug}.md`);
    expect(frontmatter).toMatchObject({ kind: 'capability', domain: 'domains/billing', created_by: 'human' });
    expect(keysOf(frontmatter)).toEqual(['created_by', 'display_en', 'domain', 'kind', 'slug', 'title', 'uid']);
  }

  // Refunds depends on Invoices, with its reason, found through the target search.
  await expect(page.getByTestId('topology-index-tree')).toContainText('Refunds', { timeout: 15_000 });
  await selectInList(page, 'Refunds');
  await openEditMenuItem(page, 'map-detail-panel-action-edit');
  await page.getByTestId('meaning-editor-relation-dependsOn').click();
  const target = page.getByTestId('meaning-editor-target');
  await target.click();
  await target.fill('invo');
  await page.getByTestId('meaning-editor-target-option').filter({ hasText: 'Invoices' }).click();
  const why = page.getByTestId('meaning-editor-why');
  await why.fill('A refund reverses an issued invoice.');
  await why.press('Enter');
  await expect.poll(() => frontmatterOf(page, 'capabilities/refunds.md'), { timeout: 15_000 }).toMatchObject({
    dependencies: ['capabilities/invoices'],
    relation_notes: { 'capabilities/invoices': 'A refund reverses an issued invoice.' },
  });
  expect(keysOf(await frontmatterOf(page, 'capabilities/refunds.md'))).toEqual([
    'created_by', 'dependencies', 'display_en', 'domain', 'kind', 'relation_notes', 'slug', 'title', 'uid',
  ]);
  await page.getByTestId('meaning-editor-panel').getByRole('button', { name: 'Close relation editor' }).click();

  // Rename in place, then take it back.
  const beforeRename = await readFile(page, 'capabilities/refunds.md');
  await expect(page.getByTestId('map-detail-panel')).toBeVisible({ timeout: 15_000 });
  await openEditMenuItem(page, 'map-detail-panel-action-rename');
  const rename = page.getByTestId('map-detail-panel-rename');
  await rename.fill('Refund requests');
  await rename.press('Enter');
  await expect.poll(() => frontmatterOf(page, 'capabilities/refunds.md'), { timeout: 15_000 }).toMatchObject({
    title: 'Refund requests',
    slug: 'capabilities/refunds',
  });
  expect(await readFile(page, 'capabilities/refunds.md')).toContain('\n# Refund requests\n');
  await undoLatest(page);
  await expect.poll(() => readFile(page, 'capabilities/refunds.md'), { timeout: 15_000 }).toBe(beforeRename);

  // Delete after the confirmation, then bring it back byte for byte.
  await expect(page.getByTestId('map-detail-panel')).toHaveAttribute('data-selected-node-title', 'Refunds', { timeout: 15_000 });
  await openEditMenuItem(page, 'map-detail-panel-action-delete');
  await page.getByTestId('map-detail-panel-delete-confirm-button').click();
  await expect.poll(() => readFile(page, 'capabilities/refunds.md'), { timeout: 15_000 }).toBeNull();
  // The keyboard takes the delete back too, so Undo outlives its toast.
  await expect(page.getByText('Deleted “Refunds”')).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => readFile(page, 'capabilities/refunds.md'), { timeout: 15_000 }).toBe(beforeRename);
  await expect(page.getByTestId('topology-index-tree')).toContainText('Refunds', { timeout: 15_000 });
});
