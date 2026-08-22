import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

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

  // 실제 FileSystemDirectoryHandle인 OPFS를 고르되, 이 검사의 주제가 아닌
  // starter scaffold를 거치지 않도록 문서 하나를 미리 둔다.
  await stubDirectoryPicker(page, {
    "README.md": "# Dialog fixture\n\n새 문서 대화상자를 여는 최소 로컬 폴더.\n",
  });
  await page.goto("/ko/topology/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

  // 같은 로컬 handle을 문서함이 읽은 뒤 새 문서 대화상자를 연다.
  await page.goto("/ko/docs/", { waitUntil: "domcontentloaded" });
  const treeButton = page.getByRole("navigation", { name: "문서 목록" }).getByRole("button").first();
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
