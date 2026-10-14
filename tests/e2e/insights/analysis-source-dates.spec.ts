import { readFileSync, readdirSync } from 'node:fs';
import { auditPage, FREEZE_CSS } from '../../../scripts/lib/design/ui-audit-probe.mjs';
import { parseRampNames, shouldFail, formatSummary } from '../../../scripts/lib/design/ui-audit-checks.mjs';
import { expect, test } from '@playwright/test';
import { installLibraryWorkHarness } from '../library-work-harness';
import { openFolderFromFirstRun } from '../open-folder';

const files = {
  'fixture.md': '---\nuid: 40000000-0000-4000-8000-000000000001\nslug: fixture\nkind: project\ntitle: Date fixture\ncapabilities: [capabilities/pay]\n---\nRecorded payment responsibility.\n',
  'capabilities/pay.md': '---\nuid: 40000000-0000-4000-8000-000000000002\nslug: capabilities/pay\nkind: capability\ntitle: Pay\npath: src/pay.ts\n---\nReturns the payment result. Human review remains required.\n',
  '.ontology-atlas/project-sources.json': JSON.stringify({ contractVersion: 1, bindings: [{ projectSlug: 'fixture', sourceId: 'fixture', kind: 'git', rootPath: '/connected', boundAt: '2026-01-02' }] }),
};

test('source grant recovery keeps the selected claim across cancellation, a wrong folder and retry', async ({ page }) => {
  await installLibraryWorkHarness(page, { files });
  await openFolderFromFirstRun(page, 'en');
  await page.evaluate(() => {
    const state = window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> }; evidenceCalls: string[] };
    const invoke = state.__TAURI_INTERNALS__.invoke;
    let choice = 0;
    state.evidenceCalls = [];
    state.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'pick_source_directory') return choice < 3 ? [null, '/wrong', '/connected'][choice++] : '/connected';
      if (command === 'git_bound_evidence_dates') {
        state.evidenceCalls.push(command);
        const selected = args?.selectedSourcePath;
        return { status: selected === '/wrong' ? 'wrong-folder' : selected === '/connected' ? 'measured' : 'ungranted', omittedVaultPaths: [], omittedSourcePaths: [],
          vaultChanges: selected === '/connected' ? [{ path: 'capabilities/pay.md', exists: true, isDir: false, dirty: false, lastChangedAt: '2026-01-02T00:00:00Z' }] : [],
          sourceChanges: selected === '/connected' ? [{ path: 'src/pay.ts', exists: true, isDir: false, dirty: false, lastChangedAt: '2026-01-03T00:00:00Z' }] : [] };
      }
      return invoke(command, args);
    };
  });
  await page.locator('a[href*="/ontology/insights"]').first().click();
  await expect(page.getByTestId('analysis-workspace')).toBeVisible();
  await expect(page.getByTestId('analysis-choose-source')).toBeVisible();
  const title = await page.getByTestId('analysis-finding-heading').innerText();
  await page.getByTestId('analysis-choose-source').click();
  await expect(page.getByTestId('analysis-choose-source')).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { evidenceCalls: string[] }).evidenceCalls.length)).toBe(1);
  await page.getByTestId('analysis-choose-source').click();
  await expect(page.getByTestId('analysis-source-recovery').getByRole('status')).toBeVisible();
  await expect(page.getByTestId('analysis-finding-heading')).toHaveText(title);
  const rampNames = parseRampNames(readdirSync('app/styles').filter(file => file.endsWith('.css')).map(file => readFileSync(`app/styles/${file}`, 'utf8')).join('\n'));
  await page.addStyleTag({ content: FREEZE_CSS });
  for (const width of [1920, 2560]) {
    await page.setViewportSize({ width, height: 1320 });
    const { findings } = await auditPage(page, { width, rampNames });
    console.log(formatSummary('analysis wrong-folder recovery', width, findings));
    expect(shouldFail([{ findings }]), JSON.stringify(findings)).toBe(false);
  }
  await page.getByTestId('analysis-choose-source').click();
  await expect(page.getByTestId('analysis-choose-source')).toHaveCount(0);
  await expect(page.getByTestId('analysis-source-status')).toContainText(/changed|moved/i);
  await expect(page.getByTestId('analysis-evidence')).toContainText('src/pay.ts');
  await expect(page.getByTestId('analysis-finding-heading')).toHaveText(title);
});
