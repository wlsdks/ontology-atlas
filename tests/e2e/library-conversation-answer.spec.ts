import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { installLibraryWorkHarness } from './library-work-harness';

const SOURCE = 'sources/room-capacity.md';
const SOURCE_TEXT = 'The current room capacity is 18 participants.\n';
const PAGE = [
  '---', 'title: Room notes', 'created_by: human', 'compiled_at: 2026-09-09T00:00:00Z',
  'sources: []', 'source_hash: {}', 'status: draft', 'summary: Notes to review.', '---', '',
  '## Summary', '', 'Room notes.', '', '## Facts', '', '## Decisions', '',
  '## Open questions', '', '## Not in sources', '',
].join('\n');

test('ordinary Library questions can be explicitly filed and do not impersonate Compile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, { files: {
    [SOURCE]: SOURCE_TEXT,
    'wiki/room.md': PAGE,
  } });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder/i }).click();
  await expect(page.getByTestId('library-page')).toBeVisible();
  await expect(page.getByTestId('app-nav-rail-item-map')).toHaveCount(0);
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  const chat = page.getByTestId('acp-chat-panel');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  await expect(page.getByTestId('acp-chat-empty')).not.toContainText(/map/i);

  const ask = async (question: string) => {
    await chat.getByRole('textbox').fill(question);
    await page.getByTestId('acp-chat-send').click();
    await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
    await expect(page.getByTestId('library-shelf-compiling')).toHaveCount(0);
    await expect(page.getByTestId('library-file-answer')).toHaveCount(0);
  };
  await ask('What is the current capacity?');
  await harness.answer(page, `The capacity is 18 participants (${SOURCE}:1).`);
  await expect(page.getByTestId('library-file-answer')).toBeVisible();
  expect((await harness.snapshot(page)).writes).toEqual([]);

  await page.getByTestId('library-file-answer').click();
  await expect.poll(async () => Object.keys((await harness.snapshot(page)).files).filter((path) => path.startsWith('wiki/answers/'))).toHaveLength(1);
  const filed = await harness.snapshot(page);
  const answerPath = Object.keys(filed.files).find((path) => path.startsWith('wiki/answers/'))!;
  expect(filed.files[answerPath]).toContain('title: "What is the current capacity?"');
  expect(filed.files[answerPath]).toContain(`[[src:${SOURCE}#l1]]`);
  expect(filed.files[answerPath]).toContain(`${SOURCE}: unmeasured`);
  expect(filed.files[SOURCE]).toBe(SOURCE_TEXT);
  expect(filed.files['wiki/room.md']).toBe(PAGE);
  expect(filed.files[answerPath]).not.toContain('\nkind:');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => answerPath in (await harness.snapshot(page)).files).toBe(false);

  // A completed explicit request remains in the dock's opening envelope. Its kind
  // must not leak into the next ordinary question or its retained answer title.
  await page.getByTestId('library-compile').click();
  await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
  await expect(page.getByTestId('library-shelf-compiling')).toBeVisible();
  await harness.answer(page, 'No page changes were needed.');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  await expect.poll(async () => 'wiki/_log.md' in (await harness.snapshot(page)).files).toBe(true);
  const afterCompile = await harness.snapshot(page);
  await ask('Is the earlier capacity still current?');
  await harness.answer(page, `The current capacity remains 18 (${SOURCE}:1).`);
  await expect(page.getByTestId('library-file-answer')).toBeVisible();
  expect((await harness.snapshot(page)).writes).toEqual(afterCompile.writes);
  await page.getByTestId('library-file-answer').click();
  await expect.poll(async () => Object.values((await harness.snapshot(page)).files).some((text) => text.includes('title: "Is the earlier capacity still current?"'))).toBe(true);
});

async function openConversation(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, { files: { [SOURCE]: SOURCE_TEXT, 'wiki/room.md': PAGE } });
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder/i }).click();
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  const chat = page.getByTestId('acp-chat-panel');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  return {
    harness,
    async ask(question: string) {
      await chat.getByRole('textbox').fill(question);
      await page.getByTestId('acp-chat-send').click();
      await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
    },
    async answer(text: string) {
      await harness.answer(page, `${text} (${SOURCE}:1).`);
      await expect(page.getByTestId('library-file-answer')).toBeVisible();
    },
    async file(count: number) {
      await page.getByTestId('library-file-answer').click();
      await expect.poll(async () => Object.keys((await harness.snapshot(page)).files).filter(path => path.startsWith('wiki/answers/'))).toHaveLength(count);
      return (await harness.snapshot(page)).files;
    },
  };
}

function answerPaths(files: Record<string, string>) {
  return Object.keys(files).filter(path => path.startsWith('wiki/answers/'));
}

function filedToast(page: import('@playwright/test').Page, path: string) {
  return page.locator('[data-sonner-toast]').filter({ hasText: path.replace(/^wiki\//, '').replace(/\.md$/, '') });
}

test('filing the same question twice preserves the first page through Undo', async ({ page }) => {
  const flow = await openConversation(page);
  await flow.ask('What is the current capacity?');
  await flow.answer('First answer: 18 participants');
  const first = await flow.file(1);
  const firstPath = answerPaths(first)[0];
  await flow.ask('What is the current capacity?');
  await flow.answer('Second answer: still 18 participants');
  const second = await flow.file(2);
  const secondPath = answerPaths(second).find(path => path !== firstPath)!;
  expect(second[secondPath]).toContain('Second answer');
  expect(second[firstPath]).toBe(first[firstPath]);
  await filedToast(page, secondPath).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => answerPaths((await flow.harness.snapshot(page)).files)).toEqual([firstPath]);
  expect((await flow.harness.snapshot(page)).files[firstPath]).toBe(first[firstPath]);
});

for (const undoAfterAnswer of [false, true]) {
  test(`Undo of an earlier filing cannot replace a later ${undoAfterAnswer ? 'completed' : 'pending'} answer`, async ({ page }) => {
    const flow = await openConversation(page);
    await flow.ask('Question A');
    await flow.answer('Answer A');
    const first = await flow.file(1);
    const firstPath = answerPaths(first)[0];
    await flow.ask('Question B');
    if (undoAfterAnswer) await flow.answer('Answer B');
    await filedToast(page, firstPath).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => firstPath in (await flow.harness.snapshot(page)).files).toBe(false);
    if (!undoAfterAnswer) {
      await expect(page.getByTestId('library-file-answer')).toHaveCount(0);
      await flow.answer('Answer B');
    }
    const second = await flow.file(1);
    const secondText = second[answerPaths(second)[0]];
    expect(secondText).toContain('title: "Question B"');
    expect(secondText).toContain('Answer B');
    expect(secondText).not.toContain('Answer A');
  });
}

test('a delayed filing is single-flight and cannot clear the next answer', async ({ page }) => {
  const flow = await openConversation(page);
  await flow.ask('Question A');
  await flow.answer('Answer A');
  await page.evaluate(() => {
    const host = window as unknown as {
      __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
      __delayedCreate?: { attempts: number; release: () => void };
    };
    const original = host.__TAURI_INTERNALS__.invoke;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const state = { attempts: 0, release };
    host.__delayedCreate = state;
    host.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'create_vault_text_file') {
        state.attempts += 1;
        if (state.attempts === 1) await gate;
      }
      return original(command, args);
    };
    const button = document.querySelector<HTMLButtonElement>('[data-testid="library-file-answer"]')!;
    button.click();
    button.click();
  });
  await expect(page.getByTestId('library-file-answer')).toBeDisabled();
  await expect(page.getByTestId('library-file-answer')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId('library-file-answer')).toContainText('Writing');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __delayedCreate: { attempts: number } }).__delayedCreate.attempts)).toBe(1);
  await flow.ask('Question B');
  await flow.answer('Answer B');
  await page.evaluate(() => (window as unknown as { __delayedCreate: { release: () => void } }).__delayedCreate.release());
  await expect.poll(async () => answerPaths((await flow.harness.snapshot(page)).files)).toHaveLength(1);
  await expect(page.getByTestId('library-file-answer')).toBeEnabled();
  const files = await flow.file(2);
  expect(Object.values(files).some(text => text.includes('title: "Question B"') && text.includes('Answer B'))).toBe(true);
  expect(Object.values(files).some(text => text.includes('title: "Question A"') && text.includes('Answer A'))).toBe(true);
});
