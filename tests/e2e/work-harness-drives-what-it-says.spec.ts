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
  // The wire carries the wiki tool...
  const { events } = await harness.snapshot(page);
  expect(JSON.stringify(events)).toContain('mcp__atlas-vault__write_wiki_file');
  // ...and the row names what it does to the wiki page, not a concept patch. Since 2026-09-25 a call
  // on our server the label table does not know reads as its ACP kind rather than its function name.
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-acp-entry="tool"]')]
    .map((row) => (row.textContent ?? '').trim()));
  expect(rows.join(' | ')).toContain('Edit · wiki/architecture.md');
});

/**
 * **Three surfaces this suite could not reach at all.**
 *
 * The past-conversation list, the slash-command menu and the agent's thinking are ordinary things
 * an adapter sends, and nothing here could produce any of them — so nothing had ever rendered
 * them. A harness that cannot reach a surface is why a surface goes unlooked-at.
 */
test('past conversations reach the history list', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await openLibraryWorkScenario(page, {
    pastSessions: [
      { sessionId: 's-1', title: 'Tidy the stale pages', updatedAt: '2026-09-18T04:00:00.000Z' },
      { sessionId: 's-2', updatedAt: '2026-09-15T08:00:00.000Z' },
    ],
  });
  await page.getByTestId('acp-chat-history').click();
  const rows = page.getByTestId('acp-chat-history-item');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Tidy the stale pages');
  // A row the client would discard for an unknown folder must not be how this passes.
  const heights = await rows.evaluateAll((nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().height)));
  expect(new Set(heights).size, 'rows in one list do not share a height').toBe(1);
});

test('the command list reaches the slash menu', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await openLibraryWorkScenario(page, {
    slashCommands: [{ name: 'compact', description: 'Shorten the conversation' }, { name: 'review' }],
  });
  await page.getByTestId('acp-chat-panel').getByRole('textbox').fill('/');
  await expect(page.getByTestId('acp-chat-slash-menu')).toBeVisible();
  await expect(page.getByTestId('acp-chat-slash-menu')).toContainText('/compact');
  await expect(page.getByTestId('acp-chat-slash-menu')).toContainText('/review');
});

test('thinking reaches the work trace', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  const harness = await openLibraryWorkScenario(page, {});
  await harness.think(page, 'A thought the transcript folds away by default.');
  const group = page.getByTestId('acp-chat-work-group');
  await expect(group).toBeVisible();
  // Folded is the default; the words arrive only when asked for.
  await expect(page.locator('[data-acp-entry="thought"]')).toBeHidden();
  await group.click();
  await expect(page.locator('[data-acp-entry="thought"]').first()).toContainText('folds away by default');
});
