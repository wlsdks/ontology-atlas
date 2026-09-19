import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { installLibraryWorkHarness } from './library-work-harness';

/**
 * **A fenced block that runs past the panel says so.**
 *
 * Measured in the rendered dock on 2026-09-19: a command in an answer drew as
 * `pnpm atlas compile --page wiki/archite` at a 320px panel — cut flush at the right edge, with no
 * fade, no rule and no resting scrollbar, because a WebView's overlay scrollbars appear only while
 * the pointer moves. A truncated sentence is visibly truncated; a truncated **command** looks
 * complete, and copying it runs the wrong thing.
 *
 * ⚠️ **Both states are measured at a width where that state exists.** A mask painted
 * unconditionally states the opposite of the fact it exists to state, and a gate that only ever
 * looks at the narrow case would never catch that. So the same answer is read at the width where
 * the command fits and at the width where it does not.
 */
/**
 * The command measured in the dock, unchanged: it fits the panel's default width and runs past its
 * documented floor. A longer one would prove only that a very long command overflows everywhere.
 */
const COMMAND = 'pnpm atlas compile --page wiki/architecture.md';
const ANSWER = [
  'Recompiling rereads the source and rewrites only the Facts section.',
  '',
  '```bash',
  COMMAND,
  '```',
  '',
  '| Page | Status |',
  '| --- | --- |',
  '| architecture | stale |',
].join('\n');

/** The panel's documented default, where the command fits, and its documented floor, where it does not. */
const FITS = 520;
const OVERFLOWS = 320;

async function answerAt(page: Page, width: number) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await page.addInitScript((stored) => {
    window.localStorage.setItem('atlas.acp-chat.width', String(stored));
  }, width);
  const harness = await installLibraryWorkHarness(page, {});
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder/i }).click();
  await page.goto('/en/library/?guides=off&e2e=1');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  const chat = page.getByTestId('acp-chat-panel');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  await chat.getByRole('textbox').fill('How do I refresh it?');
  await page.getByTestId('acp-chat-send').click();
  await harness.answer(page, ANSWER);
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  await expect(page.getByTestId('acp-chat-code-block')).toBeVisible();
}

const readBlock = (page: Page, testId: string) => page.evaluate((id) => {
  const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  if (!element) throw new Error(`${id} is not in the transcript`);
  return {
    hidden: Math.round(element.scrollWidth - element.clientWidth),
    edge: element.getAttribute('data-edge-overflow'),
    masked: getComputedStyle(element).maskImage !== 'none',
  };
}, testId);

test(`a command that fits is not faded (${FITS})`, async ({ page }) => {
  await answerAt(page, FITS);
  const block = await readBlock(page, 'acp-chat-code-block');
  expect(block.hidden, 'the command should fit at the default width').toBeLessThanOrEqual(1);
  expect(block.edge, 'nothing is hidden, so no edge is marked').toBeNull();
  expect(block.masked, 'a mask over a command that fits blurs its ending for no reason').toBe(false);
});

test(`a command that runs past the edge fades there (${OVERFLOWS})`, async ({ page }) => {
  await answerAt(page, OVERFLOWS);
  const block = await readBlock(page, 'acp-chat-code-block');
  expect(block.hidden, 'the command should not fit at the documented floor').toBeGreaterThan(1);
  expect(block.edge).toBe('end');
  expect(block.masked, 'the hidden end of a command has to be visible as hidden').toBe(true);
});

test(`scrolling a faded block moves the fade to the edge that is now hiding (${OVERFLOWS})`, async ({ page }) => {
  await answerAt(page, OVERFLOWS);
  await page.getByTestId('acp-chat-code-block').evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect
    .poll(async () => (await readBlock(page, 'acp-chat-code-block')).edge)
    .toBe('start');
});

test(`a table that fits carries no fade either (${OVERFLOWS})`, async ({ page }) => {
  await answerAt(page, OVERFLOWS);
  const table = await readBlock(page, 'acp-chat-markdown-table');
  expect(table.hidden).toBeLessThanOrEqual(1);
  expect(table.edge).toBeNull();
  expect(table.masked).toBe(false);
});
