import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * The Dialog (center) responsive contract — merge condition ⓐ of the 체계 seat's
 * ratification (2026-08-15).
 *
 * Measures the first consumer of each variant at three widths (1280/768/390):
 * ① does the scrim cover the whole viewport (the visual half of modality) ② is the
 * panel width exactly the formula `min(var(--dialog-w-sm), 100vw - 2rem)` ③ does the
 * panel sit entirely inside the viewport. These are rects rather than static
 * reasoning — cascade and variant-order defects appear only in rects
 * (the responsive-sweep discipline).
 *
 * The dialog is **resized while open** — measuring only at open time leaves the
 * screen of a user who shrank the window afterwards never measured by anyone.
 */

const WIDTHS = [1280, 768, 390] as const;
const DIALOG_W_SM = 420;
const VIEWPORT_INSET = 32; // calc(100vw - 2rem)

test("center Dialog 는 세 폭에서 스크림·폭 공식·수납을 지킨다", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await seedFirstRunSeen(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Stubs OPFS as the folder picker to create a writable vault along the real journey
  // (the same technique as the chrome-text-fit spec — each context gets a fresh OPFS,
  // so they never mix).
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      async () => navigator.storage.getDirectory();
  });
  await page.goto("/ko/topology/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-create").click();
  await page.getByTestId("vault-guide-create-new").click();
  await expect(page.getByTestId("topology-index-footer")).toBeVisible({ timeout: 30_000 });

  // Seeding from topology then going to /docs races the write completion (measured:
  // /docs saw an empty folder even after the growth signal). Create the document with
  // /docs's own seed CTA, then wait until a real document appears in the tree before
  // opening.
  await page.goto("/ko/docs/", { waitUntil: "domcontentloaded" });
  const seedCta = page.getByRole("button", { name: "시작 시드 만들기" });
  const treeButton = page.getByRole("navigation", { name: "문서 목록" }).getByRole("button").first();
  // ⚠️ `isVisible()` **does not wait**. This used to query the CTA with it right after
  // goto; in the instant before it is drawn it returns false, so the click was
  // **skipped** and the test then waited 30 seconds on the tree with an empty folder
  // before dying (2026-08-21: all 3 CI retries failed, reproduced on a local static
  // build too). Now it waits for whichever appears first and then decides — the CTA
  // for an empty folder, the tree if a document already exists.
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
    // Wait for the frame that applies the resize — a rect is a fact that follows layout.
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

    // ① The scrim covers the whole viewport.
    expect(rects.scrim.x, `${width}px 스크림 x`).toBe(0);
    expect(rects.scrim.y, `${width}px 스크림 y`).toBe(0);
    expect(Math.round(rects.scrim.w), `${width}px 스크림 폭`).toBe(rects.vw);
    expect(Math.round(rects.scrim.h), `${width}px 스크림 높이`).toBe(rects.vh);

    // ② The width formula min(420, vw − 2rem), tolerating 1px of sub-pixel error.
    const expected = Math.min(DIALOG_W_SM, rects.vw - VIEWPORT_INSET);
    expect(
      Math.abs(rects.panel.w - expected),
      `${width}px 패널 폭 ${rects.panel.w} ≠ 공식 ${expected}`,
    ).toBeLessThanOrEqual(1);

    // ③ The panel sits entirely inside the viewport.
    expect(rects.panel.x, `${width}px 패널 좌측`).toBeGreaterThanOrEqual(0);
    expect(rects.panel.y, `${width}px 패널 상단`).toBeGreaterThanOrEqual(0);
    expect(rects.panel.x + rects.panel.w, `${width}px 패널 우측`).toBeLessThanOrEqual(rects.vw + 1);
    expect(rects.panel.y + rects.panel.h, `${width}px 패널 하단`).toBeLessThanOrEqual(rects.vh + 1);
  }
});
