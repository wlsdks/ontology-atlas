import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { FIXTURE_VAULT } from '../fixture-vault';
import { installLibraryWorkHarness } from '../library-work-harness';
import { openFolderFromFirstRun } from '../open-folder';
import { analysisRecordFileName, serializeAnalysisRecord } from '../../../src/entities/analysis-record/model/analysis-record.mts';

const ARCHIVE = '.ontology-atlas/analyses';
const HASH = `sha256:${'a'.repeat(64)}`;

function savedRun(n: number) {
  const run = {
    schema: 'atlas-analysis/v1' as const,
    recordType: 'run' as const,
    id: `95f4ba81-41f7-483b-a617-2a4be815be3${n}`,
    createdAt: `2026-09-0${n}T08:00:00.000Z`,
    mode: 'meaning' as const,
    scope: { projectSlug: 'storefront', projectUid: null, targetSlugs: [], profileSlug: null },
    request: { id: `user-${n}`, text: `Explain the business flow, run ${n}.`, parentRunId: null },
    origin: { surface: 'analysis' as const, runtimeId: 'test', sessionId: `session-${n}`, userEventId: `user-${n}`, answerEventId: `agent-${n}`, startedAt: `2026-09-0${n}T07:59:00.000Z`, stopReason: 'end_turn', outcome: 'completed' as const },
    basis: { graphHash: HASH, sourceFingerprint: null, profileHash: null, documents: [] },
    evidence: [],
    observations: [],
    profileSnapshot: null,
    toolReads: [],
    sourceAccess: 'atlas-only' as const,
    findings: [],
    qualification: { status: 'unverified' as const, reasons: [] },
    answer: `A saved explanation, run ${n}.\n`,
  };
  return { path: `${ARCHIVE}/${analysisRecordFileName(run)}`, text: serializeAnalysisRecord(run as never) };
}

test.describe('the retired Guidance and Written explanations addresses', () => {
  test('?tab=harness replaces itself with At a glance, keeping other flags and adding no history entry', async ({ browser }) => {
    const context = await browser.newContext();
    const direct = await context.newPage();
    await direct.goto('/en/architecture/?guides=off&view=overview');
    await expect(direct.getByRole('tab', { name: 'At a glance' })).toHaveAttribute('aria-selected', 'true');
    const baseline = await direct.evaluate(() => history.length);

    const old = await context.newPage();
    await old.goto('/en/ontology/insights/?tab=harness&guides=off');
    await expect(old).toHaveURL(/\/en\/architecture\/\?guides=off&view=overview$/);
    await expect(old.getByRole('tab', { name: 'At a glance' })).toHaveAttribute('aria-selected', 'true');
    expect(await old.evaluate(() => history.length)).toBe(baseline);
    await old.goBack();
    expect(old.url()).not.toContain('/architecture/');
    await context.close();
  });

  test('a return chip addressed to the Guidance section lands on At a glance', async ({ page }) => {
    await page.goto('/en/ontology/insights/?tab=harness&via=insights%3Aharness');
    await expect(page).toHaveURL(/\/en\/architecture\/\?via=insights%3Aharness&view=overview$/);
    await expect(page.getByRole('tab', { name: 'At a glance' })).toHaveAttribute('aria-selected', 'true');
  });

  test('?tab=flow opens System relationships with the retired notice, not the legacy one', async ({ page }) => {
    await page.goto('/ko/ontology/insights/?tab=flow&guides=off');
    await expect(page.getByTestId('analysis-flow-retired')).toContainText('.ontology-atlas/analyses/');
    await expect(page.getByTestId('analysis-flow-retired')).not.toContainText('에이전트 패널');
    await expect(page.getByTestId('insights-core-ontology')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('analysis-board')).toBeVisible();
    await page.getByTestId('insights-core-brief').click();
    await expect(page.getByTestId('analysis-flow-retired')).toHaveCount(0);
  });

  test('the tab bar holds exactly three sections, in order', async ({ page }) => {
    await page.goto('/en/ontology/insights/?guides=off');
    const tabs = page.getByTestId('insights-core-switch').getByRole('tab');
    await expect(tabs).toHaveText(['System relationships', 'Review summary', 'Wiki']);
    await expect(page.getByTestId('insights-core-harness')).toHaveCount(0);
    await expect(page.getByTestId('insights-core-flow')).toHaveCount(0);
  });

  test('a claim return keeps working on the retired Flow address', async ({ page }) => {
    await page.goto('/en/ontology/insights/?guides=off');
    const id = await page.locator('[data-testid="analysis-claim"]').first().getAttribute('data-analysis-claim-id');
    await page.goto(`/en/ontology/insights/?tab=do-next&guides=off&review=${encodeURIComponent(`analysis:${id}`)}`);
    await expect(page.locator('[data-testid="analysis-claim"][aria-pressed="true"]')).toHaveAttribute('data-analysis-claim-id', id!);
  });
});

test('visiting every section and the retired Flow address leaves saved explanations untouched and readable', async ({ page }) => {
  const runs = [1, 2, 3].map(savedRun);
  const harness = await installLibraryWorkHarness(page, {
    files: { ...FIXTURE_VAULT, ...Object.fromEntries(runs.map(run => [run.path, run.text])) },
    runtimeId: 'claude-acp',
  });
  await page.addInitScript(() => {
    type Internals = { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
    const internals = (window as unknown as { __TAURI_INTERNALS__: Internals }).__TAURI_INTERNALS__;
    const original = internals.invoke.bind(internals);
    internals.invoke = (command, args) => command === 'read_analysis_record_text'
      ? (original('read_vault_text_file', { ...args, relativePath: `.ontology-atlas/analyses/${String(args?.fileName)}` }) as Promise<{ text: string }>).then(file => file.text)
      : original(command, args);
  });
  await openFolderFromFirstRun(page, 'en');
  const hashes = async () => {
    const { files } = await harness.snapshot(page);
    return runs.map(run => createHash('sha256').update(files[run.path] ?? '').digest('hex'));
  };
  const before = await hashes();
  expect(before.every(Boolean)).toBe(true);

  await page.goto('/en/ontology/insights/?guides=off');
  for (const section of ['brief', 'library', 'ontology']) {
    await page.getByTestId(`insights-core-${section}`).click();
    await expect(page.locator('#main [role="alert"], [data-testid="analysis-workbench-error"]')).toHaveCount(0);
  }
  await page.goto('/en/ontology/insights/?tab=flow&guides=off');
  await expect(page.getByTestId('analysis-flow-retired')).toContainText("Findings & history");
  await expect(page.locator('#main [role="alert"], [data-testid="analysis-workbench-error"]')).toHaveCount(0);

  const opener = page.getByTestId('analysis-inspect-selected');
  await opener.click();
  const chat = page.getByTestId('acp-chat-panel');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  const draft = 'Keep this unsent request after the sections changed';
  await chat.getByRole('textbox').fill(draft);
  await page.getByRole('tab', { name: 'Findings & history' }).click();
  await expect(page.getByTestId('analysis-history-empty')).toHaveCount(0);
  await page.getByRole('combobox', { name: /version/i }).click();
  await expect(page.getByRole('option')).toHaveCount(3);
  await page.keyboard.press('Escape');

  await page.getByTestId('analysis-workbench-close').click();
  await expect(page.getByTestId('insights-agent-dock-frame')).toHaveAttribute('data-dock-state', 'put-away');
  await opener.click();
  await page.getByRole('tab', { name: 'Conversation' }).click();
  await expect(chat.getByRole('textbox')).toHaveValue(draft);
  expect(await hashes()).toEqual(before);
});
