import { expect, test } from '@playwright/test';
import { installDesktopRailRuntime } from './desktop-rail-arrival-harness';
import { openSettings } from './settings-reading-harness';

const SECTIONS = ['screen', 'map', 'expand', 'footprint', 'notify', 'agents', 'privacy', 'workspace', 'about'];

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

function paneColumnStarts(): { what: string; left: number }[] {
  const pane = document.querySelector('[data-testid^="app-settings-pane-"]')!;
  const round = (value: number) => Math.round(value * 10) / 10;
  const isCard = (el: Element) => {
    const style = getComputedStyle(el);
    return (
      parseFloat(style.borderLeftWidth) > 0 &&
      parseFloat(style.borderTopLeftRadius) > 0 &&
      el.getBoundingClientRect().width > pane.clientWidth / 2
    );
  };
  const insideCard = (el: Element) => {
    for (let node = el.parentElement; node && node !== pane; node = node.parentElement) {
      if (isCard(node)) return true;
    }
    return false;
  };
  const textLeft = (el: Element) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0) return rect.left;
    }
    return null;
  };
  const cards = [...pane.querySelectorAll('*')]
    .filter((el) => isCard(el) && !insideCard(el))
    .map((el) => ({ what: `card ${el.tagName.toLowerCase()}`, left: round(el.getBoundingClientRect().left) }));
  const texts = [...pane.querySelectorAll('h3, p')]
    .filter((el) => !insideCard(el) && !isCard(el))
    .flatMap((el) => {
      const left = textLeft(el);
      return left === null ? [] : [{ what: el.textContent!.trim().slice(0, 24), left: round(left) }];
    });
  return [...texts, ...cards];
}

for (const [width, height] of [[1040, 720], [1440, 900]] as const) {
  test.describe(`settings at ${width}`, () => {
    test.use({ viewport: { width, height } });

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

    test('every pane starts its head, group labels and card edges on one line', async ({ page }) => {
      await openSettings(page, 'ko');
      for (const section of SECTIONS) {
        await page.getByTestId(`app-settings-nav-${section}`).click();
        await expect(page.getByTestId('app-settings-pane-head')).toContainText(
          await page.getByTestId(`app-settings-nav-${section}`).innerText(),
        );
        const starts = await page.evaluate(paneColumnStarts);
        expect(starts.some((start) => start.what.startsWith('card')), `${section} measured no card`).toBe(true);
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
  });
}
