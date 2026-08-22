import { expect, test } from '@playwright/test';

/**
 * "Recent changes" must **not be a dead end on the sample.**
 *
 * ## Why this spec exists
 *
 * Owner report, 2026-08-03: *"일반 화면에서 '최근 변경' 누르니까 아무런 반응이
 * 없는데?"* (on the normal screen, pressing "recent changes" does nothing). There
 * were two causes: ① it was disabled without looking disabled (owned by
 * `tests/contract/disabled-affordance.contract.test.ts`), and ② on the sample it
 * **should not have been disabled at all.**
 *
 * Recent changes is 0 on the sample not because nothing has been changed yet but
 * because **the sample's dates are when this repository last touched the fixture.**
 * Waiting does not turn it on — it only gains meaning once a folder is opened. When
 * the reason is "your next action" rather than "none", the next action must be
 * offered: that is `surfaces.md`'s degradation contract (why plus where) and the
 * **0 dead CTAs** the web smoke test requires.
 *
 * Why e2e rather than jsdom: modality (the scrim), centring, focus, and Esc can only
 * be shown true **on a rendered screen.**
 */

test.describe('최근 변경 — 샘플에서 폴더로 가는 길', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto('/ko/topology/?guides=off', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
  });

  test('샘플에서는 눌린다 — 비활성으로 막지 않는다', async ({ page }) => {
    const chip = page.getByTestId('topology-spotlight-toggle');
    await expect(chip).toBeEnabled();
  });

  test('누르면 안내가 열리고, 다음 행동이 하나 있다', async ({ page }) => {
    await page.getByTestId('topology-spotlight-toggle').click();
    const dialog = page.getByTestId('recent-changes-needs-vault-dialog');
    await expect(dialog).toBeVisible();

    // Both the why and the where must be present — one alone is either an apology or an order.
    await expect(dialog).toContainText('폴더');
    await expect(page.getByTestId('recent-changes-needs-vault-open')).toBeVisible();
  });

  test('모달이 모달임을 증명한다 — scrim 이 뒤를 막는다', async ({ page }) => {
    // `design.md`: a modal must **prove** a dim/scrim or blocked interaction.
    await page.getByTestId('topology-spotlight-toggle').click();
    const scrim = page.getByTestId('recent-changes-needs-vault-scrim');
    await expect(scrim).toBeVisible();
    const alpha = await scrim.evaluate((el) => {
      const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor);
      const parts = m ? m[1].split(',').map(Number) : [];
      return parts.length > 3 ? parts[3] : 1;
    });
    expect(alpha, 'scrim 이 투명하면 모달이 아니라 떠 있는 카드다').toBeGreaterThan(0.2);
  });

  test('열리면 포커스가 다음 행동에 간다', async ({ page }) => {
    await page.getByTestId('topology-spotlight-toggle').click();
    await expect(page.getByTestId('recent-changes-needs-vault-open')).toBeFocused();
  });

  test('Esc 와 scrim 클릭 둘 다로 닫힌다', async ({ page }) => {
    const chip = page.getByTestId('topology-spotlight-toggle');
    const dialog = page.getByTestId('recent-changes-needs-vault-dialog');

    await chip.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await chip.click();
    await expect(dialog).toBeVisible();
    // Press the scrim's edge, not the card.
    await page.mouse.click(40, 40);
    await expect(dialog).toBeHidden();
  });

  test('지도를 바꾸지 않는다 — 렌즈는 폴더가 있어야 켜진다', async ({ page }) => {
    // If opening the guidance also switched the lens on, a lens with nothing to
    // highlight would be left on — "it is on and nothing happens".
    const before = page.url();
    await page.getByTestId('topology-spotlight-toggle').click();
    await expect(page.getByTestId('recent-changes-needs-vault-dialog')).toBeVisible();
    expect(page.url(), '`?recent=` 가 붙으면 안 된다').toBe(before);
  });
});
