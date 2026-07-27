import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 영문 화면에 한국어가 **렌더되면** 실패한다.
 *
 * 왜 e2e 여야 하나: 2026-07-28 스윕이 잡은 결함(`/en/project/new` 의 카테고리·
 * 상태 드롭다운과 카드 미리보기가 한국어)은 기존 게이트 어느 것도 못 봤다.
 * `pnpm test:i18n:messages` 는 **메시지 카탈로그**의 키 대칭만 보고, 그 문자열은
 * 카탈로그가 아니라 코드 상수(`entities/status` defaults)와 JSX 리터럴에서
 * 왔다. lint 도 vitest 도 "이 문자열이 영문 화면에 실제로 그려지는가" 는 못
 * 본다 — 그 층은 브라우저만 안다.
 *
 * ## 왜 이 두 라우트만인가 (사정거리와 그 이유)
 *
 * 앱의 거의 모든 화면은 **사용자 vault 의 텍스트**를 그린다. 예시 볼트
 * (`온라인 쇼핑몰`, `주문 생성` …)와 사용자가 쓴 노드 제목은 한국어가 정상이고,
 * 사용자가 쓴 문자열을 기계가 번역해 보여주는 것은 이 제품의 원칙 위반이다.
 * 그래서 "모든 /en 라우트에 한글 0" 은 참이 아닌 명제이고, 그걸 강제하려면
 * vault 유래 텍스트를 전부 마커로 감싸야 한다 — 지금 켤 수 없는 큰 변경이다.
 *
 * 대신 **vault 텍스트를 한 글자도 그리지 않는 라우트**만 잠근다. 오늘 전수
 * 측정(1512×950, 예시 볼트 로드) 결과 그런 라우트는 아래 둘이고, 결함이 난
 * 자리(`/project/new`)가 그 안에 있다. 라우트가 vault 데이터를 그리기
 * 시작하면 이 스펙이 먼저 깨져서 목록을 다시 보게 만든다 — 조용히 썩지 않는다.
 *
 * 나머지 라우트의 어권 회귀는 뿌리에서 막는다:
 * `tests/contract/taxonomy-locale-label.contract.test.ts`.
 */
const VAULT_FREE_EN_ROUTES = [
  // 결함이 났던 자리 — 새 프로젝트 폼(카테고리/상태 드롭다운 + 카드 미리보기).
  // 프로젝트가 아직 없으므로 그려지는 문자열이 전부 앱 크롬이다.
  "/en/project/new/",
  // 다운로드 안내 — 릴리스 사실 + 정적 카피만.
  "/en/download/",
];

const HANGUL_SOURCE = "[\\u3131-\\u318E\\uAC00-\\uD7A3]";

test.describe("영문 화면 어권 순도", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1512, height: 950 });
  });

  for (const route of VAULT_FREE_EN_ROUTES) {
    test(`${route} 에 한국어가 렌더되지 않는다`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      // 폼/미리보기가 하이드레이션 뒤에 채워진다.
      await page.waitForTimeout(1500);

      const hits = await page.evaluate((hangulSource) => {
        const hangul = new RegExp(hangulSource);
        // 화면에 그려지지 않는 것은 대상이 아니다 — RSC 페이로드가 사는
        // <script> 를 세면 모든 페이지가 실패한다(직렬화된 ko 카탈로그).
        const nonVisual = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
        const found: string[] = [];

        const describe = (el: Element): string => {
          const parts: string[] = [];
          let cur: Element | null = el;
          while (cur && cur !== document.body && parts.length < 5) {
            const testId = cur.getAttribute("data-testid");
            parts.push(cur.tagName.toLowerCase() + (testId ? `[${testId}]` : ""));
            cur = cur.parentElement;
          }
          return parts.join("<");
        };

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const text = (node.nodeValue ?? "").trim();
          const parent = node.parentElement;
          if (text && hangul.test(text) && parent) {
            let ancestor: Element | null = parent;
            let hidden = false;
            while (ancestor) {
              if (nonVisual.has(ancestor.tagName)) {
                hidden = true;
                break;
              }
              ancestor = ancestor.parentElement;
            }
            if (!hidden) found.push(`"${text.slice(0, 60)}" @ ${describe(parent)}`);
          }
          node = walker.nextNode();
        }

        // <option> 텍스트는 접혀 있어도 사용자가 여는 순간 읽는 값이다.
        for (const select of Array.from(document.querySelectorAll("select"))) {
          for (const option of Array.from(select.options)) {
            const text = (option.textContent ?? "").trim();
            if (hangul.test(text)) {
              found.push(`"${text}" @ select[${select.getAttribute("data-testid") ?? select.name}]>option`);
            }
          }
        }

        return Array.from(new Set(found));
      }, HANGUL_SOURCE);

      expect(
        hits,
        `${route} 에 한국어가 렌더됐다 — 영문 화면의 문자열은 화면 언어를 따라야 한다:\n${hits.join("\n")}`,
      ).toEqual([]);
    });
  }
});
