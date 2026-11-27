import { expect, test, type Page } from '@playwright/test';
import { mountDesktopVault } from './desktop-rail-arrival-harness';
import { expectSmoothMotion, startSmoothness, stopSmoothness } from './motion-sampler';
import { installReleasesRuntime, SMALL_HISTORY } from './projects/change-releases-fixture';
import { waitForAnimationsDone } from './settle';

/*
 * Releases in Changes say which span is read by shape and motion: the span mark slides and stretches
 * along the branch line, measured per frame in full Chromium's headless mode, which composites on the
 * GPU as a window does without opening one.
 */
test.use({ channel: 'chromium', headless: true });

const SPAN = '[data-release-span]';

async function openByRelease(page: Page) {
  await installReleasesRuntime(page, SMALL_HISTORY);
  await mountDesktopVault(page);
  await page.goto('/en/changes/?guides=off');
  await page.getByTestId('change-grouping').getByRole('radio', { name: 'By release' }).click();
  await expect(page.locator('[data-release-row="v1.0.0"]')).toHaveAccessibleName(/changes?$/);
  await expect(page.getByTestId('release-heading')).toBeVisible();
}

const spanTransform = (page: Page) => page.locator(SPAN).evaluate(element => getComputedStyle(element).transform);

/*
 * Choosing v1.1.1 then v1.1.0 slides the mark and stretches it, since v1.1.0 starts past its own
 * beta; a Since choice moves the same transition but opens a Select whose own indicator animates.
 */
test('the span mark slides to another release and stretches to its start with no long frame', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 1000 });
  await openByRelease(page);
  await waitForAnimationsDone(page.locator('#main'));
  await startSmoothness(page);
  await page.locator('[data-release-row="v1.1.1"]').click();
  await page.locator('[data-release-row="v1.1.0"]').click();
  await page.locator('[data-release-row="v2.0.0-rc.1"]').click();
  await waitForAnimationsDone(page.locator(SPAN));
  expectSmoothMotion(await stopSmoothness(page));
});

test('under reduced motion the span mark is placed at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1512, height: 1000 });
  await openByRelease(page);
  const before = await spanTransform(page);
  await page.locator('[data-release-row="v1.1.0"]').click();
  const next = await page.locator(SPAN).evaluate(element => new Promise<string>(resolve => requestAnimationFrame(() => resolve(getComputedStyle(element).transform))));
  expect(next).not.toBe(before);
  expect(await page.locator(SPAN).evaluate(element => element.getAnimations().length)).toBe(0);
});

test('in greyscale a release, a pre-release, Unreleased and a tag off the branch still differ', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 1000 });
  await openByRelease(page);
  await page.locator('[data-release-row="v1.2.0"]').click();
  await waitForAnimationsDone(page.getByTestId('release-list'));
  await page.evaluate(() => { document.documentElement.style.filter = 'grayscale(1)'; });
  const gutter = async (name: string) => {
    const box = (await page.locator(`[data-release-row="${name}"]`).boundingBox())!;
    return (await page.screenshot({ clip: { x: box.x, y: box.y, width: 28, height: box.height } })).toString('base64');
  };
  const shapes = await Promise.all(['v1.1.1', 'v1.1.0-beta.1', 'unreleased', 'v1.0.1-hotfix'].map(gutter));
  expect(new Set(shapes).size).toBe(shapes.length);
});
