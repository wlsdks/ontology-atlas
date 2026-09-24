import { expect, test } from '@playwright/test';
import { installDesktopBridge } from './rounds-desktop-bridge';

test.describe('Automations workspace', () => {
  test('exposes both lanes and a valid tabpanel in the browser no-vault state', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ko/automations/?guides=off', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('app-nav-rail-item-automations')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('automations-tab-ontology')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="tabpanel"]')).toHaveAttribute('id', 'automations-tabpanel-ontology');
    await expect(page.getByText('자동화는 맥 앱에서만 실행돼요')).toBeVisible();

    await page.getByTestId('automations-tab-documents').click();
    await expect(page).toHaveURL(/\/ko\/automations\/\?guides=off&kind=documents$/);
    await expect(page.getByTestId('automations-tab-documents')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="tabpanel"]')).toHaveAttribute('id', 'automations-tabpanel-documents');
  });

  test('keeps the lane strip and no-vault stage inside a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/automations/?guides=off&kind=documents', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('automations')).toBeVisible();
    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  });
});


test('schedule rows expose result evidence, collapse, and keep creation cancellable', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/automations/?guides=off&kind=documents');
  await expect(page.getByTestId('automations-last-run').filter({ visible: true })).toContainText('Checked 4 documents');
  await page.getByText('Earlier runs · 3', { exact: true }).click();
  const reviewPage = page.getByRole('link', { name: 'Open design-system in Wiki', exact: true });
  await expect(reviewPage).toHaveAttribute('href', '/en/docs/?slug=wiki%2Fdesign-system');
  await reviewPage.click();
  await expect(page).toHaveURL(/\/en\/docs\/\?slug=wiki%2Fdesign-system/);
  await expect(page.getByRole('article')).toContainText('Design system src:sources/design-system.pdf#p1.');
  await page.goBack();
  await page.getByTestId('automation-r-consistency').press('Enter');
  await expect(page.getByTestId('automation-r-consistency')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('automations-run-now').filter({ visible: true })).toHaveCount(0);
  await page.getByTestId('automation-r-confluence').press('Enter');
  await expect(page.getByTestId('automations-last-run').filter({ visible: true })).toContainText('wiki/onboarding.md');
  const report = page.getByTestId('automations-last-run').filter({ visible: true });
  await report.getByText('Tool activity', { exact: true }).press('Enter');
  await expect(report.getByText(/Refused: mcp__confluence__create_page/)).toBeVisible();
  await page.getByTestId('automations-remove').click();
  await expect(page.getByTestId('automations-confirm-remove')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('automations-confirm-remove')).toHaveCount(0);
  await page.getByTestId('automations-tab-ontology').click();
  await expect(page.getByTestId('automations-tab-ontology')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('automations-new').press('Enter');
  await expect(page.getByTestId('ontology-automation-name')).toBeFocused();
  await page.keyboard.type('A review that will be cancelled');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('ontology-automation-focus')).toBeFocused();
  await page.keyboard.type('Missing evidence');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ontology-automation-sheet')).toHaveCount(0);
  await expect(page.getByTestId('automations-new')).toBeFocused();
  const rounds = await page.evaluate(() => JSON.parse((window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles['.ontology-atlas/rounds.json']).rounds);
  expect(rounds.map((round: { id: string }) => round.id)).toEqual(['r-consistency', 'r-confluence']);
});

test('new schedules start fresh after cancellation and save, including rapid reopening', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/automations/?guides=off&kind=documents');
  await page.getByTestId('automations-new').click();
  await page.getByTestId('library-rounds-rename').click();
  await page.getByTestId('library-rounds-name').fill('Cancelled document draft');
  await page.getByTestId('library-rounds-name').press('Enter');
  await page.getByTestId('library-rounds-cadence-unit').getByRole('radio', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Do not wait for the old exit to finish before opening the next draft.
  await page.getByTestId('automations-new').press('Enter');
  const documents = page.getByTestId('library-rounds-sheet');
  await expect(documents).not.toContainText('Cancelled document draft');
  await expect(page.getByTestId('library-rounds-cadence-unit').getByRole('radio', { name: 'Hours', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('library-rounds-add-place').click();
  await expect(page.getByTestId('library-rounds-add-menu')).toBeVisible();
  await expect(page.getByTestId('library-rounds-add-menu')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('library-rounds-add-place')).toBeFocused();
  // Escape first dismisses the nested menu; save the fresh default document schedule.
  await page.getByTestId('library-rounds-allow').click();
  await expect(documents).toHaveCount(0);
  await page.getByTestId('automations-new').click();
  await expect(page.getByTestId('library-rounds-add-menu')).toHaveCount(0);
  await expect(page.getByTestId('library-rounds-rename')).not.toContainText('Cancelled document draft');
  await page.keyboard.press('Escape');
  await expect(documents).toHaveCount(0);

  await page.getByTestId('automations-tab-ontology').click();
  await page.getByTestId('automations-new').click();
  await page.getByTestId('ontology-automation-name').fill('Cancelled ontology draft');
  await page.keyboard.press('Escape');
  await page.getByTestId('automations-new').press('Enter');
  await expect(page.getByTestId('ontology-automation-name')).toHaveValue('Ontology refinement');
  await page.getByTestId('ontology-automation-name').fill('Saved ontology review');
  await page.getByTestId('ontology-automation-focus').fill('Evidence links');
  await page.getByTestId('ontology-automation-allow').click();
  await expect(page.getByTestId('ontology-automation-sheet')).toHaveCount(0);
  await expect(page.getByTestId('automations-list')).toContainText('Saved ontology review');
  await page.getByTestId('automations-new').click();
  await expect(page.getByTestId('ontology-automation-name')).toHaveValue('Ontology refinement');
  await expect(page.getByTestId('ontology-automation-focus')).toHaveValue('');
  await page.keyboard.press('Escape');
});

for (const lane of ['documents', 'ontology'] as const) {
  test(`${lane} save blocks dismissal while pending and recovers from a disk failure`, async ({ page }) => {
    await installDesktopBridge(page, { seedRounds: true });
    await page.goto('/en/');
    await page.getByRole('button', { name: /Open.*folder/i }).first().click();
    await expect(page.getByTestId('app-nav-rail')).toBeVisible();
    await page.goto(`/en/automations/?guides=off&kind=${lane}`);
    await page.getByTestId('automations-new').click();
    const prefix = lane === 'documents' ? 'library-rounds' : 'ontology-automation';
    const sheet = page.getByTestId(`${prefix}-sheet`);
    const save = page.getByTestId(`${prefix}-allow`);
    await page.evaluate(() => {
      const stub = window as unknown as {
        __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
        __failScheduleWrite?: () => void;
      };
      const original = stub.__TAURI_INTERNALS__.invoke;
      stub.__TAURI_INTERNALS__.invoke = (command, args) => {
        if (command === 'write_vault_text_file' && args?.relativePath === '.ontology-atlas/rounds.json') {
          return new Promise((_, reject) => {
            stub.__failScheduleWrite = () => {
              stub.__TAURI_INTERNALS__.invoke = original;
              reject(new Error('Simulated disk failure'));
            };
          });
        }
        return original(command, args);
      };
    });
    await save.click();
    await expect(save).toHaveText('Scheduling…');
    await expect(save).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId(lane === 'documents' ? 'library-rounds-rename' : 'ontology-automation-name')).toBeDisabled();
    await page.waitForFunction(() => typeof (window as unknown as { __failScheduleWrite?: unknown }).__failScheduleWrite === 'function');
    await page.evaluate(() => (window as unknown as { __failScheduleWrite: () => void }).__failScheduleWrite());
    await expect(sheet.getByRole('alert')).toBeVisible();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(sheet).toHaveCount(0);
    const count = await page.evaluate(() => JSON.parse((window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles['.ontology-atlas/rounds.json']).rounds.length);
    expect(count).toBe(3);
  });
}
