import { expect, test, type Page } from '@playwright/test';

import { DESKTOP_VAULT_ROOT, installDesktopRailRuntime } from './desktop-rail-arrival-harness';

/**
 * **Known folders that no longer exist are one quiet line at the end of the launch chooser.**
 *
 * Owner inspection, 2026-09-26: after a few QA runs the chooser opened on five dead rows — each a
 * full row with a warning and two buttons — above the folders that still exist, because the deleted
 * temporary folders were the most recently opened. This drives the installed app's own launch path
 * (the desktop runtime stub, `vault_path_exists` answering "No such file or directory" for the gone
 * paths exactly as Tauri rejects) and measures what the person meets:
 *
 * - the list never draws a gone folder as a row, not even for the frames before the probe answers;
 * - the live folders come first and the missing ones are one line, the list's last;
 * - opening the review does not move that line from under the pointer (the chooser is centred, so
 *   a review that grew the page in place re-centred it and slid a "forget" under the pointer);
 * - nothing leaves the known list until "forget" is pressed, and then exactly what was pressed.
 */

const GONE = ['/Users/probe/qa-run-0925-a', '/Users/probe/qa-run-0925-b', '/Users/probe/qa-run-0926-c'];
const NOTES = '/Users/probe/atlas-notes';

async function seedKnownFolders(page: Page) {
  await page.addInitScript(
    ({ gone, live, current }) => {
      // The installed app answers a vanished root with a rejection, not with `false`.
      const internals = (window as unknown as {
        __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
      }).__TAURI_INTERNALS__;
      const invoke = internals.invoke.bind(internals);
      internals.invoke = (command, args = {}) =>
        command === 'vault_path_exists' && gone.includes(String(args.rootPath))
          ? Promise.reject('No such file or directory (os error 2)')
          : invoke(command, args);

      // Every frame from first paint: how many folder rows the list drew outside the missing line.
      const peak = { rows: 0, frames: 0 };
      (window as unknown as { __chooserPeak: typeof peak }).__chooserPeak = peak;
      const start = performance.now();
      const sample = () => {
        const rows = [...document.querySelectorAll('[data-testid="recent-vault-row"]')].filter(
          (row) => !row.closest('[data-testid="recent-vault-missing-review"]'),
        );
        if (rows.length > 0) peak.frames += 1;
        peak.rows = Math.max(peak.rows, rows.length);
        if (performance.now() - start < 6000) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);

      const now = Date.now();
      const record = (path: string, hoursAgo: number) => {
        const name = path.split('/').pop();
        return {
          id: 'current',
          handle: { name },
          desktopRootPath: path,
          name,
          createdAt: now - 90 * 24 * 3600_000,
          lastAccessedAt: now - hoursAgo * 3600_000,
        };
      };
      const records = [
        ...gone.map((path, index) => record(path, index + 1)),
        record(current, 5),
        record(live, 30),
      ];
      const request = indexedDB.open('demo-kv', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        const existing = store.get('docs-vault:fs-handle:current');
        existing.onsuccess = () => {
          if (existing.result) return;
          store.put(records[gone.length], 'docs-vault:fs-handle:current');
          store.put(records, 'docs-vault:fs-handle:recent');
        };
        tx.oncomplete = () => db.close();
      };
    },
    { gone: GONE, live: NOTES, current: DESKTOP_VAULT_ROOT },
  );
}

async function knownPaths(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('demo-kv', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction('kv', 'readonly').objectStore('kv').get('docs-vault:fs-handle:recent');
          get.onsuccess = () => {
            db.close();
            resolve(((get.result ?? []) as { desktopRootPath: string }[]).map((entry) => entry.desktopRootPath));
          };
        };
      }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installDesktopRailRuntime(page);
  await seedKnownFolders(page);
});

test('the chooser lists live folders first and the gone ones as one line, drawn once', async ({ page }) => {
  await page.goto('/en/?guides=off');
  const list = page.getByTestId('recent-vault-list');
  await expect(list).toBeVisible({ timeout: 30_000 });

  const rows = list.getByTestId('recent-vault-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.getByTestId('recent-vault-name')).toHaveText(['atlas-vault', 'atlas-notes']);
  const group = page.getByTestId('recent-vault-missing-group');
  await expect(group).toHaveAttribute('data-count', '3');
  expect(await list.evaluate((el) => el.lastElementChild?.getAttribute('data-testid'))).toBe(
    'recent-vault-missing-group',
  );
  // One control for three gone folders, and no removal offered until the review is opened.
  await expect(group.locator('button')).toHaveCount(1);

  // No frame ever drew a gone folder as a row — not the frames before the probe answered either.
  // measurement window: the sampler keeps counting rows per frame; the claim is that none of those frames drew a gone folder.
  await page.waitForTimeout(500);
  const peak = await page.evaluate(() => (window as unknown as { __chooserPeak: { rows: number; frames: number } }).__chooserPeak);
  expect(peak.frames, 'the sampler saw the list').toBeGreaterThan(0);
  expect(peak.rows, 'a frame drew more rows than there are live folders').toBe(2);
});

test('the review opens without moving its line, and forgets only what is pressed', async ({ page }) => {
  await page.goto('/en/?guides=off');
  const toggle = page.getByTestId('recent-vault-missing-toggle');
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  expect(await knownPaths(page)).toHaveLength(5);

  const before = await toggle.boundingBox();
  await toggle.click();
  const review = page.getByTestId('recent-vault-missing-review');
  await expect(review).toBeVisible();
  await expect(review.getByTestId('recent-vault-row')).toHaveCount(3);
  const after = await toggle.boundingBox();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0)), 'the line moved under the pointer').toBeLessThanOrEqual(0.5);
  expect(await knownPaths(page), 'opening the review forgot something').toHaveLength(5);

  // One folder, by its own button.
  await review.getByRole('button', { name: /qa-run-0925-b/ }).click();
  await expect(review.getByTestId('recent-vault-row')).toHaveCount(2);
  const afterOne = await knownPaths(page);
  expect(afterOne).toHaveLength(4);
  expect(afterOne).not.toContain('/Users/probe/qa-run-0925-b');
  await expect(review).toBeFocused();

  // The rest, at once.
  await review.getByTestId('recent-vault-forget-missing').click();
  await expect(review).toHaveCount(0);
  await expect(page.getByTestId('recent-vault-missing-group')).toHaveCount(0);
  expect((await knownPaths(page)).sort()).toEqual([DESKTOP_VAULT_ROOT, NOTES].sort());
  await expect(page.getByTestId('recent-vault-row')).toHaveCount(2);
  // Focus returns to the list the person is choosing from, not to the top of the page.
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(
    'recent-vault-open',
  );
});

/**
 * No sweep reaches this surface (it needs gone folders in IndexedDB), so it brings its own touch
 * floor, with the `Math.round(...) < 44` filter `touch-target-contract.spec.ts` uses.
 */
test.describe('under a coarse pointer', () => {
  test.use({ hasTouch: true, isMobile: false });

  test('the line and every control of its review are at least 44 by 44', async ({ page }) => {
    await page.goto('/en/?guides=off');
    const toggle = page.getByTestId('recent-vault-missing-toggle');
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();
    const review = page.getByTestId('recent-vault-missing-review');
    await expect(review).toBeVisible();

    const measured = await page.evaluate(() =>
      [
        document.querySelector<HTMLElement>('[data-testid="recent-vault-missing-toggle"]'),
        ...document.querySelectorAll<HTMLElement>('[data-testid="recent-vault-missing-review"] button'),
      ].map((control) => {
        const r = control!.getBoundingClientRect();
        return { control: control!.getAttribute('data-testid') ?? control!.textContent, w: Math.round(r.width), h: Math.round(r.height) };
      }),
    );
    // Anti-idle: the line, three forgets, find, close and forget all.
    expect(measured.length).toBe(7);
    const undersized = measured.filter(({ w, h }) => w < 44 || h < 44);
    expect(undersized, JSON.stringify(undersized)).toEqual([]);
  });
});
