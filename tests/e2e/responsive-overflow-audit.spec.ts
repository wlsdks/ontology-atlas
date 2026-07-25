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
