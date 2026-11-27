import { expect, test } from '@playwright/test';
import type {} from './atlas-map-probe';

import { installDesktopRailRuntime, mountDesktopVault } from './desktop-rail-arrival-harness';
import { waitForAnimationsDone, waitForBoxStill, waitForDomQuiet } from './settle';

async function mountFixture(page: import('@playwright/test').Page) {
  await installDesktopRailRuntime(page, {}, undefined, { writable: true });
  await mountDesktopVault(page, 'ko');
  await page.goto('/ko/topology/?guides=off&e2e=1', { waitUntil: 'domcontentloaded' });
  const indexSearch = page.getByTestId('topology-index-search');
  await indexSearch.fill('딥링크 표적 문서');
  await expect(page.getByTestId('topology-index-tree')).toContainText('딥링크 표적 문서', {
    timeout: 30_000,
  });
  await indexSearch.fill('');
  // The cleared search has re-rendered the whole index before the next step searches again.
  await expect(indexSearch).toHaveValue('');
  await waitForDomQuiet(page);
}

async function openCheckoutEditor(page: import('@playwright/test').Page) {
  const indexSearch = page.getByTestId('topology-index-search');
  await indexSearch.fill('결제 승인');
  const row = page.getByTestId('topology-index-row').filter({ hasText: '결제 승인' }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.getByTestId('map-detail-panel')).toBeVisible({ timeout: 15_000 });
  await openRelationEditorFromDetail(page);
  await expect(page.getByTestId('meaning-editor-panel')).toBeVisible({ timeout: 15_000 });
}

async function openRelationEditorFromDetail(page: import('@playwright/test').Page) {
  // In an open folder, Edit relations shares the Edit menu with rename, description and delete.
  const detailPanel = page.getByTestId('map-detail-panel');
  await detailPanel.getByTestId('map-detail-panel-edit-menu-trigger').click();
  await page.getByTestId('map-detail-panel-action-edit').click();
}

async function chooseRelatedTaxReport(page: import('@playwright/test').Page) {
  await page.getByTestId('meaning-editor-relation-relates').click();
  const target = page.getByTestId('meaning-editor-target');
  await target.click();
  await target.fill('세금');
  await page.getByTestId('meaning-editor-target-option').filter({ hasText: '세금 신고 자료' }).click();
}

test('map relation editor previews one relation and writes it at once without leaving the map', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await mountFixture(page);
  await openCheckoutEditor(page);
  await chooseRelatedTaxReport(page);
  const why = page.getByTestId('meaning-editor-why');
  await why.fill('결제 승인과 세금 신고의 의미 경계를 함께 검토한다.');
  await expect(page.getByTestId('ontology-map')).toHaveAttribute(
    'data-preview-edge',
    'capability:checkout>capability:tax-report:related_to',
  );
  await expect(page.getByTestId('ontology-map')).toHaveAttribute('data-preview-phase', 'draft');

  const panelFit = await page.getByTestId('meaning-editor-panel').evaluate((panel) => ({
    width: panel.getBoundingClientRect().width,
    overflow: panel.scrollWidth - panel.clientWidth,
  }));
  expect(panelFit.width).toBeCloseTo(352, 0);
  expect(panelFit.overflow).toBeLessThanOrEqual(1);

  await why.press('Enter');
  const written = page.getByTestId('meaning-editor-relation-row').filter({ hasText: '세금 신고 자료' });
  await expect(written, 'the written relation is listed once the folder rereads it').toHaveAttribute(
    'data-relation',
    'relates',
    { timeout: 30_000 },
  );
  await expect(page.getByRole('button', { name: '되돌리기' })).toBeVisible();
  await expect(page.getByTestId('meaning-editor-panel')).toBeVisible();
  await expect(page.getByTestId('ontology-map')).not.toHaveAttribute('data-preview-edge');
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
  await expect(page.getByTestId('map-detail-panel')).toBeVisible({ timeout: 15_000 });
  await openRelationEditorFromDetail(page);
  await expect(page.getByTestId('meaning-editor-panel')).toBeVisible({ timeout: 15_000 });
  await chooseRelatedTaxReport(page);
  const revealedByPreview = await page.evaluate(() =>
    window.__atlasMap?.nodes(),
  ).then((nodes) => nodes?.find((node) => node.id === 'capability:tax-report'));
  expect(revealedByPreview).toMatchObject({ hidden: false, previewEndpoint: true });

  const matrix = [
    { width: 1040, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ] as const;

  for (const viewport of matrix) {
    await page.setViewportSize(viewport);
    // A rect is a fact that follows layout: read it once the workbench has reflowed.
    await waitForAnimationsDone(page.locator('html'));
    await waitForBoxStill(page.getByTestId('meaning-editor-panel'));
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[data-testid="meaning-editor-panel"]');
      if (!panel) return null;
      const rect = panel.getBoundingClientRect();
      const tabbar = document.querySelector<HTMLElement>('nav[data-tabbar="primary"]');
      const tabRect = tabbar?.getClientRects().length ? tabbar.getBoundingClientRect() : null;
      const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), [role="combobox"]:not([aria-disabled="true"]), textarea:not(:disabled)')];
      // The relation list scrolls inside the panel, so a control counts once it is scrolled to.
      const blocked = controls.flatMap((control) => {
        control.scrollIntoView({ block: 'nearest' });
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
    expect(metrics!.mapGap).toBeGreaterThanOrEqual(480);
    console.log(`[contextual-editor-responsive] ${viewport.width}x${viewport.height} ${JSON.stringify(metrics)}`);
  }
});
