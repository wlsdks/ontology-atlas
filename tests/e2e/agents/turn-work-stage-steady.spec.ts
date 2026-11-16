import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { installLibraryWorkHarness, type LibraryWorkHarness } from '../library-work-harness';
import { openFolderFromFirstRun } from '../open-folder';
import { waitForBoxStill } from '../settle';

/** Moru's stage stands still while the answer streams above it: a moving figure beside moving text makes readers dizzy. */

const ANSWER_LINES = 36;
const LINES_PER_SECOND = 12;

const answerChunks = () =>
  Array.from({ length: ANSWER_LINES }, (_, index) => `- Line ${index + 1}: the compile step rereads the sources this page cites.\n`);

async function openDockWithTurn(page: Page): Promise<LibraryWorkHarness> {
  await page.setViewportSize({ width: 1410, height: 840 });
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, {});
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/library/?guides=off&e2e=1');
  await page.getByTestId('library-workspace-wiki').click();
  await page.getByTestId('library-open-conversation').click();
  const chat = page.getByTestId('acp-chat-panel');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  await chat.getByRole('textbox').fill('Walk me through the whole compile.');
  await page.getByTestId('acp-chat-send').click();
  await expect(page.getByTestId('acp-turn-work')).toHaveAttribute('data-work-phase', 'working');
  // The agent thinks before it answers: the stage has unfolded by the first chunk.
  await waitForBoxStill(page.getByTestId('acp-turn-work'));
  return harness;
}

/** Samples the stage's top edge on every frame from the first streamed chunk until the last, while the turn works. */
async function sampleStageTop(page: Page) {
  await page.evaluate(() => {
    type Harness = { streamed(): { emitted: number; total: number } };
    const probe = { tops: [] as number[], done: false };
    Object.assign(window, { __stageTopProbe: probe });
    const sample = () => {
      const progress = (window as unknown as { __atlasLibraryWorkHarness?: Harness }).__atlasLibraryWorkHarness?.streamed();
      const stage = document.querySelector<HTMLElement>('[data-testid="acp-turn-work"]');
      if (progress && progress.total > 0 && progress.emitted >= 1 && stage?.dataset.workPhase === 'working') {
        probe.tops.push(stage.getBoundingClientRect().top);
      }
      if (progress && progress.total > 0 && progress.emitted >= progress.total) {
        probe.done = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

test('the work stage keeps its place while a long answer streams, and the newest line stays above it', async ({ page }) => {
  const harness = await openDockWithTurn(page);
  await sampleStageTop(page);
  await harness.stream(page, answerChunks(), { perSecond: LINES_PER_SECOND, endTurn: true });
  await page.waitForFunction(() => (window as unknown as { __stageTopProbe: { done: boolean } }).__stageTopProbe.done);

  const tops = await page.evaluate(() => (window as unknown as { __stageTopProbe: { tops: number[] } }).__stageTopProbe.tops);
  const travel = Math.max(...tops) - Math.min(...tops);
  const path = tops.slice(1).reduce((sum, top, index) => sum + Math.abs(top - tops[index]!), 0);
  console.log(`[stage-steady] ${tops.length} frames; top range ${travel.toFixed(2)}px, summed frame-to-frame motion ${path.toFixed(2)}px`);
  expect(tops.length, 'the stage was sampled across the stream').toBeGreaterThan(20);
  expect(travel, 'the stage top moved while the answer streamed').toBeLessThanOrEqual(0.5);

  const newest = page.getByText(`Line ${ANSWER_LINES}:`, { exact: false });
  await expect(newest).toBeVisible();
  const [line, stage, transcript] = await Promise.all([
    newest.boundingBox(),
    page.getByTestId('acp-turn-work').boundingBox(),
    page.getByTestId('acp-chat-transcript').boundingBox(),
  ]);
  if (!line || !stage || !transcript) throw new Error('a measured box is missing');
  expect(line.y + line.height, 'the newest line sits above the stage').toBeLessThanOrEqual(stage.y + 0.5);
  expect(line.y + line.height, 'the newest line is inside the transcript view').toBeLessThanOrEqual(transcript.y + transcript.height + 0.5);
  expect(line.y, 'the newest line is inside the transcript view').toBeGreaterThanOrEqual(transcript.y - 0.5);
});
