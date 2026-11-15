import { expect, test, type Page } from '@playwright/test';
import planning from '../../../messages/ko/planning.json';
import { installDesktopRailRuntime } from '../desktop-rail-arrival-harness';

async function openFolder(page: Page) {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    const win = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
    const original = win.__TAURI_INTERNALS__.invoke;
    const paths = ['plans/checkout.md', ...Array.from({ length: 40 }, (_, n) => `research/note-${n}.md`), 'images/flow.png'];
    const body = '# Checkout\n\n' + Array.from({ length: 80 }, (_, n) => `Paragraph ${n} of the checkout plan.`).join('\n\n');
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan') return { files: paths.map((path) => ({ path, size: 1, modified_seconds: 1 })), skipped: 0, partial: false, visited: paths.length, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      if (cmd === 'planning_open_document') return Array.from(new TextEncoder().encode('a'.repeat(32) + (args?.path === 'plans/checkout.md' ? body : `# ${String(args?.path)}`)));
      return original(cmd, args);
    };
  });
  await page.goto('/ko/planning/');
  await page.getByRole('button', { name: planning.chooseFolder }).click();
}

test('arriving in a folder opens its first document without a click', async ({ page }) => {
  await openFolder(page);
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'plans/checkout.md' })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText(planning.selectFile)).toHaveCount(0);
});

test('what was read opens in a dialog and nothing on the page unfolds in place', async ({ page }) => {
  await openFolder(page);
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await expect(page.locator('[data-planning-surface] [aria-expanded]')).toHaveCount(0);
  await page.getByRole('button', { name: planning.details }).click();
  const scope = page.getByRole('dialog', { name: planning.details });
  await expect(scope).toBeVisible();
  await expect(scope.getByText(planning.limits)).toBeVisible();
});

test('the list and the document fill the height and scroll separately', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await openFolder(page);
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  const list = page.locator('[data-planning-file-list]');
  const reader = page.locator('[data-planning-reader]');
  const slot = (await page.getByTestId('app-shell-body-slot').boundingBox())!;
  for (const pane of [page.locator('[data-planning-list]'), page.locator('[data-planning-document]')]) {
    const box = (await pane.boundingBox())!;
    expect(Math.abs(box.y + box.height - (slot.y + slot.height))).toBeLessThanOrEqual(1);
  }
  await list.evaluate((node) => { node.scrollTop = 120; });
  await reader.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await list.evaluate((node) => node.scrollTop)).toBe(120);
  expect(await page.getByTestId('app-shell-body-slot').evaluate((node) => node.scrollTop)).toBe(0);
});
