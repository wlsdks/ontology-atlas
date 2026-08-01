import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { STOREFRONT_STUDIO_NODE_PARAM } from "./storefront-node";

/**
 * 공방이 **걷는다** — 같은-라우트 이동의 회귀 게이트.
 *
 * ## 왜 e2e 여야 하나
 *
 * 2026-07-28 실측: 프로덕션 빌드에서 공방의 소프트 내비게이션이 **전부 죽어
 * 있었다**. 위성 클릭(산책)도, 「새 노드 만들기」도 무반응 — history push 0건,
 * URL 불변, 무대 불변. 딥링크 하드로드만 살아 있어서 화면은 멀쩡해 보였다.
 *
 * 원인 두 겹 모두 **정적 export 고유**라 단위 테스트로는 원리적으로 못 잡는다:
 *
 * 1. `trailingSlash: true` 인데 내부 상수만 슬래시가 없어서, client push 가
 *    페이로드를 못 찾고 조용히 no-op 이 됐다.
 * 2. 슬래시를 고친 뒤에도 **경로가 같고 쿼리만 다른 이동**은 여전히 일어나지
 *    않았다 — 라우트가 파일 하나라 검색 파라미터가 라우팅 단위가 아니다.
 *
 * 둘 다 jsdom 에는 존재하지 않는 층이고, dev 서버에서도 재현되지 않는다(A/B
 * 로 확인: dev 는 슬래시 유무와 무관하게 둘 다 성공한다 — **dev 는 이 결함에
 * 대해 진단력이 없다**). 그래서 게이트는 빌드된 것을 실제로 눌러 보는 이 자리다.
 *
 * 판정은 **URL 변화**로 한다. 무대가 다시 그려졌는지가 아니라 주소가 움직였는지
 * — 죽었을 때 정확히 그것이 안 움직였고, 그것이 모든 상위 동작(딥링크 공유·
 * 뒤로가기·새로고침 복원)의 전제이기 때문이다.
 */

async function open(page: Page, url: string) {
  await seedFirstRunSeen(page);
  await page.goto(url, { waitUntil: "networkidle" });
  await expect(page.getByTestId("studio-compass-stage").or(page.getByTestId("studio-entry-choice"))).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("공방 내비게이션 — 주소가 실제로 움직인다", () => {
  test("「새 노드 만들기」가 CREATE 주소로 데려간다", async ({ page }) => {
    await open(page, "/ko/ontology/studio/?guides=off");

    const create = page.getByTestId("studio-entry-create");
    await expect(create).toBeVisible();
    await create.click();

    await expect(page).toHaveURL(/[?&]mode=create/);
  });

  test("위성 클릭이 그 노드로 걸어간다 — 산책", async ({ page }) => {
    await open(
      page,
      `/ko/ontology/studio/?guides=off&node=${STOREFRONT_STUDIO_NODE_PARAM}`,
    );

    const satellite = page.getByTestId("studio-satellite-right").first();
    await expect(satellite).toBeVisible();
    await satellite.click();

    // 어느 이웃으로 걸어갔는지는 볼트 내용이 정하므로 고정하지 않는다 —
    // 지켜야 할 사실은 "출발한 노드가 아닌 곳에 도착했다" 이다.
    await expect(page).toHaveURL(/[?&]node=/);
    await expect(page).not.toHaveURL(
      new RegExp(`node=${STOREFRONT_STUDIO_NODE_PARAM}`),
    );
  });

  /**
   * 맥락이 따라오는지 — 이동은 성공했는데 맥락이 증발하면, 인사이트에서 넘어온
   * 사람이 돌아갈 길을 잃는다(`via`/`review`). 여기서는 감사 스위치(`guides`)로
   * 같은 계약을 싸게 확인한다.
   */
  test("이동해도 맥락 파라미터가 따라온다", async ({ page }) => {
    await open(page, "/ko/ontology/studio/?guides=off");

    await page.getByTestId("studio-entry-create").click();

    await expect(page).toHaveURL(/[?&]mode=create/);
    await expect(page).toHaveURL(/[?&]guides=off/);
  });

  test("「그만하기」는 지도로 나간다", async ({ page }) => {
    await open(
      page,
      `/ko/ontology/studio/?guides=off&node=${STOREFRONT_STUDIO_NODE_PARAM}`,
    );

    await page.getByTestId("studio-exit").click();

    await expect(page).toHaveURL(/\/topology\/?$/);
  });
});

/**
 * 공방 크롬의 **스케일 고정 계약** — `design.md` 「스케일 고정 계약」의 공방 몫.
 *
 * 2026-07-28 실측으로 드러난 것: 이 표면 유일의 filled 컨트롤인 주 저장
 * 버튼이 `text-caption`(9.5px) 이었다. 크롬 라벨 계약은 `text-label`(11px)
 * 이고, caption 은 진행 캡션·타임스탬프의 것이다. 같은 줄의 컨트롤 높이도
 * 30 과 32 로 갈려 있었다.
 *
 * lint 가 못 잡는다: `text-caption` 은 램프 안의 **정당한 스텝**이라 값
 * 규칙을 무결점 통과한다. 틀린 것은 값이 아니라 **쓰임**이고, 쓰임은 렌더된
 * 원소를 봐야 안다.
 */
test("공방 크롬이 스케일 계약을 지킨다 — 라벨 11px · 컨트롤 높이 한 등급", async ({
  page,
}) => {
  await open(
    page,
    `/ko/ontology/studio/?guides=off&node=${STOREFRONT_STUDIO_NODE_PARAM}`,
  );

  const measured = await page.evaluate(() => {
    const read = (id: string) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!el) return null;
      return {
        fontSize: getComputedStyle(el).fontSize,
        height: Math.round(el.getBoundingClientRect().height),
      };
    };
    return { save: read("studio-save"), exit: read("studio-exit") };
  });

  expect(measured.save, "저장 버튼을 못 찾았다").not.toBeNull();
  expect(measured.exit, "그만하기 버튼을 못 찾았다").not.toBeNull();

  // 크롬 라벨은 11px 한 값이다.
  expect(measured.save!.fontSize).toBe("11px");
  expect(measured.exit!.fontSize).toBe("11px");
  // 같은 줄의 컨트롤은 한 높이 등급을 쓴다.
  expect(measured.save!.height).toBe(measured.exit!.height);
});
