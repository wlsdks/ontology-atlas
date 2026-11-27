import { expect, test, type Page } from '@playwright/test';

import { installDesktopRailRuntime, mountDesktopVault } from '../desktop-rail-arrival-harness';

const DESTINATIONS = [
  '/en/',
  '/ko/',
  '/en/topology/',
  '/en/docs/',
  '/en/library/',
  '/en/projects/',
  '/en/agents/',
  '/en/agents/?tab=mcp',
  '/en/automations/',
  '/en/insights/',
  '/en/git/',
  '/en/harness/',
  '/en/architecture/',
  '/en/download/',
  '/en/guide/',
];

const FOLDER = {
  'project.md': ['---', 'kind: project', 'slug: launch', 'title: Launch', '---', '', '# Launch', ''].join('\n'),
  'wiki/tracked.md': ['---', 'title: Tracked', '---', '', '# Tracked', '', '![Diagram](https://tracker.example/pixel.png?reader=me)', ''].join('\n'),
};

async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
}

const violations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);

async function openFolderInLibrary(page: Page) {
  await installDesktopRailRuntime(page, FOLDER, undefined, { replaceFixture: true });
  await mountDesktopVault(page);
  await expect(page.getByTestId('first-run-starter')).toHaveCount(0);
  await page.getByTestId('app-nav-rail-item-library').click();
  await expect(page.getByTestId('library-workspace-sources')).toBeVisible();
}

test.describe('the static site under its own policy', () => {
  test.skip(!process.env.PLAYWRIGHT_STATIC, 'the policy ships only in the static export');

  test('every destination loads with no policy violation', async ({ page }) => {
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await recordViolations(page);
    for (const destination of DESTINATIONS) {
      await page.goto(destination);
      await page.waitForLoadState('networkidle');
      expect(await violations(page), destination).toEqual([]);
    }
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      'content',
      /img-src 'self' blob: data:/,
    );
  });

  test('a remote image in a page is never requested, and its place names the host', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('tracker.example')) requested.push(request.url());
    });
    await recordViolations(page);
    await openFolderInLibrary(page);
    await page.getByTestId('library-workspace-wiki').click();
    await page.getByTestId('library-wiki-wiki/tracked').click();
    await expect(page.getByRole('heading', { name: 'Tracked' }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(requested).toEqual([]);
    const placeholder = page.getByTestId('docs-viewer-remote-image');
    await expect(placeholder).toContainText('tracker.example');
    await expect(placeholder.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
    expect(await violations(page)).toEqual([]);
  });
});
