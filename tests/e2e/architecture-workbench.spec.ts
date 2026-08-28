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

test('the agent packet says it is longer than its box, before anything is scrolled', async ({
  page,
}) => {
  /*
   * ⚠️ The fade over a covered edge existed and never appeared. Measured on the built export
   * (2026-08-28): entering plan mode gave `clientHeight 190, scrollHeight 444` with
   * `mask-image: none` — a quarter of a kilobyte of text hidden with nothing on screen saying so,
   * which a fresh-eyes walker read as a sentence truncated mid-word. Any scroll fixed it, which is
   * why a unit test could not catch it: the reading ran once, before the block was mounted.
   *
   * macOS hides its overlay scrollbar until something moves, so the fade is the only affordance
   * this state has. Asserted here rather than in jsdom because the whole claim is about a
   * measured box.
   */
  await page.goto('/ko/architecture/');
  await page.getByTestId('architecture-mode-plan').click();

  const packet = page.locator('pre[aria-label]').first();
  await expect(packet).toBeVisible();

  const measured = await packet.evaluate((element) => ({
    hidden: element.scrollHeight - element.clientHeight,
    mask: getComputedStyle(element).maskImage,
    scrollTop: element.scrollTop,
  }));

  expect(measured.scrollTop, 'nothing has been scrolled yet').toBe(0);
  expect(measured.hidden, 'this fixture is meant to overflow its box').toBeGreaterThan(1);
  expect(measured.mask, 'a covered edge with no affordance reads as truncated text').not.toBe(
    'none',
  );
});

test('the canvas says when the drawing runs past its right edge', async ({ page }) => {
  /*
   * ⚠️ The drawing keeps its true size and the canvas is a viewport, so a profile wider than the
   * window is simply cut at the panel edge — and macOS keeps its overlay scrollbar invisible until
   * something moves. Found in the installed app (2026-08-28), where the seventh role sat half off
   * the edge with nothing on screen distinguishing "there is more" from "it ends here". Same defect
   * as the agent packet one panel over, on the other axis, so it reuses that judgment.
   *
   * Both directions are asserted: an affordance that is always on is not an affordance.
   */
  await page.setViewportSize({ width: 1512, height: 950 });
  await page.goto('/ko/architecture/');
  const scroller = page.locator('[data-testid="architecture-graph"]').locator('..');
  await expect(scroller).toBeVisible();

  const wide = await scroller.evaluate((element) => ({
    hidden: element.scrollWidth - element.clientWidth,
    mask: getComputedStyle(element).maskImage,
  }));
  expect(wide.hidden, 'this profile is meant to fit at the workbench width').toBeLessThanOrEqual(1);
  expect(wide.mask, 'nothing is covered, so nothing should claim to be').toBe('none');

  await page.setViewportSize({ width: 700, height: 950 });
  const narrow = await scroller.evaluate((element) => ({
    hidden: element.scrollWidth - element.clientWidth,
    mask: getComputedStyle(element).maskImage,
  }));
  expect(narrow.hidden, 'the drawing keeps its size, so this width must cut it').toBeGreaterThan(1);
  expect(narrow.mask, 'a cut edge with no affordance reads as the end of the drawing').not.toBe(
    'none',
  );
});

test('a cut-off drawing says how much of itself is missing', async ({ page }) => {
  /*
   * ⚠️ The fade this replaced was real and measurable and nobody saw it. A fresh-eyes walkthrough
   * measured 180px hidden at 700 and 490px at 390, zoomed in specifically to check whether the cut
   * edge carried an intentional mask, and reported "no scrollbar, no fade, no arrow" — because a
   * fade works by dissolving ink and that edge carries a dot grid and a hairline arrow tail. An
   * affordance nobody perceives is not an affordance, which is the same standard this screen
   * already applied to a rule list rendered one pixel wide.
   *
   * The count is derived from the boxes' own geometry, so it is asserted as a number rather than
   * as the presence of a mark. Both directions: nothing hidden must claim nothing.
   */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ko/architecture/');
  const chip = page.getByTestId('architecture-canvas-hidden-right');
  const drawing = page.getByTestId('architecture-graph');
  await expect(drawing).toBeVisible();
  await expect(chip, 'the whole drawing fits, so nothing should claim otherwise').toHaveCount(0);

  await page.setViewportSize({ width: 700, height: 900 });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('1');

  /* And it must not sit on the drawing: an opaque chip over a node is the overlap the design
     system forbids, which is how the run control earned its own row. */
  const [chipBox, drawingBox] = await Promise.all([chip.boundingBox(), drawing.boundingBox()]);
  expect(chipBox).not.toBeNull();
  expect(drawingBox).not.toBeNull();
  expect(chipBox!.y + chipBox!.height).toBeLessThanOrEqual(drawingBox!.y + 1);
});
