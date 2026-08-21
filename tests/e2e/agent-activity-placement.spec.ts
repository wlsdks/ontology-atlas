import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **활동 줄과 알림함이 놓인 자리를 잰다** (2026-08-17 소유자 지적 3건).
 *
 * ## 왜 이 spec 이 생겼나
 *
 * 알림을 지도 하단에서 우상단으로 올리면서 **컨트롤만 옮기고 기하는 아래 있던
 * 그대로 뒀다.** 소유자가 셋을 한꺼번에 지적했고, 셋 다 그 한 가지에서 나왔다:
 *
 * 1. *"종 아이콘 사이즈가 가로로 너무 길고"* — 종만 남은 칩이 **글줄용 칩
 *    껍데기**(`CHROME_STATUS_CHIP_CLASS`, 좌우 14px 안여백) 안에 들어 있었다.
 *    아이콘 하나를 담는 상자가 아니다.
 * 2. *"누르면 이래 제대로 안보이고"* — 알림함이 `bottom-[calc(100%+8px)]` 로
 *    **위로 자란다.** 칩이 지도 하단에 살던 시절의 기하다. 위로 올라간 뒤로는
 *    그 방향이 화면 밖과 유틸 줄 쪽이다.
 * 3. *"하단에는 그대로 이게 있고..? 헷갈리는데"* — 종은 위로 갔는데 상태 줄은
 *    아래 남아서 **같은 사실이 두 곳**에 있었다.
 *
 * ## 이 spec 이 재는 것
 *
 * 자리를 좌표로 못박지 않는다 — 그건 디자인 판정이라 바뀔 수 있다. 대신 어디에
 * 두든 참이어야 하는 성질 셋만 잰다: **하나뿐인가 · 종이 찌그러지지 않았나 ·
 * 열었을 때 다 보이나.**
 *
 * 픽커만 스텁하고 그 뒤는 전부 실제 코드다(`vault-picker-stub` 머리말).
 */
test("활동 줄은 한 곳에만 있고, 알림함은 열었을 때 다 보인다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  // heartbeat 없이 24시간 창 안의 완료 로그 — 「마지막 작업」 상태.
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

  // ① 같은 사실이 두 곳에 있으면 안 된다.
  await expect(
    page.getByTestId("agent-activity-chip"),
    "활동 줄이 두 곳에 그려졌다. 하나는 지워야 한다",
  ).toHaveCount(1);

  // ② 종은 아이콘 하나를 담는 컨트롤이다 — 글줄용 상자에 들어가면 가로로 늘어난다.
  const bellBox = (await bell.boundingBox())!;
  expect(
    +(bellBox.width / bellBox.height).toFixed(2),
    `종이 가로로 늘어났다 (${Math.round(bellBox.width)}×${Math.round(bellBox.height)})`,
  ).toBeLessThanOrEqual(1.35);

  // ③ 열면 다 보여야 한다 — 화면 밖으로 나가지도, 유틸 줄을 덮지도 않는다.
  await bell.click();
  const inbox = page.getByTestId("agent-activity-inbox");
  await expect(inbox).toBeVisible();
  const inboxBox = (await inbox.boundingBox())!;
  const view = page.viewportSize()!;

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

  // 유틸 줄(에이전트 · 최근 변경)을 덮으면 그 버튼들이 안 읽힌다.
  const lane = page.getByTestId("topology-utility-action-lane").locator("> div").first();
  const laneBox = (await lane.boundingBox())!;
  const overlaps =
    inboxBox.x < laneBox.x + laneBox.width &&
    laneBox.x < inboxBox.x + inboxBox.width &&
    inboxBox.y < laneBox.y + laneBox.height &&
    laneBox.y < inboxBox.y + inboxBox.height;
  expect(overlaps, "알림함이 위쪽 유틸 버튼 줄을 덮었다").toBe(false);

  /*
   * ④ **알림함이 맨 위에 그려진다** (2026-08-17 소유자 지적: *"알림이 위로
   * 덮어야지?"*). ③ 은 겹치는지만 봤고 **누가 위에 그려지는지**는 안 봤다 —
   * 그래서 오른쪽 도구 타일이 알림함을 덮고 있는데도 초록이었다.
   *
   * 좌표 겹침이 아니라 **실제로 그 지점에서 무엇이 잡히는지**(elementFromPoint)
   * 로 판정한다. 계산된 z-index 를 비교하면 쌓임 맥락이 다를 때 틀린 답이 나온다.
   */
  const topAtInbox = await page.evaluate(() => {
    const inbox = document.querySelector('[data-testid="agent-activity-inbox"]');
    if (!inbox) return { ok: false, reason: "알림함이 없다" };
    const r = inbox.getBoundingClientRect();
    /*
     * ⚠️ **가장자리까지 찍는다.** 처음엔 0.15~0.85 만 찍었는데, 실제로 덮고
     * 있던 도구 타일이 알림함 오른쪽 끝 36px 안에 있어서 **6px 차이로 비껴갔다**
     * — 결함이 그대로인데 초록이 나왔다. 겹침은 대개 가장자리에서 일어나므로
     * 안쪽만 찍는 프로브는 이 결함을 원리적으로 못 본다.
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

  // 반투명 패널은 z-index가 이겨도 뒤 컨트롤과 rect가 겹치면 아이콘이 행 액션처럼
  // 비쳐 보인다. 카드 밖 컨트롤과 기하 자체가 겹치지 않아야 한다.
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
