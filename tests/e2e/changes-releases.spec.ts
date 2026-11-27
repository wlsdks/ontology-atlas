import { expect, test, type Page } from '@playwright/test';
import { mountDesktopVault } from './desktop-rail-arrival-harness';
import { waitForAnimationsDone } from './settle';
import { installReleasesRuntime, LARGE_HISTORY, releaseCalls, releaseWalks, SMALL_HISTORY, type ReleaseHistory } from './projects/change-releases-fixture';

/** criterion 5: a list that does not change for this long reads and mutates nothing. */
const REST_WINDOW_MS = 60_000;
const PAGE_ROWS = 40;

async function openByRelease(page: Page, history: ReleaseHistory, options: { holdWalks?: boolean } = {}) {
  await installReleasesRuntime(page, history, options);
  await mountDesktopVault(page);
  await page.goto('/en/changes/?guides=off');
  await page.getByTestId('change-grouping').getByRole('radio', { name: 'By release' }).click();
}

const row = (page: Page, name: string) => page.locator(`[data-release-row="${name}"]`);

test('names the recorded concept whose file changed between two tags and opens the map on it', async ({ page }) => {
  await openByRelease(page, SMALL_HISTORY);
  await row(page, 'v1.1.0').click();
  await expect(row(page, 'v1.1.0')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('release-heading')).toHaveText('v1.1.0');
  const concept = page.getByTestId('release-concepts').getByRole('link', { name: '결제 승인: 3 changes', exact: true });
  await expect(concept).toBeVisible();
  await concept.click();
  await expect(page).toHaveURL(/\/topology\/\?p=/);
});

test('a release that touches no recorded concept says so instead of guessing', async ({ page }) => {
  await openByRelease(page, SMALL_HISTORY);
  await row(page, 'v1.1.1').click();
  await expect(page.getByTestId('release-heading')).toHaveText('v1.1.1');
  await expect(page.getByTestId('release-concepts')).toContainText('No recorded concept names a file that changed in this release.');
  await expect(page.getByTestId('release-concepts').getByRole('link')).toHaveCount(0);
});

test('a repository picked alone draws no concept strip and reads only its own tags', async ({ page }) => {
  await openByRelease(page, SMALL_HISTORY);
  await page.getByRole('button', { name: 'Change repository' }).click();
  await page.getByTestId('change-grouping').getByRole('radio', { name: 'By release' }).click();
  await row(page, 'v1.1.0').click();
  await expect(page.getByTestId('release-heading')).toHaveText('v1.1.0');
  await expect(page.getByTestId('change-digest')).toBeVisible();
  await expect(page.getByTestId('release-concepts')).toHaveCount(0);
  const commands = new Set((await releaseCalls(page)).map(call => call.command));
  expect(commands.has('git_source_releases')).toBe(true);
});

test('5,000 tags: names arrive before any count, a release is chosen while counting, 40 rows at a time, and rest is still', async ({ page }) => {
  test.setTimeout(REST_WINDOW_MS * 3);
  await openByRelease(page, LARGE_HISTORY, { holdWalks: true });
  const options = page.getByTestId('release-list').getByRole('option');
  await expect(options.first()).toBeVisible();
  await expect(options).toHaveCount(PAGE_ROWS + 1);
  await expect(options.nth(1)).toHaveAccessibleName(/not counted yet$/);
  await row(page, 'v49.97.0').click();
  await expect(row(page, 'v49.97.0')).toHaveAttribute('aria-selected', 'true');
  await releaseWalks(page);
  await expect(row(page, 'v49.97.0')).toHaveAccessibleName(/: 6 changes$/);
  await expect(page.getByTestId('release-heading')).toHaveText('v49.97.0');
  await expect(page.getByText('Counting the changes in older releases…')).toHaveCount(0);
  await page.getByRole('button', { name: `Show ${PAGE_ROWS} more` }).click();
  await expect(options).toHaveCount(PAGE_ROWS * 2 + 1);

  await waitForAnimationsDone(page.locator('#main'));
  const before = (await releaseCalls(page)).length;
  await page.evaluate(() => {
    const target = window as unknown as { __restMutations: number };
    target.__restMutations = 0;
    // The app's safety poll re-renders the page each minute, and React and the primitives re-set equal
    // attribute values (an input's empty `name` included); only a changed value counts.
    const changed = (record: MutationRecord) => record.type !== 'attributes' || (record.oldValue ?? '') !== ((record.target as Element).getAttribute(record.attributeName!) ?? '');
    new MutationObserver(records => { target.__restMutations += records.filter(changed).length; })
      .observe(document.getElementById('main')!, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  });
  // measurement window: the claim is that nothing reads or redraws for a minute at rest.
  await page.waitForTimeout(REST_WINDOW_MS);
  expect((await releaseCalls(page)).length).toBe(before);
  expect(await page.evaluate(() => (window as unknown as { __restMutations: number }).__restMutations)).toBe(0);
});
