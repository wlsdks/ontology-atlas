import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { installLibraryWorkHarness, type LibraryWorkHarness } from './library-work-harness';
import { openFolderFromFirstRun } from './open-folder';
import { waitFrames } from './settle';

/** A person scrolls up and reads while an answer streams: a real wheel against the protocol harness. */

const RATE = 45;
/** A trackpad flick with momentum, about 370px up. */
const FLICK = [-4, -8, -12, -18, -24, -30, -30, -28, -26, -24, -22, -20, -18, -16, -14, -12, -10, -9, -8, -7, -6, -5, -4, -3, -3, -2, -2, -1, -1, -1];

const EARLIER_ANSWER = [
  'The compile step rereads every source the page cites and rewrites only the Facts section.',
  '',
  '- **Facts** — a page whose sources changed since the last compile is marked stale.',
  '- `wiki/architecture.md` keeps its place in the index when it is renamed.',
  '- Nothing is written until you allow it, and the card names the file first.',
  '',
  '```bash',
  'pnpm atlas compile --page wiki/architecture.md --force',
  '```',
  '',
  'Two concepts that share a slug prefix are still separate concepts, and the check says which is which.',
].join('\n');

function streamedAnswer(chunks: number): string[] {
  const words = Array.from({ length: chunks * 2 }, (_, index) =>
    index % 40 === 39 ? '\n\n' : index % 13 === 12 ? '`capabilities/checkout` ' : `word${index % 97} `,
  );
  return Array.from({ length: chunks }, (_, index) => words[index * 2] + words[index * 2 + 1]);
}

async function openStreamingDock(page: Page, width = 520): Promise<LibraryWorkHarness> {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await page.addInitScript((stored) => {
    window.localStorage.setItem('atlas.acp-chat.width', String(stored));
  }, width);
  const harness = await installLibraryWorkHarness(page, {});
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/library/?guides=off&e2e=1');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  const chat = page.getByTestId('acp-chat-panel');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  for (let turn = 0; turn < 6; turn += 1) {
    await chat.getByRole('textbox').fill(`Question ${turn + 1}: what changed?`);
    await page.getByTestId('acp-chat-send').click();
    await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
    await harness.answer(page, EARLIER_ANSWER);
    await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  }
  await chat.getByRole('textbox').fill('Walk me through the whole compile.');
  await page.getByTestId('acp-chat-send').click();
  await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
  return harness;
}

const transcriptBox = (page: Page) =>
  page.getByTestId('acp-chat-transcript').evaluate((list) => ({
    top: list.scrollTop,
    distance: list.scrollHeight - list.clientHeight - list.scrollTop,
  }));

async function untilStreamed(page: Page, emitted: number) {
  await page.waitForFunction(
    (count) =>
      ((window as unknown as { __atlasLibraryWorkHarness?: { streamed(): { emitted: number } } })
        .__atlasLibraryWorkHarness?.streamed().emitted ?? 0) >= count,
    emitted,
  );
}

async function flickUp(page: Page) {
  const box = await page.getByTestId('acp-chat-transcript').boundingBox();
  if (!box) throw new Error('the transcript has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (const delta of FLICK) {
    await page.mouse.wheel(0, delta);
    await waitFrames(page, 1);
  }
  await waitFrames(page, 2);
}

async function driftWhile(page: Page, top: number, untilEmitted: number) {
  await page.getByTestId('acp-chat-transcript').evaluate((list, rest) => {
    const probe = window as unknown as { __readDrift?: { max: number; running: boolean } };
    probe.__readDrift = { max: 0, running: true };
    const sample = () => {
      if (!probe.__readDrift?.running) return;
      probe.__readDrift.max = Math.max(probe.__readDrift.max, Math.abs(list.scrollTop - rest));
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, top);
  await untilStreamed(page, untilEmitted);
  await waitFrames(page, 2);
  return page.evaluate(() => {
    const probe = window as unknown as { __readDrift?: { max: number; running: boolean } };
    if (!probe.__readDrift) throw new Error('drift probe missing');
    probe.__readDrift.running = false;
    return probe.__readDrift.max;
  });
}

test('a reader who scrolls up mid-answer stays where they stopped, and the door brings them back', async ({ page }) => {
  const harness = await openStreamingDock(page);
  const chunks = streamedAnswer(640);
  await harness.stream(page, chunks, { perSecond: RATE, endTurn: true });
  await untilStreamed(page, 60);

  const box = await page.getByTestId('acp-chat-transcript').boundingBox();
  if (!box) throw new Error('the transcript has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => {
    const seen: boolean[] = [];
    const tops: number[] = [];
    const list = document.querySelector<HTMLElement>('[data-testid="acp-chat-transcript"]')!;
    Object.assign(window, { __upwardWheels: seen, __topsAtWheel: tops });
    window.addEventListener('wheel', (event) => { if (event.deltaY < 0) tops.push(list.scrollTop); }, { capture: true, passive: true });
    window.addEventListener('wheel', (event) => { if (event.deltaY < 0) seen.push(event.defaultPrevented); }, { passive: true });
  });
  // One notch up stays within 120px of the end, where the old follow still counted as following.
  // Three rounds: the WebKit race that loses a notch does not lose every one.
  for (let round = 1; round <= 3; round += 1) {
    await page.mouse.wheel(0, 20_000);
    await expect.poll(async () => (await transcriptBox(page)).distance, `round ${round} starts at the tail`).toBeLessThanOrEqual(48);
    const emitted = (await harness.streamed(page)).emitted;
    await untilStreamed(page, emitted + 30);
    await expect.poll(async () => (await transcriptBox(page)).distance, `round ${round}: the tail is being followed`).toBeLessThanOrEqual(48);
    await page.evaluate(() => {
      const probe = window as unknown as { __upwardWheels: boolean[]; __topsAtWheel: number[] };
      probe.__upwardWheels.length = 0;
      probe.__topsAtWheel.length = 0;
    });
    await page.mouse.wheel(0, -60);
    await waitFrames(page, 2);
    const nudged = await transcriptBox(page);
    expect(
      await page.evaluate(() => (window as unknown as { __upwardWheels: boolean[] }).__upwardWheels),
      `round ${round}: the wheel that stops the follow is taken over, so no queued write can undo it`,
    ).toEqual([true]);
    const [topAtWheel] = await page.evaluate(() => (window as unknown as { __topsAtWheel: number[] }).__topsAtWheel);
    expect(topAtWheel! - nudged.top, `round ${round}: one notch has to take the view up`).toBeGreaterThan(40);
    const nudgeDrift = await driftWhile(page, nudged.top, (await harness.streamed(page)).emitted + 40);
    expect(nudgeDrift, `round ${round}: a reader one notch above the end must stay there`).toBeLessThanOrEqual(1);
  }

  const before = await transcriptBox(page);
  await flickUp(page);
  const after = await transcriptBox(page);
  expect(before.top - after.top, 'the flick has to take the view up, not down').toBeGreaterThan(200);

  const drift = await driftWhile(page, after.top, (await harness.streamed(page)).emitted + 110);
  expect(drift, 'text arriving below must not move a reader who left the end').toBeLessThanOrEqual(1);

  const door = page.getByTestId('acp-chat-jump-latest');
  await expect(door).toBeVisible();
  await door.click();
  await expect.poll(async () => (await transcriptBox(page)).distance).toBeLessThanOrEqual(2);
  await expect(door).toBeHidden();

  await untilStreamed(page, chunks.length);
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  await expect.poll(async () => (await transcriptBox(page)).distance).toBeLessThanOrEqual(2);
});

test('a return to the end resumes the follow when text lands before its scroll event', async ({ page }) => {
  const harness = await openStreamingDock(page);
  await harness.stream(page, streamedAnswer(640), { perSecond: RATE, endTurn: true });
  await untilStreamed(page, 60);
  const box = await page.getByTestId('acp-chat-transcript').boundingBox();
  if (!box) throw new Error('the transcript has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await waitFrames(page, 2);
  expect((await transcriptBox(page)).distance, 'the reader left the end').toBeGreaterThan(100);
  await page.getByTestId('acp-chat-transcript').evaluate((list) => {
    list.scrollTop = list.scrollHeight;
    const paragraph = document.createElement('div');
    paragraph.style.height = '30px';
    list.firstElementChild!.appendChild(paragraph);
  });
  const emitted = (await harness.streamed(page)).emitted;
  await untilStreamed(page, emitted + 30);
  await expect.poll(async () => (await transcriptBox(page)).distance, 'the follow resumed').toBeLessThanOrEqual(48);
});

test('scrolling back down to the end resumes the follow without the door', async ({ page }) => {
  const harness = await openStreamingDock(page);
  const chunks = streamedAnswer(300);
  await harness.stream(page, chunks, { perSecond: RATE, endTurn: true });
  await untilStreamed(page, 60);
  await flickUp(page);
  await untilStreamed(page, 120);
  expect((await transcriptBox(page)).distance).toBeGreaterThan(24);

  await page.mouse.wheel(0, 20_000);
  await expect.poll(async () => (await transcriptBox(page)).distance).toBeLessThanOrEqual(2);
  await untilStreamed(page, chunks.length);
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  await expect.poll(async () => (await transcriptBox(page)).distance).toBeLessThanOrEqual(2);
});

/** Writes short of the end while following: a glide's steps (frames away count arrivals too). */
async function glideSteps(page: Page, harness: LibraryWorkHarness, question: string) {
  const chat = page.getByTestId('acp-chat-panel');
  await chat.getByRole('textbox').fill(question);
  await page.getByTestId('acp-chat-send').click();
  await expect(chat).toHaveAttribute('data-acp-status', 'thinking');
  await expect.poll(async () => (await transcriptBox(page)).distance).toBeLessThanOrEqual(2);
  await page.getByTestId('acp-chat-transcript').evaluate((list) => {
    const own = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    if (!own?.get || !own.set) throw new Error('scrollTop is not an accessor here');
    const probe = window as unknown as { __glideSteps: number };
    probe.__glideSteps = 0;
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get() { return own.get!.call(this); },
      set(value: number) {
        if (value < list.scrollHeight - list.clientHeight - 1) probe.__glideSteps += 1;
        own.set!.call(this, value);
      },
    });
  });
  const chunks = streamedAnswer(90);
  await harness.stream(page, chunks, { perSecond: RATE, endTurn: true });
  await untilStreamed(page, chunks.length);
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  await expect.poll(async () => (await transcriptBox(page)).distance).toBeLessThanOrEqual(2);
  return page.getByTestId('acp-chat-transcript').evaluate((list) => {
    delete (list as unknown as { scrollTop?: number }).scrollTop;
    return (window as unknown as { __glideSteps: number }).__glideSteps;
  });
}

test('under reduced motion the follow lands at the end instead of gliding', async ({ page }) => {
  const harness = await openStreamingDock(page);
  await harness.stream(page, streamedAnswer(20), { perSecond: RATE, endTurn: true });
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');

  expect(await glideSteps(page, harness, 'And with motion?'), 'with motion the follow glides').toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await glideSteps(page, harness, 'And without it?'), 'reduced motion lands on the end in one write').toBe(0);
});
