import { expect, test, type Page } from '@playwright/test';

import { openLibraryWorkScenario } from './library-work-harness';

/**
 * **The work harness drives the request it advertises.**
 *
 * `permissionKind: 'ontology-patch'` titled its tool call `patch_concept` but sent the wiki tool
 * name in the correlated MCP payload, and `toPermissionRequest` derives the tool from that
 * correlation rather than from the title. So the card received a `write_wiki_file` request and
 * classified it through the generic branch: the review read 「Change your folder」 and counted the
 * concept's own slug among its changed fields. The mode existed and drove the wrong thing, which
 * is worse than not existing — every assertion written against it passed for the wrong reason.
 *
 * `permissionText` had the same shape of fault: accepted by the signature, read only on the wiki
 * branch, silently dropped on the other. Measured 2026-09-19, when a probe written to grow the
 * review card until it scrolled produced a card of exactly the same height every time.
 *
 * ⚠️ These assertions are about **what the card receives**, not about how it draws it. A harness
 * is a claim about the wire, and nothing else in this suite checks that claim.
 */
const DISTINCT = '## Definition\n\nA sentence only this test would ever write.\n';

const review = (page: Page) => page.evaluate(() => ({
  scope: document.querySelector('[data-testid="task-review-scope"]')?.textContent?.trim() ?? null,
  headline: document.querySelector('[data-testid="acp-permission-card"] p')?.textContent?.trim() ?? null,
  units: [...document.querySelectorAll('[data-testid^="task-review-meaning-unit-"]')]
    .map((node) => (node.textContent ?? '').trim()),
}));

test('an ontology patch reaches the card as a concept update, not a folder write', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  const harness = await openLibraryWorkScenario(page, { permissionKind: 'ontology-patch' });
  await harness.read(page);
  await harness.wait(page);
  await expect(page.getByTestId('acp-permission-card')).toBeVisible({ timeout: 15_000 });

  const shown = await review(page);
  // The operation the patch branch of `buildOntologyChangeSet` produces, and its target.
  expect(shown.scope).toContain('capabilities/task-review');
  expect(shown.scope, 'the card read the patch as a generic folder write').not.toMatch(/folder/i);
  // The slug is the target, so it is not also one of the changed fields.
  expect(shown.scope).toMatch(/1 requested field\b/);
  expect(shown.headline).toContain('task-review');
});

test('a body the caller supplies is the body the card reviews', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  const harness = await openLibraryWorkScenario(page, {
    permissionKind: 'ontology-patch',
    permissionText: DISTINCT,
  });
  await harness.read(page);
  await harness.wait(page);
  await expect(page.getByTestId('acp-permission-card')).toBeVisible({ timeout: 15_000 });

  const shown = await review(page);
  expect(
    shown.units.join('\n'),
    'the caller gave the harness a body and the card reviewed a different one',
  ).toContain('A sentence only this test would ever write.');
});

test('the wiki kind still drives the wiki tool', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  const harness = await openLibraryWorkScenario(page, {});
  await harness.read(page);
  await harness.wait(page);
  await expect(page.getByTestId('acp-permission-card')).toBeVisible({ timeout: 15_000 });
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-acp-entry="tool"]')]
    .map((row) => (row.textContent ?? '').trim()));
  expect(rows.join(' | ')).toContain('write_wiki_file');
});
