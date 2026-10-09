import { expect, test } from '@playwright/test';

/** A pair count must name exactly the declarations a reader can inspect. */
test('every displayed responsibility count agrees with its named witnesses', async ({ page }) => {
  await page.goto('/ko/ontology/insights/');
  const pairs = page.getByTestId('analysis-pair');
  await expect(pairs.first()).toBeVisible();
  expect(await pairs.count()).toBeGreaterThan(1);
  for (let index = 0; index < await pairs.count(); index++) {
    const pair = pairs.nth(index);
    const count = Number((await pair.innerText()).trim().match(/(\d+)$/)![1]);
    await pair.click();
    await expect(pair).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('analysis-witness')).toHaveCount(count);
    await expect(page.getByTestId('analysis-evidence').getByRole('link').first()).toHaveAttribute('href', /slug=/);
  }
});


test('a local folder replaces sample counts and an empty dependency record stays qualified', async ({ page }) => {
  const { seedFirstRunSeen } = await import('./first-run-seed');
  const { stubDirectoryPicker } = await import('./vault-picker-stub');
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, {
    'shop.md': '---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Local Shop\ncontains: [capabilities/pay]\n---\nA local product.\n',
    'capabilities/pay.md': '---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\nCollects payment for the order.\n',
  });
  await page.goto('/ko/topology/?guides=off');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('topology-index-panel')).toContainText('Local Shop');
  await page.goto('/en/ontology/insights/?guides=off');
  const workspace = page.getByTestId('analysis-workspace');
  await expect(workspace).toHaveAttribute('data-analysis-capability-count', '1');
  await expect(workspace).toHaveAttribute('data-analysis-cross-count', '0');
  await expect(workspace).toContainText('does not establish independence');
  await expect(page.getByTestId('analysis-claim')).toHaveCount(1);
  await expect(page.getByTestId('analysis-evidence')).toContainText('No source path');
});
