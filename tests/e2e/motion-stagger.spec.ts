import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { useDogfoodSample } from './sample-source';

test.use({ viewport: { width: 1512, height: 945 } });

interface StaggerEvent {
  at: number;
  added: boolean;
  slug: string | null;
  name: string;
  duration: string;
  delay: string;
}

async function recordStaggerClasses(page: Page) {
  await page.addInitScript(() => {
    const events: StaggerEvent[] = [];
    (window as unknown as { __stagger: StaggerEvent[] }).__stagger = events;
    const staggered = (value: string | null) => /\bmotion-stagger-(in|fade)\b/.test(value ?? '');
    const state = new WeakMap<Element, boolean>();
    const push = (el: Element, added: boolean) => {
      if (!el.isConnected || state.get(el) === added) return;
      state.set(el, added);
      const style = getComputedStyle(el);
      events.push({
        at: performance.now(),
        added,
        slug: el.getAttribute('data-concept-slug'),
        name: style.animationName,
        duration: style.animationDuration,
        delay: style.animationDelay,
      });
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) {
          const has = staggered(record.target.getAttribute('class'));
          if (staggered(record.oldValue) !== has) push(record.target, has);
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          for (const el of [node, ...node.querySelectorAll('*')]) {
            if (staggered(el.getAttribute('class'))) push(el, true);
          }
        }
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
    });
  });
}

const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stagger: StaggerEvent[] }).__stagger.slice());

const toMs = (value: string) => parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);

const cssMs = (page: Page, name: string) =>
  page.evaluate((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(), name).then(toMs);

async function openRole(page: Page) {
  await recordStaggerClasses(page);
  await page.goto('/en/architecture/?view=architecture&guides=off');
  await expect(page.getByTestId('architecture-graph')).toBeVisible({ timeout: 30_000 });
  const box = page.getByTestId('architecture-graph-box-widgets');
  await box.click();
  await expect(page.locator('[data-concept-slug]').first()).toBeVisible();
  return box;
}

test('a list staggers once on its first arrival, capped at three steps, and never replays', async ({ page }) => {
  await seedFirstRunSeen(page);
  await useDogfoodSample(page);
  const box = await openRole(page);
  const step = await cssMs(page, '--motion-stagger');
  const base = await cssMs(page, '--motion-base');

  await expect(page.locator('.motion-stagger-in, .motion-stagger-fade')).toHaveCount(0);
  const first = (await events(page)).filter((event) => event.slug !== null);
  const added = first.filter((event) => event.added);
  expect(added.length, 'the first arrival carries the stagger class').toBeGreaterThan(1);
  const delays = added.map((event) => toMs(event.delay));
  expect(delays[0]).toBe(0);
  for (let i = 1; i < delays.length; i += 1) expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
  expect(Math.max(...delays)).toBeLessThanOrEqual(3 * step);
  const window = Math.max(...first.map((event) => event.at)) - Math.min(...added.map((event) => event.at));
  expect(window, 'the class leaves after the entrance window').toBeLessThanOrEqual(3 * step + base + 250);

  await box.click();
  await expect(page.locator('[data-concept-slug]')).toHaveCount(0);
  await box.click();
  await expect(page.locator('[data-concept-slug]').first()).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const again = (await events(page)).filter((event) => event.slug !== null && event.added);
  expect(again.length, 'returning to the same list in the session replays nothing').toBe(added.length);
});

test('reduced motion keeps the fade on the fast step with no delay', async ({ page }) => {
  await seedFirstRunSeen(page);
  await useDogfoodSample(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRole(page);
  const fast = await cssMs(page, '--motion-fast');
  const added = (await events(page)).filter((event) => event.slug !== null && event.added);
  expect(added.length).toBeGreaterThan(0);
  for (const event of added) {
    expect(event.name).toBe('panelCrossfadeIn');
    expect(toMs(event.duration)).toBe(fast);
    expect(toMs(event.delay)).toBe(0);
  }
});
