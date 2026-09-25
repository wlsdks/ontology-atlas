import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { installLibraryWorkHarness } from './library-work-harness';
import { openFolderFromFirstRun } from './open-folder';

/**
 * **The conversation dock behaves as one surface in both of its homes** (2026-09-25).
 *
 * Measured on the map's dock and the Library's, with the protocol-level harness:
 *
 * - Escape in the map's composer closed the whole dock and threw the typed draft away, while the
 *   Library's dock ignored the key and kept its draft. One rule now: a composer holding a sentence
 *   claims Escape, and from anywhere else the key puts the dock away.
 * - Focus fell to `<body>` after Stop, after answering a permission card, and on opening and
 *   putting away the Library's dock.
 * - After "Don't" the write's row said "running" and then "failed" — the person's own answer
 *   reported back as a fault — and a write on the vault server's prefix printed its function name.
 * - The resize handle straddled the dock's clipped edge, so part of it and its focus mark were cut.
 * - At 1040×720 the permission card left the transcript 96px, with the call it asks about out of
 *   view.
 *
 * Each case below measures the thing a person meets — where focus is, what the row says, what is
 * painted where — rather than the component state that produced it.
 */

async function openMapDock(page: Page, size = { width: 1512, height: 949 }) {
  await page.setViewportSize(size);
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, {});
  await openFolderFromFirstRun(page, 'ko');
  await page.goto('/ko/?guides=off&e2e=1');
  await page.getByTestId('topology-vault-agent-toggle').click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  return harness;
}

async function openLibraryDock(page: Page) {
  await page.setViewportSize({ width: 1512, height: 949 });
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, {});
  await openFolderFromFirstRun(page, 'ko');
  await page.goto('/ko/library/?guides=off&e2e=1');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  return harness;
}

const composer = (page: Page) => page.getByTestId('acp-chat-panel').getByRole('textbox');

/** What holds focus, named the way a failure message can be read. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return 'BODY';
    return active.getAttribute('data-testid') ?? active.getAttribute('aria-label') ?? active.tagName;
  });

async function sendAndWaitForCard(page: Page, harness: Awaited<ReturnType<typeof installLibraryWorkHarness>>, text: string) {
  await composer(page).fill(text);
  await page.getByTestId('acp-chat-send').click();
  await harness.read(page);
  await expect(page.locator('[data-acp-entry="tool"]').first()).toBeVisible();
  await harness.wait(page);
  await expect(page.getByTestId('acp-permission-card')).toBeVisible();
}

test('Escape in the map composer keeps the dock and the draft; an empty composer closes it', async ({ page }) => {
  await openMapDock(page);
  const chip = page.getByTestId('topology-vault-agent-toggle');

  await composer(page).fill('초안 문장');
  await composer(page).press('Escape');
  await expect(page.getByTestId('acp-chat-panel'), 'Escape over a draft closed the dock').toBeVisible();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  await expect(composer(page)).toHaveValue('초안 문장');

  // Put away by the X with the draft still there; the chip brings the same sentence back.
  await page.getByTestId('analysis-workbench-close').click();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('acp-chat-panel')).toBeHidden();
  await chip.click();
  await expect(composer(page), 'the draft did not survive putting the dock away').toHaveValue('초안 문장');

  await composer(page).fill('');
  await composer(page).press('Escape');
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
});

test('the Library dock follows the same Escape rule and returns focus to its door', async ({ page }) => {
  await openLibraryDock(page);
  await expect.poll(() => focused(page), { message: 'opening left focus outside the composer' }).toBe('무엇을 시킬지 적어요');

  await composer(page).fill('자료실 초안');
  await composer(page).press('Escape');
  await expect(page.getByTestId('library-agent-dock-frame')).toHaveAttribute('data-dock-state', 'open');

  await composer(page).fill('');
  await composer(page).press('Escape');
  await expect(page.getByTestId('library-agent-dock-frame')).toHaveAttribute('data-dock-state', 'put-away');
  await expect.poll(() => focused(page), { message: 'putting the dock away dropped focus' }).toBe('library-open-conversation');
});

test('after Stop and after declining a write, focus is in the composer and the row says it was declined', async ({ page }) => {
  const harness = await openLibraryDock(page);
  await sendAndWaitForCard(page, harness, '정리해 줘');

  const row = page.locator('[data-acp-entry="tool"]').nth(1);
  // A write on the vault server's prefix the label table does not know reads as its kind.
  await expect(row).not.toContainText('write_wiki_file');
  // A running Korean row does not say the work is already done.
  await expect(page.locator('[data-acp-entry="tool"]').first()).not.toContainText('읽었어요');

  await page.getByTestId('acp-permission-reject').click();
  await expect.poll(() => focused(page), { message: 'answering the card dropped focus' }).toBe('무엇을 시킬지 적어요');
  await expect(row.getByTestId('acp-chat-tool-outcome')).toHaveText('거절함');
  await harness.finish(page);
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  await expect(row.getByTestId('acp-chat-tool-outcome'), 'the declined write was reported as a failure').toHaveText('거절함');

  await composer(page).fill('다시 해 줘');
  await page.getByTestId('acp-chat-send').click();
  await expect(page.getByTestId('acp-chat-stop')).toBeVisible();
  await page.getByTestId('acp-chat-stop').click();
  await expect.poll(() => focused(page), { message: 'Stop dropped focus' }).toBe('무엇을 시킬지 적어요');
});

test('the resize handle and its focus mark lie inside the dock it resizes', async ({ page }) => {
  await openLibraryDock(page);
  const handle = page.getByTestId('acp-chat-resize');
  // Arrive by keyboard, so the focus mark being measured is the one a keyboard user sees.
  await handle.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect.poll(() => focused(page)).toBe('acp-chat-resize');
  const geometry = await page.evaluate(() => {
    const handleEl = document.querySelector('[data-testid="acp-chat-resize"]')!;
    const dock = document.querySelector('[data-testid="library-agent-dock"]')!.getBoundingClientRect();
    const box = handleEl.getBoundingClientRect();
    const style = getComputedStyle(handleEl);
    const midY = box.top + box.height / 2;
    // Every column of the handle is either the handle itself or its own line.
    const painted = [0.5, 2.5, 4.5, 6.5].map((dx) => {
      const top = document.elementFromPoint(box.left + dx, midY);
      return top === handleEl;
    });
    return { handle: [box.left, box.right], dock: [dock.left, dock.right], outlineOffset: style.outlineOffset, painted };
  });
  expect(geometry.handle[0], `handle ${geometry.handle} starts outside the dock ${geometry.dock}`).toBeGreaterThanOrEqual(geometry.dock[0]);
  expect(geometry.painted, 'part of the handle is not reachable where it is drawn').toEqual([true, true, true, true]);
  expect(geometry.outlineOffset, 'the focus mark is drawn outward, where the dock clips it').toBe('-2px');
});

test('at 1040×720 the permission card leaves the call it asks about in view', async ({ page }) => {
  const harness = await openMapDock(page, { width: 1040, height: 720 });
  await sendAndWaitForCard(page, harness, '첫째 줄\n둘째 줄\n셋째 줄\n넷째 줄\n다섯째 줄\n여섯째 줄\n일곱째 줄');
  const waiting = page.locator('[data-acp-entry="tool"][data-tool-phase="awaiting"]');
  await expect(waiting).toHaveCount(1);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const row = document.querySelector('[data-acp-entry="tool"][data-tool-phase="awaiting"]');
          if (!row) return 'no row';
          const box = row.getBoundingClientRect();
          const top = document.elementFromPoint(box.left + 24, box.top + box.height / 2);
          return top && row.contains(top) ? 'visible' : `covered by ${top?.closest('[data-testid]')?.getAttribute('data-testid') ?? top?.tagName}`;
        }),
      { message: 'the waiting call is not in view above the card' },
    )
    .toBe('visible');
});
