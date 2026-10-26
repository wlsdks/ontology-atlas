import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "../fixture-vault";
import { seedFirstRunSeen } from "../first-run-seed";
import { stubDirectoryPicker } from "../vault-picker-stub";

for (const populated of [false, true]) {
  test(`service import preserves keyboard continuity from the ${populated ? 'index' : 'empty stage'}`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, { ...FIXTURE_VAULT, ...(populated ? { 'sources/base.pdf': '%PDF-1.7 base\n' } : {}) });
    await page.goto('/en/library/?guides=off');
    await page.getByTestId('library-open-vault').click();
    const opener = page.getByTestId(populated ? 'library-import-open' : 'library-start-import');
    await opener.evaluate((button) => {
      (document.activeElement as HTMLElement)?.blur();
      button.addEventListener('mousedown', (event) => event.preventDefault(), { once: true });
    });
    await opener.click();
    const dialog = page.getByTestId('library-import-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('library-import-close').click();
    await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');
    const notion = dialog.locator('[data-service="notion"]');
    await notion.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByTestId('library-import-web-setup')).toBeVisible();
    await expect(dialog.getByTestId('library-import-token')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(notion).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog.getByTestId('library-import-web-setup')).toBeVisible();
    await expect(dialog.getByTestId('library-import-token')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  });
}

/**
 * The third door: documents not on this computer yet. Locks the promise, not the plumbing: the door
 * exists, the picker names services, and the first step says who keeps what comes back.
 */

test("the library has a door for importing from a service, avoids jargon, and on the web says what happened instead of showing an unpressable button", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

  await page.goto("/ko/library/");
  await page.waitForLoadState("networkidle");

  // The fixture folder has no sources, so this is the empty stage: three doors, in the order
  // of how far away the document is — on disk, in the folders you granted, and somewhere else
  // entirely. The workbench carries the same three as chips (`library-import-open`).
  await expect(page.getByTestId("library-start-add-files")).toBeVisible();
  await expect(page.getByTestId("library-start-find-documents")).toBeVisible();
  const door = page.getByTestId("library-start-import");
  await expect(door).toBeVisible();

  await door.click();
  const dialog = page.getByTestId("library-import-dialog");
  await expect(dialog).toBeVisible();

  // Services by name, not protocols. The escape hatch to the technical dialog is last.
  const tiles = page.getByTestId("library-import-service");
  await expect(tiles).not.toHaveCount(0);
  await expect(tiles.last()).toHaveAttribute("data-service", "other");
  await expect(
    page.locator('[data-testid="library-import-service"][data-service="notion"]'),
  ).toBeVisible();

  await page.locator('[data-testid="library-import-service"][data-service="notion"]').click();
  await expect(page.getByTestId("library-import-step")).toHaveAttribute("data-step", "connect");

  await expect(dialog.getByTestId("library-import-web-setup")).toBeVisible();
  await expect(dialog.getByTestId("library-import-token")).toHaveCount(0);
  await expect(dialog.getByTestId("library-import-connect")).toHaveCount(0);
  await expect(dialog.getByTestId("library-import-connected")).toHaveCount(0);
  await expect(dialog.getByTestId("library-import-no-agent-app")).toHaveAttribute("href", /download/);
  await page.evaluate(() => {
    const target = window as unknown as {showOpenFilePicker: () => Promise<FileSystemFileHandle[]>; __filesAsked?: boolean};
    target.showOpenFilePicker = async () => { target.__filesAsked = true; return []; };
  });
  await dialog.getByTestId("library-import-add-files").click();
  expect(await page.evaluate(() => (window as unknown as {__filesAsked?: boolean}).__filesAsked)).toBe(true);
  await expect(dialog).toBeHidden();
});

// The bridge below is isolated in-memory fixture data. No OS keychain or service is called.
import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';
import type { ServiceSaveWindow } from './service-save-desktop-fixture';
import { installServiceSaveFixture } from './service-save-desktop-fixture';
async function openDesktopSetup(page: import('@playwright/test').Page) {
  await seedFirstRunSeen(page);
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/library/?guides=off');
  await page.getByTestId('library-import-open').click();
  await page.locator('[data-testid="library-import-service"][data-service="notion"]').click();
  await page.getByTestId('library-import-token').fill('fixture_value');
  await expect(page.getByTestId('library-import-connect')).toBeEnabled();
}
test('a delayed desktop save stays single and closing prevents its next operation', async ({page}) => {
  await installServiceSaveFixture(page, {hold:'stage'});
  await openDesktopSetup(page);
  await page.getByTestId('library-import-connect').evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByTestId('library-import-connect')).toBeDisabled();
  await expect(page.getByTestId('library-import-connect')).toHaveAttribute('aria-busy','true');
  await expect.poll(() => page.evaluate(() => (window as unknown as ServiceSaveWindow).__serviceSaveHarness.calls.stage)).toBe(1);
  await page.getByTestId('library-import-close').click();
  await page.evaluate(() => (window as unknown as ServiceSaveWindow).__serviceSaveHarness.release());
  await expect.poll(() => page.evaluate(() => JSON.parse((window as unknown as ServiceSaveWindow).__roundsStubFiles['.ontology-atlas/connectors.json']).connectors.some((row:ConnectorRecord)=>row.origin==='library-import:notion'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as ServiceSaveWindow).__serviceSaveHarness.calls.secret)).toBe(0);
  await expect(page.getByTestId('library-import-dialog')).toBeHidden();
});
test('a desktop credential failure keeps the same disabled row and retry completes without exposing the token', async ({page}) => {
  await installServiceSaveFixture(page, {secretFailure:true});
  await openDesktopSetup(page);
  await page.getByTestId('library-import-connect').click();
  await expect(page.getByTestId('library-import-failed')).toBeVisible();
  await expect(page.getByTestId('library-import-token')).toHaveValue('fixture_value');
  await expect(page.getByTestId('library-import-connected')).toHaveCount(0);
  const before=await page.evaluate(() => JSON.parse((window as unknown as ServiceSaveWindow).__roundsStubFiles['.ontology-atlas/connectors.json']).connectors.find((row:ConnectorRecord)=>row.origin==='library-import:notion'));
  expect(before.enabled).toBe(false);
  await page.evaluate(() => (window as unknown as ServiceSaveWindow).__serviceSaveHarness.succeed());
  await page.getByTestId('library-import-connect').click();
  await expect(page.getByTestId('library-import-what')).toBeFocused();
  const saved=await page.evaluate(() => (window as unknown as ServiceSaveWindow).__roundsStubFiles['.ontology-atlas/connectors.json']);
  expect(saved).not.toContain('fixture_value');
  const rows=JSON.parse(saved).connectors.filter((row:ConnectorRecord)=>row.origin==='library-import:notion');
  expect(rows).toHaveLength(1); expect(rows[0].id).toBe(before.id); expect(rows[0].enabled).toBe(true);
  await expect(page.getByTestId('library-import-connected')).toContainText('has not been checked');
});
test('desktop activation retry reuses the confirmed credential and setup ID', async ({page}) => {
  await installServiceSaveFixture(page, {activationFailure:true});
  await openDesktopSetup(page); await page.getByTestId('library-import-connect').click();
  await expect(page.getByTestId('library-import-failed')).toBeVisible();
  await expect(page.getByTestId('library-import-token')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as ServiceSaveWindow).__serviceSaveHarness.succeed());
  await page.getByTestId('library-import-connect').click();
  await expect(page.getByTestId('library-import-connected')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as ServiceSaveWindow).__serviceSaveHarness.calls.secret)).toBe(1);
});
