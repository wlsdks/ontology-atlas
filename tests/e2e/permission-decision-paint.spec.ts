import { expect, test, type Locator, type Page } from '@playwright/test';

import { openLibraryWorkScenario } from './library-work-harness';

const PAINT = `(el) => {
  const s = getComputedStyle(el);
  return [s.backgroundColor, s.borderColor, s.color, s.fontWeight].join('|');
}`;

const ANSWERS = ['task-review-correct', 'task-review-defer', 'acp-permission-reject', 'acp-permission-allow'] as const;

const TITLE_PATCH = {
  slug: 'capabilities/probe-delivery',
  expected_mtime: 1_727_000_000_000,
  frontmatter: { title: 'Probe delivery pipeline' },
};

const LONG_REPLY = Array.from({ length: 24 }, (_, index) => `Line ${index + 1} of a reply long enough to scroll the transcript. `);

function settle(locator: Locator) {
  return locator.evaluate((el) => Promise.all(
    (el.closest('[data-surface-state]') ?? el).getAnimations({ subtree: true }).map((animation) => animation.finished),
  ));
}

async function openTitlePatch(page: Page, size: { width: number; height: number }, reply: readonly string[] = []) {
  await page.setViewportSize(size);
  const harness = await openLibraryWorkScenario(page, { permissionKind: 'ontology-patch', permissionInput: TITLE_PATCH });
  await harness.read(page);
  if (reply.length > 0) {
    await harness.stream(page, reply, { perSecond: 200 });
    await expect.poll(async () => (await harness.streamed(page)).emitted).toBe(reply.length);
  }
  await harness.wait(page);
  const card = page.getByTestId('acp-permission-card');
  await expect(card).toBeVisible();
  await expect(card.locator('xpath=ancestor::*[@data-surface-state][1]')).toHaveAttribute('data-surface-state', 'entered');
  await settle(card);
  return { harness, card };
}

test('the write decision is painted unlike every decision that writes nothing', async ({ page }) => {
  const harness = await openLibraryWorkScenario(page, { permissionKind: 'ontology-patch' });
  await harness.read(page);
  await harness.wait(page);
  const card = page.getByTestId('acp-permission-card');
  await expect(card).toBeVisible();

  const allow = card.getByTestId('acp-permission-allow');
  const allowPaint = await allow.evaluate(new Function('el', `return (${PAINT})(el);`) as (el: SVGElement | HTMLElement) => string);

  for (const id of ['task-review-correct', 'task-review-defer', 'acp-permission-reject']) {
    const other = card.getByTestId(id);
    if ((await other.count()) === 0) continue;
    const paint = await other.evaluate(new Function('el', `return (${PAINT})(el);`) as (el: SVGElement | HTMLElement) => string);
    expect(paint, `${id} is painted exactly like the button that writes`).not.toBe(allowPaint);
  }
});

test('the keyboard opens on the card title, never on an answer', async ({ page }) => {
  const harness = await openLibraryWorkScenario(page, { permissionKind: 'ontology-patch' });
  await harness.read(page);
  await harness.wait(page);
  await expect(page.getByTestId('acp-permission-card')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? null)).toBe('acp-permission-title');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
  expect(ANSWERS as readonly (string | null)[]).not.toContain(focused);
});

test('every answer is drawn as a button, and each tier keeps one height', async ({ page }) => {
  const { card } = await openTitlePatch(page, { width: 1040, height: 720 });
  const shapes = await card.evaluate((root, ids) => ids.map((id) => {
    const button = root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    const clear = (color: string) => color === 'transparent' || /rgba\(0, 0, 0, 0\)/.test(color);
    return {
      id,
      shaped: !clear(style.backgroundColor) || !clear(style.borderTopColor),
      top: Math.round(rect.top),
      height: rect.height,
      width: rect.width,
    };
  }), [...ANSWERS]);
  for (const shape of shapes) expect(shape.shaped, `${shape.id} reads as bare text`).toBe(true);
  const [correct, defer, reject, allow] = shapes;
  expect(correct.height).toBe(defer.height);
  expect(correct.top).toBe(defer.top);
  expect(reject.height).toBe(allow.height);
  expect(reject.width).toBeCloseTo(allow.width, 0);
  expect(reject.top).toBe(allow.top);
  expect(reject.height, 'the main pair is the larger tier').toBeGreaterThan(correct.height);
});

test('the value being written is in clear view at the smallest window, without opening Details', async ({ page }) => {
  const { card } = await openTitlePatch(page, { width: 1040, height: 720 });
  await expect(card.getByTestId('task-review-depth-summary')).toHaveAttribute('aria-checked', 'true');
  const value = card.getByTestId('task-review-value');
  await expect(value).toContainText('Probe delivery pipeline');
  const box = await page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="acp-permission-body-scroll"]')!.getBoundingClientRect();
    const shown = document.querySelector('[data-testid="task-review-value"] dd')!.getBoundingClientRect();
    const fade = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabbar-edge-fade'));
    return { top: shown.top, bottom: shown.bottom, scrollerTop: scroller.top, clearBottom: scroller.bottom - fade };
  });
  expect(box.top).toBeGreaterThanOrEqual(box.scrollerTop);
  expect(box.bottom, 'the written value sits under the scroller edge fade').toBeLessThanOrEqual(box.clearBottom);
});

test('the jump to latest stands on a band the transcript fades out of', async ({ page }) => {
  await openTitlePatch(page, { width: 1040, height: 720 }, LONG_REPLY);
  const transcript = page.getByTestId('acp-chat-transcript');
  await expect.poll(() => transcript.evaluate((el) => el.scrollHeight > el.clientHeight + 200)).toBe(true);
  await transcript.evaluate((el) => {
    el.scrollTop = 0;
  });
  const jump = page.getByTestId('acp-chat-jump-latest');
  await expect(jump).toBeVisible();
  await settle(jump);
  await expect(transcript).toHaveAttribute('data-jump-band', 'true');
  const geometry = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="acp-chat-transcript"]') as HTMLElement;
    const pill = document.querySelector('[data-testid="acp-chat-jump-latest"]')!.getBoundingClientRect();
    const tile = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-tile-size'));
    const mask = getComputedStyle(frame).maskImage || getComputedStyle(frame).getPropertyValue('-webkit-mask-image');
    return { pillTop: pill.top, pillBottom: pill.bottom, bandTop: frame.getBoundingClientRect().bottom - tile, frameBottom: frame.getBoundingClientRect().bottom, mask };
  });
  expect(geometry.mask).toMatch(/rgba\(0, 0, 0, 0\) calc\(100% - \d+(\.\d+)?px\)\)$/);
  expect(geometry.pillTop).toBeGreaterThanOrEqual(geometry.bandTop - 0.5);
  expect(geometry.pillBottom).toBeLessThanOrEqual(geometry.frameBottom + 0.5);
});
