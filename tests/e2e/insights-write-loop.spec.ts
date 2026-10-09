import { expect, test, type Page } from '@playwright/test';
import { parseFrontmatter } from '../../scripts/lib/parse-frontmatter.mjs';
import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';

const PAY_BODY = '# Pay\n\n## Definition\n\nPay executes an explicitly approved payment.\n';
const SEED: Record<string, string> = {
  'shop.md': '---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Insight Shop\ndomains: [domains/billing]\n---\n\n# Insight Shop\n',
  'domains/billing.md': '---\nuid: 33333333-3333-4333-8333-333333333333\nslug: domains/billing\nkind: domain\ntitle: Billing\ncapabilities: [capabilities/pay, capabilities/receipt]\n---\n\nBilling records approved payments.\n',
  'capabilities/pay.md': '---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\ndomain: domains/billing\npath: src/pay.ts\ntags: [payments, preserved]\n---\n\n' + PAY_BODY,
  'capabilities/receipt.md': '---\nuid: 44444444-4444-4444-8444-444444444444\nslug: capabilities/receipt\nkind: capability\ntitle: Receipt\ndomain: domains/billing\n---\n\nReceipt records proof of a payment.\n',
};
const RATIONALE = 'A receipt is required to complete the approved payment.';
type ParsedDocument = { frontmatter: Record<string, unknown>; body: string };

async function readVaultFile(page: Page, path: string): Promise<string> {
  return page.evaluate(async target => {
    const root = await navigator.storage.getDirectory();
    let vault: FileSystemDirectoryHandle | null = null;
    for await (const [name, handle] of root.entries()) {
      if (name.startsWith('stub-vault-') && handle.kind === 'directory') {
        vault = handle as FileSystemDirectoryHandle;
        break;
      }
    }
    if (!vault) throw new Error('The picker did not persist the fixture folder');
    const parts = target.split('/');
    let dir = vault;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return (await (await dir.getFileHandle(parts[parts.length - 1])).getFile()).text();
  }, path);
}

async function expectOriginalFiles(page: Page) {
  for (const [path, body] of Object.entries(SEED)) expect(await readVaultFile(page, path), path).toBe(body);
}

test('Analysis correction reviews one typed relation before writing its exact document and returning focus', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, SEED);
  await page.goto('/en/topology/?guides=off');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('topology-index-panel')).toContainText('Insight Shop');
  await page.goto('/en/ontology/insights/?tab=do-next&guides=off');
  const claim = page.getByTestId('analysis-claim').filter({ hasText: 'Pay' });
  await claim.click();
  const claimId = await claim.getAttribute('data-analysis-claim-id');
  await page.getByTestId('analysis-evidence').locator('a[href*="workbench=edit"]').click();
  await expect(page.getByTestId('meaning-editor-panel')).toBeVisible();
  await page.getByTestId('meaning-editor-relation').click();
  await page.getByRole('option', { name: /^Depends on/ }).click();
  await page.getByTestId('meaning-editor-target').click();
  await page.getByRole('option', { name: 'Receipt' }).click();
  await page.getByTestId('meaning-editor-why').fill(RATIONALE);
  await expect(page.getByTestId('ontology-map')).toHaveAttribute('data-preview-phase', 'draft');
  await expectOriginalFiles(page);

  await page.getByTestId('meaning-editor-review').click();
  const review = page.getByTestId('meaning-editor-change-review');
  await expect(review).toBeVisible();
  await expect(review).toContainText('capabilities/pay');
  await expect(review).toContainText('capabilities/receipt');
  await expect(review).toContainText('depends_on');
  await expectOriginalFiles(page);
  await page.getByTestId('meaning-editor-apply').click();
  await expect.poll(() => readVaultFile(page, 'capabilities/pay.md')).toContain(RATIONALE);
  const written = parseFrontmatter(await readVaultFile(page, 'capabilities/pay.md')) as ParsedDocument;
  const original = parseFrontmatter(SEED['capabilities/pay.md']) as ParsedDocument;
  expect(written.frontmatter).toMatchObject({
    uid: original.frontmatter.uid,
    slug: original.frontmatter.slug,
    kind: original.frontmatter.kind,
    title: original.frontmatter.title,
    domain: original.frontmatter.domain,
    path: original.frontmatter.path,
    tags: original.frontmatter.tags,
    dependencies: ['capabilities/receipt'],
  });
  expect(written.body).toBe(original.body);
  expect((written.frontmatter.relation_notes as Record<string, unknown>)['capabilities/receipt']).toBe(RATIONALE);
  for (const [path, body] of Object.entries(SEED)) {
    if (path !== 'capabilities/pay.md') expect(await readVaultFile(page, path), path).toBe(body);
  }
  await expect(page.getByTestId('meaning-editor-panel')).toHaveCount(0);
  await page.getByTestId('topology-insights-return-chip-link').click();
  const returned = page.locator('[data-testid="analysis-claim"][aria-pressed="true"]');
  await expect(returned).toHaveAttribute('data-analysis-claim-id', claimId!);
  await expect(returned).toBeFocused();
  await expect(returned).toBeInViewport({ ratio: 1 });
});
