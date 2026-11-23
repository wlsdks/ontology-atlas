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
    snapshot(): { calls: Array<{ method: string; params?: unknown }> };
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

const row = (page: Page) => page.getByTestId('mapping-run-row');

async function openMapConversation(page: Page) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await installLibraryWorkHarness(page, { files: { 'project.md': projectNote(96), 'sources/architecture.docx': 'Architecture evidence\n' } });
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

async function longestFrameDuring(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const log = window as unknown as { __frames: number[]; __framesOn: boolean };
    log.__frames = [];
    log.__framesOn = true;
    const tick = (time: number) => {
      log.__frames.push(time);
      if (log.__framesOn) window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
  await act();
  const frames = await page.evaluate(() => {
    const log = window as unknown as { __frames: number[]; __framesOn: boolean };
    log.__framesOn = false;
    return log.__frames;
  });
  return Math.max(...frames.slice(1).map((time, index) => time - frames[index]!));
}

test.describe('one press maps the rest of the code', () => {
  test('sends request after request, each count on the row and then on the card', async ({ page }) => {
    await openMapConversation(page);
    await press(page);
    await expect(row(page)).toContainText('Request 1');

    await requestEnds(page, 72);
    await expect.poll(() => prompts(page), { message: 'the second request goes out by itself' }).toBe(2);
    await expect(row(page)).toContainText('Request 2');
    await expect(row(page)).toContainText('48 of 120 abilities on the map (40%)');

    const longest = await longestFrameDuring(page, async () => {
      await requestEnds(page, 40);
      await expect.poll(() => prompts(page)).toBe(3);
      await expect(row(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
      await page.waitForFunction(() => document.querySelector('[data-testid="mapping-run-row"]')?.getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running') ?? false);
    });
    console.log(`longest frame while the row's count and bar moved: ${longest.toFixed(1)} ms`);
    expect(longest, 'a frame over 50 ms while the bar moved').toBeLessThanOrEqual(50);
    await expect(row(page)).toContainText('80 of 120 abilities on the map (66%)');

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
    await page.getByTestId('library-open-conversation').click();
    await expect(page.getByTestId('acp-folder-busy')).toBeVisible();
    await expect(page.getByTestId('acp-folder-busy')).toContainText('Another conversation is working in this folder.');
    const agentsBefore = await starts(page);

    await requestEnds(page, 72);
    await expect.poll(() => prompts(page), { message: 'the run goes on behind the Library' }).toBe(2);
    await expect(page.getByTestId('acp-folder-busy')).toBeVisible();
    // The run's own new conversation is the one start; the Library's dock started none.
    expect(await starts(page)).toBe(agentsBefore + 1);

    await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Map', exact: true }).click();
    await expect(page).toHaveURL(/\/topology\//);
    await page.getByTestId('topology-vault-agent-toggle').click();
    await expect(row(page)).toHaveAttribute('data-mapping-state', 'running');
    await expect(row(page)).toContainText('Request 2');
  });
});
