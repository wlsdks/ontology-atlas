import { expect, test } from "@playwright/test";
import { STOREFRONT_STUDIO_NODE_PARAM } from "./storefront-node";

/**
 * 반응형 오버플로 전수 검수 (opus5 최종 검수 2026-07-25).
 *
 * 왜 필요한가: 이번 웨이브에서 소유자가 반복해 지적한 결함이 전부 같은 종류였다
 * — "글자가 박스 초과해서 튀어나가는거 보이지?", "이렇게 겹쳐진건 대체 뭐지?",
 * "박스를 넘어섰지? 하단보면". 그런데 이걸 잡는 자동 게이트가 없어서 매번
 * 사람 눈으로 발견됐고, 실제로 단축키 시트의 스크롤 높이 회귀는 jsdom 단위
 * 테스트를 통과한 채 최종 검수에서야 잡혔다.
 *
 * 이 스펙이 검사하는 것:
 *  1. 문서 자체가 가로로 스크롤되지 않는다 (`scrollWidth <= clientWidth`).
 *     디자인 규칙: "wide content 는 자기 컨테이너 안에서 스크롤" — 페이지 본문이
 *     가로로 밀리면 결함이다.
 *  2. 인터랙티브/텍스트 요소가 뷰포트 밖으로 나가지 않는다.
 *  3. `role="dialog"` 가 동시에 둘 이상 열려 있지 않다(#62 오버레이 배타).
 *
 * 폭 선정: 1512(14인치 기준 계약) · 1024(lg 경계) · 834(태블릿 포트레이트) ·
 * 390(모바일). 각 폭에서 살아있는 5개 표면 + 다운로드를 돈다.
 */

const WIDTHS = [
  { label: "14in", width: 1512, height: 900 },
  { label: "lg-edge", width: 1024, height: 800 },
  { label: "tablet", width: 834, height: 1112 },
  { label: "mobile", width: 390, height: 844 },
] as const;

const ROUTES = [
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/studio/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/download/",
] as const;

const SELECTOR = "button, a, h1, h2, h3, p, li, dt, dd, input, kbd, [role='tab']";

for (const vp of WIDTHS) {
  for (const route of ROUTES) {
    test(`${vp.label} ${vp.width}px — ${route} 가로 오버플로·겹침 없음`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route);
      // 캔버스/차트가 첫 레이아웃을 끝낼 시간.
      await page.waitForTimeout(900);

      const report = await page.evaluate((selector) => {
        const vw = document.documentElement.clientWidth;
        const offenders: { tag: string; text: string; left: number; right: number }[] = [];
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const r = el.getBoundingClientRect();
          // sr-only(1px)·미표시 요소 제외.
          if (r.width < 2 || r.height < 2) continue;
          if (getComputedStyle(el).visibility === "hidden") continue;
          if (r.right > vw + 1 || r.left < -1) {
            offenders.push({
              tag: el.tagName,
              text: (el.textContent ?? "").trim().slice(0, 48),
              left: Math.round(r.left),
              right: Math.round(r.right),
            });
          }
        }
        return {
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: vw,
          offenders: offenders.slice(0, 6),
          offenderCount: offenders.length,
          dialogCount: document.querySelectorAll('[role="dialog"]').length,
        };
      }, SELECTOR);

      expect(
        report.docScrollWidth,
        `문서가 가로로 스크롤됨 (${report.docScrollWidth} > ${report.docClientWidth})`,
      ).toBeLessThanOrEqual(report.docClientWidth + 1);

      expect(
        report.offenderCount,
        `뷰포트를 벗어난 요소: ${JSON.stringify(report.offenders, null, 2)}`,
      ).toBe(0);

      // #62 — 상충하는 오버레이 동시 개방 0. 첫 방문 자동 투어는 1개까지 허용.
      expect(
        report.dialogCount,
        "role=dialog 가 둘 이상 동시에 열려 있음 (#62 오버레이 배타 위반)",
      ).toBeLessThanOrEqual(1);
    });
  }
}

/**
 * **세로 축 — 하단 탭바가 무엇을 덮고 있나** (2026-08-01 추가).
 *
 * 위의 전수 검사는 **가로 축만** 본다. 그래서 rc.5 검수에서 나온 결함 둘을
 * 원리적으로 못 잡았다 — 둘 다 `scrollWidth == clientWidth` 를 지키며 발생했다:
 *
 * 1. 문서함 하단 바(「지도에서 열기」 · 역참조 칩)가 `<lg` 전 구간에서 탭바 뒤로
 *    20~30px 파고들었다. **가림을 넘어 입력이 탈취**돼서, 누르면 `/download/`
 *    로 갔다 — 문서를 지도에서 열려던 사람이 다운로드 페이지에 도착한다.
 * 2. 지도의 첫 상호작용 지시문(`sample-node-hint`)이 768–1023 에서 높이의
 *    83% 를 덮였다. 좌우용 인셋 토큰을 써서 하단 예약고를 안 받았다.
 *
 * 그래서 두 가지를 잰다. **rect 교집합만으로는 부족하다** — 이 결함의 본질은
 * 겹침이 아니라 **도달 불가**이고, 그건 `elementFromPoint` 만 답한다.
 *
 * 1024 는 대조군이다: 탭바가 `display:none` 이므로 겹침이 0이어야 하고, 0이
 * **아니면** 이 시험이 탭바를 못 찾고 있다는 뜻이다(조용한 무력화 탐지).
 */
const TAB_BAR = 'nav[data-tabbar="primary"]';

for (const width of [375, 768, 1023, 1024] as const) {
  for (const route of ["/ko/docs/", "/ko/topology/"] as const) {
    test(`${width}px ${route} — 하단 탭바가 아무것도 덮지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto(route);
      await page.waitForTimeout(900);

      const report = await page.evaluate(
        ({ tabBarSelector, selector }) => {
          const bar = document.querySelector(tabBarSelector);
          const barRect = bar ? bar.getBoundingClientRect() : null;
          const barVisible = Boolean(
            barRect && barRect.height > 2 && getComputedStyle(bar!).display !== "none",
          );
          if (!barVisible) return { barVisible, covered: [], stolen: [] };

          const covered: { tag: string; text: string; overlap: number }[] = [];
          const stolen: { tag: string; text: string; hit: string }[] = [];
          for (const el of Array.from(document.querySelectorAll(selector))) {
            if (el === bar || bar!.contains(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === "hidden" || cs.display === "none") continue;
            // 뷰포트 밖(스크롤로 내려가야 보이는 것)은 이 검사 대상이 아니다.
            if (r.bottom <= 0 || r.top >= window.innerHeight) continue;

            const overlap = Math.min(r.bottom, barRect!.bottom) - Math.max(r.top, barRect!.top);
            if (overlap <= 1) continue;
            const label = (el.textContent ?? "").trim().slice(0, 40);
            covered.push({ tag: el.tagName, text: label, overlap: Math.round(overlap) });

            // 도달 가능성 — 중심점이 자기(또는 자기 자손/조상)를 돌려주는가.
            const hit = document.elementFromPoint(
              Math.round(r.left + r.width / 2),
              Math.round(r.top + r.height / 2),
            );
            if (!hit || !(el.contains(hit) || hit.contains(el))) {
              stolen.push({
                tag: el.tagName,
                text: label,
                hit: hit
                  ? `${hit.tagName}${hit.getAttribute("data-testid") ? `[${hit.getAttribute("data-testid")}]` : ""}`
                  : "null",
              });
            }
          }
          /**
           * 2차 — **바닥에 앵커된 작은 표면**. 위 셀렉터는 `button/a/p/…` 라
           * `div` 로 만든 힌트·칩·판독계를 못 본다. 실제로 `sample-node-hint`
           * 가 그 사각지대로 빠져 83% 덮인 채 통과했다.
           *
           * 컨테이너는 제외한다 — 지도 캔버스처럼 화면을 채우는 원소 위에
           * 탭바가 떠 있는 것은 **설계**이지 결함이 아니다. 판별은 크기로
           * 한다: 탭바가 *덮으면 안 되는 것*은 바닥 근처에 앉은 작은 표면이고,
           * 탭바가 *위에 떠도 되는 것*은 그 아래 깔린 큰 면이다.
           */
          for (const el of Array.from(document.querySelectorAll("[data-testid]"))) {
            if (el === bar || bar!.contains(el) || el.contains(bar!)) continue;
            const cs = getComputedStyle(el);
            if (cs.position !== "absolute" && cs.position !== "fixed") continue;
            if (cs.visibility === "hidden" || cs.display === "none") continue;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            if (r.height > 200 || r.width > window.innerWidth * 0.9) continue; // 컨테이너
            const overlap = Math.min(r.bottom, barRect!.bottom) - Math.max(r.top, barRect!.top);
            if (overlap <= 1) continue;
            const id = el.getAttribute("data-testid") ?? el.tagName;
            if (covered.some((c) => c.text === id)) continue;
            covered.push({ tag: el.tagName, text: id, overlap: Math.round(overlap) });
          }

          return { barVisible, covered: covered.slice(0, 8), stolen: stolen.slice(0, 8) };
        },
        { tabBarSelector: TAB_BAR, selector: SELECTOR },
      );

      if (width >= 1024) {
        // 대조군 — 여기서 탭바가 보이면 `<lg` 전용이라는 전제가 깨진 것이다.
        expect(report.barVisible, "1024px 에서 하단 탭바가 아직 떠 있다").toBe(false);
        return;
      }

      expect(
        report.barVisible,
        `${width}px 에서 하단 탭바를 못 찾았다 — 이 시험이 지금 아무것도 지키지 않는다`,
      ).toBe(true);

      // 탈취가 먼저다: 덮였어도 누를 수 있으면 등급이 다르고, 못 누르면 결함이다.
      expect(
        report.stolen,
        `하단 탭바가 다른 컨트롤의 클릭을 가로챈다: ${JSON.stringify(report.stolen, null, 2)}`,
      ).toEqual([]);
      expect(
        report.covered,
        `하단 탭바가 요소를 덮는다: ${JSON.stringify(report.covered, null, 2)}`,
      ).toEqual([]);
    });
  }
}

/**
 * 공방 <lg 정직 강등 (2026-07-28 판정 ②).
 *
 * 왜 여기인가 — 웹 스모크 ③ 의 `DEGRADED_SURFACES` 등록부가 아니라 이 파일에
 * 둔다. 그 등록부는 **웹↔앱 축**(브라우저가 원리적으로 못 하는 능력 → 유일한
 * 목적지가 `/download/`)의 계약이고, 각 행이 "이건 웹에서 안 된다"를 주장한다.
 * 이건 **뷰포트 폭 축**이다 — 같은 웹 빌드가 1024px 이상에서는 공방을 그대로
 * 연다. 그 등록부에 넣으면 형식(URL 열고 카드 확인 → `/download/` 링크)이
 * 거짓 주장을 하게 되고, 두 축이 한 목록에서 섞이면 다음 감사자가 "웹은 공방을
 * 못 연다"로 읽는다. 폭이 독립 변수인 이 스펙이 제자리다.
 *
 * 계약의 원칙 자체는 축과 무관하게 그대로 적용한다 (`.claude/rules/surfaces.md`):
 * 강등은 **왜**와 **어디로**를 함께 말한다. 이유만 있고 갈 곳이 없으면 그건
 * 강등이 아니라 막다른 길이다.
 */
const NARROW_STUDIO_ENTRIES = [
  { name: "직접 진입", url: "/ko/ontology/studio/" },
  { name: "딥링크 — 데이터시트의 관계 편집", url: "/ko/ontology/studio/?node=mcp-server" },
  { name: "딥링크 — 새 노드 만들기", url: "/ko/ontology/studio/?mode=create" },
] as const;

for (const width of [1023, 768] as const) {
  for (const entry of NARROW_STUDIO_ENTRIES) {
    test(`${width}px 공방 ${entry.name} — 왜 못 오는지와 어디로 가면 되는지를 함께 말한다`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(entry.url);

      const card = page.getByTestId("studio-too-narrow");
      await expect(card).toBeVisible({ timeout: 15_000 });
      // 왜 — 폭이 이유임을 화면이 말한다.
      await expect(card).toContainText("1024px");
      // 어디로 — 목적지 둘. 지도는 이 폭에서도 쓸 수 있는 곳, 앱은 폭이 보장된 곳.
      await expect(page.getByTestId("studio-too-narrow-map")).toHaveAttribute(
        "href",
        /\/topology\//,
      );
      await expect(page.getByTestId("studio-too-narrow-get-app")).toHaveAttribute(
        "href",
        /\/download\//,
      );
      // 무대 자체는 렌더되지 않는다 — 숨기는 것과 안 만드는 것은 다르다.
      await expect(page.getByTestId("studio-center-card")).toHaveCount(0);
      // 없는 표면을 소개하는 안내가 이 위로 뜨지 않는다.
      await expect(page.getByTestId("guided-tour-card")).toHaveCount(0);
    });
  }
}

test("1024px 부터는 공방이 그대로 열린다 — 강등은 폭 축이지 웹↔앱 축이 아니다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/ko/ontology/studio/");
  await expect(page.getByTestId("studio-too-narrow")).toHaveCount(0);
});

/**
 * 나침 무대의 보드가 화면 밖으로 잘리지 않는다 — **폭 축의 실측 게이트**.
 *
 * 2026-07-28 실측: 보드는 고정 1180px 인데 무대 폭이 그보다 좁으면 좌우가
 * 대칭으로 잘렸다(1024 에서 한쪽 110px, 설치 앱의 최소 폭 1040 에서 102px).
 * 사라진 것은 여백이 아니라 기능이었다 — 왼쪽 소켓 라벨의 앞 글자와 오른쪽
 * 위성의 「···」 편집 버튼 **전체**.
 *
 * 강등 경계를 올리는 대신 축소를 고른 이유가 이 목록의 1040 이다: 설치 앱의
 * `minWidth` 가 1040 이라, 경계를 올리면 앱이 자기 최소 크기에서 강등 화면을
 * 본다. 그 뷰포트를 여기 케이스로 박아 두어 다음 사람이 같은 유혹에 빠지면
 * 여기서 걸리게 한다.
 *
 * 판정은 **rect 로** 한다. "잘려 보이나" 는 사람이 못 재고, 잘림은 정확히
 * 좌우 넘침 px 이다.
 */
for (const width of [1024, 1040, 1180, 1264, 1440]) {
  test(`${width}px 공방 — 보드가 무대 밖으로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/ko/ontology/studio/?guides=off&node=${STOREFRONT_STUDIO_NODE_PARAM}`);

    const stage = page.getByTestId("studio-compass-stage");
    await expect(stage).toBeVisible();

    const readOverflow = () =>
      stage.evaluate((el) => {
        const board = [...el.querySelectorAll<HTMLElement>("[data-board-scale]")][0];
        if (!board) return null;
        const s = el.getBoundingClientRect();
        const b = board.getBoundingClientRect();
        return { left: s.left - b.left, right: b.right - s.right };
      });

    expect(await readOverflow(), "보드를 못 찾았다 — 셀렉터가 썩었으면 이 게이트는 무효다").not.toBeNull();

    // 폴링하는 이유: 판정 대상은 "**언젠가** 클램프된다" 가 아니라 "클램프된
    // 상태로 **머문다**" 이고, 느린 러너에서 첫 프레임을 재면 그건 클램프가
    // 아니라 스케줄링을 재는 것이 된다. 영영 안 걸리면 여기서 시간 초과로
    // 터진다 — 실제로 CI 가 그 모양(넘침 110px = 배율 1)으로 결함을 잡았다.
    await expect
      .poll(async () => (await readOverflow())!.left, { timeout: 5_000 })
      .toBeLessThanOrEqual(0);
    expect((await readOverflow())!.right).toBeLessThanOrEqual(0);
  });
}
