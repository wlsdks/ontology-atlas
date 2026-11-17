import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { installLibraryWorkHarness, type LibraryWorkHarness } from '../library-work-harness';

const VAULT_FILES = {
  'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n',
  'planning/roadmap.md': '# Roadmap\n',
};

// Answers the keychain and planning commands in memory, on top of the work harness's ACP bridge.
async function answerConnectorCommands(page: Page) {
  await page.addInitScript(() => {
    type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    const bridge = (window as unknown as { __TAURI_INTERNALS__: { invoke: Invoke } }).__TAURI_INTERNALS__;
    const invoke = bridge.invoke.bind(bridge);
    const stored = new Set<string>();
    bridge.invoke = (command, args = {}) => {
      if (command === 'planning_supported') return Promise.resolve(true);
      if (command === 'resolve_connector_runtimes') return Promise.resolve([{ name: 'npx', path: '/test/runtime/npx' }]);
      const secretRef = String(args.secretRef);
      if (command === 'connector_secret_set') stored.add(secretRef);
      if (command === 'connector_secret_set' || command === 'connector_secret_status') {
        return Promise.resolve({ secretRef, stored: stored.has(secretRef), last4: stored.has(secretRef) ? 'test' : null });
      }
      return invoke(command, args);
    };
  });
}

async function openEmptyVault(page: Page) {
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, { files: VAULT_FILES });
  await answerConnectorCommands(page);
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open (?:a|my) folder/i }).click();
  await page.getByRole('heading', { name: 'Map' }).waitFor();
  return harness;
}

async function startNotionImport(page: Page, harness: LibraryWorkHarness) {
  const dialog = page.getByTestId('library-import-dialog');
  await dialog.locator('[data-testid="library-import-service"][data-service="notion"]').click();
  await dialog.getByTestId('library-import-token').fill('fixture_value');
  await dialog.getByTestId('library-import-connect').click();
  await dialog.getByTestId('library-import-what').fill('the launch plan');
  await dialog.getByTestId('library-import-bring').click();
  await expect.poll(async () => (await harness.snapshot(page)).calls.filter((call) => call.method === 'session/prompt').length).toBe(1);
}

test('an import Planning asked for ends with a way back to Planning', async ({ page }) => {
  const harness = await openEmptyVault(page);
  await page.goto('/en/planning/');
  await page.locator('[data-planning-import]').click();
  await startNotionImport(page, harness);
  await expect(page.getByRole('button', { name: 'Open in Planning' })).toHaveCount(0);

  await harness.answer(page, 'Saved the launch plan under planning/notion.');

  await page.getByRole('button', { name: 'Open in Planning' }).click();
  await expect(page).toHaveURL(/\/en\/planning\//);
  await expect(page.locator('[data-planning-import]')).toBeVisible();
});

test('an import started on the empty Library keeps its conversation when the first document arrives', async ({ page }) => {
  const harness = await openEmptyVault(page);
  await page.goto('/en/library/?guides=off&e2e=1');
  await expect(page.getByTestId('library-page')).toHaveAttribute('data-library-state', 'empty-folder');
  await page.getByTestId('library-start-stage').getByRole('button', { name: 'Bring from a service' }).click();
  await startNotionImport(page, harness);
  await expect(page.getByTestId('library-agent-dock')).toBeVisible();

  await harness.mutateSource(page, 'sources/notion/launch-plan.md', '# Launch plan\n');

  await expect(page.getByTestId('library-page')).not.toHaveAttribute('data-library-state', 'empty-folder', { timeout: 20_000 });
  await harness.answer(page, 'Saved the launch plan under sources/notion.');
  await expect(page.getByTestId('library-agent-dock')).toContainText('Saved the launch plan under sources/notion.');
  const calls = (await harness.snapshot(page)).calls;
  expect(calls.filter((call) => call.method === 'session/new')).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Open in Planning' })).toHaveCount(0);
});
