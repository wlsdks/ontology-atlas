import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { auditPage, FREEZE_CSS } from '../../../scripts/lib/design/ui-audit-probe.mjs';
import { parseRampNames, shouldFail } from '../../../scripts/lib/design/ui-audit-checks.mjs';
import { installLibraryWorkHarness } from '../library-work-harness';
import { openFolderFromFirstRun } from '../open-folder';

async function chooseSourceScope(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Source state', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

test('unmeasured browser evidence stays unknown while the selected claim remains open', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/en/ontology/insights/?tab=do-next&guides=off');
  const heading = page.getByTestId('analysis-finding-heading');
  const before = await heading.innerText();
  await expect(page.getByRole('combobox', { name: 'Source state', exact: true })).toBeVisible();
  await chooseSourceScope(page, 'Source changed · 0');
  await expect(page.getByTestId('analysis-source-scope-status')).toContainText('0 capabilities');
  await expect(heading).toHaveText(before);
  const count = await page.getByTestId('analysis-workspace').getAttribute('data-analysis-capability-count');
  await chooseSourceScope(page, `Not checked · ${count}`);
  await expect(page.getByTestId('analysis-source-scope-status')).toContainText(`${count} capabilities`);
  const source = page.getByRole('combobox', { name: 'Source state', exact: true });
  await source.press('Enter');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(source).toHaveText(`All sources · ${count}`);
  await expect(source).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: new RegExp(`^Gaps ${count}$`) })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-testid="analysis-claim"][tabindex="0"]')).toBeFocused();
});

test('source scopes intersect search and recorded gaps without losing the selected document', async ({ page }) => {
  const body = '\n## Definition\nReturns whether a payment is authorized under the current spending limit.\n## Includes\n- Its recorded operation.\n## Excludes\n- Other operations.\n## Uncertainty\n- Runtime behavior has not been checked.\n';
  const slugs = Array.from({ length: 16 }, (_, i) => `capabilities/ability-${i}`);
  const files: Record<string, string> = {
    'fixture.md': '---\nuid: 50000000-0000-4000-8000-000000000001\nslug: fixture\nkind: project\ntitle: Source scope fixture\ndomains: [domains/work]\n---\nRecorded work.\n',
    'domains/work.md': `---\nuid: 50000000-0000-4000-8000-000000000002\nslug: domains/work\nkind: domain\ntitle: Work\ncapabilities: [${slugs.join(', ')}]\n---\nRecorded responsibility.\n`,
    '.ontology-atlas/project-sources.json': JSON.stringify({ contractVersion: 1, bindings: [{ projectSlug: 'fixture', sourceId: 'fixture', kind: 'git', rootPath: '/connected', boundAt: '2026-01-02' }] }),
  };
  slugs.forEach((slug, i) => { files[`${slug}.md`] = `---\nuid: 50000000-0000-4000-8000-${String(i + 10).padStart(12, '0')}\nslug: ${slug}\nkind: capability\ntitle: Ability ${String(i).padStart(2, '0')}\ndomain: domains/work\npath: src/ability-${i}.ts\n---${i === 15 ? '\nPerforms its operation.\n' : body}`; });
  await installLibraryWorkHarness(page, { files });
  await openFolderFromFirstRun(page, 'en');
  await page.evaluate(() => {
    const state = window as unknown as { sourceScopeCurrent?: boolean; __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> } };
    const invoke = state.__TAURI_INTERNALS__.invoke;
    state.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'git_bound_evidence_dates') return { status: 'partial', omittedVaultPaths: [], omittedSourcePaths: ['src/ability-2.ts'],
        vaultChanges: Array.from({ length: 16 }, (_, i) => ({ path: `capabilities/ability-${i}.md`, exists: true, isDir: false, dirty: false, lastChangedAt: '2026-01-02T00:00:00Z' })),
        sourceChanges: Array.from({ length: 16 }, (_, i) => ({ path: `src/ability-${i}.ts`, exists: state.sourceScopeCurrent || i !== 1, isDir: false, dirty: false, lastChangedAt: state.sourceScopeCurrent ? '2026-01-01T00:00:00Z' : i === 2 ? null : i === 15 ? '2026-01-03T00:00:00Z' : '2026-01-01T00:00:00Z' })) };
      return invoke(command, args);
    };
  });
  await page.locator('a[href*="/ontology/insights"]').first().click();
  await page.getByRole('radio', { name: 'Evidence to check', exact: true }).click();
  await page.getByRole('radio', { name: /^All 16$/ }).click();
  const heading = page.getByTestId('analysis-finding-heading');
  const before = await heading.innerText();
  const document = page.getByTestId('analysis-evidence').getByRole('link').first();
  const href = await document.getAttribute('href');
  await chooseSourceScope(page, 'Source changed · 1');
  const later = page.getByTestId('analysis-claim').filter({ hasText: 'Ability 15' });
  await expect(later).toBeVisible();
  await expect(later.locator('..')).not.toHaveAttribute('data-dimmed');
  await expect(heading).toHaveText(before);
  await expect(document).toHaveAttribute('href', href!);
  await page.getByTestId('analysis-claim-search').fill('Ability 00');
  await expect(page.getByTestId('analysis-source-scope-status')).toContainText('0 capabilities');
  await page.getByTestId('analysis-claim-search').press('Escape');
  await expect(page.getByTestId('analysis-source-scope-status')).toContainText('1 capability');
  await page.getByRole('radio', { name: /^Gaps 1$/ }).click();
  await expect(page.getByTestId('analysis-source-scope-status')).toContainText('1 capability');
  await later.click();
  await expect(heading).toHaveText('Ability 15');
  await chooseSourceScope(page, 'Path missing · 1');
  await expect(page.getByTestId('analysis-source-scope-status')).toContainText('0 capabilities');
  await page.getByRole('radio', { name: /^All 16$/ }).click();
  await expect(page.getByTestId('analysis-source-scope-status')).toContainText('1 capability');
  await expect(heading).toHaveText('Ability 15');
  await chooseSourceScope(page, 'Not checked · 1');
  await expect(page.getByTestId('analysis-source-scope-status')).toContainText('1 capability');
  await page.evaluate(() => { (window as unknown as { sourceScopeCurrent: boolean }).sourceScopeCurrent = true; });
  await page.getByTestId('analysis-retry-source').click();
  await chooseSourceScope(page, 'Source changed · 0');
  await expect(page.getByTestId('analysis-source-scope-status')).toContainText('0 capabilities');
  await expect(page.getByTestId('analysis-claim')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Show 4 more', exact: true })).toBeVisible();
  await expect(heading).toHaveText('Ability 15');
  await page.getByRole('button', { name: 'Show 4 more', exact: true }).click();
  await expect(page.getByTestId('analysis-claim')).toHaveCount(16);
  await page.getByRole('button', { name: 'Show less', exact: true }).click();
  await expect(page.getByTestId('analysis-claim')).toHaveCount(12);
  await expect(heading).toHaveText('Ability 15');
});

const rampNames = parseRampNames(readdirSync('app/styles').filter(file => file.endsWith('.css')).map(file => readFileSync(`app/styles/${file}`, 'utf8')).join('\n'));
for (const width of [390, 768, 1024, 1920, 2560]) {
  test(`keeps source scope controls reachable at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/ko/ontology/insights/?tab=do-next&guides=off');
    const source = page.getByRole('combobox', { name: '소스 상태', exact: true });
    await expect(source).toBeVisible();
    await source.click();
    const count = await page.getByTestId('analysis-workspace').getAttribute('data-analysis-capability-count');
    await page.getByRole('option', { name: `미확인 · ${count}`, exact: true }).click();
    await page.addStyleTag({ content: FREEZE_CSS });
    if (width === 390) await page.evaluate(() => { document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 2}px`; });
    const audit = await auditPage(page, { width, rampNames, scope: '[data-testid="analysis-workspace"]' });
    await testInfo.attach(`source-scope-${width}`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
    expect(shouldFail([audit]), JSON.stringify(audit.findings)).toBe(false);
    await source.click();
    await expect(page.getByRole('option', { name: `모든 소스 · ${count}`, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(source).toBeFocused();
  });
}
