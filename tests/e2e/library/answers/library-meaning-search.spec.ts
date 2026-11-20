import { expect, test, type Page } from '@playwright/test';
import type { VectorFound, VectorStatus } from '../../../../src/shared/lib/vault-folder/tauri-vault-vectors';
import { seedFirstRunSeen } from '../../first-run-seed';
import {
  installLibraryWorkHarness,
  LIBRARY_VECTOR_FAILURES,
  LIBRARY_VECTOR_SCRIPT,
  type LibraryVectorsScript,
  type LibraryWorkHarness,
} from '../../library-work-harness';

const VAULT_ROOT = '/Users/probe/Ontology Atlas/launch';
const CHOICE_KEY = 'ontology-atlas:vault-vectors:v1';
const BUILTIN = { source: { kind: 'builtin' }, paused: false };

// Lines: 1 heading, 2-5 refund lines, 6 blank, 7 heading, 8-9 exceptions.
const returns = '# Returns\nRefund window is 15 days.\nRefund requests need the receipt.\nRefund fee is 3 percent.\nRefund goes to the card.\n\n## Exceptions\nOpened items cannot go back.\nThe fee is waived for defects.\n';
const policy = '# Policy\nRefund approval takes two days.\nRefund disputes go to finance.\n';
const page = [
  '---', 'title: Returns', 'created_by: agent:fixture', 'compiled_at: 2026-09-20T00:00:00Z',
  'sources:', '  - sources/returns.md', 'status: draft', 'summary: Returns.', '---',
  '## Summary', 'Returns.', '## Facts',
  '- Refunds are paid to the card. [[src:sources/returns.md#l5]]',
  '- Refund requests need a receipt. [[src:sources/returns.md#l3]]',
  '- Opened items are excluded. [[src:sources/returns.md#l8]]',
  '## Open questions',
].join('\n');
const FILES = {
  'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Returns\nslug: returns\n---\n',
  'sources/returns.md': returns,
  'sources/policy.md': policy,
  'wiki/returns.md': page,
};

const found = (fields: Partial<VectorFound>): VectorFound => ({
  state: 'ok', failure: null, hits: [], staleDropped: 0, filesReady: 1240, filesTotal: 2000, ...fields,
});

async function openDesk(page: Page, vectors: LibraryVectorsScript = {}, choice?: object): Promise<LibraryWorkHarness> {
  await page.setViewportSize({ width: 1512, height: 901 });
  await seedFirstRunSeen(page);
  if (choice) {
    await page.addInitScript(([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    }, [CHOICE_KEY, JSON.stringify({ [VAULT_ROOT]: choice })]);
  }
  const harness = await installLibraryWorkHarness(page, { files: FILES, vectors });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open (?:a|my) folder/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  await page.goto('/en/library/?tab=wiki&guides=off');
  await expect(page.getByTestId('meaning-desk-line')).not.toHaveAttribute('data-state', 'pending');
  return harness;
}

async function ask(page: Page, question: string) {
  await page.getByTestId('question-desk-input').fill(question);
  await page.getByTestId('question-desk-input').press('Enter');
  await expect(page.getByTestId('question-desk-results')).toBeVisible();
}

const callsOf = async (harness: LibraryWorkHarness, page: Page, command: string) =>
  (await harness.snapshot(page)).calls.filter((call) => call.method === command);
const rows = (page: Page) => page.getByTestId('question-desk-lead');
/** The top edge once it holds still for 200 ms, so a rise still in flight is not read as a place. */
const top = async (page: Page, testId: string) => {
  const read = () => page.getByTestId(testId).evaluate((element) => new Promise<[number, number]>((resolve) => {
    const before = element.getBoundingClientRect().top;
    window.setTimeout(() => resolve([before, element.getBoundingClientRect().top]), 200);
  }));
  await expect.poll(async () => { const [before, after] = await read(); return before === after; }).toBe(true);
  return (await read())[1];
};

test('a passage only meaning found is a row of its first sentence, its file and line, and Similar meaning', async ({ page }) => {
  const question = 'Is unsealed merchandise accepted?';
  const harness = await openDesk(page, {
    status: LIBRARY_VECTOR_SCRIPT.ready,
    foundByQuestion: { [question]: found({ hits: [{ path: 'sources/returns.md', lineStart: 7, lineEnd: 9, heading: 'Exceptions', score: 0.71 }] }) },
  }, BUILTIN);
  await ask(page, question);
  await expect(rows(page)).toHaveCount(1);
  const row = rows(page).first();
  await expect(row.locator('[data-lead-sentence]')).toHaveText('Opened items cannot go back.');
  await expect(row.locator('[data-lead-where]')).toContainText('returns.md');
  await expect(row.locator('[data-lead-where]')).toContainText('line 8');
  await expect(row.locator('[data-lead-reason]')).toHaveText(/^·\s*Similar meaning$/);
  await expect(row.locator('[data-lead-sentence] .font-\\[var\\(--font-weight-emphasis\\)\\]')).toHaveCount(0);
  const searches = await callsOf(harness, page, 'vault_vectors_search');
  expect(searches.map((call) => call.params)).toEqual([{ rootPath: VAULT_ROOT, source: { kind: 'builtin' }, question, limit: 24 }]);
});

test('a word lead inside a passage found by meaning is one row, counted once, for both reasons', async ({ page }) => {
  const question = 'How long is the window?';
  await openDesk(page, {
    status: LIBRARY_VECTOR_SCRIPT.ready,
    foundByQuestion: { [question]: found({ hits: [{ path: 'sources/returns.md', lineStart: 1, lineEnd: 3, heading: 'Returns', score: 0.9 }] }) },
  }, BUILTIN);
  await ask(page, question);
  await expect(page.getByTestId('question-desk-results-head')).toContainText('1 passage found');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator('[data-lead-sentence]')).toHaveText('Refund window is 15 days.');
  await expect(rows(page).first().locator('[data-lead-reason]')).toHaveText(/^·\s*Same words · similar meaning$/);
});

test('a folder with nothing set up asks by words alone: no reason on a row, and no search or warm call', async ({ page }) => {
  const harness = await openDesk(page);
  await page.getByTestId('question-desk-input').focus();
  await ask(page, 'When is a refund approved?');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('[data-lead-reason]')).toHaveCount(0);
  expect(await callsOf(harness, page, 'vault_vectors_search')).toEqual([]);
  expect(await callsOf(harness, page, 'vault_vectors_warm')).toEqual([]);
});

test('the field warms the model on its first focus in a ready folder, and only then', async ({ page }) => {
  const harness = await openDesk(page, { status: LIBRARY_VECTOR_SCRIPT.ready }, BUILTIN);
  const field = page.getByTestId('question-desk-input');
  await field.focus();
  await expect.poll(async () => (await callsOf(harness, page, 'vault_vectors_warm')).map((call) => call.params)).toEqual([{ source: { kind: 'builtin' } }]);
  await field.blur();
  await field.focus();
  await ask(page, 'When is a refund approved?');
  expect(await callsOf(harness, page, 'vault_vectors_warm')).toHaveLength(1);
});

test('when the model is gone the word rows stand, the line and one sentence say so, and the one Download again asks in the dialog first', async ({ page }) => {
  const harness = await openDesk(page, {
    status: LIBRARY_VECTOR_SCRIPT.ready,
    found: found({ state: 'failed', failure: 'modelGone', filesReady: 0, filesTotal: 0 }),
  }, BUILTIN);
  const statusReads = (await callsOf(harness, page, 'vault_vectors_status')).length;
  await ask(page, 'When is a refund approved?');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('[data-lead-reason]')).toHaveCount(0);
  const notice = page.getByTestId('question-desk-meaning-notice');
  await expect(notice).toHaveText('The model is no longer on this computer, so these results match words only.');
  // The search's failure is read back into the folder's status, so the line above says the same.
  await expect(page.getByTestId('meaning-desk-line')).toHaveAttribute('data-state', 'modelGone');
  expect(await callsOf(harness, page, 'vault_vectors_status')).toHaveLength(statusReads + 1);
  // The notice is the sentence alone; the line above carries the state and its one press.
  await expect(page.getByRole('button', { name: 'Download again' })).toHaveCount(1);
  await expect(notice.getByRole('button')).toHaveCount(0);
  await page.getByTestId('meaning-desk-downloadAgain').click();
  await expect(page.getByTestId('meaning-setup-dialog')).toBeVisible();
  await expect(page.getByTestId('meaning-setup-cancel')).toBeFocused();
  expect(await callsOf(harness, page, 'vault_vectors_prepare')).toEqual([]);
  await expect(page.getByTestId('meaning-setup-primary')).toHaveText('Download and prepare');
  await page.getByTestId('meaning-setup-primary').click();
  await expect.poll(async () => (await callsOf(harness, page, 'vault_vectors_prepare')).map((call) => call.params))
    .toEqual([{ rootPath: VAULT_ROOT, enabled: true, source: { kind: 'builtin' } }]);
});

test('says Ollama did not answer when the runner is down, and nothing when meaning is not ready', async ({ page }) => {
  const harness = await openDesk(page, { status: LIBRARY_VECTOR_SCRIPT.ready, found: found({ state: 'failed', failure: 'runnerDown' }) }, BUILTIN);
  await ask(page, 'When is a refund approved?');
  await expect(page.getByTestId('question-desk-meaning-notice')).toHaveText('Ollama did not answer, so these results match words only.');
  await expect(page.getByTestId('meaning-desk-line')).toHaveAttribute('data-state', 'runnerDown');
  await harness.setVectorFound(page, found({ state: 'notReady' }));
  await ask(page, 'When is the refund approved?');
  await expect(page.getByTestId('question-desk-meaning-notice')).toHaveCount(0);
  await expect(page.locator('[data-lead-reason]')).toHaveCount(0);
});

test('the coverage popover names meaning coverage only when it was partial, and left-out passages when meaning took part', async ({ page }) => {
  const harness = await openDesk(page, {
    status: LIBRARY_VECTOR_SCRIPT.ready,
    // One passage the app left out because its file changed.
    found: found({ staleDropped: 1, hits: [{ path: 'sources/returns.md', lineStart: 1, lineEnd: 2, heading: 'Returns', score: 0.9 }] }),
  }, BUILTIN);
  await ask(page, 'When is a refund approved?');
  await page.getByTestId('question-desk-coverage-info').click();
  const popover = page.getByTestId('question-desk-coverage-info-popover');
  await expect(popover).toContainText('By meaning: 1,240 of 2,000 files');
  await expect(popover).toContainText('1 passage from a changed file was left out');
  await page.keyboard.press('Escape');

  // Every file prepared: the count would read as a second scope beside the desk's own.
  await harness.setVectorFound(page, found({ filesReady: 2000, staleDropped: 1, hits: [{ path: 'sources/returns.md', lineStart: 1, lineEnd: 2, heading: 'Returns', score: 0.9 }] }));
  await ask(page, 'When are refunds approved?');
  await page.getByTestId('question-desk-coverage-info').click();
  await expect(popover).toContainText('1 passage from a changed file was left out');
  await expect(popover).not.toContainText('By meaning');
  await page.keyboard.press('Escape');

  await harness.setVectorFound(page, found({ state: 'notReady' }));
  await ask(page, 'When is the refund approved?');
  await page.getByTestId('question-desk-coverage-info').click();
  await expect(popover).toBeVisible();
  await expect(popover).not.toContainText('By meaning');
});

test('no match with nothing set up offers Set up first, which opens the dialog on Cancel', async ({ page }) => {
  await openDesk(page);
  await ask(page, 'Who owns the lunar migration?');
  const unknown = page.getByTestId('question-desk-unknown');
  await expect(unknown).toContainText('Word search can miss documents in another language');
  const setup = unknown.getByTestId('question-desk-meaning-setup');
  await expect(setup).toHaveText('Set up search by meaning');
  await expect(unknown.getByTestId('question-desk-summarize')).toBeVisible();
  expect(await setup.evaluate((element) => {
    const investigate = document.querySelector('[data-testid="question-desk-summarize"]')!;
    return Boolean(element.compareDocumentPosition(investigate) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await setup.click();
  await expect(page.getByTestId('meaning-setup-dialog')).toBeVisible();
  await expect(page.getByTestId('meaning-setup-cancel')).toBeFocused();
});

test('no match when meaning took part says neither these words nor this meaning matched', async ({ page }) => {
  await openDesk(page, { status: LIBRARY_VECTOR_SCRIPT.ready, found: found({}) }, BUILTIN);
  await ask(page, 'Who owns the lunar migration?');
  const unknown = page.getByTestId('question-desk-unknown');
  await expect(unknown).toContainText('No passage in the files searched matches these words or this meaning.');
  await expect(unknown.getByTestId('question-desk-meaning-setup')).toHaveCount(0);
});

const LINE_STATES: Array<[string, VectorStatus]> = [
  ['words', LIBRARY_VECTOR_SCRIPT.notSetUp],
  ['waitingTurn', LIBRARY_VECTOR_SCRIPT.waitingTurn],
  ['modelDownloading', LIBRARY_VECTOR_SCRIPT.downloading],
  ['modelConverting', LIBRARY_VECTOR_SCRIPT.converting],
  ['preparing', LIBRARY_VECTOR_SCRIPT.preparingMeasured],
  ['updating', LIBRARY_VECTOR_SCRIPT.updatingMany],
  ['stopped', LIBRARY_VECTOR_SCRIPT.stopped],
  ['modelGone', LIBRARY_VECTOR_FAILURES.modelGone],
  ['ready', LIBRARY_VECTOR_SCRIPT.ready],
];

test('the field keeps one top edge across entry, results, Show more, a report and every state of the line', async ({ page }) => {
  const harness = await openDesk(page, {
    status: LIBRARY_VECTOR_SCRIPT.ready,
    found: found({ hits: [{ path: 'sources/returns.md', lineStart: 7, lineEnd: 9, heading: 'Exceptions', score: 0.6 }] }),
  }, BUILTIN);
  const tops: number[] = [await top(page, 'question-desk-input')];
  for (const [state, status] of LINE_STATES) {
    await harness.emitVectorStatus(page, status);
    await expect(page.getByTestId('meaning-desk-line')).toHaveAttribute('data-state', state);
    tops.push(await top(page, 'question-desk-input'));
  }

  await ask(page, 'When is a refund approved?');
  await expect(rows(page)).toHaveCount(3);
  tops.push(await top(page, 'question-desk-input'));
  // Under the field nothing moves while the line says something else.
  const resultsTops: number[] = [];
  for (const [state, status] of LINE_STATES) {
    await harness.emitVectorStatus(page, status);
    await expect(page.getByTestId('meaning-desk-line')).toHaveAttribute('data-state', state);
    tops.push(await top(page, 'question-desk-input'));
    resultsTops.push(await top(page, 'question-desk-results-head'));
  }

  await page.getByTestId('question-desk-show-more').click();
  await expect(rows(page)).toHaveCount(8);
  tops.push(await top(page, 'question-desk-input'));

  await page.getByTestId('question-desk-summarize').click();
  await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
  await harness.answer(page, '## Answer\nRefunds go to the card. [[src:sources/returns.md#l5]]\n\n## Source-backed evidence\n- The refund goes to the card. [[src:sources/returns.md#l5]]\n\n## Disagreements or changed claims\nNone read.\n\n## Unknowns and search limits\nThe timing is unknown.');
  await expect(page.getByTestId('question-desk-report')).toBeVisible();
  await page.getByTestId('library-question-desk').evaluate((desk) => { desk.scrollTop = 0; });
  tops.push(await top(page, 'question-desk-input'));

  test.info().annotations.push({ type: 'field top', description: [...new Set(tops)].join(', ') });
  expect(new Set(tops).size).toBe(1);
  expect(new Set(resultsTops).size).toBe(1);
});
