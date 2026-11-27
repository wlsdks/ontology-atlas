import { expect, test, type Page } from '@playwright/test';

import { installDesktopRailRuntime, listDesktopFiles, mountDesktopVault } from '../desktop-rail-arrival-harness';

const concept = (path: string, kind: string, slug: string, title: string, extra: string[] = []) => [
  path,
  ['---', `kind: ${kind}`, `slug: ${slug}`, `title: ${title}`, ...extra, '---', '', `# ${title}`, '', `${title}.`, ''].join('\n'),
];

const SEED: Record<string, string> = Object.fromEntries([
  concept('project.md', 'project', 'reset-shop', 'Reset Shop', ['contains:', '  - reset-orders']),
  concept('domains/orders.md', 'domain', 'reset-orders', 'Reset Orders', ['contains:', '  - reset-checkout']),
  concept('capabilities/checkout.md', 'capability', 'reset-checkout', 'Reset Checkout', ['domain: reset-orders']),
  ['README.md', '---\nkind: vault-readme\ntitle: Read me\n---\n\n# Read me\n'],
  ['wiki/notes.md', '---\ntitle: Notes\n---\n\n# Notes\n'],
]);

/** Paths in the served folder, so the spec reads the disk rather than the screen. */
async function folderFiles(page: Page): Promise<string[]> {
  return (await listDesktopFiles(page)) ?? [];
}

test('Clear all concepts moves the concept documents aside, and Undo puts them back on the map', async ({ page }) => {
  await installDesktopRailRuntime(page, SEED, undefined, { replaceFixture: true, writable: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mountDesktopVault(page);
  const index = page.getByTestId('topology-index-panel');
  await expect(index).toContainText('3 concepts', { timeout: 30_000 });

  await page.locator('[data-testid="app-settings-trigger"]:visible').click();
  await page.getByTestId('app-settings-nav-workspace').click();
  const row = page.getByTestId('app-settings-reset');
  await row.getByTestId('app-settings-reset-open').click();
  const dialog = page.getByTestId('app-settings-reset-dialog');
  await expect(dialog).toContainText('3');
  await expect(dialog.getByTestId('app-settings-reset-cancel')).toBeFocused();
  // The dialog sits over the settings sheet, which traps Tab too; only the dialog may answer.
  await page.keyboard.press('Tab');
  await expect(dialog.getByTestId('app-settings-reset-confirm')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('app-settings-popover')).toBeVisible();
  await row.getByTestId('app-settings-reset-open').click();
  await dialog.getByTestId('app-settings-reset-confirm').click();

  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);
  await expect(page.getByText('Reset Orders')).toHaveCount(0);
  const files = await folderFiles(page);
  expect(files.filter((path) => !path.startsWith('.ontology-atlas/'))).toEqual(['README.md', 'wiki/notes.md']);
  expect(files.filter((path) => /^\.ontology-atlas\/removed\/\d{8}-\d{6}\//.test(path))).toHaveLength(3);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(async () => (await folderFiles(page)).filter((path) => !path.startsWith('.ontology-atlas/')))
    .toEqual(['README.md', 'capabilities/checkout.md', 'domains/orders.md', 'project.md', 'wiki/notes.md']);
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Map', exact: true }).click();
  await expect(index).toContainText('3 concepts');
});
