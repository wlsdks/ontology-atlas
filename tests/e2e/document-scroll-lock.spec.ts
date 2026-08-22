import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The document (html) does not scroll — the shell owns the viewport.**
 *
 * **What happened (full responsive measurement, 2026-08-08).** On the gateway
 * (`/`), expanding "why you can trust this download" and wheeling to the end left
 * **the whole screen blank black** (measured at 600×900: the footer at −270px
 * above the viewport, document scrollHeight 862→1970). The body is held by the
 * shell's inner scroll slot, but the document itself also gained a scroll range,
 * producing **double scrolling**, and once wheel chaining exhausted the inner one
 * it pushed the document past all its content.
 *
 * **Two causes — counter-examples to the property this spec measures.**
 *
 * 1. **An `absolute` element with no positioned ancestor stretches the document.**
 *    A `sr-only` (`position: absolute`) span inside the expanded content took **the
 *    viewport** as its positioning reference, because the shell root was `static`;
 *    and a static `overflow-hidden` cannot clip an element that is not in its own
 *    containing block, so the document's scroll range grew to include that span.
 *    Fix: `relative` on the shell root — after which no absolute element can
 *    stretch the document.
 * 2. **The body's 56px tab-bar reservation padding is a relic of the pre-shell
 *    era** (present since the initial import on 2026-04-30). Now that the shell
 *    owns the viewport with `h-dvh`, that padding protects nothing while creating
 *    56px of dead document scroll on every page below `md`.
 *
 * **Why the gate has this shape.** `scroll-end-gap.spec.ts` measures the scroll-end
 * gap in the **closed default state** — it never measured expanded collapsible
 * surfaces, so this defect family passed that gate forever. Here exactly one thing
 * is measured across changing states (including expanded): **is the document's
 * scroll range 0**. With one property the counter-example is unambiguous: if the
 * document scrolls by even 1px, some element has leaked outside the viewport.
 */

const WIDTHS = [
  { w: 600, h: 900 },
  { w: 1440, h: 900 },
] as const;

const ROUTES = ["/ko/?guides=off", "/ko/topology/?guides=off", "/ko/docs/?guides=off"] as const;

async function documentScrollSlack(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollHeight - el.clientHeight;
  });
}

test.describe("문서 스크롤 잠금 — 셸이 뷰포트를 소유한다", () => {
  for (const { w, h } of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} @ ${w}×${h} — 문서 스크롤 범위 0`, async ({ page }) => {
        await seedFirstRunSeen(page);
        await page.setViewportSize({ width: w, height: h });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        // During the gateway's Suspense swap there are briefly two <main> elements — first() just confirms readiness.
        await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
        // Hydration can shift the layout — poll for the settled value.
        await expect
          .poll(() => documentScrollSlack(page), { timeout: 10_000 })
          .toBeLessThanOrEqual(0);
      });
    }

    /*
     * [Deleted 2026-08-19] "the gateway's trust section … does not grow the
     * document".
     *
     * Its subject (the `download-trust` verification rail and the checksum copy button
     * inside it) disappeared along with the install section — owner: *"맨 마지막 이거는
     * 없어도 될듯? 어차피 맨 위에 다 있어서"* (this last one can probably go; it is all
     * at the top anyway). The property this test guarded (zero document scroll slack
     * even in the gateway's tallest state) is now carried by the `/ko/?guides=off` test
     * in the loop above — the gateway's tallest state is now its first paint.
     */
  }
});
