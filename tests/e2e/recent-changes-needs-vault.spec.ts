import { expect, test } from '@playwright/test';

/**
 * 「최근 변경」이 샘플에서 **막다른 곳이 아니어야 한다.**
 *
 * ## 왜 이 스펙이 있나
 *
 * 2026-08-03 소유자 실보고: *"일반 화면에서 '최근 변경' 누르니까 아무런 반응이
 * 없는데?"*. 원인이 둘이었다 — ① 비활성인데 비활성처럼 안 보였고(그건
 * `tests/contract/disabled-affordance.contract.test.ts` 가 맡는다), ② 샘플에서는
 * 애초에 **비활성이면 안 됐다.**
 *
 * 샘플에서 최근 변경이 0인 이유는 「아직 안 바꿨다」가 아니라 **샘플의 날짜가 이
 * 저장소가 픽스처를 마지막으로 건드린 시각**이라는 것이다. 기다린다고 켜지지
 * 않는다 — 폴더를 열어야 뜻을 갖는다. 사유가 「없음」이 아니라 「다음 행동」이면
 * 다음 행동을 줘야 하고, 그게 `surfaces.md` 의 강등 계약(왜 + 어디서)이자 웹
 * 스모크가 요구하는 **죽은 CTA 0** 이다.
 *
 * jsdom 이 아니라 e2e 인 이유: 모달성(scrim)·중앙 배치·포커스·Esc 는 **렌더된
 * 화면에서만** 참인지 알 수 있다.
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

    // 「왜」와 「어디서」가 둘 다 있어야 한다 — 하나만 있으면 사과문이거나 명령이다.
    await expect(dialog).toContainText('폴더');
    await expect(page.getByTestId('recent-changes-needs-vault-open')).toBeVisible();
  });

  test('모달이 모달임을 증명한다 — scrim 이 뒤를 막는다', async ({ page }) => {
    // `design.md`: 모달은 dim/scrim 또는 차단된 상호작용을 **증명**해야 한다.
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
    // scrim 의 가장자리를 누른다 — 카드 위가 아니라.
    await page.mouse.click(40, 40);
    await expect(dialog).toBeHidden();
  });

  test('지도를 바꾸지 않는다 — 렌즈는 폴더가 있어야 켜진다', async ({ page }) => {
    // 안내를 여는 것이 렌즈를 켜 버리면, 아무것도 강조 못 하는 렌즈가 켜진 채
    // 남아 「켜져 있는데 아무 일도 안 일어난다」가 된다.
    const before = page.url();
    await page.getByTestId('topology-spotlight-toggle').click();
    await expect(page.getByTestId('recent-changes-needs-vault-dialog')).toBeVisible();
    expect(page.url(), '`?recent=` 가 붙으면 안 된다').toBe(before);
  });
});
