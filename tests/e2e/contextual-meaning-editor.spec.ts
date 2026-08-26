import { expect, test } from '@playwright/test';
import type {} from './atlas-map-probe';

import { FIXTURE_VAULT } from './fixture-vault';
import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';

async function mountFixture(page: import('@playwright/test').Page) {
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto('/ko/topology/?guides=off&e2e=1', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('first-run-starter-open').click();
  await expect(page.getByTestId('vault-guide-sheet')).toBeVisible();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('first-run-starter')).toHaveCount(0, { timeout: 30_000 });
  const indexSearch = page.getByTestId('topology-index-search');
  await indexSearch.fill('딥링크 표적 문서');
  await expect(page.getByTestId('topology-index-tree')).toContainText('딥링크 표적 문서', {
    timeout: 30_000,
  });
  await indexSearch.fill('');
  await page.waitForTimeout(500);
}

async function openCheckoutEditor(page: import('@playwright/test').Page) {
  const indexSearch = page.getByTestId('topology-index-search');
  await indexSearch.fill('결제 승인');
  const row = page.getByTestId('topology-index-row').filter({ hasText: '결제 승인' }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.getByTestId('topology-v2-detail-panel')).toBeVisible({ timeout: 15_000 });
  await openRelationEditorFromDetail(page);
  await expect(page.getByTestId('meaning-editor-panel')).toBeVisible({ timeout: 15_000 });
}

async function openRelationEditorFromDetail(page: import('@playwright/test').Page) {
  const detailPanel = page.getByTestId('topology-v2-detail-panel');
  await detailPanel.getByTestId('topology-v2-detail-panel-edit-menu-trigger').click();
  await detailPanel
    .getByTestId('topology-v2-detail-panel-edit-menu')
    .getByTestId('topology-v2-detail-panel-action-edit')
    .click();
}

async function chooseOption(
  page: import('@playwright/test').Page,
  triggerTestId: string,
  optionName: string,
) {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: optionName }).click();
}

test('map relation editor previews, reviews, and writes one relation without leaving the map', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await mountFixture(page);
  await openCheckoutEditor(page);
  await chooseOption(page, 'meaning-editor-relation', '비슷한 것');
  await chooseOption(page, 'meaning-editor-target', '세금 신고 자료');
  await page.getByTestId('meaning-editor-why').fill('결제 승인과 세금 신고의 의미 경계를 함께 검토한다.');
  await expect(page.getByTestId('topology-map-v2')).toHaveAttribute(
    'data-preview-edge',
    'capability:checkout>capability:tax-report:related_to',
  );
  await expect(page.getByTestId('topology-map-v2')).toHaveAttribute('data-preview-phase', 'draft');

  await page.getByTestId('meaning-editor-review').click();
  const review = page.getByTestId('meaning-editor-change-review');
  await expect(review).toBeVisible();
  await expect(review).toContainText('capabilities/checkout');
  await expect(review).toContainText('capabilities/tax-report');
  await expect(review).toContainText('related_to');

  const reviewFit = await review.evaluate((element) => {
    const panel = element.closest<HTMLElement>('[data-testid="meaning-editor-panel"]');
    const rows = [...element.querySelectorAll<HTMLElement>('[data-testid="ontology-change-review-field-row"]')];
    const keys = [...element.querySelectorAll<HTMLElement>('[data-testid="ontology-change-review-field-key"]')];
    return {
      panelWidth: panel?.getBoundingClientRect().width ?? 0,
      panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : Number.POSITIVE_INFINITY,
      reviewOverflow: element.scrollWidth - element.clientWidth,
      rowCount: rows.length,
      rowOverflows: rows.map((row) => row.scrollWidth - row.clientWidth),
      keyWidths: keys.map((key) => key.getBoundingClientRect().width),
      keyWrap: keys.map((key) => {
        const style = getComputedStyle(key);
        return { overflowWrap: style.overflowWrap, wordBreak: style.wordBreak };
      }),
    };
  });
  expect(reviewFit.panelWidth).toBeCloseTo(352, 0);
  expect(reviewFit.rowCount, 'review fixture must render changed frontmatter fields').toBeGreaterThan(0);
  expect(reviewFit.panelOverflow).toBeLessThanOrEqual(1);
  expect(reviewFit.reviewOverflow).toBeLessThanOrEqual(1);
  expect(reviewFit.rowOverflows.every((overflow) => overflow <= 1)).toBe(true);
  expect(reviewFit.keyWidths.every((width) => Math.abs(width - 96) <= 1)).toBe(true);
  expect(
    reviewFit.keyWrap.every(
      ({ overflowWrap, wordBreak }) => overflowWrap === 'break-word' && wordBreak !== 'break-all',
    ),
  ).toBe(true);

  /*
   * ⚠️ The relation rows (from · relation · to · why) used to be **one grid each**, aligned only because
   * `4.5rem` was written four times. 72px held four 11px two-character labels — about 22px of text —
   * and the 50px left over read as a gap between a label and its own value (owner, on the installed
   * rc.13 build). They share one grid now, so this measures the property that replaced the number:
   * every label starts at the same x, every value starts at the same x, and neither column is
   * mostly empty.
   */
  const relationFit = await review.evaluate((element) => {
    const list = element.querySelector<HTMLElement>('dl');
    if (!list) return null;
    const labels = [...list.querySelectorAll<HTMLElement>('dt')];
    const values = [...list.querySelectorAll<HTMLElement>('dd')];
    const box = (el: HTMLElement) => el.getBoundingClientRect();
    return {
      labelCount: labels.length,
      labelLefts: labels.map((el) => Math.round(box(el).left)),
      valueLefts: values.map((el) => Math.round(box(el).left)),
      /*
       * ⚠️ **The text, not the cell.** A grid item fills its column, so `dt.getBoundingClientRect()`
       * returns the column width whatever the label says — comparing the two measures a thing
       * against itself. A probe caught exactly that: restoring the hardcoded 4.5rem left this
       * check green. A Range around the text node measures what is actually drawn.
       */
      widestLabelText: Math.max(
        ...labels.map((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return Math.round(range.getBoundingClientRect().width);
        }),
      ),
      columnWidth: labels.length ? Math.round(box(labels[0]).width) : 0,
    };
  });
  /*
   * ⚠️ Not `if (relationFit)`. A silent skip would let this whole measurement disappear the day the
   * markup changes, and a gate that can vanish without saying so is not a gate.
   */
  expect(relationFit, 'the review must render a relation detail list to measure').not.toBeNull();
  {
    expect(relationFit!.labelCount, 'relation detail must render its labels').toBeGreaterThan(1);
    expect(new Set(relationFit!.labelLefts).size, 'labels share one column').toBe(1);
    expect(new Set(relationFit!.valueLefts).size, 'values share one column').toBe(1);
    /*
     * The column is sized by its widest label, so the slack inside it is the difference between
     * the labels themselves — never the 50px of dead space a hardcoded 4.5rem left behind.
     */
    expect(relationFit!.columnWidth - relationFit!.widestLabelText).toBeLessThanOrEqual(1);
  }

  await page.getByTestId('meaning-editor-apply').click();
  await expect(page.getByTestId('topology-map-v2')).toHaveAttribute(
    'data-preview-phase',
    'committing',
  );
  await expect(page.getByTestId('meaning-editor-panel')).toHaveCount(0, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/workbench=edit/);
  await expect(page.getByTestId('topology-map-v2')).not.toHaveAttribute('data-preview-edge');
});

test('contextual editor stays inside the responsive workbench and every control is reachable', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await mountFixture(page);
  const indexSearch = page.getByTestId('topology-index-search');
  await indexSearch.fill('결제 승인');
  const row = page.getByTestId('topology-index-row').filter({ hasText: '결제 승인' }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect
    .poll(() => page.evaluate(() => window.__atlasMap?.nodes().length ?? 0), { timeout: 15_000 })
    .toBeGreaterThan(0);
  await expect(page.getByTestId('topology-v2-detail-panel')).toBeVisible({ timeout: 15_000 });
  await openRelationEditorFromDetail(page);
  await expect(page.getByTestId('meaning-editor-panel')).toBeVisible({ timeout: 15_000 });
  await chooseOption(page, 'meaning-editor-relation', '비슷한 것');
  await chooseOption(page, 'meaning-editor-target', '세금 신고 자료');
  const revealedByPreview = await page.evaluate(() =>
    window.__atlasMap?.nodes(),
  ).then((nodes) => nodes?.find((node) => node.id === 'capability:tax-report'));
  expect(revealedByPreview).toMatchObject({ hidden: false, previewEndpoint: true });

  const matrix = [
    { width: 600, height: 900 },
    { width: 768, height: 1024 },
    { width: 834, height: 1112 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ] as const;

  for (const viewport of matrix) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[data-testid="meaning-editor-panel"]');
      if (!panel) return null;
      const rect = panel.getBoundingClientRect();
      const tabbar = document.querySelector<HTMLElement>('nav[data-tabbar="primary"]');
      const tabRect = tabbar?.getClientRects().length ? tabbar.getBoundingClientRect() : null;
      const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), [role="combobox"]:not([aria-disabled="true"]), textarea:not(:disabled)')];
      const blocked = controls.flatMap((control) => {
        const r = control.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit && (hit === control || control.contains(hit))
          ? []
          : [{ label: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.tagName, hit: hit?.tagName ?? null }];
      });
      const index =
        document.querySelector<HTMLElement>('[data-testid="topology-index-panel"]') ??
        document.querySelector<HTMLElement>('[data-testid="topology-index-tab"]');
      const indexRect = index?.getClientRects().length ? index.getBoundingClientRect() : null;
      return {
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        tabTop: tabRect?.top ?? null,
        blocked,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        mapGap: indexRect ? rect.left - indexRect.right : null,
      };
    });

    expect(metrics, `${viewport.width}px에서 편집기 DOM을 못 찾았다`).not.toBeNull();
    expect(metrics!.rect.left).toBeGreaterThanOrEqual(-1);
    expect(metrics!.rect.top).toBeGreaterThanOrEqual(-1);
    expect(metrics!.rect.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics!.rect.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(metrics!.blocked).toEqual([]);
    expect(metrics!.docOverflow).toBeLessThanOrEqual(1);
    if (metrics!.tabTop !== null) expect(metrics!.rect.bottom).toBeLessThanOrEqual(metrics!.tabTop);
    if (viewport.width >= 1024) expect(metrics!.mapGap).toBeGreaterThanOrEqual(480);
    console.log(`[contextual-editor-responsive] ${viewport.width}x${viewport.height} ${JSON.stringify(metrics)}`);
  }
});
