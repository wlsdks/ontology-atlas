import { expect, test } from '@playwright/test';

import { openLibraryWorkScenario } from './library-work-harness';

const fullyInsideClips = (element: HTMLElement) => {
  const target = element.getBoundingClientRect();
  let top = Math.max(0, target.top);
  let right = Math.min(innerWidth, target.right);
  let bottom = Math.min(innerHeight, target.bottom);
  let left = Math.max(0, target.left);
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (!/(auto|scroll|hidden|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) continue;
    const clip = ancestor.getBoundingClientRect();
    top = Math.max(top, clip.top);
    right = Math.min(right, clip.right);
    bottom = Math.min(bottom, clip.bottom);
    left = Math.max(left, clip.left);
  }
  return bottom - top >= target.height - 0.5 && right - left >= target.width - 0.5;
};

for (const width of [320, 390]) {
  test.describe(`task review permission at ${width}px`, () => {
    test.use({ viewport: { width, height: 720 }, hasTouch: true, isMobile: true });

    test('shows a complete proposed meaning unit and defers without answering', async ({ page }) => {
      const harness = await openLibraryWorkScenario(page, { permissionKind: 'ontology-patch' });
      await harness.read(page);
      await harness.wait(page);

      await expect(page.getByTestId('task-review-heading')).toBeFocused();
      const firstUnit = page.getByTestId('task-review-meaning-unit-0');
      await expect(firstUnit).toContainText('Review the selected proposal.');
      await expect.poll(() => firstUnit.evaluate(fullyInsideClips)).toBe(true);

      const depth = page.getByTestId('task-review-depth');
      await expect.poll(() => depth.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !!hit && (hit === element || element.contains(hit));
      })).toBe(true);

      await page.getByTestId('task-review-defer').click();
      await expect(page.getByTestId('acp-permission-deferred')).toBeVisible();
      expect((await harness.snapshot(page)).calls.filter((call) => call.method === 'response')).toHaveLength(0);
      await page.getByRole('button', { name: 'Resume review' }).click();
      await expect(page.getByTestId('acp-permission-allow')).toBeVisible();
      expect((await harness.snapshot(page)).calls.filter((call) => call.method === 'response')).toHaveLength(0);
    });
  });
}
