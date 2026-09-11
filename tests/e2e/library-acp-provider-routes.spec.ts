import { createHash } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { parseFrontmatter } from '../../src/shared/lib/parse-frontmatter';
import { seedFirstRunSeen } from './first-run-seed';
import {
  installLibraryWorkHarness,
  LIBRARY_WORK_CODEX_CONFIG,
  LIBRARY_WORK_MCP_BINARY,
  type LibraryWorkHarness,
  type LibraryWorkRuntimeId,
} from './library-work-harness';

const VAULT_ROOT = '/Users/probe/Ontology Atlas/launch';
const SOURCE = 'sources/retention.md';
const AUDIT = 'sources/audit.md';
const ANSWER = 'wiki/answers/retention.md';
const ORIGINAL = 'Keep records for 24 days.\nThe owner must approve external communication.\n';
const REVISED = 'Keep records for 18 days, replacing the previous 24-day guidance.\nThe owner must approve external communication.\n';
const AUDIT_TEXT = 'The audit worksheet lists 24 days.\nThe worksheet review is pending.\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

const OLD_BODY = `## Summary
The recorded period is 24 days.

## Facts
- Storage guidance says 24 days. [[src:${SOURCE}#l1]]

## Decisions
- Human note: do not announce externally until the owner approves. [[src:${SOURCE}#l2]]

## Open questions
- The audit worksheet is not yet reviewed. [[src:${AUDIT}#l2]]

## Not in sources
- No signed approval was provided.
`;

const REFRESH_BODY = `## Summary
The storage guidance changed to 18 days; the audit worksheet still disagrees.

## Facts
- Storage guidance now says 18 days. [[src:${SOURCE}#l1]]

## Decisions
- Human note: do not announce externally until the owner approves. [[src:${SOURCE}#l2]]

## Open questions
- The audit worksheet is not yet reviewed. [[src:${AUDIT}#l2]]
- The audit worksheet says 24 days while storage guidance says 18. Both accounts remain unresolved. [[src:${AUDIT}#l1]] [[src:${SOURCE}#l1]]

## Not in sources
- No signed approval was provided.
`;

const OLD_PAGE = `---
title: What is the retention policy?
created_by: human
compiled_at: 2026-09-10T00:00:00Z
sources: [${SOURCE}, ${AUDIT}]
source_hash:
  ${SOURCE}: unmeasured
  ${AUDIT}: unmeasured
status: draft
summary: Retained account of the policy.
answer_thread: wiki/answers/retention
answer_observed_at: 2026-09-10T00:00:00Z
answer_scope_sources: [${SOURCE}, ${AUDIT}]
answer_source_observations:
  ${SOURCE}: ${hash(ORIGINAL)}
  ${AUDIT}: ${hash(AUDIT_TEXT)}
---
${OLD_BODY}`;

const BASE_FILES: Record<string, string> = {
  'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Knowledge review\nslug: knowledge-review\n---\n# Knowledge review\n',
  [SOURCE]: ORIGINAL,
  [AUDIT]: AUDIT_TEXT,
  [ANSWER]: OLD_PAGE,
};

type HarnessCall = Awaited<ReturnType<LibraryWorkHarness['snapshot']>>['calls'][number];

function rpcParams(call: HarnessCall): Record<string, unknown> {
  const params = call.params;
  return params && typeof params === 'object' && !Array.isArray(params)
    ? (params as { params?: unknown }).params as Record<string, unknown>
    : {};
}

function promptText(call: HarnessCall): string {
  const prompt = rpcParams(call).prompt;
  return Array.isArray(prompt)
    ? prompt.map((block) => (block && typeof block === 'object' && 'text' in block ? String(block.text) : '')).join('\n')
    : String(prompt ?? '');
}

async function openLibrary(page: Page, runtimeId: LibraryWorkRuntimeId): Promise<LibraryWorkHarness> {
  await seedFirstRunSeen(page);
  const files = runtimeId === 'codex-acp'
    ? { ...BASE_FILES, '.codex/config.toml': LIBRARY_WORK_CODEX_CONFIG }
    : BASE_FILES;
  const harness = await installLibraryWorkHarness(page, { files, runtimeId });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder/i }).click();
  await page.getByRole('heading', { name: 'Map' }).waitFor();
  await page.getByTestId('app-nav-rail-item-library').click();
  await page.getByTestId('library-graph-canvas').waitFor();
  return harness;
}

async function expectProviderSession(page: Page, harness: LibraryWorkHarness, runtimeId: LibraryWorkRuntimeId) {
  const initial = await harness.snapshot(page);
  const start = initial.calls.find((call) => call.method === 'acp_start');
  expect(start?.params).toMatchObject({ runtimeId, cwd: VAULT_ROOT });

  const sessionNew = initial.calls.find((call) => call.method === 'session/new');
  expect(sessionNew, `${runtimeId} must create an ACP session`).toBeDefined();
  const params = rpcParams(sessionNew!);
  expect(params.cwd).toBe(VAULT_ROOT);
  if (runtimeId === 'claude-acp') {
    expect(params.mcpServers).toEqual([
      {
        name: 'atlas-vault',
        command: LIBRARY_WORK_MCP_BINARY,
        args: [],
        env: [{ name: 'OATLAS_VAULT', value: VAULT_ROOT }],
      },
    ]);
  } else {
    // Codex reads a valid current-vault `.codex/config.toml` itself. Wiring another server would
    // create the measured duplicate tool/process, so this route deliberately sends no mcpServers.
    expect(params.mcpServers).toEqual([]);
    expect(initial.files['.codex/config.toml']).toBe(LIBRARY_WORK_CODEX_CONFIG);
    expect(initial.calls.some((call) => call.method === 'session/set_mode' && rpcParams(call).modeId === 'read-only')).toBe(true);
  }
}

async function startRefresh(page: Page, harness: LibraryWorkHarness) {
  await page.getByTestId('library-questions-open').click();
  await expect(page.getByTestId('answer-evidence-state')).toHaveAttribute('data-state', 'unchanged');
  await harness.mutateSource(page, SOURCE, REVISED);
  await expect(page.getByTestId('answer-evidence-state')).toHaveAttribute('data-state', 'changed');
  await page.getByTestId('answer-refresh-start').click();
  await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
  const prompt = (await harness.snapshot(page)).calls.find((call) => call.method === 'session/prompt');
  expect(promptText(prompt!)).toContain('Refresh one retained answer as a proposal.');
  expect(promptText(prompt!)).toContain('Do not write, edit or delete any file.');
}

for (const runtimeId of ['claude-acp', 'codex-acp'] as const) {
  test(`${runtimeId} receives the compile click time rather than an inferred timestamp`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-11T01:02:03Z'));
    const harness = await openLibrary(page, runtimeId);
    await page.getByTestId('library-index-segment-wiki').click();
    const clickedAt = '2026-09-11T04:05:06Z';
    await page.clock.setFixedTime(new Date(clickedAt));
    await page.getByTestId('library-compile').click();
    await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/prompt')).toBe(true);
    await expectProviderSession(page, harness, runtimeId);
    const snapshot = await harness.snapshot(page);
    const prompt = snapshot.calls.find((call) => call.method === 'session/prompt');
    expect(promptText(prompt!)).toContain(`created_by: agent:${runtimeId}`);
    expect(promptText(prompt!)).toContain('`read_source`');
    expect(promptText(prompt!)).not.toContain('`propose_wiki_page`');
    expect(promptText(prompt!)).not.toContain('A page that fits the contract is written at once');
    const timestamps = [...promptText(prompt!).matchAll(/compiled_at:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/g)].map((match) => match[1]);
    expect(timestamps).toContain(clickedAt);
    expect(timestamps).not.toContain('2026-09-11T01:02:03Z');
    expect(snapshot.files[ANSWER]).toBe(OLD_PAGE);
    expect(snapshot.files[SOURCE]).toBe(ORIGINAL);
    expect(snapshot.writes).toHaveLength(0);
  });

  test(`${runtimeId} refreshes the same retained answer through ACP and waits for confirmation`, async ({ page }) => {
    const harness = await openLibrary(page, runtimeId);
    await startRefresh(page, harness);
    await expectProviderSession(page, harness, runtimeId);

    await harness.answer(page, REFRESH_BODY);
    await page.getByTestId('answer-review-open').click();
    const comparison = page.getByTestId('answer-comparison');
    await expect(comparison).toBeVisible();
    await expect(comparison.getByTestId('answer-comparison-before')).toContainText('24 days');
    await expect(comparison.getByTestId('answer-comparison-after')).toContainText('Both accounts remain unresolved');
    await expect(comparison.getByTestId('answer-comparison-after')).toContainText('Summary');
    await expect(comparison.getByTestId('answer-comparison-after')).toContainText('Facts');
    await expect(comparison.getByTestId('answer-comparison-after')).toContainText('Decisions');
    await expect(comparison.getByTestId('answer-comparison-after')).toContainText('Open questions');
    await expect(comparison.getByTestId('answer-comparison-after')).toContainText('Not in sources');

    const beforeConfirm = await harness.snapshot(page);
    expect(beforeConfirm.files[ANSWER]).toBe(OLD_PAGE);
    expect(beforeConfirm.writes).toHaveLength(1);
    expect(beforeConfirm.writes[0]?.relativePath).toBe(SOURCE);

    await comparison.getByTestId('answer-revision-save').click();
    await expect(comparison).not.toBeVisible();
    const saved = await harness.snapshot(page);
    const nextPath = Object.keys(saved.files).find((path) => path.startsWith('wiki/answers/') && path !== ANSWER);
    expect(nextPath).toBeDefined();
    expect(saved.files[ANSWER]).toBe(OLD_PAGE);
    expect(saved.files[SOURCE]).toBe(REVISED);
    expect(parseFrontmatter(saved.files[nextPath!]).frontmatter.answer_previous).toBe('wiki/answers/retention');
    expect(saved.writes).toHaveLength(2);
    expect(saved.writes[1]?.relativePath).toBe(nextPath);
  });

  test(`${runtimeId} cancels an in-flight retained answer refresh without writing`, async ({ page }) => {
    const harness = await openLibrary(page, runtimeId);
    await startRefresh(page, harness);
    await expectProviderSession(page, harness, runtimeId);

    const beforeCancel = await harness.snapshot(page);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByTestId('retained-answer-context')).toContainText('did not complete');
    await expect.poll(async () => (await harness.snapshot(page)).calls.some((call) => call.method === 'session/cancel')).toBe(true);

    const afterCancel = await harness.snapshot(page);
    expect(afterCancel.files[ANSWER]).toBe(beforeCancel.files[ANSWER]);
    expect(afterCancel.files[SOURCE]).toBe(beforeCancel.files[SOURCE]);
    expect(afterCancel.writes).toEqual(beforeCancel.writes);
    expect(Object.keys(afterCancel.files).filter((path) => path.startsWith('wiki/answers/'))).toEqual([ANSWER]);
  });
}
