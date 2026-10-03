import { expect, test } from '@playwright/test';
import { FIXTURE_VAULT } from './fixture-vault';
import { installLibraryWorkHarness } from './library-work-harness';
import { openFolderFromFirstRun } from './open-folder';

test('closing and reopening Analysis retains the unsent draft and protocol session', async ({ page }) => {
  const harness = await installLibraryWorkHarness(page, {
    files: FIXTURE_VAULT,
    runtimeId: 'claude-acp',
  });
  await openFolderFromFirstRun(page, 'en');
  await page.goto('/en/ontology/insights/?tab=composition&guides=off');
  const opener = page.getByTestId('insights-agent-open');
  await opener.click();
  const chat = page.getByTestId('acp-chat-panel');
  await expect(chat).toHaveAttribute('data-acp-status', 'ready');
  const composer = chat.getByRole('textbox');
  const draft = 'Keep this unsent Analysis request when putting the dock away';
  await composer.fill(draft);
  const sessionCount = (await harness.snapshot(page)).calls.filter((call) => call.method === 'session/new').length;
  await page.getByTestId('analysis-workbench-close').click();
  const frame = page.getByTestId('insights-agent-dock-frame');
  await expect(frame).toHaveAttribute('data-dock-state', 'put-away');
  await expect(frame).toHaveAttribute('inert');
  await expect.poll(() => frame.evaluate((element) => element.getBoundingClientRect().width)).toBe(0);
  await opener.click();
  await expect(composer).toHaveValue(draft);
  const after = await harness.snapshot(page);
  expect(after.calls.filter((call) => call.method === 'session/new')).toHaveLength(sessionCount);
});
