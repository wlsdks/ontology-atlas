import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "../fixture-vault";
import { seedFirstRunSeen } from "../first-run-seed";
import { stubDirectoryPicker } from "../vault-picker-stub";
import { installDesktopRailRuntime } from "../desktop-rail-arrival-harness";

// Keep the web connection pane within two screens, with at most one copy action
// in the first viewport and four overall. Native setup needs installed-app proof.
const CEILING = { copyVisibleFirstScreen: 1, copyTotal: 4, scrollRatio: 2 };

test("the connection pane keeps its first screen simple and its content within reach", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter"), "the fixture vault must be attached before measuring").toHaveCount(0);
  await page.getByTestId("app-nav-rail").getByRole("link", { name: "에이전트" }).click();
  await page.getByTestId("agents-tab-mcp").click();

  const pane = page.getByTestId("agent-setup-section");
  await expect(pane).toBeVisible();
  const census = await pane.evaluate((root) => {
    const copyButtons = [...root.querySelectorAll("button")].filter((button) =>
      /복사|copy/i.test(`${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""}`),
    );
    return {
      copyTotal: copyButtons.length,
      copyVisibleFirstScreen: copyButtons.filter((button) => {
        const box = button.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
      }).length,
      scrollHeight: root.scrollHeight,
      visibleHeight: Math.min(root.clientHeight, window.innerHeight),
    };
  });
  await testInfo.attach("agent-connect-census.json", {
    body: JSON.stringify(census, null, 2),
    contentType: "application/json",
  });
  expect(census.copyTotal, "the pane must contain copy actions before measuring their density").toBeGreaterThan(0);
  expect(census.visibleHeight, "the pane must occupy visible space").toBeGreaterThan(0);
  expect(census.copyVisibleFirstScreen, "fold secondary copy actions below the first screen").toBeLessThanOrEqual(CEILING.copyVisibleFirstScreen);
  expect(census.copyTotal).toBeLessThanOrEqual(CEILING.copyTotal);
  expect(census.scrollHeight / census.visibleHeight, "the pane must fit within two visible screens").toBeLessThanOrEqual(CEILING.scrollRatio);
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
