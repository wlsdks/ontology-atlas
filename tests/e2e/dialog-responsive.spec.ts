import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * Dialog(center) 반응형 계약 — 「체계」석 비준(2026-08-15)의 머지 조건 ⓐ.
 *
 * 변형별 첫 소비자를 세 폭(1280/768/390)에서 실측한다: ① 스크림이 뷰포트
 * 전체를 덮는가(모달성의 시각 절반) ② 패널 폭이 공식
 * `min(var(--dialog-w-sm), 100vw - 2rem)` 대로인가 ③ 패널이 뷰포트 안에
 * 온전히 있는가. 정적 추론이 아니라 rect 다 — 캐스케이드·변형 순서 결함은
 * rect 에만 나타난다(responsive-sweep 규율).
 *
 * 대화상자를 **연 채로 리사이즈**한다 — 열 때만 재면 「열린 뒤 창을 줄인」
 * 사용자의 화면은 아무도 잰 적이 없게 된다.
 */

const WIDTHS = [1280, 768, 390] as const;
const DIALOG_W_SM = 420;
const VIEWPORT_INSET = 32; // calc(100vw - 2rem)

test("center Dialog 는 세 폭에서 스크림·폭 공식·수납을 지킨다", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await seedFirstRunSeen(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // OPFS 를 폴더 피커로 세워 실제 여정 그대로 쓰기 가능한 vault 를 만든다
  // (chrome-text-fit 스펙과 같은 기법 — 컨텍스트마다 새 OPFS 라 안 섞인다).
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      async () => navigator.storage.getDirectory();
  });
  await page.goto("/ko/topology/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-create").click();
  await page.getByTestId("vault-guide-create-new").click();
  await expect(page.getByTestId("topology-index-footer")).toBeVisible({ timeout: 30_000 });

  // 토폴로지 시드→/docs 는 쓰기 완료 레이스가 있다(실측: growth 신호 뒤에도
  // /docs 가 빈 폴더를 봤다). /docs 자신의 시드 CTA 로 문서를 만들고, 트리에
  // 실제 문서가 잡힐 때까지 기다린 뒤 연다.
  await page.goto("/ko/docs/", { waitUntil: "domcontentloaded" });
  const seedCta = page.getByRole("button", { name: "시작 시드 만들기" });
  const treeButton = page.getByRole("navigation", { name: "문서 목록" }).getByRole("button").first();
  // ⚠️ `isVisible()` 은 **기다리지 않는다**. 예전에는 goto 직후 그것으로 CTA 를
  // 물었는데, 아직 안 그려진 그 순간이면 false 가 나와 **클릭을 건너뛰고** 빈
  // 폴더인 채로 트리를 30초 기다리다 죽었다(2026-08-21 CI 3회 재시도 전부 실패,
  // 로컬 정적 빌드에서도 재현). 둘 중 무엇이든 먼저 나타날 때까지 기다린 뒤
  // 판단한다 — 빈 폴더면 CTA, 이미 문서가 있으면 트리다.
  await expect(seedCta.or(treeButton).first()).toBeVisible({ timeout: 30_000 });
  if (await seedCta.isVisible()) {
    await seedCta.click();
  }
  await expect(treeButton).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("docs-sidebar-new-doc").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog, `pageerrors: ${pageErrors.join(" | ") || "(none)"}`).toBeVisible();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // 리사이즈 반영 프레임을 기다린다 — rect 는 레이아웃 뒤의 사실이다.
    await page.waitForTimeout(120);

    const rects = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[role="dialog"]');
      const scrim = panel?.parentElement ?? null;
      if (!panel || !scrim) return null;
      const p = panel.getBoundingClientRect();
      const s = scrim.getBoundingClientRect();
      return {
        panel: { x: p.x, y: p.y, w: p.width, h: p.height },
        scrim: { x: s.x, y: s.y, w: s.width, h: s.height },
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });
    expect(rects, `${width}px — 대화상자가 사라졌다`).not.toBeNull();
    if (!rects) return;

    // ① 스크림 = 뷰포트 전체.
    expect(rects.scrim.x, `${width}px 스크림 x`).toBe(0);
    expect(rects.scrim.y, `${width}px 스크림 y`).toBe(0);
    expect(Math.round(rects.scrim.w), `${width}px 스크림 폭`).toBe(rects.vw);
    expect(Math.round(rects.scrim.h), `${width}px 스크림 높이`).toBe(rects.vh);

    // ② 폭 공식 min(420, vw − 2rem) — 서브픽셀 1px 관용.
    const expected = Math.min(DIALOG_W_SM, rects.vw - VIEWPORT_INSET);
    expect(
      Math.abs(rects.panel.w - expected),
      `${width}px 패널 폭 ${rects.panel.w} ≠ 공식 ${expected}`,
    ).toBeLessThanOrEqual(1);

    // ③ 패널이 뷰포트 안에 온전히 있다.
    expect(rects.panel.x, `${width}px 패널 좌측`).toBeGreaterThanOrEqual(0);
    expect(rects.panel.y, `${width}px 패널 상단`).toBeGreaterThanOrEqual(0);
    expect(rects.panel.x + rects.panel.w, `${width}px 패널 우측`).toBeLessThanOrEqual(rects.vw + 1);
    expect(rects.panel.y + rects.panel.h, `${width}px 패널 하단`).toBeLessThanOrEqual(rects.vh + 1);
  }
});
