import { test, expect } from "@playwright/test";
import { AUDITED_ROUTES } from "./audited-routes";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 스크롤 끝에서 하단 여백이 살아 있는지 — 셸 본문 슬롯의 압축 금지 계약.
 *
 * ## 무엇을 지키나
 *
 * 셸 본문 슬롯(`AppShell` 의 `overflow-y-auto` 칼럼)은 스크롤 컨테이너다.
 * 페이지 루트는 슬롯을 채우려고 `min-h-full` 을 쓰는데, 그 명시적 min-height 는
 * flex 아이템의 자동 최소 크기(내용 높이)를 덮어쓴다. 그래서 예전에는 내용이
 * 뷰포트보다 길어지면 flex 가 페이지 박스를 뷰포트 높이까지 **압축**했고,
 * 내용은 visible overflow 로 삐져나와 스크롤은 되지만 페이지가 선언한 하단
 * 예약고가 줄어든 박스 바닥에 붙어 스크롤 끝에서 사라졌다.
 *
 * 1512×950 실측(결함 당시): 다운로드는 마지막 글줄이 뷰포트 바닥에 **딱 붙고**
 * (여백 0px), 768 에서는 프로젝트 상세의 마지막 줄이 하단 탭바 **뒤로 17px
 * 들어가** 가려졌다. `.claude/rules/design.md` 의 터치 계약대로 "탭바 뒤로
 * 가려짐" 은 결함이다.
 *
 * ## 왜 단위 테스트가 아니라 e2e 인가
 *
 * 이 결함은 **레이아웃 계산의 결과**다. jsdom 은 레이아웃을 하지 않아 압축도
 * 스크롤 끝 여백도 재현할 수 없다 — 클래스 문자열 단언(`AppShell.test.tsx`)은
 * 처방이 제자리에 있는지만 보고, 그 처방이 실제로 픽셀을 되찾는지는 못 본다.
 * 두 층을 같이 둔다.
 */

/** 실측 최소 예약고는 40px(`lg:pb-10`)다. 24 는 서브픽셀 흔들림만 흡수한다. */
const MIN_GAP = 24;

/**
 * 감사 라우트 **정본**을 그대로 쓴다 (2026-08-06).
 *
 * ## 왜 손으로 고른 5개에서 갈아탔나
 *
 * 종전 목록은 손으로 고른 다섯 줄이었고 **그 다섯이 왜 그 다섯인지 아무도 적어
 * 두지 않았다.** 그 사각지대가 실제 결함을 숨겼다 — `/`(관문)가 목록에 없었고,
 * 거기서 마지막 줄이 하단 탭바 뒤로 **17px** 들어가 있었다(390·768 양쪽에서,
 * 프로덕션 정적 export 로 재확인).
 *
 * 더 나쁜 것은 **왜 안 걸렸나** 다. `/` 와 `/download` 는 같은 관문 뷰를 그리는데
 * 탭바는 `/` 에만 선다(`shouldHideBottomTabBar` 가 `/download` 만 숨긴다). 목록에
 * 있던 것은 탭바가 **없는** 쪽이고, 탭바가 없으면 `tabClearance` 가 `null` 이라
 * 아래 ③ 검사가 **조용히 건너뛰어진다.** 즉 같은 화면을 「검사가 무력화되는
 * 쪽에서만」 재고 있었다.
 *
 * 그래서 셋을 함께 고친다: 목록을 정본으로 · 폰 폭을 매트릭스에 · ③ 이 한 번도
 * 안 돌았으면 실패하게(아래 `tabMeasured`). 라우트를 새로 만들면 정본에 등재하는
 * 것을 `audited-route-coverage.contract.test.ts` 가 이미 강제하므로 이 게이트도
 * 자동으로 따라온다 — 손으로 관리하는 목록이 하나 줄었다.
 */
const ROUTES = AUDITED_ROUTES.map((url) => [url, url] as const);

/** 하단 탭바가 서는 폭 — `BottomTabBar` 는 `lg:hidden` 이라 1024 미만이다. */
const BOTTOM_TAB_BAR_MAX_WIDTH = 1024;

/**
 * 셸 본문 슬롯이 **없는 것이 정상**인 라우트.
 *
 * 404 는 루트 `app/not-found.tsx` 가 셸 **밖에서** 그린다(그 사실은
 * `audited-routes.ts` 가 실측으로 기록해 뒀다). 그러니 여기서 슬롯이 없는 것은
 * 결함이 아니다 — 스크롤 계약 자체가 적용되지 않는다.
 *
 * ⚠️ 이 집합에 **없는** 라우트에서 슬롯이 사라지면 셸 구조가 바뀐 것이므로
 * 아래 단언이 그대로 터진다. 「슬롯 없으면 건너뛴다」로 뭉개면 셸이 통째로
 * 바뀌어도 이 게이트가 조용히 전부 건너뛰고 초록이 된다.
 */
const SLOTLESS_ROUTES = new Set(
  AUDITED_ROUTES.filter((url) => url.includes("this-route-does-not-exist")),
);

const VIEWPORTS = [
  // 다섯 라우트가 모두 스크롤되는 조합 — 압축 재현에 필요한 "내용 > 뷰포트".
  { label: "desktop-1280x700", w: 1280, h: 700 },
  // `<lg` — 하단 탭바가 서고 페이지가 그 예약고를 계약하는 폭.
  { label: "tablet-768x950", w: 768, h: 950 },
  // 폰. 종전 매트릭스에 없어서 **탭바가 서는 가장 좁은 폭**이 미측정이었다.
  { label: "phone-390x844", w: 390, h: 844 },
] as const;

type Measured = {
  slot: boolean;
  scrollable: boolean;
  rootHeight: number;
  scrollHeight: number;
  /**
   * 스크롤 끝에서 마지막 "잉크" 아래 남은 여백.
   *
   * **잉크를 하나도 못 찾으면 `null`** 이다 — 종전에는 그 경우도 `0` 을 돌려줬고,
   * `0 < MIN_GAP` 이라 **계측 실패가 「여백 0px 위반」으로 보고**됐다(실측
   * 2026-08-06: `/ko/project/storefront/`). 못 잰 것은 통과도 실패도 아니라
   * **계측 실패**이므로, 부르는 쪽이 그 사실을 그대로 말해야 한다.
   */
  gap: number | null;
  /** 하단 고정 탭바가 있으면 마지막 잉크가 그 위로 얼마나 떨어져 있나. */
  tabClearance: number | null;
};

async function measure(page: import("@playwright/test").Page): Promise<Measured> {
  return page.evaluate(() => {
    const slot = [...document.querySelectorAll("div")].find(
      (d) =>
        getComputedStyle(d).overflowY === "auto" &&
        (d.parentElement?.className ?? "").includes("flex min-h-0 flex-1"),
    );
    if (!slot) {
      return { slot: false, scrollable: false, rootHeight: 0, scrollHeight: 0, gap: null, tabClearance: null };
    }
    /**
     * 페이지 루트 — **첫 자식이 아니다.**
     *
     * Next 는 이 슬롯 안에도 `<script>` 를 주입하고, 그것이 첫 자식이면 종전
     * 코드는 높이 0 짜리 노드를 페이지 루트로 삼아 **잉크를 하나도 못 찾았다**
     * (실측 2026-08-06 `/ko/project/storefront/`: 슬롯 자식이
     * `[SCRIPT, SCRIPT, DIV(1004px)]` — `rootHeight 0`, 잉크 0건).
     * 박스를 가진 첫 자식을 고른다.
     */
    const root = ([...slot.children] as HTMLElement[]).find(
      (el) => el.getBoundingClientRect().height > 0,
    ) ?? null;
    slot.scrollTop = slot.scrollHeight;

    /**
     * 조상이 잘라 낸 것은 **이 페이지의 잉크가 아니다.**
     *
     * `/ko/changelog/` 의 데스크톱 목차는 자기 스크롤을 가진 sticky 사이드바
     * (`max-h-[…] overflow-y-auto`)라, 그 안의 항목 rect 가 사이드바 밖으로
     * 한참 뻗어 있다. 종전 코드는 그것을 페이지의 마지막 잉크로 세어
     * **`gap −184px` 라는 거짓 위반**을 냈다(실측 2026-08-06, 1280×700 —
     * 사이드바는 63.8~619.8 인데 잡힌 잉크는 883.8).
     *
     * 슬롯 자신은 검사하지 않는다 — 슬롯은 우리가 끝까지 스크롤한 컨테이너이고,
     * 그 안에서 아래에 있는 것이야말로 재려는 대상이다.
     */
    /**
     * 조상의 클리핑을 반영한 **보이는 아랫변**을 돌려준다. 완전히 밖이면 `null`.
     *
     * ⚠️ 「완전히 밖인가」만 보면 부족하다 (2026-08-07 코드 리뷰). 클리핑 상자의
     * 아래 모서리에 **걸친** 자식은 전부 밖이 아니라서 통과하고, 그때 잘려서
     * 안 보이는 부분까지 포함한 `bottom` 이 그대로 쓰인다. 그러면 이 함수가
     * 막으려던 `/ko/changelog/` 사이드바 거짓 위반이 스크롤 위치나 뷰포트만
     * 바뀌면 그대로 재현된다. 교집합으로 **깎아서** 돌려준다.
     */
    const visibleBottom = (el: Element, r: DOMRect): number | null => {
      let bottom = r.bottom;
      for (let n = el.parentElement; n && n !== slot; n = n.parentElement) {
        if (getComputedStyle(n).overflow === "visible") continue;
        const nr = n.getBoundingClientRect();
        if (r.top > nr.bottom || r.bottom < nr.top) return null;
        bottom = Math.min(bottom, nr.bottom);
      }
      return bottom;
    };

    // 마지막 잉크 — 컨테이너의 하단 패딩은 여백이지 내용이 아니므로 잎만 본다.
    let inkBottom = Number.NEGATIVE_INFINITY;
    const walk = (el: Element) => {
      for (const child of Array.from(el.children)) {
        const cs = getComputedStyle(child);
        if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
        if ((child.className ?? "").toString().includes("sr-only")) continue;
        /**
         * ⚠️ **닫힌 `<details>` 의 내용은 박스는 있는데 잉크가 아니다.**
         *
         * 최신 Chromium 은 닫힌 disclosure 를 `display: none` 이 아니라
         * `content-visibility: hidden` 으로 감춘다(전개 애니메이션 때문에 바뀐
         * 동작). 위 세 조건은 전부 통과하는데 화면에는 없다 — 실측 2026-07-29:
         * `/download` 의 접힌 「받아도 되는 이유」가 561px 짜리 유령 잉크가 되어
         * 하단 여백을 -505px 로 만들었다. `checkVisibility()` 가 표준 판별이다.
         */
        if (typeof child.checkVisibility === "function" && !child.checkVisibility()) continue;
        const r = child.getBoundingClientRect();
        if (child.children.length === 0 && r.height > 2 && r.width > 2 && r.bottom > inkBottom) {
          const shown = visibleBottom(child, r);
          if (shown !== null && shown > inkBottom) inkBottom = shown;
        }
        walk(child);
      }
    };
    if (root) walk(root);

    const bottomBar = [...document.querySelectorAll("*")].find((el) => {
      const s = getComputedStyle(el);
      if (s.position !== "fixed") return false;
      const r = el.getBoundingClientRect();
      return r.height > 20 && r.bottom >= window.innerHeight - 2 && r.width > window.innerWidth * 0.5;
    });

    const slotRect = slot.getBoundingClientRect();
    return {
      slot: true,
      scrollable: slot.scrollHeight > slot.clientHeight + 1,
      rootHeight: Math.round(root?.getBoundingClientRect().height ?? 0),
      scrollHeight: Math.round(slot.scrollHeight),
      gap: Number.isFinite(inkBottom) ? Math.round(slotRect.bottom - inkBottom) : null,
      tabClearance:
        bottomBar && Number.isFinite(inkBottom)
          ? Math.round(bottomBar.getBoundingClientRect().top - inkBottom)
          : null,
    };
  });
}

for (const vp of VIEWPORTS) {
  test(`스크롤 끝 하단 여백 — ${vp.label}`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });

    const violations: string[] = [];
    let scrolledRoutes = 0;
    /** 셸 본문 슬롯을 실제로 찾은 라우트 수. */
    let slotRoutes = 0;
    /** ③ 이 실제로 판정한 라우트 수. 0 이면 그 검사는 돌지 않은 것이다. */
    let tabMeasured = 0;

    for (const [label, url] of ROUTES) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const m = await measure(page);
      if (!m.slot) {
        expect(
          SLOTLESS_ROUTES.has(url),
          `${label}: 셸 본문 슬롯을 못 찾았다 — 셸 구조가 바뀌면 이 게이트가 죽는다`,
        ).toBe(true);
        continue;
      }
      slotRoutes += 1;
      if (!m.scrollable) continue;
      scrolledRoutes += 1;

      // ① 압축 금지 — 페이지 박스가 내용 높이를 가져야 예약고가 제자리에 붙는다.
      if (m.rootHeight < m.scrollHeight - 1) {
        violations.push(
          `${label}: 페이지 루트가 압축됐다 (박스 ${m.rootHeight} < 내용 ${m.scrollHeight})`,
        );
      }
      // ② 스크롤 끝에 여백이 남아야 한다. **못 잰 것은 통과가 아니다.**
      if (m.gap === null) {
        violations.push(
          `${label}: 잉크를 하나도 못 찾았다 — 계측 실패이지 통과가 아니다 (슬롯 구조가 바뀌었나)`,
        );
      } else if (m.gap < MIN_GAP) {
        violations.push(`${label}: 스크롤 끝 하단 여백 ${m.gap}px (< ${MIN_GAP})`);
      }
      // ③ 하단 탭바가 있으면 그 뒤로 들어가지 않아야 한다.
      if (m.tabClearance !== null) {
        tabMeasured += 1;
        if (m.tabClearance < MIN_GAP) {
          violations.push(`${label}: 마지막 줄이 하단 탭바에 가렸다 (여유 ${m.tabClearance}px)`);
        }
      }
    }

    // 게이트 생존 확인 — 스크롤되는 라우트가 하나도 없으면 "통과" 가 아니라 결함이다.
    expect(scrolledRoutes, "스크롤되는 라우트가 없다 — 매트릭스가 결함을 못 본다").toBeGreaterThan(1);

    // 슬롯을 찾은 라우트 수는 **파생값으로** 단언한다 — 숫자를 손으로 박으면
    // 라우트가 늘 때마다 사람이 따라 고쳐야 하고, 안 고치면 게이트가 낡는다.
    expect(
      slotRoutes,
      "셸 본문 슬롯이 있어야 하는 라우트 수가 안 맞는다 — 셸 구조나 404 배선이 바뀌었다",
    ).toBe(ROUTES.length - SLOTLESS_ROUTES.size);

    /**
     * ③ 이 **한 번이라도 판정했는지** 를 단언한다.
     *
     * `tabClearance` 는 탭바를 못 찾으면 `null` 이고, `null` 이면 위 검사가 조용히
     * 건너뛰어진다. 종전 목록은 탭바가 없는 라우트만 담고 있어서 이 검사가 **한
     * 번도 돈 적이 없었고**, 그런데도 시험은 초록이었다 — 그게 17px 가림을 숨긴
     * 방식이다. 탭바가 서는 폭에서는 최소 한 라우트가 실제로 판정돼야 한다.
     */
    if (vp.w < BOTTOM_TAB_BAR_MAX_WIDTH) {
      expect(
        tabMeasured,
        `${vp.label}: 하단 탭바를 한 번도 못 찾았다 — ③ 검사가 통째로 공회전했다. ` +
          `탭바가 사라졌거나(그러면 이 폭의 계약이 바뀐 것) 셀렉터가 낡았다.`,
      ).toBeGreaterThan(0);
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
}
