import { expect, test, type Page } from '@playwright/test';
import { installDesktopBridge } from '../rounds-desktop-bridge';

test.describe('Automations workspace', () => {
  test('exposes both lanes and a valid tabpanel in the browser no-vault state', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ko/automations/?guides=off', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('app-nav-rail-item-automations')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('automations-tab-ontology')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="tabpanel"]')).toHaveAttribute('id', 'automations-tabpanel-ontology');
    await expect(page.getByText('앱에서 폴더를 열면 이 화면에서 바로 예약을 만들 수 있어요.')).toBeVisible();

    await page.getByTestId('automations-tab-documents').click();
    await expect(page).toHaveURL(/\/ko\/automations\/\?guides=off&kind=documents$/);
    await expect(page.getByTestId('automations-tab-documents')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="tabpanel"]')).toHaveAttribute('id', 'automations-tabpanel-documents');
  });

});


async function openFolderThen(page: Page, path: string) {
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto(path);
}

test('schedule rows never unfold: the row carries the result, selection narrows the history, creation stays cancellable', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  await openFolderThen(page, '/en/automations/?guides=off&kind=documents');
  const consistency = page.getByTestId('automation-r-consistency');
  await expect(consistency.getByTestId('automation-summary')).toHaveText('Checked 4 documents.');
  await expect(page.getByTestId('automations-list-panel').locator('[aria-expanded]')).toHaveCount(0);

  const history = page.getByTestId('automations-run-ledger');
  await history.locator("[data-outcome='stale']").getByRole('button', { name: /Design system/ }).click();
  await expect(page).toHaveURL(/\/en\/docs\/\?slug=wiki%2Fdesign-system/);
  // The page's unlabelled citation reads as its file and place, not as the raw `src:` address.
  await expect(page.getByRole('article')).toContainText('Design system design-system.pdf · page 1.');
  await page.goBack();

  await page.getByTestId('automation-r-confluence').press('Enter');
  await expect(page.getByTestId('automation-r-confluence')).toHaveAttribute('aria-selected', 'true');
  await expect(history.getByRole('heading', { level: 2 })).toHaveText('Run history · Confluence');
  await expect(history.locator("[data-outcome='redrafted']")).toHaveCount(1);
  await expect(history.locator("[data-outcome='held']")).toHaveCount(0);
  await history.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(page.getByTestId('automation-r-confluence')).toHaveAttribute('aria-selected', 'false');
  await expect(history.locator("[data-outcome='held']")).toHaveCount(3);
  await expect(page.getByTestId('automations-list-panel').locator('[aria-expanded]')).toHaveCount(0);

  const trigger = consistency.getByTestId('automations-row-menu');
  await trigger.click();
  await page.getByRole('menu').getByTestId('automations-remove').click();
  await expect(page.getByTestId('automations-confirm-remove')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('automations-confirm-remove')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(consistency).toHaveAttribute('aria-selected', 'false');

  await page.getByTestId('automations-tab-ontology').click();
  await expect(page.getByTestId('automations-tab-ontology')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('automations-new').press('Enter');
  // The kind is the sheet's first field: it decides the default name and the fields after it.
  await expect(page.getByTestId('ontology-automation-kind-check')).toBeFocused();
  await page.keyboard.press('Tab');
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

test("a row's menu opens above its trigger with right edges aligned, over the table, and Escape gives focus back", async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  await openFolderThen(page, '/en/automations/?guides=off&kind=documents');
  for (const id of ['r-consistency', 'r-confluence']) {
    const row = page.getByTestId(`automation-${id}`);
    const trigger = row.getByTestId('automations-row-menu');
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await expect(menu).toHaveAttribute('data-surface-state', 'entered');
    const [menuBox, triggerBox] = await Promise.all([menu.boundingBox(), trigger.boundingBox()]);
    if (!menuBox || !triggerBox) throw new Error('the menu or its trigger was not drawn');
    expect(menuBox.y + menuBox.height, `${id}: the menu ends above its trigger`).toBeLessThanOrEqual(triggerBox.y);
    expect(Math.abs(menuBox.x + menuBox.width - (triggerBox.x + triggerBox.width)), `${id}: right edges align`).toBeLessThanOrEqual(1);
    const onTop = await menu.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return [0.2, 0.5, 0.8].map((fy) => {
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height * fy);
        return !!hit && el.contains(hit);
      });
    });
    expect(onTop, `${id}: nothing covers the menu`).toEqual([true, true, true]);
    await expect(row).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test('a run in the Ontology history opens its tool record in a dialog', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  await page.addInitScript(() => {
    const files = (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles;
    const store = JSON.parse(files['.ontology-atlas/rounds.json']);
    const endedAt = new Date().toISOString();
    if (store.rounds.some((round: { id: string }) => round.id === 'r-review')) return;
    store.rounds.push({ id: 'r-review', name: 'Source gaps', kind: 'ontology', cadence: { every: '6h' }, enabled: true,
      createdAt: endedAt, lastPassAt: endedAt, nextDueAt: endedAt });
    files['.ontology-atlas/rounds.json'] = JSON.stringify(store, null, 2) + '\n';
    files['.ontology-atlas/rounds-ledger.jsonl'] += `${JSON.stringify({ v: 1, id: 'p-review', roundId: 'r-review', roundName: 'Source gaps',
      kind: 'ontology', startedAt: endedAt, endedAt, outcome: 'reviewed', checked: 0, stale: [], written: [], refused: [],
      called: ['mcp__atlas__query_ontology'], agentTurns: 1, summary: 'One source binding gap', trigger: 'clock' })}\n`;
  });
  await openFolderThen(page, '/en/automations/?guides=off&kind=ontology');
  const run = page.getByTestId('automations-last-run');
  await expect(run).toContainText('One source binding gap');
  await expect(run).not.toContainText('query_ontology');
  await run.getByRole('button', { name: 'Tool activity', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tool activity' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('mcp__atlas__query_ontology');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('new schedules start fresh after cancellation and save, including rapid reopening', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/automations/?guides=off&kind=documents');
  await page.getByTestId('automations-new').evaluate((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault(), { once: true });
  });
  await page.getByTestId('automations-new').click();
  await page.getByTestId('library-rounds-rename').click();
  await page.getByTestId('library-rounds-name').fill('Cancelled document draft');
  await page.getByTestId('library-rounds-name').press('Enter');
  await page.getByTestId('library-rounds-cadence-unit').getByRole('radio', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Do not wait for the old exit to finish before opening the next draft.
  await page.keyboard.press('Enter');
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
  await page.getByTestId('automations-new').evaluate((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault(), { once: true });
  });
  await page.getByTestId('automations-new').click();
  await expect(page.getByTestId('library-rounds-add-menu')).toHaveCount(0);
  await expect(page.getByTestId('library-rounds-rename')).not.toContainText('Cancelled document draft');
  await page.keyboard.press('Escape');
  await expect(documents).toHaveCount(0);

  await page.getByTestId('automations-tab-ontology').click();
  await page.getByTestId('automations-new').evaluate((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault(), { once: true });
  });
  await page.getByTestId('automations-new').click();
  await page.getByTestId('ontology-automation-name').fill('Cancelled ontology draft');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('ontology-automation-name')).toHaveValue('Ontology check');
  await page.getByTestId('ontology-automation-name').fill('Saved ontology review');
  await page.getByTestId('ontology-automation-focus').fill('Evidence links');
  await page.getByTestId('ontology-automation-allow').click();
  await expect(page.getByTestId('ontology-automation-sheet')).toHaveCount(0);
  await expect(page.getByTestId('automations-list')).toContainText('Saved ontology review');
  await page.getByTestId('automations-new').evaluate((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault(), { once: true });
  });
  await page.getByTestId('automations-new').click();
  await expect(page.getByTestId('ontology-automation-name')).toHaveValue('Ontology check');
  await expect(page.getByTestId('ontology-automation-focus')).toHaveValue('');
  await page.keyboard.press('Escape');
});

test('a pass that had no agent says so on its row in one line, and every row keeps one height', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  // The local check's newest pass found a stale page, and no agent was ready to redraft it.
  await page.addInitScript(() => {
    const files = (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles;
    const path = '.ontology-atlas/rounds-ledger.jsonl';
    const endedAt = new Date().toISOString();
    files[path] += `${JSON.stringify({ v: 1, id: 'p-no-agent', roundId: 'r-consistency', roundName: 'Pages still match',
      kind: 'consistency', startedAt: endedAt, endedAt, outcome: 'stale', checked: 4, stale: ['wiki/design-system'],
      written: [], refused: [], called: [], agentTurns: 0, summary: '', trigger: 'manual', note: 'no-agent' })}\n`;
  });
  await openFolderThen(page, '/en/automations/?guides=off&kind=documents');
  await expect(page.getByTestId('automation-r-consistency').getByTestId('automation-summary')).toHaveText('Checked 4 documents.');
  // The Library ledger's own sentence for the same stored fact.
  await expect(page.getByTestId('round-ledger-pass-p-no-agent')).toContainText('No coding agent was ready on this Mac, so nothing was redrafted.');

  for (const width of [1280, 1040, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const rows = page.locator('[data-schedule-row]');
    await expect(rows).toHaveCount(2);
    const heights = await rows.evaluateAll((elements) => elements.map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(new Set(heights).size, `${width}: one row height (${heights.join(', ')})`).toBe(1);
    const summaryLines = await page.getByTestId('automation-summary').evaluateAll((elements) => elements.map((el) =>
      Math.round(el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight))));
    expect(summaryLines, `${width}: each summary is one line`).toEqual([1, 1]);
  }
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

test('a round and a connector a cloned folder switched on wait for this Mac, and one press allows each', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true, allowedHere: false });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/automations/?guides=off&kind=documents');
  const row = page.getByTestId('automation-r-confluence');
  // The strip is the grid row right after the schedule's own row.
  const item = row.locator('xpath=following-sibling::*[@role="row"][1]');
  await expect(row).toContainText('Off on this Mac');
  // A consent step, so it stands open under its row with no press first.
  const strip = item.getByTestId('automation-allow-here');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('Switched on in this folder but not allowed on this Mac');
  const [rowBox, stripRow] = await Promise.all([row.boundingBox(), item.boundingBox()]);
  if (!rowBox || !stripRow) throw new Error('the row or its strip was not drawn');
  expect(Math.abs(stripRow.y - (rowBox.y + rowBox.height)), 'the strip starts where the row ends').toBeLessThanOrEqual(1);
  expect(Math.abs(stripRow.width - rowBox.width), 'the strip spans the row').toBeLessThanOrEqual(1);
  await expect(row.getByTestId('automations-run-now')).toBeDisabled();
  await expect(item.getByTestId('automation-allow-here-line')).toContainText('confluence · looks for “pages changed in the last day” · at most 20 new documents per run');
  const before = await page.evaluate(() => (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles['.ontology-atlas/rounds.json']);
  await item.getByTestId('automation-allow-here-button').click();
  await expect(item.getByTestId('automation-allow-here')).toHaveCount(0);
  await expect(row).toContainText('Scheduled');
  await expect(page.getByTestId('automation-r-consistency')).toContainText('Off on this Mac');
  const after = await page.evaluate(() => (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles['.ontology-atlas/rounds.json']);
  expect(after).toBe(before);

  await page.goto('/en/agents/?tab=mcp&mcp=connectors&guides=off');
  const connector = page.getByTestId('connectors-item').filter({ hasText: 'confluence' });
  await expect(connector).toHaveAttribute('data-connector-waiting', 'true');
  await expect(connector).toHaveAttribute('data-connector-enabled', 'false');
  await expect(connector.getByTestId('connectors-item-runs')).toHaveText('https://mcp.atlassian.com/v1/mcp');
  await connector.getByTestId('connectors-item-allow').click();
  await expect(connector).toHaveAttribute('data-connector-enabled', 'true');
  await expect(connector.getByTestId('connectors-item-waiting')).toHaveCount(0);
});

test('a document round is edited in place: same id, its history kept, the new cadence on the row', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/automations/?guides=off&kind=documents&round=r-consistency');
  const row = page.getByTestId('automation-r-consistency');
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await row.getByTestId('automations-row-menu').click();
  await page.getByRole('menu').getByTestId('automations-edit').click();
  const sheet = page.getByTestId('library-rounds-sheet');
  await expect(sheet).toContainText('Edit document check');
  await expect(page.getByTestId('library-rounds-rename')).toContainText('Pages still match');
  await page.getByTestId('library-rounds-cadence-unit').getByRole('radio', { name: 'Day', exact: true }).click();
  await expect(page.getByTestId('library-rounds-allow')).toHaveText('Save changes');
  await page.getByTestId('library-rounds-allow').click();
  await expect(sheet).toHaveCount(0);
  await expect(row).toContainText('Daily at 09:00');
  await expect(page.getByTestId('automations-run-ledger').locator("[data-outcome='held']")).toHaveCount(3);
  const rounds = await page.evaluate(() => JSON.parse((window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles['.ontology-atlas/rounds.json']).rounds);
  expect(rounds.map((round: { id: string }) => round.id)).toEqual(['r-consistency', 'r-confluence']);
  expect(rounds[0]).toMatchObject({ id: 'r-consistency', name: 'Pages still match', cadence: { daily: '09:00', weekdaysOnly: false } });
  await expect(row).toContainText('Scheduled');
});

test('the documents lane keeps its run history under the schedules: held lines, change cards, sleep on request', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/automations/?guides=off&kind=documents');

  const history = page.getByTestId('automations-run-ledger');
  await expect(history.getByRole('heading', { level: 2 })).toHaveText('Run history');
  const listBottom = await page.getByTestId('automations-list-panel').evaluate((panel) => panel.getBoundingClientRect().bottom);
  const historyTop = await history.evaluate((section) => section.getBoundingClientRect().top);
  expect(historyTop, 'the history stands below the schedule list').toBeGreaterThan(listBottom);

  const ledger = history.getByTestId('round-ledger');
  await expect(ledger.locator("[data-outcome='held']")).toHaveCount(3);
  await expect(ledger.locator("[data-outcome='asleep']")).toHaveCount(0);
  await expect(ledger.locator("[data-outcome='redrafted']")).toContainText('1 agent run');
  await expect(ledger.locator("[data-outcome='redrafted']")).toContainText('mcp__confluence__create_page');
  await expect(ledger.locator("[data-outcome='stale']")).toContainText('no agent run');
  const heldHeight = await ledger.locator("[data-outcome='held']").first().evaluate((el) => el.getBoundingClientRect().height);
  const cardHeight = await ledger.locator("[data-outcome='redrafted']").first().evaluate((el) => el.getBoundingClientRect().height);
  expect(cardHeight, 'a change is a card, a held pass a line').toBeGreaterThan(heldHeight * 2);

  const sleepToggle = ledger.getByTestId('round-ledger-show-sleep');
  await sleepToggle.focus();
  await page.keyboard.press('Space');
  await expect(sleepToggle).toBeChecked();
  await expect(sleepToggle).toBeFocused();
  await expect(ledger.locator("[data-outcome='asleep']")).toHaveCount(1);
  await page.keyboard.press('Space');
  await expect(ledger.locator("[data-outcome='asleep']")).toHaveCount(0);
});

test('an old Library check-history link opens the documents lane on that schedule and its runs', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/library/?tab=rounds&round=r-confluence');

  await expect(page).toHaveURL(/\/en\/automations\/\?kind=documents&round=r-confluence$/);
  await expect(page.getByTestId('automation-r-confluence')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('automation-r-consistency')).toHaveAttribute('aria-selected', 'false');
  const history = page.getByTestId('automations-run-ledger');
  await expect(history.getByRole('heading', { level: 2 })).toContainText('Confluence');
  await expect(history.locator("[data-outcome='redrafted']")).toHaveCount(1);
  await expect(history.locator("[data-outcome='held']")).toHaveCount(0);

  // Picking another row narrows the history to that schedule instead.
  await page.getByTestId('automation-r-consistency').click();
  await expect(history.locator("[data-outcome='held']")).toHaveCount(3);
  await expect(history.locator("[data-outcome='redrafted']")).toHaveCount(0);
});

test('a local check saved from the documents lane runs once and lands in its run history', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: false });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/automations/?guides=off&kind=documents');
  await expect(page.getByTestId('automations-run-ledger')).toHaveCount(0);

  await page.getByTestId('automations-new').click();
  await page.getByTestId('library-rounds-allow').click();
  await expect(page.getByTestId('library-rounds-sheet')).toHaveCount(0);

  const ledger = page.getByTestId('automations-run-ledger').getByTestId('round-ledger');
  await expect(ledger.locator("[data-outcome='held']")).toHaveCount(1);
  await expect(ledger).toContainText('run manually');
  const stored = await page.evaluate(() => {
    const files = (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles;
    return (files['.ontology-atlas/rounds-ledger.jsonl'] ?? '').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  });
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ kind: 'consistency', outcome: 'held', trigger: 'manual', agentTurns: 0 });
});

test('Library offers sources, wiki and ontology, and no check history tab', async ({ page }) => {
  await installDesktopBridge(page, { seedRounds: true });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/library/');
  await expect(page.getByTestId('library-workspace-tabs').getByRole('tab')).toHaveText([/^Sources/, /^Wiki/, /^Ontology/]);
});
