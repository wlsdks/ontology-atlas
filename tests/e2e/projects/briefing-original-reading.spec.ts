import { expect, test, type Page } from '@playwright/test';
import { calls, enter, readPrs } from './git-pr-briefing-helpers';
import { readFileSync, readdirSync } from 'node:fs';
import { auditPage } from '../../../scripts/lib/design/ui-audit-probe.mjs';
import { parseRampNames, shouldFail } from '../../../scripts/lib/design/ui-audit-checks.mjs';

test.use({ viewport: { width: 1920, height: 1080 } });

const title = 'Keep map navigation readable';
const body = [
  '## Changes',
  'Changes: keep return controls visible. See [the rationale][reason].',
  '- Keep the chosen map.\n- Return to the same claim.',
  '```ts\nconst first = 1;\n\nconst second = 2;\n```',
  '| Source | Status |\n| --- | --- |\n| Original | Kept |',
  '![Map comparison](https://example.invalid/private-image.png)',
  '<script>window.__untrustedOriginal = true</script>',
  '[Local file](file:///etc/passwd) and [Unsafe action](javascript:alert%281%29).',
  '[Contact author](mailto:author@example.invalid)',
  ...Array.from({ length: 60 }, (_, index) => `Earlier author note ${index}.`),
  'Why: panels hid navigation.',
  '[reason]: https://example.invalid/rationale',
].join('\n\n');

async function openSources(page: Page, text = body, descriptionTitle = title) {
  await enter(page);
  await page.evaluate(({ text, descriptionTitle }) => {
    const target = window as unknown as { __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> } };
    const invoke = target.__TAURI_INTERNALS__.invoke;
    target.__TAURI_INTERNALS__.invoke = async (command, args) => {
      const result = await invoke(command, args);
      if (command === 'git_briefing_pull_descriptions') {
        Object.assign((result as { descriptions: { body: string; title: string }[] }).descriptions[0], { body: text, title: descriptionTitle });
      }
      return result;
    };
  }, { text, descriptionTitle });
  await readPrs(page);
  await page.getByTestId('briefing-originals').click();
}

test('reads PR Markdown as a whole document without fetching embedded content and retains exact text', async ({ page }, testInfo) => {
  const external: string[] = [];
  page.on('request', request => { if (request.url().startsWith('https://example.invalid')) external.push(request.url()); });
  await openSources(page);
  await page.getByRole('button', { name: new RegExp(title) }).click();
  const original = page.getByTestId('briefing-original');
  await expect(original.getByRole('heading', { name: 'Changes', exact: true })).toBeVisible();
  await expect(original.getByText(title, { exact: true })).toHaveCount(1);
  const rampNames = parseRampNames(readdirSync('app/styles').filter(name => name.endsWith('.css')).map(name => readFileSync(`app/styles/${name}`, 'utf8')).join('\n'));
  const audit = await auditPage(page, { width: 1920, rampNames, scope: 'main' });
  await testInfo.attach('formatted-original-audit', { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
  expect(shouldFail([audit]), JSON.stringify(audit.findings)).toBe(false);
  await expect(original.locator('li')).toHaveText(['Keep the chosen map.', 'Return to the same claim.']);
  await expect(original.locator('pre code')).toHaveText('const first = 1;\n\nconst second = 2;\n');
  await expect(original.getByRole('link', { name: 'the rationale' })).toHaveAttribute('href', 'https://example.invalid/rationale');
  await expect(original.getByRole('table')).toHaveCount(1);
  await expect(original.locator('img,script,iframe')).toHaveCount(0);
  await expect(original.getByRole('link', { name: 'Local file', exact: true })).toHaveCount(0);
  await expect(original.getByRole('link', { name: 'Unsafe action', exact: true })).toHaveCount(0);
  await expect(original.getByRole('link', { name: 'Contact author', exact: true })).toHaveCount(0);
  expect(external).toEqual([]);
  expect(await page.evaluate(() => '__untrustedOriginal' in window)).toBe(false);
  await original.getByRole('button', { name: 'View source text', exact: true }).click();
  expect(await original.getByTestId('briefing-source-text').textContent()).toBe(`${title}\n\n${body}`);
  await original.getByRole('button', { name: 'View formatted text', exact: true }).click();
  await expect(original.getByRole('heading', { name: 'Changes', exact: true })).toBeVisible();
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(0);
});

test('opens a late cited passage in view and returns to the exact summary claim', async ({ page }) => {
  await openSources(page);
  await page.getByTestId('briefing-summary-mode').click();
  await page.getByRole('button', { name: 'Create summary', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  const citations = page.getByTestId('briefing-theme').getByRole('button', { name: `Read source ${title}`, exact: true });
  const reason = citations.nth(1);
  await reason.click();
  const original = page.getByTestId('briefing-original');
  const selected = original.locator('[data-source-passage]').filter({ hasText: 'Why: panels hid navigation.' });
  await expect(selected).toContainText('Why: panels hid navigation.');
  await expect(selected).toBeInViewport();
  await original.getByRole('button', { name: 'Back to summary', exact: true }).last().click();
  await expect(reason).toBeFocused();
});


test('keeps a cited passage inside a multi-paragraph code fence attached to the whole code block', async ({ page }) => {
  const text = body.replace('Why: panels hid navigation.', '```text\nWhy: panels hid navigation.\n\n한글 + emoji 🧭 stay in the same fence.\n```');
  await openSources(page, text);
  await page.getByTestId('briefing-summary-mode').click();
  await page.getByRole('button', { name: 'Create summary', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await page.getByTestId('briefing-theme').getByRole('button', { name: `Read source ${title}`, exact: true }).nth(1).click();
  const original = page.getByTestId('briefing-original');
  const code = original.locator('pre[data-source-selected="true"]');
  await expect(code).toHaveText('Why: panels hid navigation.\n\n한글 + emoji 🧭 stay in the same fence.\n');
  await expect(code).toBeInViewport();
  await original.getByRole('button', { name: 'View source text', exact: true }).click();
  expect(await original.getByTestId('briefing-source-text').textContent()).toBe(`${title}\n\n${text}`);
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Map', exact: true }).click();
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Changes', exact: true }).click();
  await expect(original.getByTestId('briefing-source-text')).toBeVisible();
  expect(await original.getByTestId('briefing-source-text').textContent()).toBe(`${title}\n\n${text}`);
  expect(await calls(page, 'source_briefing_chat')).toHaveLength(1);
});

test('falls back to exact text for a citation into an unpainted Markdown definition', async ({ page }) => {
  const text = body.replace('Why: panels hid navigation.', '[unused]: https://example.invalid/definition "Why: panels hid navigation."');
  await openSources(page, text);
  await page.getByTestId('briefing-summary-mode').click();
  await page.getByRole('button', { name: 'Create summary', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await page.getByTestId('briefing-theme').getByRole('button', { name: `Read source ${title}`, exact: true }).nth(1).click();
  const original = page.getByTestId('briefing-original');
  const selected = original.locator('[data-source-selected="true"]');
  await expect(selected).toContainText('[unused]: https://example.invalid/definition');
  await expect(selected).toBeInViewport();
  expect(await original.getByTestId('briefing-source-text').textContent()).toBe(`${title}\n\n${text}`);
});

test('keeps an explicit formatted citation view through route and period returns', async ({ page }) => {
  const text = body.replace('Why: panels hid navigation.', '[unused]: https://example.invalid/definition "Why: panels hid navigation."');
  await openSources(page, text);
  await page.getByTestId('briefing-summary-mode').click();
  await page.getByRole('button', { name: 'Create summary', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await page.getByTestId('briefing-theme').getByRole('button', { name: `Read source ${title}`, exact: true }).nth(1).click();
  const original = page.getByTestId('briefing-original');
  await expect(original.getByTestId('briefing-source-text')).toBeVisible();
  await original.getByRole('button', { name: 'View formatted text', exact: true }).click();
  await expect(original.getByRole('heading', { name: 'Changes', exact: true })).toBeVisible();
  const position = await original.evaluate(element => { const main = element.closest('main')!; main.scrollTop = 800; return main.scrollTop; });
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await page.getByRole('button', { name: 'Previous period', exact: true }).click();
  await expect(original.getByTestId('briefing-source-reading')).toBeVisible();
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Map', exact: true }).click();
  await page.getByTestId('app-nav-rail').getByRole('link', { name: 'Changes', exact: true }).click();
  await expect(original.getByTestId('briefing-source-reading')).toBeVisible();
  await expect.poll(() => original.evaluate(element => element.closest('main')!.scrollTop)).toBe(position);
  await original.getByRole('button', { name: 'Back to summary', exact: true }).first().click();
  const citation = page.getByTestId('briefing-theme').getByRole('button', { name: `Read source ${title}`, exact: true }).nth(1);
  await expect(citation).toBeFocused();
  await citation.click();
  await expect(original.getByTestId('briefing-source-text')).toBeVisible();
  await expect(original.locator('[data-source-selected="true"]')).toBeInViewport();
});

test('shows exact text when a cited passage begins far inside a long code block', async ({ page }) => {
  const text = '## Changes\n\nChanges: keep return controls visible.\n\n```text\n'
    + Array.from({ length: 80 }, (_, index) => `Earlier code note ${index}.`).join('\n\n')
    + '\n\nWhy: panels hid navigation.\n```';
  await openSources(page, text);
  await page.getByTestId('briefing-summary-mode').click();
  await page.getByRole('button', { name: 'Create summary', exact: true }).click();
  await page.getByRole('button', { name: 'Create period explanation', exact: true }).click();
  await page.getByTestId('briefing-theme').getByRole('button', { name: `Read source ${title}`, exact: true }).nth(1).click();
  const original = page.getByTestId('briefing-original');
  await expect(original.getByTestId('briefing-source-text')).toBeVisible();
  const selected = original.locator('[data-source-selected="true"]');
  await expect(selected).toContainText('Why: panels hid navigation.');
  await expect(selected).toBeInViewport();
});


for (const descriptionTitle of ['[reason]: https://example.invalid/from-title', '```text']) {
  test(`does not let a ${descriptionTitle.startsWith('[') ? 'reference definition' : 'code fence'} in the PR title change its body`, async ({ page }) => {
    const text = '## Changes\n\nBody uses [rationale][reason].';
    await openSources(page, text, descriptionTitle);
    await page.getByTestId('briefing-sources').locator('[data-control="row"]').first().click();
    const original = page.getByTestId('briefing-original');
    await expect(original.getByRole('heading', { name: 'Changes', exact: true })).toBeVisible();
    await expect(original.getByTestId('briefing-source-reading').getByRole('link')).toHaveCount(0);
    await expect(original.getByTestId('briefing-source-reading').locator('pre')).toHaveCount(0);
    await expect(original.getByTestId('briefing-source-reading')).toContainText('Body uses [rationale][reason].');
    await original.getByRole('button', { name: 'View source text', exact: true }).click();
    expect(await original.getByTestId('briefing-source-text').textContent()).toBe(`${descriptionTitle}\n\n${text}`);
  });
}
