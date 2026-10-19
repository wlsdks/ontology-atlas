import { expect, test } from '@playwright/test';

const dimmed = '[data-dimmed] [data-testid="analysis-claim"]';

test('capability search marks matches on the board without hiding the project or changing the fact', async ({ page }) => {
  await page.goto('/ko/ontology/insights/?guides=off');
  const search = page.getByTestId('analysis-claim-search');
  const heading = page.getByTestId('analysis-finding-heading');
  const documentLink = page.getByTestId('analysis-evidence').getByRole('link').first();
  const cards = page.getByTestId('analysis-claim');
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  const before = { heading: await heading.textContent(), href: await documentLink.getAttribute('href') };
  await search.fill('주문');
  await expect(page.locator(dimmed)).not.toHaveCount(0);
  await expect(cards).toHaveCount(total);
  const lit = await page.locator('li:not([data-dimmed]) > [data-testid="analysis-claim"]').allTextContents();
  expect(lit.length).toBeGreaterThan(0);
  for (const name of lit) expect(name).toContain('주문');
  await expect(heading).toHaveText(before.heading!);
  await expect(documentLink).toHaveAttribute('href', before.href!);
  await search.fill('no-such-capability');
  await expect(page.locator(dimmed)).toHaveCount(total);
  await expect(search).not.toHaveAttribute('aria-invalid', 'true');
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.locator(dimmed)).toHaveCount(0);
});

test('a searched capability stays selected after its search is cleared', async ({ page }) => {
  await page.goto('/ko/ontology/insights/?tab=do-next&guides=off');
  const filter = page.getByRole('radiogroup', { name: '역량 표시 범위' });
  await filter.getByRole('radio', { name: /^전체 \d+$/ }).click();
  const search = page.getByTestId('analysis-claim-search');
  await search.fill('환불 처리');
  const match = page.locator('li:not([data-dimmed]) > [data-testid="analysis-claim"]');
  await expect(match).toHaveCount(1);
  await match.click();
  const selectedId = await match.getAttribute('data-analysis-claim-id');
  const documentLink = page.getByTestId('analysis-evidence').getByRole('link').first();
  const href = await documentLink.getAttribute('href');
  await page.getByTestId('analysis-claim-search-clear').click();
  await expect(search).toBeFocused();
  const selected = page.locator('[data-testid="analysis-claim"][aria-pressed="true"]');
  await expect(selected).toHaveAttribute('data-analysis-claim-id', selectedId!);
  await expect(documentLink).toHaveAttribute('href', href!);
  await search.fill('no-such-capability');
  await expect(selected).toHaveAttribute('data-analysis-claim-id', selectedId!);
  await expect(documentLink).toHaveAttribute('href', href!);
  await search.press('Escape');
  await expect(search).toBeFocused();
  await expect(selected).toHaveAttribute('data-analysis-claim-id', selectedId!);
});

test('the capability filter supports an immediate arrow and tab sequence with normal motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/en/ontology/insights/?tab=do-next&guides=off');
  const filter = page.getByRole('radiogroup', { name: 'Capability scope' });
  const all = filter.getByRole('radio').first();
  const gaps = filter.getByRole('radio').last();
  await all.click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Tab');
  await expect(gaps).toHaveAttribute('aria-checked', 'true');
  await expect(all).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('analysis-claim').first()).toBeFocused();
});
