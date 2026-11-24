import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { installLibraryWorkHarness } from '../library-work-harness';
import { openFolderFromFirstRun } from '../open-folder';

/**
 * One press maps the rest of the code (`docs/specs/2026-11-23-one-press-maps-the-rest.md`): the
 * planted agent rewrites the project's line between requests, as the server's measure has it do.
 */

const projectNote = (uncovered: number | null) => `---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n\n## Uncertainty\n\n${uncovered === null ? 'Every area is mapped.' : `- Not mapped yet: 3 of 9 areas, ${uncovered} of 120 abilities.`}\n`;

type HarnessWindow = {
  __atlasLibraryWorkHarness?: {
    snapshot(): { calls: Array<{ method: string; params?: unknown }>; writes: Array<{ relativePath: string; content: string }> };
    mutateSource(path: string, text: string): void;
    answer(text: string): void;
    emitRead(): void;
    emitWait(): void;
  };
};

const calls = (page: Page) =>
  page.evaluate(() => ((window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.snapshot().calls ?? []).map((call) => ({ method: call.method, params: call.params })));
const prompts = async (page: Page) => (await calls(page)).filter((call) => call.method === 'session/prompt').length;
const starts = async (page: Page) => (await calls(page)).filter((call) => call.method === 'acp_start').length;
/** Answers the app sent to a permission request (`id` 902 is the harness's write request). */
const permissionAnswers = async (page: Page) =>
  (await calls(page)).filter((call) => call.method === 'response' && (call.params as { id?: unknown } | undefined)?.id === 902).length;

/** The agent rewrites the project's line, as a request ends, and ends its turn. */
async function requestEnds(page: Page, uncovered: number | null) {
  await page.evaluate(({ note }) => {
    const harness = (window as unknown as HarnessWindow).__atlasLibraryWorkHarness;
    harness?.mutateSource('project.md', note);
    harness?.answer('Mapped the next areas and rewrote the project lines.');
  }, { note: projectNote(uncovered) });
}

/** The analysis each heartbeat the app wrote names (`acp-agent-heartbeat.ts`), in order; null outside a press. */
async function heartbeatAnalyses(page: Page): Promise<Array<string | null>> {
  const writes = await page.evaluate(() => (window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.snapshot().writes ?? []);
  // A file handle's writable lands as an empty write first, then the text.
  return writes
    .filter((write) => write.relativePath === '.ontology-atlas/agent-activity.json' && write.content.trim() !== '')
    .map((write) => (JSON.parse(write.content) as { mapAnalysis?: { id: string } }).mapAnalysis?.id ?? null);
}

const row = (page: Page) => page.getByTestId('mapping-run-row');

/** The requests the open conversation shows: one line each; the instruction the agent receives only once asked for. */
const requestLines = (page: Page) => page.getByTestId('acp-chat-panel').locator('[data-acp-entry="user"]');
async function expectOneRequestLine(page: Page, part: number) {
  await expect(requestLines(page)).toHaveText([`Map the rest of the code · request ${part}`]);
  await expect(page.getByTestId('acp-chat-panel')).not.toContainText('Map the next part now');
}

async function openMapConversation(page: Page) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  // Each request opens a conversation of its own, as a real agent's does, so History has them to group.
  await installLibraryWorkHarness(page, { files: { 'project.md': projectNote(96), 'sources/architecture.docx': 'Architecture evidence\n' }, listsConversations: true });
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/topology/?guides=off');
  await page.getByTestId('topology-vault-agent-toggle').click();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
  await expect(row(page)).toContainText('24 of the 120 abilities found in the code are on the map (20%)');
}

async function press(page: Page) {
  await page.getByTestId('mapping-run-action').click();
  await expect.poll(() => prompts(page), { message: 'the first request reaches the agent' }).toBe(1);
  await expect(row(page)).toHaveAttribute('data-mapping-state', 'running');
}

/**
 * The longest frame interval while the row's own count or bar was moving, and how many frames it
 * moved for: the turn's closing work and the folder's reload are timed to pass before it moves.
 */
async function longestRowMotionFrame(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const log = window as unknown as { __frames: Array<[number, boolean]>; __framesOn: boolean };
    log.__frames = [];
    log.__framesOn = true;
    const tick = (time: number) => {
      const moving = document.querySelector('[data-testid="mapping-run-row"]')?.getAnimations({ subtree: true })
        .some((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity) ?? false;
      log.__frames.push([time, moving]);
      if (log.__framesOn) window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
  await act();
  const frames = await page.evaluate(() => {
    const log = window as unknown as { __frames: Array<[number, boolean]>; __framesOn: boolean };
    log.__framesOn = false;
    return log.__frames;
  });
  const intervals = frames.slice(1).flatMap(([time, moving], index) => {
    const [before, movingBefore] = frames[index]!;
    return moving || movingBefore ? [time - before] : [];
  });
  return { longestMs: Math.max(0, ...intervals), movingFrames: intervals.length };
}

test.describe('one press maps the rest of the code', () => {
  test('sends request after request, each count on the row and then on the card', async ({ page }) => {
    await openMapConversation(page);
    await press(page);
    await expect(row(page)).toContainText('Request 1');
    await expectOneRequestLine(page, 1);
    const full = page.getByTestId('acp-chat-panel').getByTestId('acp-chat-request-full');
    await full.click();
    await expect(page.getByTestId('acp-chat-panel')).toContainText('Map the next part now');
    await full.click();

    await requestEnds(page, 72);
    await expect.poll(() => prompts(page), { message: 'the second request goes out by itself' }).toBe(2);
    await expect(row(page)).toContainText('Request 2');
    await expectOneRequestLine(page, 2);
    await expect(row(page)).toContainText('48 of 120 abilities on the map (40%)');

    const motion = await longestRowMotionFrame(page, async () => {
      await requestEnds(page, 40);
      await expect.poll(() => prompts(page)).toBe(3);
      await expect(row(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
      await page.waitForFunction(() => document.querySelector('[data-testid="mapping-run-row"]')?.getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running') ?? false);
    });
    console.log(`longest frame while the row's count and bar moved: ${motion.longestMs.toFixed(1)} ms over ${motion.movingFrames} frames`);
    expect(motion.movingFrames, 'the row never moved, so no frame was timed').toBeGreaterThan(0);
    expect(motion.longestMs, 'a frame over 50 ms while the bar moved').toBeLessThanOrEqual(50);
    await expect(row(page)).toContainText('80 of 120 abilities on the map (66%)');
    // Three requests, three lines: a request the folder's reload refused would have left a second one.
    await expectOneRequestLine(page, 3);
    // One run reads as one conversation: the finished requests stand above the live one, and History holds one row.
    await expect(page.getByTestId('mapping-run-request')).toHaveText([
      /^Request 1 · 24 abilities put on the map · /,
      /^Request 2 · 32 abilities put on the map · /,
    ]);
    await page.getByTestId('acp-chat-history').click();
    await expect(page.getByTestId('acp-chat-history-run')).toHaveCount(1);
    await expect(page.getByTestId('acp-chat-history-run')).toContainText(/^Map the rest of the code · [23] requests/);
    // The only other row is the conversation the dock opened before the press.
    await expect(page.getByTestId('acp-chat-history-item')).toHaveCount(1);
    await expect(page.getByTestId('acp-chat-history-item')).toHaveAttribute('data-session-id', 'library-acp-session-1');
    await page.getByTestId('acp-chat-history-scrim').click();

    await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page).toHaveURL(/\/library\//);
    await expect(page.getByTestId('work-run-figures')).toContainText('80 of 120 abilities on the map');
    await requestEnds(page, 10);
    await expect.poll(() => prompts(page), { message: 'the run goes on away from the map' }).toBe(4);
    await expect(page.getByTestId('work-run-figures')).toContainText('110 of 120 abilities on the map');

    await requestEnds(page, null);
    await expect(page.getByTestId('work-run-title')).toHaveText('Every ability found in the code is on the map');
    expect(await prompts(page)).toBe(4);
  });

  test('every request of one press names one analysis, and the run\'s end starts no session', async ({ page }) => {
    await openMapConversation(page);

    const chat = page.getByTestId('acp-chat-panel');
    await chat.getByRole('textbox').fill('What does billing own?');
    await page.getByTestId('acp-chat-send').click();
    await expect.poll(() => prompts(page)).toBe(1);
    await page.evaluate(() => (window as unknown as HarnessWindow).__atlasLibraryWorkHarness?.answer('Billing owns invoices.'));
    await expect(chat).toHaveAttribute('data-acp-status', 'ready');
    const before = await heartbeatAnalyses(page);
    expect(before.length, 'the conversation before the press wrote no heartbeat').toBeGreaterThan(0);
    expect(before.every((id) => id === null), 'the conversation before the press is named as a press').toBe(true);

    await page.getByTestId('mapping-run-action').click();
    await expect.poll(() => prompts(page), { message: 'the first request reaches the agent' }).toBe(2);
    await expect(row(page)).toHaveAttribute('data-mapping-state', 'running');
    await requestEnds(page, 72);
    await expect.poll(() => prompts(page), { message: 'the second request goes out by itself' }).toBe(3);
    await expect.poll(async () => (await heartbeatAnalyses(page)).length).toBeGreaterThan(before.length + 1);
    const pressed = (await heartbeatAnalyses(page)).slice(before.length).filter((id) => id !== null);
    expect(new Set(pressed).size, `the press's requests named ${new Set(pressed).size} analyses`).toBe(1);
    expect(pressed[0]).toMatch(/^press-\d+-\d+$/);

    const startsBeforeStop = await starts(page);
    await page.getByTestId('mapping-run-action').click();
    await expect(row(page)).toHaveAttribute('data-mapping-state', 'stopped');
    await expect(chat).toHaveAttribute('data-acp-status', 'ready');
    // measurement window: a restart would arrive as one more acp_start after the run's end settles.
    await page.waitForTimeout(1_000);
    expect(await starts(page), 'the run\'s end started the session again').toBe(startsBeforeStop);
    expect(await chat.getAttribute('data-acp-status')).toBe('ready');
  });

  test('Stop ends the run within five seconds', async ({ page }) => {
    await openMapConversation(page);
    await press(page);
    const pressedAt = Date.now();
    await page.getByTestId('mapping-run-action').click();
    await expect(row(page)).toHaveAttribute('data-mapping-state', 'stopped');
    const endedMs = Date.now() - pressedAt;
    // The spec's bound for any Stop; measured 0.22 s here on 2026-11-23.
    console.log(`Stop to stopped: ${endedMs} ms`);
    expect(endedMs).toBeLessThan(5_000);
    await expect(row(page)).toContainText('Stopped at 20%');
    expect(await prompts(page)).toBe(1);
  });

  test('the composer\'s Stop ends the whole run, as the row\'s does', async ({ page }) => {
    await openMapConversation(page);
    await press(page);
    await page.getByTestId('acp-chat-stop').click();
    await expect(row(page)).toHaveAttribute('data-mapping-state', 'stopped');
    await expect(row(page)).toContainText('Stopped at 20%');
    await expect(page.getByTestId('mapping-run-action')).toHaveText('Continue');
    expect(await prompts(page)).toBe(1);
  });

  test('a waiting permission card is left to the person', async ({ page }) => {
    await openMapConversation(page);
    await press(page);
    await page.evaluate(() => {
      const harness = (window as unknown as HarnessWindow).__atlasLibraryWorkHarness;
      harness?.emitRead();
      harness?.emitWait();
    });
    await expect(page.getByTestId('acp-permission-card')).toBeVisible();
    await expect(row(page)).toHaveAttribute('data-mapping-state', 'asking');
    await expect(row(page)).toContainText('Waiting for your answer');
    await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page.getByTestId('work-run-title')).toHaveText('Waiting for your answer');
    expect(await permissionAnswers(page), 'the app answered a permission request').toBe(0);
    expect(await prompts(page)).toBe(1);
  });

  test('a draft in the composer stops the run at the next boundary and stays', async ({ page }) => {
    await openMapConversation(page);
    await press(page);
    const composer = page.getByTestId('acp-chat-panel').getByRole('textbox');
    await composer.fill('Why is billing split in two?');
    await requestEnds(page, 72);
    await expect(row(page)).toHaveAttribute('data-mapping-state', 'stopped');
    await expect(row(page)).toContainText('Stopped so you can ask. Continue picks up from here.');
    await expect(composer).toHaveValue('Why is billing split in two?');
    expect(await prompts(page)).toBe(1);
  });

  test('survives leaving the map, closing the dock and the Library opening the same folder', async ({ page }) => {
    await openMapConversation(page);
    await press(page);
    await page.getByTestId('topology-vault-agent-toggle').click();
    await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page).toHaveURL(/\/library\//);
    // The map tile carries the run while it is away from the map, by the folder its driver keys it with.
    await expect(page.getByTestId('app-nav-rail-ring-map')).toBeVisible();
    await page.getByTestId('library-open-conversation').click();
    await expect(page.getByTestId('acp-folder-busy')).toBeVisible();
    await expect(page.getByTestId('acp-folder-busy')).toContainText('Another conversation is working in this folder.');
    const agentsBefore = await starts(page);

    await requestEnds(page, 72);
    await expect.poll(() => prompts(page), { message: 'the run goes on behind the Library' }).toBe(2);
    await expect(page.getByTestId('acp-folder-busy')).toBeVisible();
    // The run's own new conversation is the one start; the Library's dock started none.
    expect(await starts(page)).toBe(agentsBefore + 1);

    // While the run goes on, the map tile names its share: "Map: 40% done".
    await page.getByTestId('app-nav-rail').getByRole('link', { name: /^Map\b/ }).click();
    await expect(page).toHaveURL(/\/topology\//);
    await page.getByTestId('topology-vault-agent-toggle').click();
    await expect(row(page)).toHaveAttribute('data-mapping-state', 'running');
    await expect(row(page)).toContainText('Request 2');
  });
});
