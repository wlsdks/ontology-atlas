import { test, expect } from "@playwright/test";
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

const ROUTES = [
  ["projects", "/en/projects/"],
  // 앱 자신이 목록에서 거는 링크 형태. `/project/<slug>/` 정적 라우트는 볼트가
  // 없으면 빈 껍데기라 측정 대상이 못 된다.
  ["project-detail", "/en/project/fallback/?slug=storefront"],
  ["insights", "/en/ontology/insights/"],
  ["download", "/en/download/"],
  // #708 이 페이지 단위로 고쳤던 자리 — 셸 계약으로 옮긴 뒤에도 유지되는지.
  ["project-editor", "/en/project/new/"],
] as const;

const VIEWPORTS = [
  // 다섯 라우트가 모두 스크롤되는 조합 — 압축 재현에 필요한 "내용 > 뷰포트".
  { label: "desktop-1280x700", w: 1280, h: 700 },
  // `<lg` — 하단 탭바가 서고 페이지가 그 예약고를 계약하는 폭.
  { label: "tablet-768x950", w: 768, h: 950 },
] as const;

type Measured = {
  slot: boolean;
  scrollable: boolean;
  rootHeight: number;
  scrollHeight: number;
  /** 스크롤 끝에서 마지막 "잉크" 아래 남은 여백. */
  gap: number;
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
    if (!slot) return { slot: false, scrollable: false, rootHeight: 0, scrollHeight: 0, gap: 0, tabClearance: null };
    const root = slot.firstElementChild as HTMLElement | null;
    slot.scrollTop = slot.scrollHeight;

    // 마지막 잉크 — 컨테이너의 하단 패딩은 여백이지 내용이 아니므로 잎만 본다.
    let inkBottom = Number.NEGATIVE_INFINITY;
    const walk = (el: Element) => {
      for (const child of Array.from(el.children)) {
        const cs = getComputedStyle(child);
        if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
        if ((child.className ?? "").toString().includes("sr-only")) continue;
        const r = child.getBoundingClientRect();
        if (child.children.length === 0 && r.height > 2 && r.width > 2 && r.bottom > inkBottom) {
          inkBottom = r.bottom;
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
      gap: Number.isFinite(inkBottom) ? Math.round(slotRect.bottom - inkBottom) : 0,
      tabClearance: bottomBar
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

    for (const [label, url] of ROUTES) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const m = await measure(page);
      expect(m.slot, `${label}: 셸 본문 슬롯을 못 찾았다 — 셸 구조가 바뀌면 이 게이트가 죽는다`).toBe(true);
      if (!m.scrollable) continue;
      scrolledRoutes += 1;

      // ① 압축 금지 — 페이지 박스가 내용 높이를 가져야 예약고가 제자리에 붙는다.
      if (m.rootHeight < m.scrollHeight - 1) {
        violations.push(
          `${label}: 페이지 루트가 압축됐다 (박스 ${m.rootHeight} < 내용 ${m.scrollHeight})`,
        );
      }
      // ② 스크롤 끝에 여백이 남아야 한다.
      if (m.gap < MIN_GAP) {
        violations.push(`${label}: 스크롤 끝 하단 여백 ${m.gap}px (< ${MIN_GAP})`);
      }
      // ③ 하단 탭바가 있으면 그 뒤로 들어가지 않아야 한다.
      if (m.tabClearance !== null && m.tabClearance < MIN_GAP) {
        violations.push(`${label}: 마지막 줄이 하단 탭바에 가렸다 (여유 ${m.tabClearance}px)`);
      }
    }

    // 게이트 생존 확인 — 스크롤되는 라우트가 하나도 없으면 "통과" 가 아니라 결함이다.
    expect(scrolledRoutes, "스크롤되는 라우트가 없다 — 매트릭스가 결함을 못 본다").toBeGreaterThan(1);
    expect(violations, violations.join("\n")).toEqual([]);
  });
}
