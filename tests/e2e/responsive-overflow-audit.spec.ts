import { expect, test } from "@playwright/test";

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
