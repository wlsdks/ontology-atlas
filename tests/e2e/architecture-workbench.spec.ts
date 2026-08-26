import { expect, test } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { useDogfoodSample } from './sample-source';

test.use({ viewport: { width: 600, height: 900 } });

test('단계 전환 뒤 새 스크롤 끝과 하단 탭 사이에 붙여넣을 문장 버튼이 남는다', async ({ page }) => {
  await seedFirstRunSeen(page);
  await useDogfoodSample(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ko/architecture/?guides=off');

  const scroller = page.getByTestId('architecture-layout-scroll');
  await expect(page.getByText('Atlas Web Workbench').first()).toBeVisible();
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const before = await scroller.evaluate((element) => ({
    scrollTop: element.scrollTop,
    maxScrollTop: element.scrollHeight - element.clientHeight,
  }));
  expect(Math.abs(before.maxScrollTop - before.scrollTop)).toBeLessThanOrEqual(1);

  const plan = page.getByRole('radio', { name: '계획' });
  await plan.focus();
  await page.keyboard.press('Space');
  await expect(plan).toHaveAttribute('aria-checked', 'true');

  await expect.poll(
    () => scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop),
    { message: 'Plan content changed the scroll height without preserving the prior end anchor' },
  ).toBeLessThanOrEqual(1);

  const report = await page.getByRole('button', { name: '에이전트에 붙여넣을 문장 복사' }).evaluate(
    (button) => {
      const bar = document.querySelector<HTMLElement>('nav[data-tabbar="primary"]');
      const buttonRect = button.getBoundingClientRect();
      const barRect = bar?.getBoundingClientRect() ?? null;
      const hit = document.elementFromPoint(
        buttonRect.left + buttonRect.width / 2,
        buttonRect.top + buttonRect.height / 2,
      );
      return {
        clearance: barRect ? barRect.top - buttonRect.bottom : null,
        hitOwnsPoint: hit === button || button.contains(hit),
      };
    },
  );

  expect(report.clearance).not.toBeNull();
  expect(report.clearance!).toBeGreaterThanOrEqual(-1);
  expect(report.hitOwnsPoint).toBe(true);
});
