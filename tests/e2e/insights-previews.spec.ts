import { expect, test } from '@playwright/test';

for (const subject of [
  { tab: 'library', panel: 'library-tab', destination: '/en/library/' },
  { tab: 'harness', panel: 'harness-tab', destination: '/en/architecture/?view=guides' },
]) {
  test(`${subject.tab} examples reveal setup by keyboard and keep the next step reversible`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/ontology/insights/?tab=${subject.tab}&guides=off`);
    const panel = page.getByTestId(subject.panel);
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/Example.*not data from your folder/)).toBeVisible();
    const stages = panel.locator('button[aria-expanded][aria-controls]');
    await expect(stages).toHaveCount(3);
    const selected = stages.nth(1);
    await selected.focus();
    await selected.press('Enter');
    await expect(selected).toHaveAttribute('aria-expanded', 'true');
    const controlledId = await selected.getAttribute('aria-controls');
    const explanation = page.locator(`[id="${controlledId}"]`);
    const next = explanation.getByRole('link');
    await expect(next).toHaveAttribute('href', subject.destination);
    await expect(next).toBeVisible();

    await selected.press('Enter');
    await expect(selected).toHaveAttribute('aria-expanded', 'false');
    await expect(explanation).toHaveAttribute('inert', '');
    await expect(selected).toBeFocused();
    await expect(explanation).toHaveJSProperty('clientHeight', 0);

    await selected.press('Space');
    await expect(selected).toHaveAttribute('aria-expanded', 'true');
    await expect(next).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(next).toBeFocused();
    const nav = page.locator('[data-tabbar="primary"]');
    await expect(nav).toBeVisible();
    await expect.poll(async () => {
      const [linkBox, navBox] = await Promise.all([next.boundingBox(), nav.boundingBox()]);
      if (!linkBox || !navBox) return false;
      return linkBox.y + linkBox.height <= navBox.y;
    }).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(subject.destination);
    await expect(page.getByRole('main')).toBeVisible();
  });
}
