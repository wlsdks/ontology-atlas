import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { LOCALE_META } from '../../src/i18n/locales';
import { CJK_LOCALES } from './locales';
import { seedFirstRunSeen } from './first-run-seed';
import { waitFrames } from './settle';

/**
 * Japanese and Chinese strings are written without the English or Korean length as a guide, so the
 * chrome that fits in `en` and `ko` can clip in `ja` and `zh`. This opens each main screen and every
 * settings pane at the app floor (1040) and the owner's laptop width (1440) and fails on any element
 * that cuts its own text, or any page that scrolls sideways. `E2E_SWEEP_SHOTS` also writes a dark
 * screenshot of each screen at 1440 into that directory, for a person to read.
 */
const VIEWPORTS = [
  { width: 1040, height: 720 },
  { width: 1440, height: 900 },
] as const;

const ROUTES = ['topology', 'library', 'docs', 'ontology/insights', 'architecture', 'agents', 'git', 'projects', 'download', 'no-such-page'] as const;
const SETTINGS_PANES = ['screen', 'map', 'expand', 'footprint', 'notify', 'agents', 'privacy', 'workspace', 'about'] as const;

const SHOTS = process.env.E2E_SWEEP_SHOTS;

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
      // A visually hidden label is 1px by design.
      if (rect.width <= 2 || rect.height <= 2) continue;
      // A file path is vault data, not copy, and truncates in every locale by design.
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
        await seedFirstRunSeen(page);
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
          await page.goto(`/${locale}/${route}/?guides=off`, { waitUntil: 'domcontentloaded' });
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
          await page.goto(`/${locale}/topology/?guides=off`, { waitUntil: 'domcontentloaded' });
          await page.getByTestId('app-settings-trigger').click();
          await expect(page.getByTestId('app-settings-popover')).toBeVisible();
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
