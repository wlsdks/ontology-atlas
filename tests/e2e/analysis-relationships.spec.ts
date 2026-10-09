import { expect, test } from '@playwright/test';

test('a relationship leads to its implementation claim and exact declaring document', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/ko/ontology/insights/?guides=off');
  await expect(page.getByTestId('analysis-evidence')).toBeVisible();
  const first = await page.getByTestId('analysis-evidence').getByRole('link').first().getAttribute('href');
  await page.getByTestId('analysis-open-implementation').click();
  const selected = page.locator('[data-analysis-claim-id="capability:order-cancel"]');
  await expect(selected).toBeVisible();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(selected).toBeFocused();
  await expect(selected).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('analysis-claim').first()).toBeVisible();
  const next = await page.getByTestId('analysis-evidence').getByRole('link').first().getAttribute('href');
  expect(new URL(next!, 'http://localhost').searchParams.get('slug')).toBe(new URL(first!, 'http://localhost').searchParams.get('slug'));
  expect(next).toContain('review=analysis%3A');
  await page.getByTestId('analysis-evidence').getByRole('link').first().click();
  await expect(page).toHaveURL(/library|docs/);
  await page.getByTestId('doc-frontmatter-summary').click();
  const declaration = page.getByTestId('doc-frontmatter-field-dependencies');
  await expect(declaration).toBeVisible();
  await expect(declaration).toContainText('capabilities/payment-cancel');
  await expect(declaration).toContainText('capabilities/stock-tracking');
  await page.locator('a[href*="/ontology/insights/"][href*="review=analysis"]').filter({ visible: true }).first().click();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(selected).toBeFocused();
  await expect(selected).toBeInViewport({ ratio: 1 });
  expect(errors).toEqual([]);
});

test('evidence selection works with the keyboard and source absence is not a clean result', async ({ page }) => {
  await page.goto('/en/ontology/insights/?tab=do-next');
  const choices = page.getByTestId('analysis-claim');
  await expect(choices.nth(1)).toBeVisible();
  await choices.nth(1).focus(); await page.keyboard.press('Enter');
  await expect(choices.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('analysis-evidence')).toContainText('not checked');
  await expect(page.getByTestId('analysis-evidence').getByRole('link').first()).toHaveAttribute('href', /slug=/);
});
