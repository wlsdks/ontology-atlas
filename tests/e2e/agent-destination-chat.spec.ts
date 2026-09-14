import { expect, test } from '@playwright/test';
import { installDesktopRailRuntime } from './desktop-rail-arrival-harness';

// A quick detection does not establish login readiness. Codex must survive the
// empty usable-list phase even when Claude is the first verified runner later.
test('Agents opens the requested runner after the login scan completes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const runners = [
    { id: 'claude-acp', label: 'Claude Agent' },
    { id: 'codex-acp', label: 'Codex' },
  ].map(runner => ({ ...runner, verified: true, isolated: true, icon: null, brandInk: null, description: '', website: null, license: null, launchKind: 'npx', cliPath: '/fixture/cli', adapterPath: null, adapterPackage: null }));
  await installDesktopRailRuntime(page, {}, {
    fast: runners.map(runner => ({ ...runner, state: 'login-unknown' })),
    probed: runners.map(runner => ({ ...runner, state: 'ready' })),
  });
  await page.goto('/ko/?guides=off&e2e=1');
  await page.getByTestId('first-run-open').click();
  await page.getByTestId('app-nav-rail').getByRole('link', { name: '에이전트', exact: true }).click();
  await expect(page.getByTestId('app-settings-runtime-codex-acp')).toContainText('준비됨');
  await page.getByTestId('app-settings-runtime-chat-codex-acp').click();
  const panel = page.getByTestId('acp-chat-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-label', /Codex/);
  const calls = await page.evaluate(() => (window as unknown as { __nativeCalls: { command: string }[] }).__nativeCalls);
  expect(calls.filter(call => call.command === 'acp_detect_runtimes').length).toBeGreaterThanOrEqual(4);
  expect(calls.some(call => call.command === 'acp_send')).toBe(false);
  await page.getByTestId('analysis-workbench').getByRole('button', { name: '검토 패널 닫기', exact: true }).click();
  await expect(panel).toBeHidden();
});


test('a queued task without a named runner waits for verified detection', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const runtime = { id: 'claude-acp', label: 'Claude Agent', verified: true, isolated: true, icon: null, brandInk: null, description: '', website: null, license: null, launchKind: 'npx', cliPath: '/fixture/cli', adapterPath: null, adapterPackage: null };
  await installDesktopRailRuntime(page, {}, {
    fast: [{ ...runtime, state: 'login-unknown' }],
    probed: [{ ...runtime, state: 'ready' }],
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('ontology-atlas:agent-chat-intent:pending', JSON.stringify({ runtimeId: null, prompt: 'Inspect the existing structure.' }));
  });
  await page.goto('/ko/?guides=off&e2e=1');
  await page.getByTestId('first-run-open').click();
  await expect(page.getByTestId('acp-chat-panel')).toBeVisible();
  await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('aria-label', /Claude Agent/);
  // The fixture stops at session creation; no user turn or provider request runs.
  expect(await page.evaluate(() => (window as unknown as { __nativeCalls: { command: string }[] }).__nativeCalls.some(call => call.command === 'acp_send'))).toBe(false);
});
