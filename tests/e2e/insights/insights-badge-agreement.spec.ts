import { expect, test } from '@playwright/test';

/** The declaration count must name exactly the lines a reader can inspect. */
test('the declaration count agrees with the drawn lines and each line opens its declaration', async ({ page }) => {
  await page.goto('/ko/ontology/insights/');
  const total = Number(await page.getByTestId('analysis-workspace').getAttribute('data-analysis-cross-count'));
  expect(total).toBeGreaterThan(1);
  await expect(page.getByTestId('analysis-declaration-step')).toContainText(`/ ${total}`);
  const lines = page.getByTestId('analysis-witness');
  await expect(lines).toHaveCount(total);
  for (const index of [0, Math.floor(total / 2), total - 1]) {
    const line = lines.nth(index);
    const edge = await line.getAttribute('data-edge');
    await line.dispatchEvent('click');
    await expect(page.locator('[data-connection="selected"] [data-edge]')).toHaveAttribute('data-edge', edge!);
    await expect(page.getByTestId('analysis-declaration-step')).toContainText(`/ ${total}`);
    await expect(page.getByTestId('analysis-evidence').getByRole('link').first()).toHaveAttribute('href', /slug=/);
  }
});


test('a local folder replaces sample counts and an empty dependency record stays qualified', async ({ page }) => {
  const { seedFirstRunSeen } = await import('../first-run-seed');
  const { stubDirectoryPicker } = await import('../vault-picker-stub');
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
  await expect(page.getByTestId('analysis-evidence')).toContainText('No path or real implementation-role document is connected');
  await expect(page.getByTestId('analysis-implementation-empty')).toContainText('An absent record does not establish absent implementation');
});
