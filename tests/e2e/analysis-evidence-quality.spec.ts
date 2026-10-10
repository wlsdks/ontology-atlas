import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';
import { openFolderFromFirstRun } from './open-folder';
import { FIXTURE_VAULT } from './fixture-vault';
import { installLibraryWorkHarness } from './library-work-harness';

const uid = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fixtureDocument = (kind: string, slug: string, title: string, n: number, fields: string) => `---\nuid: ${uid(n)}\nkind: ${kind}\nslug: ${slug}\ntitle: ${title}\n${fields}\n---\n${title} performs its recorded responsibility in this example.\n`;

test('multi-project scope and expanded declarations remain explicit and bounded', async ({ page }) => {
  await seedFirstRunSeen(page);
  const files: Record<string, string> = {
    'a.md': fixtureDocument('project', 'a', 'Project A', 1, 'domains: [domains/orders]'),
    'b.md': fixtureDocument('project', 'b', 'Project B', 2, 'domains: [domains/stock]'),
    'domains/orders.md': fixtureDocument('domain', 'domains/orders', 'Orders', 3, `capabilities: [${Array.from({ length: 96 }, (_, i) => `capabilities/a${i}`).join(', ')}]`),
    'domains/stock.md': fixtureDocument('domain', 'domains/stock', 'Inventory', 4, 'capabilities: [capabilities/stock]'),
    'capabilities/stock.md': fixtureDocument('capability', 'capabilities/stock', 'Stock check', 5, 'domain: domains/stock'),
  };
  for (let i = 0; i < 96; i++) files[`capabilities/a${i}.md`] = fixtureDocument('capability', `capabilities/a${i}`, `Ability ${i}`, i + 10, 'domain: domains/orders\ndependencies: [capabilities/stock]');
  await stubDirectoryPicker(page, files);
  await page.goto('/en/topology/?guides=off');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('topology-index-panel')).toContainText('Project A');
  await page.goto('/en/ontology/insights/');
  await expect(page.getByTestId('analysis-workspace')).toHaveAttribute('data-analysis-project-count', '2');
  await expect(page.getByTestId('analysis-scope')).toContainText('2 projects');
  await expect(page.getByTestId('analysis-scope')).not.toContainText('Project A');
  await expect(page.getByTestId('analysis-workspace')).toHaveAttribute('data-analysis-cross-count', '96');
  await expect(page.getByTestId('analysis-witness')).toHaveCount(4);
  expect(await page.locator('[data-dependency-node]').count()).toBeLessThanOrEqual(8);
  await page.getByRole('button', { name: 'Next declarations', exact: true }).click();
  await expect(page.getByTestId('analysis-witness')).toHaveCount(4);
  await expect(page.getByTestId('analysis-witness').first()).toBeFocused();
  expect(await page.locator('[data-dependency-node]').count()).toBeLessThanOrEqual(8);
  await expect(page.getByTestId('analysis-witness').first()).toContainText('05');
});

test('two-hundred-percent text keeps nodes, evidence and controls inside the reading width', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.goto('/en/ontology/insights/');
  await expect(page.getByTestId('analysis-witness').first()).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  await expect.poll(() => page.locator('main').evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  const last = page.getByTestId('analysis-witness').last();
  await last.focus(); await page.keyboard.press('Enter');
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  const documentLink = page.getByTestId('analysis-evidence').getByRole('link').first();
  await documentLink.scrollIntoViewIfNeeded();
  await expect(documentLink).toBeInViewport({ ratio: 1 });
});

for (const tab of ['connections', 'do-next']) {
  test(`${tab} scrolls inside the page and leaves the shell slot without a scroll range`, async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 720 });
    await page.goto(`/en/ontology/insights/?tab=${tab}&guides=off`);
    await expect(page.getByTestId('analysis-workspace')).toBeVisible();
    const ranges = await page.evaluate(() => {
      const range = (element: Element) => element.scrollHeight - element.clientHeight;
      return { page: range(document.querySelector('main#main')!), slot: range(document.querySelector('[data-testid="app-shell-body-slot"]')!) };
    });
    expect(ranges.page, 'the page must be taller than the window or nothing below is measured').toBeGreaterThan(0);
    expect(ranges.slot, JSON.stringify(ranges)).toBeLessThanOrEqual(1);
  });
}

test('the rendered node text and selected arrow meet contrast on their actual surfaces', async ({ page }, testInfo) => {
  await page.goto('/en/ontology/insights/');
  await expect(page.getByTestId('analysis-witness').first()).toBeVisible();
  const result = await page.evaluate(() => {
    const rgba = (value: string): number[] => { const v = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]; return [v[0], v[1], v[2], v[3] ?? 1]; };
    const over = (fg: number[], bg: number[]) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
    const background = (element: Element) => { const parents: Element[] = []; for (let node: Element | null = element; node; node = node.parentElement) parents.unshift(node); return parents.reduce((color, node) => over(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255, 1]); };
    const luminance = (c: number[]) => c.slice(0, 3).map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (a: number[], b: number[]) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const text = [...document.querySelectorAll('[data-dependency-node] .text-title')].map(node => { const bg = background(node); return contrast(over(rgba(getComputedStyle(node).color), bg), bg); });
    const lines = [...document.querySelectorAll('[data-testid="analysis-dependency-diagram"] svg g > path')].map(node => { const bg = background(node); return contrast(over(rgba(getComputedStyle(node).stroke), bg), bg); });
    return { text, lines };
  });
  expect(result.text.length).toBeGreaterThan(0); expect(result.lines.length).toBeGreaterThan(0);
  expect(Math.min(...result.text)).toBeGreaterThanOrEqual(4.5);
  expect(Math.min(...result.lines)).toBeGreaterThanOrEqual(3);
  await testInfo.attach('rendered-analysis-contrast', { body: JSON.stringify(result), contentType: 'application/json' });
});

test('sample inspection copies facts without querying a connected vault', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }); });
  await page.goto('/en/ontology/insights/');
  await expect(page.getByTestId('analysis-inspect-selected')).toHaveCount(0);
  await page.getByTestId('analysis-copy-selected').click();
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(copied).toContain('bundled Atlas example');
  expect(copied).not.toContain('get_concept(');
  expect(copied).not.toContain('node "$ATLAS"');
});

test('the selected local fact prefills a root-bound read-only request without sending', async ({ page }) => {
  const harness = await installLibraryWorkHarness(page, { files: FIXTURE_VAULT, runtimeId: 'claude-acp' });
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/ontology/insights/');
  await page.getByTestId('analysis-inspect-selected').click();
  const chat = page.getByTestId('acp-chat-panel');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  await expect(chat.getByRole('textbox')).toHaveValue(/connection_info/);
  await expect(chat.getByRole('textbox')).toHaveValue(/get_concept/);
  expect((await harness.snapshot(page)).calls.filter(call => call.method === 'session/prompt')).toHaveLength(0);
});

test('a missing saved identity is reported rather than silently attributed to another claim', async ({ page }) => {
  await page.goto('/en/ontology/insights/?tab=do-next&review=analysis%3Acapability%3Anot-this-vault');
  await expect(page.getByTestId('analysis-missing-selection')).toBeVisible();
  await expect(page.getByTestId('analysis-claim').first()).toBeVisible();
});

for (const [locale, title] of [['en', 'Analysis'], ['ko', '분석'], ['ja', '分析'], ['zh', '分析']]) {
  test(`the ${locale} document title names Analysis while the body names the sample scope`, async ({ page }) => {
    await page.goto(`/${locale}/ontology/insights/`);
    await expect(page.getByTestId('analysis-workspace')).toBeVisible();
    await expect(page).toHaveTitle(`${title} · Ontology Atlas`);
    await expect(page.getByTestId('analysis-scope')).toBeVisible();
  });
}

test('local correction returns to the same visible focused claim without writing', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await installLibraryWorkHarness(page, { files: FIXTURE_VAULT, runtimeId: 'claude-acp' });
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/ontology/insights/?tab=do-next');
  const selected = page.locator('[data-testid="analysis-claim"][aria-pressed="true"]');
  await expect(selected).toBeVisible();
  const id = await selected.getAttribute('data-analysis-claim-id');
  await page.getByTestId('analysis-evidence').locator('a[href*="workbench=edit"]').click();
  await expect(page.getByTestId('meaning-editor-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Close relation editor', exact: true }).click();
  await expect(page.getByTestId('meaning-editor-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('topology-insights-return-chip-link').click();
  await expect(page.locator('[data-testid="analysis-claim"][aria-pressed="true"]')).toHaveAttribute('data-analysis-claim-id', id!);
  await expect(page.locator('[data-testid="analysis-claim"][aria-pressed="true"]')).toBeFocused();
  await expect(page.locator('[data-testid="analysis-claim"][aria-pressed="true"]')).toBeInViewport({ ratio: 1 });
});

test('supporting sample records name their scope and cannot copy or launch a connected-vault explanation', async ({ page }) => {
  await page.goto('/en/ontology/insights/?tab=brief');
  await expect(page.getByTestId('analysis-records-scope')).toContainText(/example/i);
  await page.getByTestId('insights-core-flow').click();
  await expect(page.getByTestId('analysis-records-scope')).toContainText(/example/i);
  await expect(page.getByTestId('flow-no-version')).toBeVisible();
  await expect(page.getByTestId('flow-copy')).toHaveCount(0);
  await expect(page.getByTestId('flow-prefill')).toHaveCount(0);
  await expect(page.getByTestId('flow-request')).toHaveCount(0);
  await expect(page.getByTestId('flow-open-vault')).toBeVisible();
});

test('a local explanation keeps root and identity checks in the unsent request', async ({ page }) => {
  const harness = await installLibraryWorkHarness(page, { files: FIXTURE_VAULT, runtimeId: 'claude-acp' });
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/ontology/insights/?tab=flow');
  await page.getByTestId('flow-prefill').click();
  const composer = page.getByTestId('acp-chat-panel').getByRole('textbox');
  await expect(composer).toHaveValue(/connection_info/);
  await expect(composer).toHaveValue(/immutable UIDs/);
  await expect(composer).toHaveValue(/12 full concepts/);
  expect((await harness.snapshot(page)).calls.filter(call => call.method === 'session/prompt')).toHaveLength(0);
});

test.describe('supporting records at the touch viewport', () => {
  test.use({ viewport: { width: 600, height: 900 }, hasTouch: true });
  for (const tab of ['brief', 'library', 'harness']) {
    test(`${tab} returns above the bottom navigation with a full touch target`, async ({ page }) => {
      await page.goto(`/en/ontology/insights/?tab=${tab}&guides=off`);
      const back = page.getByTestId('analysis-back-to-system');
      await expect(back).toBeVisible();
      await page.locator('main').evaluate(element => { element.scrollTop = element.scrollHeight; });
      const nav = await page.getByRole('navigation', { name: 'Primary menu', exact: true }).boundingBox();
      const bounds = await back.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(nav!.y);
      expect(await back.evaluate(element => {
        const r = element.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return element === hit || element.contains(hit);
      })).toBe(true);
      await back.click();
      await expect(page.getByTestId('analysis-workspace')).toBeVisible();
    });
  }
});

test.describe('project purpose on coarse input', () => {
  test.use({ hasTouch: true });
  for (const [width, height] of [[390, 844], [600, 900], [768, 1024]]) {
    for (const tab of ['connections', 'do-next']) {
      test(`${tab} purpose remains a full touch target at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto(`/en/ontology/insights/?tab=${tab}&guides=off`);
        const purpose = page.getByTestId('analysis-purpose');
        await expect(purpose).toBeVisible();
        expect((await purpose.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await purpose.click();
        await expect(purpose).toHaveAttribute('aria-expanded', 'true');
      });
    }
  }
});
