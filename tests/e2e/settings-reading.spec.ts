import { expect, test, type Page } from '@playwright/test';
import { installDesktopRailRuntime } from './desktop-rail-arrival-harness';

const SECTIONS = ['screen', 'map', 'expand', 'footprint', 'notify', 'agents', 'privacy', 'workspace', 'about'];

async function openSettings(page: Page, locale: 'en' | 'ko', textSize?: 'larger') {
  if (textSize) {
    await page.addInitScript((value) => window.localStorage.setItem('atlas.appearance.text-size', value), textSize);
  }
  await installDesktopRailRuntime(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/${locale}/?guides=off`);
  await page.getByTestId('first-run-open').click();
  await page.locator('[data-testid="app-settings-trigger"]:visible').click();
  await expect(page.getByTestId('app-settings-popover')).toBeVisible();
}

function rowTextStarts(): { id: string; left: number }[] {
  const pane = document.querySelector('[data-testid^="app-settings-pane-"]')!;
  const firstInk = (root: Element): number | null => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Element && node.tagName.toLowerCase() === 'svg') return node.getBoundingClientRect().left;
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0) return rect.left;
      }
    }
    return null;
  };
  return [...pane.querySelectorAll('[data-setting-id]')]
    .filter((row) => !row.parentElement?.closest('[data-setting-id]'))
    .flatMap((row) => {
      const left = firstInk(row);
      return left === null ? [] : [{ id: row.getAttribute('data-setting-id')!, left }];
    });
}

// The app's window floor and a common desktop window; phone and tablet widths are not a
// target (owner direction, 2026-09-27).
for (const [width, height] of [[1040, 720], [1440, 900]] as const) {
  test.describe(`settings at ${width}`, () => {
    test.use({ viewport: { width, height } });

    test('⌘, opens the sheet, and on an open sheet focuses search', async ({ page }) => {
      await installDesktopRailRuntime(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/en/?guides=off');
      await page.getByTestId('first-run-open').click();
      await expect(page.locator('[data-testid="app-settings-trigger"]:visible')).toHaveAttribute('aria-expanded', 'false');
      await expect(async () => {
        await page.keyboard.press('ControlOrMeta+Comma');
        await expect(page.getByTestId('app-settings-popover')).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await page.keyboard.press('ControlOrMeta+Comma');
      await expect(page.getByTestId('app-settings-search')).toBeFocused();
    });

    for (const textSize of [undefined, 'larger'] as const) {
      test(`the left list fits without scrolling at ${textSize ?? 'default'} text`, async ({ page }) => {
        await openSettings(page, 'en', textSize);
        const root = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
        expect(root).toBe(textSize ? '20px' : '16px');
        const nav = await page.getByTestId('app-settings-nav').evaluate((el) => ({
          vertical: el.scrollHeight - el.clientHeight,
          horizontal: el.scrollWidth - el.clientWidth,
        }));
        expect(nav.vertical, 'the left list scrolls vertically').toBeLessThanOrEqual(1);
        expect(nav.horizontal, 'the left list scrolls sideways').toBeLessThanOrEqual(1);
      });
    }

    for (const [locale, query] of [['en', 'API'], ['ko', '키']] as const) {
      test(`search reaches API keys in one press (${locale})`, async ({ page }) => {
        await openSettings(page, locale);
        await page.getByTestId('app-settings-search').fill(query);
        await expect(page.getByTestId('app-settings-search-results')).toBeVisible();
        await page.getByTestId('app-settings-search').press('Enter');
        await expect(page).toHaveURL(/\/agents\/\?(?:.*&)?tab=models/);
      });
    }

    test('Screen · language fits at the default text size', async ({ page }) => {
      await openSettings(page, 'en');
      const pane = page.getByTestId('app-settings-pane-screen');
      const overflow = await pane.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(overflow, 'the Screen pane scrolls').toBeLessThanOrEqual(1);
    });

    test('every pane starts its row text on one line', async ({ page }) => {
      await openSettings(page, 'ko');
      for (const section of SECTIONS) {
        await page.getByTestId(`app-settings-nav-${section}`).click();
        await expect(page.getByTestId(`app-settings-pane-${section}`)).toBeVisible();
        const starts = await page.evaluate(rowTextStarts);
        expect(starts.length, `${section} anchors no row`).toBeGreaterThan(0);
        const lefts = starts.map((start) => start.left);
        expect(Math.max(...lefts) - Math.min(...lefts), `${section}: ${JSON.stringify(starts)}`).toBeLessThanOrEqual(1);
      }
    });

    test('notification choices leave their explanation readable', async ({ page }) => {
      await installDesktopRailRuntime(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/ko/?guides=off');
  await page.getByTestId('first-run-open').click();
      await page.locator('[data-testid="app-settings-trigger"]:visible').click();
      const panel = page.getByTestId('app-settings-popover');
      await panel.getByRole('button', { name: '알림', exact: true }).click();
      const row = page.getByTestId('app-settings-agent-notification-kinds');
      await expect(row.getByRole('switch')).toHaveCount(6);
      const geometry = await row.evaluate(el => {
        const row = el.getBoundingClientRect();
        const caption = el.querySelectorAll('p')[1].getBoundingClientRect();
        const buttons = [...el.querySelectorAll('button')].map(button => button.getBoundingClientRect().toJSON());
        return { row: row.toJSON(), caption: caption.toJSON(), buttons };
      });
      expect(geometry.caption.width / geometry.row.width, 'caption squeezed beside the controls').toBeGreaterThan(0.8);
      for (const button of geometry.buttons) {
        expect(button.top).toBeGreaterThanOrEqual(geometry.caption.bottom);
        expect(button.right).toBeLessThanOrEqual(geometry.row.right);
      }
    });

    test('expanded map controls fit the pane and remain reachable', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/ko/ontology/insights/?guides=off');
      await page.locator('[data-testid="app-settings-trigger"]:visible').click();
      for (const section of ['expand', 'footprint']) {
        await page.getByTestId(`app-settings-nav-${section}`).click();
        await page.getByTestId(`app-settings-${section}-detail-toggle`).click();
        const pane = page.getByTestId(`app-settings-pane-${section}`);
        const sliders = await pane.getByRole('slider').all();
        expect(sliders.length).toBeGreaterThan(0);
        for (const slider of sliders) {
          await slider.scrollIntoViewIfNeeded();
          const geometry = await slider.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const pane = element.closest('[data-testid^="app-settings-pane-"]')!;
            const bounds = pane.getBoundingClientRect();
            return {
              left: rect.left, right: rect.right, boundsLeft: bounds.left, boundsRight: bounds.right,
              overflow: pane.scrollWidth - pane.clientWidth,
              reachable: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element,
            };
          });
          expect(geometry.overflow).toBeLessThanOrEqual(1);
          expect(geometry.left).toBeGreaterThanOrEqual(geometry.boundsLeft);
          expect(geometry.right).toBeLessThanOrEqual(geometry.boundsRight);
          expect(geometry.reachable).toBe(true);
        }
      }
    });
  });
}
