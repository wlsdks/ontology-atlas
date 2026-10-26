import { expect } from '@playwright/test';
import { mountDesktopVault } from '../desktop-rail-arrival-harness';
import { installBriefingRuntime } from './change-briefing-fixture';

export async function enter(page: import('@playwright/test').Page) {
  await installBriefingRuntime(page);
  await page.addInitScript(() => localStorage.setItem('ontology-atlas:local-endpoint', JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'fixture-text-model' })));
  await mountDesktopVault(page);
  await page.goto('/en/changes/?guides=off');
  await expect(page.getByTestId('briefing-narrative')).toBeVisible();
}
export async function prepare(page: import('@playwright/test').Page) {
  await readPrs(page);
  await expectCoverage(page, '1 PR descriptions read');
  await reviewSummary(page);
  await expect(page.getByRole('dialog')).toBeVisible();
}
export async function calls(page: import('@playwright/test').Page, command: string) {
  return page.evaluate(name => (window as unknown as { __briefingProbe: { calls: { command: string; args: Record<string, unknown> }[] } }).__briefingProbe.calls.filter(call => call.command === name), command);
}

export async function reviewSummary(page: import('@playwright/test').Page) {
  await page.getByTestId('briefing-summary-mode').click();
  await page.getByRole('button', { name: /^(Create summary|Rebuild summary)$/, exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Explain this period', exact: true })).toBeVisible();
}
export async function openCoverage(page: import('@playwright/test').Page) {
  if (!await page.getByTestId('briefing-coverage-dialog').isVisible()) await page.getByTestId('briefing-coverage').click();
  return page.getByTestId('briefing-coverage-dialog');
}
export async function expectCoverage(page: import('@playwright/test').Page, text: string, absent = false) {
  if (await page.getByTestId('briefing-settings-dialog').isVisible()) await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  if (absent && !await page.getByTestId('briefing-coverage').count()) {
    await expect(page.getByTestId('briefing-narrative')).toHaveCount(0); return;
  }
  const dialog = await openCoverage(page);
  if (absent) await expect(dialog).not.toContainText(text); else await expect(dialog).toContainText(text);
  await dialog.getByRole('button', { name: 'Close coverage', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
export async function readPrs(page: import('@playwright/test').Page) {
  const summary = await page.getByTestId('briefing-summary-mode').getAttribute('aria-checked') === 'true';
  const read = page.getByRole('button', { name: /^(Read GitHub PR descriptions|Read latest PR descriptions)$/ });
  if (!await read.isVisible()) {
    await page.getByTestId('briefing-originals').click();
    const list = page.getByRole('button', { name: 'Source list', exact: true });
    if (await list.isVisible()) await list.click();
  }
  await read.click();
  if (summary) await page.getByTestId('briefing-summary-mode').click();
}
export async function chooseModel(page: import('@playwright/test').Page) {
  const link = page.getByRole('link', { name: 'Choose model', exact: true });
  if (!await link.isVisible()) await page.getByTestId('briefing-settings').click();
  await link.click();
}

