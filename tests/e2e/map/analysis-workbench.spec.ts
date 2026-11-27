import { expect, test, type Page } from '@playwright/test';
import en from '../../../messages/en.json';
import { FIT_LOCALES } from '../locales';
import { atlasSampleFiles, installDesktopRailRuntime } from '../desktop-rail-arrival-harness';
import { openMapOnApp, READY_AGENT } from './open-map-on-app';
import { storefrontSampleFiles } from './storefront-sample-files';
import { waitForAnimationsDone, waitForMapSettled } from '../settle';
import { analysisDigest, analysisRecordFileName, serializeAnalysisRecord, type AnalysisRun } from '../../../mcp/src/analysis-history/analysis-record.mts';

/** The folder is the Online Store sample unless a spec plants its own files over the shared fixture folder. */
async function openOnApp(page: Page, address: string, planted?: Record<string, string>) {
  const sample = address.includes('/architecture/') ? atlasSampleFiles() : storefrontSampleFiles();
  await installDesktopRailRuntime(page, planted ?? sample, READY_AGENT, planted ? {} : { replaceFixture: true });
  if (planted) await serveAnalysisRecords(page, planted);
  await openMapOnApp(page, address);
}

/** The faked runtime lists a planted review record but does not answer the native reader for it; this does. */
async function serveAnalysisRecords(page: Page, planted: Record<string, string>) {
  await page.addInitScript((records) => {
    const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> } }).__TAURI_INTERNALS__;
    const inner = internals.invoke.bind(internals);
    internals.invoke = (command, args = {}) => {
      const text = command === 'read_analysis_record_text' ? records[`.ontology-atlas/analyses/${String(args.fileName)}`] : undefined;
      return text === undefined ? inner(command, args) : Promise.resolve(text);
    };
  }, planted);
}

type CaptionBox = { edgeId: string; text: string; minX: number; maxX: number; minY: number; maxY: number };

for (const width of [1280, 1920]) {
  test(`expanded INDEX keeps search and meaning reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openOnApp(page, '/en/topology/?e2e=1&guides=off&index=expanded');
    await expect(page.getByTestId('topology-index-panel')).toBeVisible();
    await page.getByTestId('topology-concept-search').click({ timeout: 8000 });
    await expect(page.locator('[cmdk-item]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('topology-vault-agent-toggle').click({ timeout: 8000 });
    await expect(page.getByTestId('analysis-workbench')).toBeVisible();
  });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('a selected concept opens the review dock, which draws bounded directional relation captions while it is open', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 945 });
  await openOnApp(page, '/en/topology/?e2e=1&guides=off&p=capability%3Acart&open=domain%3Aorder%2Cproject%3Astorefront');
  await page.getByTestId('map-detail-panel-more-menu-trigger').click();
  await page.getByTestId('map-detail-panel-action-meaning').click();
  const workbench = page.getByTestId('analysis-workbench');
  await expect(workbench).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlasMap?: { relationCaptions?: () => CaptionBox[] } }).__atlasMap?.relationCaptions?.().length ?? 0)).toBeGreaterThan(0);
  const proof = await page.evaluate(() => {
    const api = (window as unknown as { __atlasMap: { relationCaptions: () => CaptionBox[]; labels: () => Array<Omit<CaptionBox, 'edgeId'>> } }).__atlasMap;
    const captions = api.relationCaptions(); const labels = api.labels();
    const overlaps = (a: Omit<CaptionBox, 'edgeId'>, b: Omit<CaptionBox, 'edgeId'>) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
    return { captions, overlaps: captions.flatMap((caption) => labels.filter((label) => overlaps(caption, label))) };
  });
  expect(proof.captions.length).toBeLessThanOrEqual(24);
  expect(proof.captions.some((caption) => /[→↘↓↙←↖↑↗]/u.test(caption.text))).toBe(true);
  expect(proof.overlaps).toEqual([]);
  await workbench.getByRole('button', { name: en.analysisWorkbench.close }).click();
  await expect(workbench).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlasMap?: { relationCaptions?: () => CaptionBox[] } }).__atlasMap?.relationCaptions?.().length ?? -1)).toBe(0);
});

for (const locale of FIT_LOCALES) {
for (const width of [1040, 2560]) {
  test(`${locale}: meaning review and close remain reachable at ${width}px`, async ({ page }) => {
    const height = width <= 1040 ? 720 : 1080;
    await page.setViewportSize({ width, height });
    await openOnApp(page, `/${locale}/topology/?e2e=1&guides=off&index=collapsed`);
    await page.getByTestId('topology-vault-agent-toggle').click();
    const panel = page.getByTestId('analysis-workbench');
    await expect(panel).toBeVisible();
    await page.waitForFunction(() => {
      const surface = document.querySelector('[data-agent-dock-surface="inset"]');
      const frame = document.querySelector('[data-agent-dock-frame]');
      return surface && frame && Number(getComputedStyle(surface).opacity) > 0.99 && [...surface.getAnimations(), ...frame.getAnimations()].every((animation) => animation.playState !== 'running');
    });
    const proof = await panel.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const close = element.querySelector<HTMLButtonElement>('[data-testid="analysis-workbench-close"]')!;
      const button = close.getBoundingClientRect();
      const hit = document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2);
      const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
      return { left: box.left, right: box.right, bottom: box.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, closeReachable: !!hit && close.contains(hit), canvasWidth: canvas.width, canvasRight: canvas.right, panelFont: getComputedStyle(element).fontSize };
    });
    expect(proof.left).toBeGreaterThanOrEqual(0);
    expect(proof.right).toBeLessThanOrEqual(proof.viewportWidth);
    expect(proof.bottom).toBeLessThanOrEqual(proof.viewportHeight);
    expect(proof.closeReachable).toBe(true);
    expect(proof.canvasWidth).toBeGreaterThanOrEqual(480);
    expect(proof.canvasRight).toBeLessThanOrEqual(proof.left);
    await page.getByTestId('analysis-workbench-close').click();
    await expect(panel).toBeHidden();
  });
}
}

test('Architecture exposes version history without requiring an agent process', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await openOnApp(page, '/en/architecture/?view=architecture&guides=off');
  await page.getByTestId('architecture-review-open').click();
  await expect(page.getByTestId('analysis-workbench')).toBeVisible();
  await expect(page.getByRole('tab', { name: en.analysisWorkbench.history })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('architecture-inspector')).toBeHidden();
});

/** One saved review run with `count` findings, written where the folder keeps review results. */
async function reviewRecordFiles(count: number): Promise<Record<string, string>> {
  const frontmatter = { kind: 'capability', title: 'Checkout' };
  const body = '\nThe checkout approves a payment before the order is placed.\n';
  const digest = await analysisDigest({ frontmatter, body });
  const run = {
    schema: 'atlas-analysis/v1', recordType: 'run', id: '95f4ba81-41f7-483b-a617-2a4be815be32', createdAt: '2026-11-15T08:00:00.000Z', mode: 'meaning',
    scope: { projectSlug: 'storefront', projectUid: null, targetSlugs: [], profileSlug: null },
    request: { id: 'u-1', text: 'Review meaning.', parentRunId: null },
    origin: { surface: 'map', runtimeId: 'test', sessionId: 's-1', userEventId: 'u-1', answerEventId: 'a-1', startedAt: '2026-11-15T07:59:00.000Z', stopReason: 'end_turn', outcome: 'completed' },
    // A graph hash no folder produces: the review reads as older than the documents.
    basis: { graphHash: `sha256:${'a'.repeat(64)}`, profileHash: null, sourceFingerprint: null, documents: [{ slug: 'capabilities/checkout', digest }] },
    evidence: [{ slug: 'capabilities/checkout', uid: null, title: 'Checkout', kind: 'capability', body, frontmatter, digest, toolCallId: 'r-1' }],
    observations: [], profileSnapshot: null, toolReads: [{ id: 'r-1', name: 'get_concepts', status: 'completed' }], sourceAccess: 'atlas-only',
    qualification: { status: 'grounded', reasons: [] }, answer: 'The original answer from the agent.',
    findings: Array.from({ length: count }, (_, index) => ({
      id: `f-${index + 1}`, category: 'boundary', title: `Question ${index + 1}: does checkout own the payment approval boundary it describes?`,
      detail: `Finding ${index + 1} explains why the recorded boundary may not match what the product does.\n\nIt cites the checkout document and suggests reading the policy before changing anything.`,
      targetSlugs: ['capabilities/checkout'], evidenceSlugs: ['capabilities/checkout'], roleIds: [], relation: null, suggestedAction: 'Read the policy.',
    })),
  } as unknown as AnalysisRun;
  return { [`.ontology-atlas/analyses/${analysisRecordFileName(run)}`]: serializeAnalysisRecord(run) };
}

test.describe('review results as a short list', () => {
  test.use({ viewport: { width: 1410, height: 840 } });
  test('four findings fit as rows; a row drills in, Escape returns to it, and the record details hold the answer', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openOnApp(page, '/en/topology/?guides=off&e2e=1', await reviewRecordFiles(4));
    await page.getByTestId('topology-vault-agent-toggle').click();
    await page.getByRole('tab', { name: en.analysisWorkbench.history }).click();
    const list = page.getByTestId('review-finding-list');
    const rows = list.getByRole('button', { name: /^Question \d/ });
    await expect(rows).toHaveCount(4, { timeout: 15_000 });
    await expect(list.getByRole('heading', { name: '4 to check' })).toBeVisible();
    await expect(list.getByText(en.analysisWorkbench.basisStaleLine)).toBeVisible();
    await expect(page.getByTestId('analysis-workbench').locator('details, summary')).toHaveCount(0);
    await waitForAnimationsDone(page.getByTestId('analysis-workbench'));
    const fit = await page.locator('#workbench-tabpanel-history').evaluate((panel) => ({ scroll: panel.scrollHeight, client: panel.clientHeight, width: panel.getBoundingClientRect().width }));
    expect(fit.scroll, `the list scrolls inside a ${fit.width}px panel`).toBeLessThanOrEqual(fit.client);

    await rows.nth(1).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('analysis-workbench')).toBeVisible();
    await expect(rows.nth(1)).toBeFocused();

    await rows.nth(2).click();
    const back = page.getByRole('button', { name: en.analysisWorkbench.backToList, exact: true });
    await expect(back).toBeFocused();
    await expect(page.getByRole('heading', { name: /^Question 3/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: '1 source document' })).toBeVisible();
    await back.click();
    await expect(rows.nth(2)).toBeFocused();

    // A text click leaves focus on the page; Escape still steps back one level, not out of the review.
    await rows.nth(0).click();
    await page.locator('[data-review-view="finding"]').getByText(/^Finding 1 explains/).click();
    await page.keyboard.press('Escape');
    await expect(rows.nth(0)).toBeFocused();
    await expect(page.getByTestId('analysis-workbench')).toBeVisible();

    const door = page.getByRole('button', { name: en.analysisWorkbench.recordDetails, exact: true });
    await door.click();
    const dialog = page.getByRole('dialog', { name: en.analysisWorkbench.recordDetails });
    await expect(dialog).toContainText('The original answer from the agent.');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(door).toBeFocused();
    await expect(page.getByTestId('analysis-workbench')).toBeVisible();

    await door.click();
    await dialog.getByText('The original answer from the agent.').click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('analysis-workbench')).toBeVisible();
  });
});

test.describe('keyboard review at the app minimum window', () => {
  test.use({ viewport: { width: 1040, height: 720 } });
  test('an opening review answers Escape before its focus handoff finishes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openOnApp(page, '/en/topology/?e2e=1&guides=off&index=collapsed');
    await waitForMapSettled(page);
    const opener = page.getByTestId('topology-vault-agent-toggle');
    for (let cycle = 0; cycle < 6; cycle += 1) {
      await opener.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await expect(opener).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByTestId('analysis-workbench')).toBeHidden();
      await expect(opener).toBeFocused();
    }
  });
  for (const route of ['topology', 'architecture']) {
    test(`${route}: review takes visible focus and restores its opener`, async ({ page }) => {
      await openOnApp(page, `/en/${route}/?${route === 'architecture' ? 'view=architecture&' : ''}e2e=1&guides=off&index=collapsed`);
      const opener = page.getByTestId(route === 'topology' ? 'topology-vault-agent-toggle' : 'architecture-review-open');
      await expect(opener).toBeVisible();
      await opener.focus();
      await expect(opener).toBeFocused();
      await page.keyboard.press('Enter');
      const panel = page.getByTestId('analysis-workbench');
      await expect(page.getByTestId('analysis-workbench-close')).toBeFocused();
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => {
          const focused = document.activeElement;
          if (!(focused instanceof HTMLElement) || focused === document.body) return true;
          const rect = focused.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return !!hit && focused.contains(hit) && !focused.closest('[inert]');
        })).toBe(true);
      }
      await page.getByTestId('analysis-workbench-close').focus();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(opener).toBeFocused();
    });
  }
});
