import { expect, test, type Page } from '@playwright/test';
import planning from '../../../messages/en/planning.json';
import { installDesktopRailRuntime } from '../desktop-rail-arrival-harness';
import { seedFirstRunSeen } from '../first-run-seed';
import { stubDirectoryPicker } from '../vault-picker-stub';

const VAULT = {
  'project.md': ['---', 'kind: project', 'slug: planning-demo', 'title: Planning demo', '---', '', '# Planning demo', ''].join('\n'),
  'capabilities/checkout.md': ['---', 'kind: capability', 'slug: checkout', 'title: Checkout', '---', '', '# Checkout', ''].join('\n'),
};

async function goTo(page: Page, destination: 'Planning' | 'Library') {
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: destination, exact: true }).click();
}

async function openVault(page: Page, files: Record<string, string> = VAULT) {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, files);
  await page.goto('/en/library/');
  await page.getByTestId('library-open-vault').click();
  await expect(page.getByTestId('library-page')).toBeVisible();
}

/** Reads, writes or removes one entry of the folder the stubbed picker handed out, in the browser's private storage. */
async function onDisk(page: Page, path: string, change: { write?: number[] | string; remove?: true } = {}): Promise<string | null> {
  return page.evaluate(async ({ relative, write, remove }) => {
    const storage = await navigator.storage.getDirectory();
    for await (const [name, handle] of (storage as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (!name.startsWith('stub-vault-') || handle.kind !== 'directory') continue;
      let folder = handle as FileSystemDirectoryHandle;
      const parts = relative.split('/');
      const leaf = parts[parts.length - 1];
      try {
        for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: write !== undefined });
        if (remove) { await folder.removeEntry(leaf, { recursive: true }); return null; }
        const file = await folder.getFileHandle(leaf, { create: write !== undefined });
        if (write !== undefined) {
          const writable = await file.createWritable();
          await writable.write(typeof write === 'string' ? write : new Uint8Array(write));
          await writable.close();
        }
        return await (await file.getFile()).text();
      } catch { return null; }
    }
    return null;
  }, { relative: path, write: change.write, remove: change.remove });
}

async function createDocument(page: Page, title: string) {
  await page.locator('[data-planning-empty-new], [data-planning-new]').first().click();
  const field = page.getByRole('textbox', { name: planning.documentTitle });
  await expect(field).toBeFocused();
  await field.fill(title);
  await field.press('Enter');
  await expect(page.locator('[data-planning-editor] textarea')).toBeFocused();
}

test('a planning folder made inside the open folder takes a new document and keeps it across visits', async ({ page }) => {
  await openVault(page);
  await goTo(page, 'Planning');
  const stage = page.locator('[data-planning-state="no-home"]');
  await expect(stage).toBeVisible();
  await expect(stage.getByRole('button').first()).toHaveAccessibleName(planning.createHome);
  await expect(stage.getByRole('button', { name: planning.chooseAnother }), 'the web cannot pick a folder outside the open one').toHaveCount(0);
  await stage.getByRole('button', { name: planning.createHome }).click();

  await expect(page.getByText(planning.emptyHome)).toBeVisible();
  await expect(page.getByText(planning.empty)).toHaveCount(0);
  await createDocument(page, 'Checkout redesign');
  const editor = page.locator('[data-planning-editor] textarea');
  await expect(editor).toHaveValue('# Checkout redesign\n\n');
  await page.keyboard.type('Customers pay in one step.');
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { toastTexts: string[] }).toastTexts = seen;
    new MutationObserver(() => document.querySelectorAll('[data-sonner-toast]').forEach((node) => seen.push(node.textContent ?? ''))).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.getByRole('button', { name: planning.save, exact: true }).click();

  const reader = page.locator('[data-planning-reader]');
  await expect(reader.getByRole('heading', { name: 'Checkout redesign' })).toBeVisible();
  await expect(reader.getByText('Customers pay in one step.')).toBeVisible();
  await expect(page.locator('[data-planning-editor]')).toHaveCount(0);
  expect(await onDisk(page, 'planning/Checkout-redesign.md')).toBe('# Checkout redesign\n\nCustomers pay in one step.');

  // An outside write after the save: once its notice shows, the reread has seen both files.
  await onDisk(page, 'capabilities/refund.md', { write: '---\nkind: capability\nslug: refund\ntitle: Refund\n---\n\n# Refund\n' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Refund' })).toBeVisible();
  const toastTexts = await page.evaluate(() => (window as unknown as { toastTexts: string[] }).toastTexts);
  expect(toastTexts.filter((text) => text.includes('Checkout redesign')), 'the person\'s own write is not reported as an outside change').toEqual([]);

  await goTo(page, 'Library');
  await expect(page.getByTestId('library-page')).toBeVisible();
  await goTo(page, 'Planning');
  await expect(page.getByRole('button', { name: 'Checkout-redesign.md' })).toHaveAttribute('aria-current', 'true');
  await expect(reader.getByText('Customers pay in one step.')).toBeVisible();
  await expect(page.locator('[data-testid="planning-stage"]')).toHaveCount(0);
});

test('unsaved editor text survives a visit to another screen and saves afterwards', async ({ page }) => {
  await openVault(page, { ...VAULT, 'planning/brief.md': '# Brief\n\n' });
  await goTo(page, 'Planning');
  await page.getByRole('button', { name: planning.edit, exact: true }).click();
  const editor = page.locator('[data-planning-editor] textarea');
  await expect(editor).toBeFocused();
  await page.keyboard.type('Kept while away.');

  await goTo(page, 'Library');
  await expect(page.getByTestId('library-page')).toBeVisible();
  await goTo(page, 'Planning');
  await expect(editor).toHaveValue('# Brief\n\nKept while away.');
  await page.getByRole('button', { name: planning.save, exact: true }).click();
  await expect(page.locator('[data-planning-reader]').getByText('Kept while away.')).toBeVisible();
  expect(await onDisk(page, 'planning/brief.md')).toBe('# Brief\n\nKept while away.');
});

test('a save over a file changed elsewhere is refused and keeps the text', async ({ page }) => {
  await openVault(page, { ...VAULT, 'planning/brief.md': '# Brief\n\n' });
  await goTo(page, 'Planning');
  await page.getByRole('button', { name: planning.edit, exact: true }).click();
  await page.keyboard.type('Mine.');
  await onDisk(page, 'planning/brief.md', { write: '# Brief\n\nTheirs.' });
  await page.getByRole('button', { name: planning.save, exact: true }).click();
  await expect(page.getByText(planning.saveRefused)).toBeVisible();
  await expect(page.locator('[data-planning-editor] textarea')).toHaveValue('# Brief\n\nMine.');
  expect(await onDisk(page, 'planning/brief.md')).toBe('# Brief\n\nTheirs.');
});

test('a document that is not UTF-8 offers no Edit and says why', async ({ page }) => {
  await openVault(page, { ...VAULT, 'planning/a.md': '# A\n' });
  await onDisk(page, 'planning/legacy.md', { write: [0x23, 0x20, 0xb0, 0xe1, 0x0a] });
  await goTo(page, 'Planning');
  await page.getByRole('button', { name: 'legacy.md' }).click();
  await expect(page.getByText(planning.notEditable)).toBeVisible();
  await expect(page.getByRole('button', { name: planning.edit, exact: true })).toHaveCount(0);
});

test('a planning folder removed from disk reads as unavailable, not as empty', async ({ page }) => {
  await openVault(page);
  await goTo(page, 'Planning');
  await page.getByRole('button', { name: planning.createHome }).click();
  await expect(page.getByText(planning.emptyHome)).toBeVisible();
  await onDisk(page, 'planning', { remove: true });
  await page.getByRole('button', { name: planning.refresh }).click();
  await expect(page.locator('[data-planning-read]').getByText(planning.folderUnavailable)).toBeVisible();
  await expect(page.getByText(planning.emptyHome)).toHaveCount(0);
});

test('a new document title is dropped with Escape and focus returns to New document', async ({ page }) => {
  await openVault(page, { ...VAULT, 'planning/brief.md': '# Brief\n\nKept.\n' });
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

test('a picked folder offers neither New document nor Edit', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    const win = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
    const original = win.__TAURI_INTERNALS__.invoke;
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan') return { files: [{ path: 'plan.md' }], skipped: 0, partial: false, visited: 1, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      if (cmd === 'planning_open_document') return Array.from(new TextEncoder().encode('a'.repeat(32) + '# Plan\n'));
      return original(cmd, args);
    };
  });
  await page.goto('/en/planning/');
  await page.getByRole('button', { name: planning.chooseFolder }).click();
  await expect(page.locator('[data-planning-reader]').getByRole('heading', { name: 'Plan' })).toBeVisible();
  await expect(page.getByText(planning.readOnly)).toBeVisible();
  await expect(page.getByRole('button', { name: planning.newDocument })).toHaveCount(0);
  await expect(page.getByRole('button', { name: planning.edit, exact: true })).toHaveCount(0);
});
