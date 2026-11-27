import { expect, test } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "../desktop-rail-arrival-harness";

/**
 * The installed app connects an agent program by a press on its row, so the pane holds no command to copy. The
 * ceilings are what the pane measures there (1512x900): 0 copy actions, 4 connect presses (one per program) all
 * on the first screen, and a pane a third of a screen tall. A copy action returning means the hand-copy flow
 * came back; a taller or denser pane means the first screen got heavier.
 */
const CEILING = { copyTotal: 0, connectPresses: 4, scrollRatio: 1 };

test("the connection pane keeps its first screen simple and its content within reach", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page, "ko");
  await page.getByTestId("app-nav-rail-item-agents").click();
  await page.getByTestId("agents-tab-mcp").click();

  const pane = page.getByTestId("agent-setup-section");
  await expect(pane).toBeVisible();
  const census = await pane.evaluate((root) => {
    const buttons = [...root.querySelectorAll("button")];
    const named = (button: HTMLElement) => `${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""}`;
    const visible = (button: HTMLElement) => {
      const box = button.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
    };
    const connect = buttons.filter((button) => (button.textContent ?? "").trim() === "연결");
    return {
      copyTotal: buttons.filter((button) => /복사|copy/i.test(named(button))).length,
      connectPresses: connect.length,
      connectVisibleFirstScreen: connect.filter(visible).length,
      scrollHeight: root.scrollHeight,
      visibleHeight: Math.min(root.clientHeight, window.innerHeight),
    };
  });
  await testInfo.attach("agent-connect-census.json", {
    body: JSON.stringify(census, null, 2),
    contentType: "application/json",
  });
  expect(census.connectPresses, "the pane must hold its connect presses before measuring their density").toBeGreaterThan(0);
  expect(census.visibleHeight, "the pane must occupy visible space").toBeGreaterThan(0);
  expect(census.copyTotal, "the app connects by a press: no command is left to copy by hand").toBeLessThanOrEqual(CEILING.copyTotal);
  expect(census.connectPresses).toBeLessThanOrEqual(CEILING.connectPresses);
  expect(census.connectVisibleFirstScreen, "every connect press is on the first screen").toBe(census.connectPresses);
  expect(census.scrollHeight / census.visibleHeight, "the pane must fit within one visible screen").toBeLessThanOrEqual(CEILING.scrollRatio);
});

for (const tool of ['Codex', 'Claude Code'] as const) {
  test(`the connection check follows ${tool} without requiring the other host`, async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 982 });
    const entry = { command: '/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp', args: [], env: { OATLAS_VAULT: '.' } };
    const path = tool === 'Codex' ? '.codex/config.toml' : '.mcp.json';
    const absent = tool === 'Codex' ? '.mcp.json' : '.codex/config.toml';
    const body = tool === 'Codex'
      ? `[mcp_servers.ontology-atlas]\ncommand = ${JSON.stringify(entry.command)}\nargs = []\n[mcp_servers.ontology-atlas.env]\nOATLAS_VAULT = "."\n`
      : JSON.stringify({ mcpServers: { 'ontology-atlas': entry } });
    await installDesktopRailRuntime(page, { [path]: body }, undefined, { writable: true });
    await page.goto('/ko/?guides=off');
    await page.getByTestId('first-run-open').click();
    await page.getByTestId('app-nav-rail-item-agents').click();
    await page.getByTestId('agents-tab-mcp').click();
    const opener = page.getByTestId('agent-setup-verify-open');
    // Reproduce WebKit pointer activation: clicking need not move DOM focus onto a button.
    await opener.evaluate((button) => button.addEventListener('mousedown', (event) => event.preventDefault(), { once: true }));
    await opener.click();
    const dialog = page.getByTestId('agent-setup-verify-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('agent-setup-status-summary')).toContainText('1/2');
    await expect(dialog.getByTestId('agent-setup-status-next')).not.toContainText(absent);
    const readyRow = dialog.locator('dl > div').filter({ has: page.locator('dt', { hasText: tool }) });
    await expect(readyRow.locator('dd')).toContainText(tool === 'Codex' ? 'codex mcp list' : '/mcp');
    const pendingRow = dialog.locator('dl > div').filter({ has: page.locator('dt', { hasText: tool === 'Codex' ? 'Claude Code' : 'Codex' }) });
    await expect(pendingRow.locator('dd')).toContainText(absent);
    await expect(pendingRow.locator('dd')).not.toContainText(tool === 'Codex' ? '/mcp' : 'codex mcp list');
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    // Use the next key during the exit, with normal motion, rather than waiting for it to settle.
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    const files = await page.evaluate(() => (window as unknown as { __stubFiles: Record<string, string> }).__stubFiles);
    expect(files[path]).toBe(body);
    expect(files[absent]).toBeUndefined();
  });
}
