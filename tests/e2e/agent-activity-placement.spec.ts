import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **Measures where the activity row and the notification tray sit** (three owner
 * reports, 2026-08-17).
 *
 * ## Why this spec exists
 *
 * Moving notifications from the bottom of the map to the top right **moved the
 * control but left the geometry as it was at the bottom.** The owner reported three
 * things at once, and all three came from that one cause:
 *
 * 1. *"The bell icon is far too wide"* (the bell icon is far too wide) — the
 *    bell-only chip sat inside a **text-row chip shell**
 *    (`CHROME_STATUS_CHIP_CLASS`, 14px horizontal padding). That is not a box for a
 *    single icon.
 * 2. *"Pressing it, you cannot see it properly"* (pressing it, you cannot see it properly) — the
 *    tray grows **upward** via `bottom-[calc(100%+8px)]`, the geometry from when the
 *    chip lived at the bottom of the map. After the move, upward means off-screen
 *    and into the utility row.
 * 3. *"This is still down at the bottom? confusing"* (this is still down at the bottom?
 *    confusing) — the bell moved up while the status row stayed below, so **the same
 *    fact was in two places.**
 *
 * ## What this spec measures
 *
 * It does not pin the position in coordinates — that is a design verdict and may
 * change. It measures only the three properties that must hold wherever they are
 * placed: **is there exactly one, is the bell not stretched, and is it fully visible
 * when open.**
 *
 * Only the picker is stubbed; everything behind it is real code (see the
 * `vault-picker-stub` preamble).
 */
test("활동 줄은 한 곳에만 있고, 알림함은 열었을 때 다 보인다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  // A completed log inside the 24-hour window with no heartbeat — the "last activity" state.
  const at = new Date(Date.now() - 20 * 60_000).toISOString();
  const line = JSON.stringify({
    v: 1,
    at,
    tool: "add_concept",
    target: "capabilities/pay",
    summary: "add_concept capability:capabilities/pay",
    agent: "codex-acp",
    why: null,
  });

  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, {
    "shop.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Chip Shop\ncontains:\n  - capabilities/pay\n---\n\n# Chip Shop\n`,
    "capabilities/pay.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n\n# Pay\n`,
    ".ontology-atlas/activity.jsonl": `${line}\n`,
  });

  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();

  const bell = page.getByTestId("agent-activity-bell");
  await expect(bell, "알림 종이 안 떴다 — 20분 전 쓰기는 알림 창 안이다").toBeVisible({
    timeout: 30_000,
  });

  // ① The same fact must not appear in two places.
  await expect(
    page.getByTestId("agent-activity-chip"),
    "활동 줄이 두 곳에 그려졌다. 하나는 지워야 한다",
  ).toHaveCount(1);

  // ② The bell is a control holding a single icon — a text-row box stretches it horizontally.
  const bellBox = (await bell.boundingBox())!;
  expect(
    +(bellBox.width / bellBox.height).toFixed(2),
    `종이 가로로 늘어났다 (${Math.round(bellBox.width)}×${Math.round(bellBox.height)})`,
  ).toBeLessThanOrEqual(1.35);

  // The bell's status cell is not inside the row, but in the rightmost single cell of the top-right toolbar.
  const utilityRow = page.getByTestId('topology-utility-action-row');
  const utilityRowBox = (await utilityRow.boundingBox())!;
  expect(Math.abs(bellBox.y - utilityRowBox.y), '종이 위쪽 도구줄과 같은 행이 아니다').toBeLessThanOrEqual(1);
  expect(
    Math.abs(bellBox.x + bellBox.width - (utilityRowBox.x + utilityRowBox.width)),
    '종이 도구줄 맨 오른쪽이 아니다',
  ).toBeLessThanOrEqual(1);
  const statusBox = (await page.getByTestId('agent-activity-status-trigger').boundingBox())!;
  expect(statusBox.y, '작업 상태 행이 독립 알림 아이콘 아래로 분리되지 않았다').toBeGreaterThan(
    bellBox.y + bellBox.height,
  );
  const statusLabelFits = await page.getByTestId('agent-activity-status').evaluate(
    (element) => element.scrollWidth <= element.clientWidth + 1,
  );
  expect(statusLabelFits, 'Codex와 마지막 작업 시각이 도구줄 폭에 묶여 잘렸다').toBe(true);

  // ③ When opened, everything must be visible — it must not go off-screen or cover the utility bar.
  await bell.click();
  const inbox = page.getByTestId("agent-activity-inbox");
  await expect(inbox).toBeVisible();
  const inboxBox = (await inbox.boundingBox())!;
  const view = page.viewportSize()!;

  expect(inboxBox.width, '알림함이 280px짜리 좁은 예전 폭에 머물렀다').toBeGreaterThanOrEqual(340);

  expect(Math.round(inboxBox.y), "알림함 윗변이 화면 위로 잘렸다").toBeGreaterThanOrEqual(0);
  expect(
    Math.round(inboxBox.y + inboxBox.height),
    "알림함 아랫변이 화면 아래로 잘렸다",
  ).toBeLessThanOrEqual(view.height);
  expect(Math.round(inboxBox.x), "알림함 왼변이 화면 밖이다").toBeGreaterThanOrEqual(0);
  expect(
    Math.round(inboxBox.x + inboxBox.width),
    "알림함 오른변이 화면 밖이다",
  ).toBeLessThanOrEqual(view.width);

  // Covering the utility row (agents, recent changes) makes those buttons unreadable.
  const lane = page.getByTestId("topology-utility-action-lane").locator("> div").first();
  const laneBox = (await lane.boundingBox())!;
  const overlaps =
    inboxBox.x < laneBox.x + laneBox.width &&
    laneBox.x < inboxBox.x + inboxBox.width &&
    inboxBox.y < laneBox.y + laneBox.height &&
    laneBox.y < inboxBox.y + inboxBox.height;
  expect(overlaps, "알림함이 위쪽 유틸 버튼 줄을 덮었다").toBe(false);

  /*
   * ④ **The tray paints on top** (owner report 2026-08-17: *"Should the notification cover what is above?"*
   * — the notification should cover what is above). ③ only checked for overlap, not
   * **which one paints on top**, so it stayed green while the right-hand tool tiles
   * were covering the tray.
   *
   * The judgement uses **what is actually hit at that point** (elementFromPoint)
   * rather than rect overlap. Comparing computed z-index gives the wrong answer when
   * the stacking contexts differ.
   */
  const topAtInbox = await page.evaluate(() => {
    const inbox = document.querySelector('[data-testid="agent-activity-inbox"]');
    if (!inbox) return { ok: false, reason: "알림함이 없다" };
    const r = inbox.getBoundingClientRect();
    /*
     * ⚠️ **Sample all the way to the edges.** The first version sampled only
     * 0.15–0.85, and the tool tile actually covering the tray sat within 36px of its
     * right edge, so the probe **missed by 6px** and returned green with the defect
     * intact. Overlap usually happens at the edges, so a probe that samples only the
     * interior cannot see this defect in principle.
     */
    const fractions = [0.02, 0.25, 0.5, 0.75, 0.98];
    const points = fractions.flatMap((fx) =>
      fractions.map((fy) => ({ x: r.x + r.width * fx, y: r.y + r.height * fy })),
    );
    const covered = points
      .map((p) => ({ p, el: document.elementFromPoint(p.x, p.y) }))
      .filter(({ el }) => !el || !inbox.contains(el))
      .map(({ p, el }) => ({
        at: { x: Math.round(p.x), y: Math.round(p.y) },
        by: el ? `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}` : "null",
      }));
    return { ok: true, covered };
  });
  expect(topAtInbox.ok, topAtInbox.reason).toBe(true);
  expect(
    topAtInbox.covered,
    "알림함 위에 다른 것이 그려졌다 — 유틸 레인의 쌓임 맥락에 갇힌 것이다",
  ).toEqual([]);

  // On a translucent panel, even a winning z-index shows the control behind it
  // through the surface, so its icon reads as a row action. The geometry itself must
  // not overlap controls outside the card.
  const outsideControlOverlaps = await page.evaluate(() => {
    const inbox = document.querySelector('[data-testid="agent-activity-inbox"]');
    if (!inbox) return [{ reason: "inbox-missing" }];
    const a = inbox.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('button, a')]
      .filter((element) => !inbox.contains(element) && !element.contains(inbox))
      .map((element) => {
        const b = element.getBoundingClientRect();
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return width > 0.5 && height > 0.5
          ? { aria: element.getAttribute('aria-label'), width, height }
          : null;
      })
      .filter(Boolean);
  });
  expect(
    outsideControlOverlaps,
    "알림함 뒤의 지도 도구가 비쳐 행 액션처럼 보인다 — 도구 열과 rect를 갈라야 한다",
  ).toEqual([]);
});
