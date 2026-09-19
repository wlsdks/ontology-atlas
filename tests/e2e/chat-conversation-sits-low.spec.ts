import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { installLibraryWorkHarness } from './library-work-harness';

/**
 * **A conversation settles at the bottom, against the hand** (owner selection, 2026-09-19).
 *
 * Measured before: across one whole journey at the dock's default width the newest thing said stood
 * 337, 544, 516, 590 and 504 pixels above the composer, and the transcript was never scrollable.
 * Sixty to seventy percent of the panel was empty air between the answer and the box.
 *
 * ⚠️ Three states, and each is measured where it exists. The short conversation is the one that
 * moved. The empty guide is the deliberate exception and must **not** move. The long conversation
 * is the trap: `justify-end` on a scroll box keeps pushing once the content overflows and puts the
 * top of the conversation out of reach, so this asserts the top is still reachable and unclipped.
 */
const COMPOSER_REACH = 100;

async function open(page: Page) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => window.localStorage.setItem('atlas.acp-chat.width', '520'));
  const harness = await installLibraryWorkHarness(page, {});
  await page.goto('/en/docs/');
  await page.getByRole('button', { name: /Open my folder/i }).click();
  await page.goto('/en/library/?guides=off&e2e=1');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  return harness;
}

const geometry = (page: Page) => page.evaluate(() => {
  const panel = document.querySelector('[data-testid="acp-chat-panel"]') as HTMLElement;
  const list = panel.querySelector('[data-testid="acp-chat-transcript"]') as HTMLElement;
  const composer = panel.querySelector('[data-testid="acp-chat-composer"]') as HTMLElement;
  const entries = [...list.querySelectorAll('[data-acp-entry], [data-testid="acp-chat-empty"]')];
  const first = entries[0] ?? null;
  const last = entries.at(-1) ?? null;
  return {
    entries: entries.length,
    firstTop: first ? Math.round(first.getBoundingClientRect().top) : null,
    lastBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null,
    composerTop: Math.round(composer.getBoundingClientRect().top),
    listTop: Math.round(list.getBoundingClientRect().top),
    listBottom: Math.round(list.getBoundingClientRect().bottom),
    scrollTop: Math.round(list.scrollTop),
    overflowing: list.scrollHeight > list.clientHeight + 1,
  };
});

test('a short conversation sits against the composer, not a screen away from it', async ({ page }) => {
  const harness = await open(page);
  const chat = page.getByTestId('acp-chat-panel');
  await chat.getByRole('textbox').fill('Which pages went stale?');
  await page.getByTestId('acp-chat-send').click();
  await harness.answer(page, 'Only the architecture page is stale.');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  await page.waitForTimeout(400);

  const shape = await geometry(page);
  expect(shape.overflowing, 'a two-line conversation should not be scrolling yet').toBe(false);
  expect(
    shape.composerTop - shape.lastBottom!,
    'the newest thing said is a screen away from the box the person types in',
  ).toBeLessThanOrEqual(COMPOSER_REACH);
});

test('the empty guide keeps its own centre — it is the one thing that should not sit against the box', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(400);
  const shape = await geometry(page);
  expect(shape.entries).toBe(1);
  const above = shape.firstTop! - shape.listTop;
  const below = shape.listBottom - shape.lastBottom!;
  // Centred, not bottom-aligned: the space above and below the guide is roughly equal.
  expect(Math.abs(above - below), 'the empty guide stopped being centred').toBeLessThanOrEqual(40);
  expect(below, 'the empty guide fell to the bottom of the box').toBeGreaterThan(COMPOSER_REACH);
});

test('a long conversation still scrolls, and its top is still reachable', async ({ page }) => {
  const harness = await open(page);
  const chat = page.getByTestId('acp-chat-panel');
  for (let turn = 0; turn < 6; turn += 1) {
    await chat.getByRole('textbox').fill(`Question ${turn}, long enough to take a couple of lines in the dock.`);
    await page.getByTestId('acp-chat-send').click();
    await harness.answer(page, `Answer ${turn}. ${'It carries several sentences so the transcript grows past its own box. '.repeat(3)}`);
    await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  }
  await page.waitForTimeout(400);

  const grown = await geometry(page);
  expect(grown.overflowing, 'six turns should overflow the transcript').toBe(true);

  // ⚠️ The trap: with `justify-end` the first turn would be pushed above the scroll origin and
  // could never be scrolled back to. An auto margin collapses to zero once the content overflows.
  await page.getByTestId('acp-chat-transcript').evaluate((list) => { list.scrollTop = 0; });
  // The transcript keeps `scroll-behavior: smooth` from its last glide, so the scroll animates.
  await expect
    .poll(async () => (await geometry(page)).scrollTop, { timeout: 5_000 })
    .toBe(0);
  const atTop = await geometry(page);
  expect(
    atTop.firstTop! - atTop.listTop,
    'the first turn sits above the top of the box, out of reach',
  ).toBeGreaterThanOrEqual(-1);
});
