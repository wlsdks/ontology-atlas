import { expect, test } from '@playwright/test';
import { waitForDocumentPaint } from './visual-ready';

test('paint readiness observes the end of a finite transition', async ({ page }) => {
  await page.setContent('<main><div id="moving" style="width:10px;height:10px"></div></main>');
  await page.evaluate(() => {
    const node = document.querySelector('#moving')!;
    node.animate([{ width: '10px' }, { width: '300px' }], { duration: 200, fill: 'forwards' });
  });
  await waitForDocumentPaint(page);
  expect(await page.locator('#moving').evaluate((node) => node.getBoundingClientRect().width)).toBe(300);
});

test('continuous decoration does not block paint readiness', async ({ page }) => {
  await page.setContent('<main><div id="decoration">Ready</div></main>');
  await page.evaluate(() => {
    document.querySelector('#decoration')!.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 200, iterations: Infinity });
  });
  await waitForDocumentPaint(page);
  expect(await page.evaluate(() => document.getAnimations().some((animation) => animation.playState === 'running'))).toBe(true);
});
