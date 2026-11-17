import { expect, test, type Page } from '@playwright/test';
import planning from '../../../messages/en/planning.json';
import { seedFirstRunSeen } from '../first-run-seed';
import { stubDirectoryPicker } from '../vault-picker-stub';

const VAULT = {
  'project.md': ['---', 'kind: project', 'slug: planning-demo', 'title: Planning demo', '---', '', '# Planning demo', ''].join('\n'),
  'capabilities/checkout.md': ['---', 'kind: capability', 'slug: checkout', 'title: Checkout', '---', '', '# Checkout', ''].join('\n'),
};

async function goTo(page: Page, destination: 'Planning' | 'Library') {
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: destination, exact: true }).click();
}

/** Reads one file of the folder the stubbed picker handed out, straight from the browser's private storage. */
async function readFromDisk(page: Page, path: string): Promise<string | null> {
  return page.evaluate(async (relative) => {
    const storage = await navigator.storage.getDirectory();
    for await (const [name, handle] of (storage as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (!name.startsWith('stub-vault-') || handle.kind !== 'directory') continue;
      let folder = handle as FileSystemDirectoryHandle;
      const parts = relative.split('/');
      try {
        for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part);
        return await (await (await folder.getFileHandle(parts[parts.length - 1])).getFile()).text();
      } catch { return null; }
    }
    return null;
  }, path);
}

test('a planning folder made inside the open folder takes a new document and keeps it across visits', async ({ page }) => {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
  await page.goto('/en/library/');
  await page.getByTestId('library-open-vault').click();
  await expect(page.getByTestId('library-page')).toBeVisible();

  await goTo(page, 'Planning');
  const stage = page.locator('[data-planning-state="no-home"]');
  await expect(stage).toBeVisible();
  await expect(stage.getByRole('button').first()).toHaveAccessibleName(planning.createHome);
  await expect(stage.getByRole('button', { name: planning.chooseAnother }), 'the web cannot pick a folder outside the open one').toHaveCount(0);
  await stage.getByRole('button', { name: planning.createHome }).click();

  await expect(page.getByText(planning.emptyHome)).toBeVisible();
  await expect(page.getByText(planning.empty)).toHaveCount(0);
  await page.locator('[data-planning-empty-new]').click();
  const title = page.getByRole('textbox', { name: planning.documentTitle });
  await expect(title).toBeFocused();
  await title.fill('Checkout redesign');
  await title.press('Enter');

  const editor = page.locator('[data-planning-editor] textarea');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('# Checkout redesign\n\n');
  await page.keyboard.type('Customers pay in one step.');
  await page.getByRole('button', { name: planning.save, exact: true }).click();

  const reader = page.locator('[data-planning-reader]');
  await expect(reader.getByRole('heading', { name: 'Checkout redesign' })).toBeVisible();
  await expect(reader.getByText('Customers pay in one step.')).toBeVisible();
  await expect(page.locator('[data-planning-editor]')).toHaveCount(0);
  expect(await readFromDisk(page, 'planning/Checkout-redesign.md')).toBe('# Checkout redesign\n\nCustomers pay in one step.');

  await goTo(page, 'Library');
  await expect(page.getByTestId('library-page')).toBeVisible();
  await goTo(page, 'Planning');
  await expect(page.getByRole('button', { name: 'Checkout-redesign.md' })).toHaveAttribute('aria-current', 'true');
  await expect(reader.getByText('Customers pay in one step.')).toBeVisible();
  await expect(page.locator('[data-testid="planning-stage"]')).toHaveCount(0);
});

test('a new document title is dropped with Escape and focus returns to New document', async ({ page }) => {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, { ...VAULT, 'planning/brief.md': '# Brief\n\nKept.\n' });
  await page.goto('/en/library/');
  await page.getByTestId('library-open-vault').click();
  await expect(page.getByTestId('library-page')).toBeVisible();

  await goTo(page, 'Planning');
  await expect(page.locator('[data-planning-reader]').getByRole('heading', { name: 'Brief' })).toBeVisible();
  const newDocument = page.getByRole('button', { name: planning.newDocument, exact: true });
  await newDocument.click();
  const title = page.getByRole('textbox', { name: planning.documentTitle });
  await expect(title).toBeFocused();
  await title.press('Escape');
  await expect(title).toHaveCount(0);
  await expect(newDocument).toBeFocused();
});
