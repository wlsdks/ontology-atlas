import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **The one list on this board built from names that are not concepts.**
 *
 * Every other insights tab is computed from documents that exist, so a fixture full of
 * real nodes exercises them. This one needs the opposite: frontmatter reaching for names
 * the folder has no document for. Nothing bundled has that shape on purpose — the dogfood
 * folder is curated — so the fixture is written here and read through the real picker
 * path, which means the chain under test is the whole one: frontmatter → `compile()` →
 * `unmatchedGraphAsks` → the board → the rendered row.
 *
 * Four things are measured that unit tests structurally cannot see:
 *
 * - the hide control's **rendered** hit area under a coarse pointer (a `min-height` marker
 *   in a CSS layer either applies or does not; jsdom cannot say which),
 * - where focus **actually** lands after a row deletes itself,
 * - that the count beside the heading does not move when a row is hidden — the
 *   double-count rule this list was narrowed for,
 * - and the scroll-end clearance at the two widths where the board's own footer sits
 *   under the mobile tab reserve.
 */
const SEED: Record<string, string> = {
  "shop.md":
    "---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Chip Shop\ncontains:\n  - domains/payment\n  - capabilities/refund\n---\n\n# Chip Shop\n",
  "domains/payment.md":
    "---\nuid: 33333333-3333-4333-8333-333333333333\nslug: domains/payment\nkind: domain\ntitle: Payment\ncapabilities:\n  - capabilities/refund\n  - capabilities/holds-position\n---\n\nWhat the shop charges for and refunds.\n",
  "capabilities/invoice.md":
    "---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/invoice\nkind: capability\ntitle: Invoice\ndomain: domains/payment\ndependencies:\n  - capabilities/holds-position\n  - capabilities/ledger\n---\n\nIssues an invoice for a completed order.\n",
  "capabilities/refund.md":
    "---\nuid: 44444444-4444-4444-8444-444444444444\nslug: capabilities/refund\nkind: capability\ntitle: Refund\ndomain: domains/payment\ndependencies:\n  - capabilities/holds-position\n---\n\nReturns money for a cancelled order.\n",
};

const MIN = 44;

test.use({ hasTouch: true, isMobile: true });

test("찾았지만 없는 이름 목록 — 손가락·키보드·숫자가 모두 계약을 지킨다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, SEED);

  await page.goto("/ko/topology/?e2e=1&guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  // The picked folder is persisted only once the starter has gone; navigating before
  // that lands the next route on an empty session (measured under the static export,
  // which reloads faster than the dev server and made this a CI-only failure).
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 20_000 });

  await page.goto("/ko/ontology/insights/?tab=unmatched&guides=off");
  await page.waitForLoadState("networkidle");
  const list = page.getByTestId("unmatched-list");
  await expect(list, "찾았지만 없는 이름 목록이 그려지지 않았다").toBeVisible({
    timeout: 30_000,
  });

  // Two distinct missing names; the one three concepts reached for carries the multiplier.
  await expect(page.getByTestId("unmatched-row")).toHaveCount(2);
  await expect(page.getByTestId("unmatched-group-count")).toHaveText("2");
  await expect(page.getByTestId("unmatched-row-count")).toHaveText("×3");

  // ── The hide control under a finger ──────────────────────────────────────
  const hitArea = await page.getByTestId("unmatched-dismiss").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const after = getComputedStyle(element, "::after");
    const expanded =
      after.content && after.content !== "none" && after.position === "absolute"
        ? {
            w: Number.parseFloat(after.width) || 0,
            h: Number.parseFloat(after.height) || 0,
          }
        : { w: 0, h: 0 };
    return {
      w: Math.round(Math.max(rect.width, expanded.w)),
      h: Math.round(Math.max(rect.height, expanded.h)),
    };
  });
  expect(hitArea.w, `숨기기 버튼 히트 영역: ${JSON.stringify(hitArea)}`).toBeGreaterThanOrEqual(MIN);
  expect(hitArea.h, `숨기기 버튼 히트 영역: ${JSON.stringify(hitArea)}`).toBeGreaterThanOrEqual(MIN);

  // ── Scroll-end clearance at the two narrow widths ────────────────────────
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(400);
    const clearance = await page.evaluate(() => {
      const footnote = document.querySelector('[data-testid="unmatched-footnote"]');
      if (!footnote) return null;
      /*
       * ⚠️ **Scroll the element that actually scrolls.** This board's scroller is an inner
       * `overflow-y-auto` div inside the app shell, not the document — so the first version of
       * this check pushed `document.scrollingElement` (which never moves here) and then measured
       * the footnote where it happened to sit. It passed only while the tab's content was short
       * enough to fit unscrolled, and reported a false pass the moment anything was added above
       * it (2026-09-06: the census strip made the same page fail by 113px with the scroll
       * position untouched). Walk up from the footnote to the first ancestor that can scroll.
       */
      let scroller: Element = document.scrollingElement ?? document.documentElement;
      for (
        let node: Element | null = footnote.parentElement;
        node;
        node = node.parentElement
      ) {
        const overflowY = getComputedStyle(node).overflowY;
        if (
          (overflowY === "auto" || overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight + 1
        ) {
          scroller = node;
          break;
        }
      }
      scroller.scrollTop = scroller.scrollHeight;
      return new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const rect = footnote.getBoundingClientRect();
          resolve(Math.round(window.innerHeight - rect.bottom));
        });
      });
    });
    expect(clearance, `${width}px 에서 마지막 줄이 화면 밖이다`).not.toBeNull();
    expect(clearance!, `${width}px 스크롤 끝 여백: ${clearance}`).toBeGreaterThanOrEqual(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // ── Hiding a row: focus moves, and the count does not ────────────────────
  const buttons = page.getByTestId("unmatched-dismiss");
  await buttons.first().focus();
  await buttons.first().click();

  const marker = page.getByTestId("unmatched-restore-all");
  await expect(marker, "숨김 표시가 제목 옆에 나타나지 않았다").toBeVisible();
  await expect(page.getByTestId("unmatched-row")).toHaveCount(1);
  // ⚠️ The number the folder reported must not move — hiding is not fixing, and a count
  // that shrank would make the board agree with whoever last clicked instead of the folder.
  await expect(page.getByTestId("unmatched-group-count")).toHaveText("2");

  const focused = await page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName,
  );
  expect(focused, "행이 사라진 뒤 포커스가 본문으로 떨어졌다").toBe("unmatched-dismiss");

  // ── And it is this browser's preference, so it survives a reload ─────────
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("unmatched-restore-all")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("unmatched-restore-all").click();
  await expect(page.getByTestId("unmatched-row")).toHaveCount(2);
  await expect(page.getByTestId("unmatched-restore-all")).toHaveCount(0);
});
