import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { LOCALE_META } from '../../../src/i18n/locales';
import { CJK_LOCALES } from '../locales';
import { installDesktopRailRuntime, mountDesktopVault } from '../desktop-rail-arrival-harness';
import { seedFirstRunSeen } from '../first-run-seed';
import { waitFrames } from '../settle';

const VIEWPORTS = [
  { width: 1040, height: 720 },
  { width: 1440, height: 900 },
] as const;

const ROUTES = ['topology', 'library', 'docs', 'architecture', 'agents', 'git', 'projects', 'download', 'no-such-page'] as const;
const SETTINGS_PANES = ['screen', 'map', 'expand', 'footprint', 'notify', 'agents', 'privacy', 'workspace', 'about'] as const;

const SHOTS = process.env.E2E_SWEEP_SHOTS;

/** Moves to a screen inside the app, so the opened folder stays open as it does for a person. */
async function openRoute(page: Page, url: string): Promise<void> {
  await page.evaluate((to) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(to), url);
  await page.waitForURL((current) => current.pathname === new URL(url, current).pathname);
}

/** Opens the fixture folder in the app, so every screen is measured with a folder's content on it. */
async function openFolderThen(page: Page, locale: string): Promise<void> {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page, locale);
}

interface Clip {
  readonly text: string;
  readonly tag: string;
  readonly testId: string;
  readonly axis: 'x' | 'y';
  readonly scroll: number;
  readonly client: number;
}

const describeClips = (clips: readonly Clip[]) => clips.map((c) => `${c.axis} ${c.scroll}/${c.client} <${c.tag}> [${c.testId}] ${c.text}`);

async function measure(page: Page): Promise<{ clips: Clip[]; pageScroll: number }> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const clips: Clip[] = [];
    const root = document.querySelector('[data-testid="app-settings-popover"]') ?? document.body;
    for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      const own = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) continue;
      if (element.closest('[data-testid="docs-editor-path"]')) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const clipsX = style.overflowX !== 'visible' && element.scrollWidth > element.clientWidth + 1;
      const clipsY = style.overflowY !== 'visible' && style.overflowY !== 'auto' && style.overflowY !== 'scroll' && element.scrollHeight > element.clientHeight + 1;
      if (!clipsX && !clipsY) continue;
      clips.push({
        text: own.slice(0, 60),
        tag: element.tagName.toLowerCase(),
        testId: element.closest('[data-testid]')?.getAttribute('data-testid') ?? '',
        axis: clipsX ? 'x' : 'y',
        scroll: clipsX ? element.scrollWidth : element.scrollHeight,
        client: clipsX ? element.clientWidth : element.clientHeight,
      });
    }
    return { clips, pageScroll: document.documentElement.scrollWidth - window.innerWidth };
  });
}

for (const locale of CJK_LOCALES) {
  const meta = (LOCALE_META as Record<string, { htmlLang: string }>)[locale];
  for (const viewport of VIEWPORTS) {
    test.describe(`${locale} ${viewport.width}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
        await page.setViewportSize(viewport);
      });

      const shot = async (page: Page, name: string) => {
        if (!SHOTS || viewport.width !== 1440) return;
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, `${locale}-${name}.png`) });
      };

      for (const route of ROUTES) {
        test(`${route} keeps its text whole`, async ({ page }) => {
          // `/download` is the website's page: the app does not carry it, so it is measured without the runtime.
          if (route === 'download') await seedFirstRunSeen(page);
          else await openFolderThen(page, locale);
          if (route === 'download') await page.goto(`/${locale}/${route}/?guides=off`, { waitUntil: 'domcontentloaded' });
          else await openRoute(page, `/${locale}/${route}/?guides=off`);
          await expect(page.locator('main, [role="main"], body').first()).toBeVisible();
          await page.waitForLoadState('networkidle').catch(() => undefined);
          await waitFrames(page, 30);
          await expect(page.locator('html')).toHaveAttribute('lang', meta.htmlLang);
          const { clips, pageScroll } = await measure(page);
          await shot(page, route.replaceAll('/', '-'));
          expect(describeClips(clips)).toEqual([]);
          expect(pageScroll).toBeLessThanOrEqual(0);
        });
      }

      for (const pane of SETTINGS_PANES) {
        test(`settings ${pane} keeps its text whole`, async ({ page }) => {
          await openFolderThen(page, locale);
          await openRoute(page, `/${locale}/topology/?guides=off`);
          await expect(async () => {
            if (!(await page.getByTestId('app-settings-popover').isVisible())) await page.locator('[data-testid="app-settings-trigger"]:visible').first().click();
            await expect(page.getByTestId('app-settings-popover')).toBeVisible({ timeout: 2000 });
          }).toPass({ timeout: 20_000 });
          await page.getByTestId(`app-settings-nav-${pane}`).click();
          await expect(page.getByTestId(`app-settings-pane-${pane}`)).toBeVisible();
          await waitFrames(page, 20);
          const { clips } = await measure(page);
          await shot(page, `settings-${pane}`);
          expect(describeClips(clips)).toEqual([]);
        });
      }
    });
  }
}
