import { expect, test, type Page } from '@playwright/test';
import { FIRST_RUN_SEEN_ENTRIES } from '../../first-run-seed';
import { installLibraryWorkHarness, LIBRARY_VECTOR_SCRIPT, type LibraryWorkHarness } from '../../library-work-harness';

const VAULT_ROOT = '/Users/probe/Ontology Atlas/launch';
const GUIDE_SEEN_KEY = 'atlas.meaning.guide-seen';
const FILES = {
  'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n',
  'wiki/architecture.md': '---\ntitle: Architecture\nstatus: draft\n---\n\n## Summary\n\nHow the launch is built.\n',
};

/** A returning person in every other way: only the search-by-meaning guide is still unseen. */
async function openFirstDesk(page: Page): Promise<LibraryWorkHarness> {
  await page.addInitScript((entries) => {
    for (const [key, value] of entries) window.localStorage.setItem(key, value);
  }, FIRST_RUN_SEEN_ENTRIES.filter(([key]) => key !== GUIDE_SEEN_KEY));
  const harness = await installLibraryWorkHarness(page, { files: FILES, vectors: {} });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open (?:a|my) folder/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  await page.goto('/en/library/?tab=wiki');
  await expect(page.getByTestId('meaning-desk-line')).toHaveAttribute('data-state', 'words');
  return harness;
}

const prepares = async (harness: LibraryWorkHarness, page: Page) =>
  (await harness.snapshot(page)).calls.filter((call) => call.method === 'vault_vectors_prepare').map((call) => call.params);
const scene = (page: Page) => page.getByTestId('meaning-guide-preview');

test('a first visit plays the sample in place of the setup line, and Not now keeps it away', async ({ page }) => {
  const harness = await openFirstDesk(page);
  await expect(page.getByTestId('meaning-guide-card')).toBeVisible();
  await expect(page.getByTestId('meaning-desk-setup')).toHaveCount(0);
  // The sample plays by itself, from the model download to the files being read.
  await expect(scene(page)).toHaveAttribute('data-guide-scene', 'download');
  await expect(scene(page)).toHaveAttribute('data-guide-scene', 'read');
  await expect(page.getByTestId('meaning-guide-preview').locator('[inert]')).toHaveCount(1);

  await page.getByTestId('meaning-guide-later').click();
  await expect(page.getByTestId('meaning-guide-card')).toHaveCount(0);
  await expect(page.getByTestId('meaning-desk-setup')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('meaning-desk-line')).toHaveAttribute('data-state', 'words');
  await expect(page.getByTestId('meaning-guide-card')).toHaveCount(0);
  expect(await prepares(harness, page)).toEqual([]);
});

test('setting up together shows what happens, then the model, and only its primary press fetches', async ({ page }) => {
  const harness = await openFirstDesk(page);
  await page.getByTestId('meaning-guide-start').click();
  const steps = page.getByTestId('meaning-wizard-steps');
  await expect(steps).toHaveAttribute('data-wizard-step', 'intro');
  await expect(page.getByTestId('meaning-wizard-row-download')).toContainText('2.3 GB');
  await expect(page.getByTestId('meaning-wizard-row-read')).toContainText('2,000 Markdown files');
  await expect(page.getByTestId('meaning-model-choices')).toHaveCount(0);

  await page.getByTestId('meaning-wizard-next').click();
  await expect(steps).toHaveAttribute('data-wizard-step', 'choose');
  await expect(page.getByTestId('meaning-model-choices')).toBeVisible();
  await page.getByTestId('meaning-wizard-back').click();
  await expect(steps).toHaveAttribute('data-wizard-step', 'intro');
  expect(await prepares(harness, page)).toEqual([]);

  await page.getByTestId('meaning-wizard-next').click();
  await page.getByTestId('meaning-setup-primary').click();
  await expect(page.getByTestId('meaning-setup-dialog')).toHaveCount(0);
  expect(await prepares(harness, page)).toEqual([{ rootPath: VAULT_ROOT, enabled: true, source: { kind: 'builtin' }, download: true }]);

  // The real stage takes the sample's place, and the guide stays met.
  await harness.emitVectorStatus(page, LIBRARY_VECTOR_SCRIPT.downloading);
  await expect(page.getByTestId('meaning-run-stage')).toBeVisible();
  await expect(page.getByTestId('meaning-guide-card')).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), GUIDE_SEEN_KEY)).toBe('on');
});

test('closing the walk before preparing keeps the guide for later', async ({ page }) => {
  await openFirstDesk(page);
  await page.getByTestId('meaning-guide-start').click();
  await expect(page.getByTestId('meaning-wizard-intro')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('meaning-setup-dialog')).toHaveCount(0);
  await expect(page.getByTestId('meaning-guide-start')).toBeFocused();
  await expect(page.getByTestId('meaning-guide-card')).toBeVisible();
});

test('under reduced motion the sample holds still on the answered question', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFirstDesk(page);
  await expect(scene(page)).toHaveAttribute('data-guide-scene', 'ask');
  await expect(scene(page)).toContainText('When a payment fails');
  await expect(scene(page)).toContainText('Similar meaning');
});
