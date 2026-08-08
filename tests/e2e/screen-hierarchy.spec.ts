import { test, expect } from "@playwright/test";

import { AUDITED_ROUTES } from "./audited-routes";

/**
 * 화면 위계 — **눈이 먼저 닿아야 하는 것이 실제로 가장 큰가 · 채워진 악센트는
 * 하나인가.**
 *
 * ## 왜 이 층이어야 하나
 *
 * 2026-08-06 「위계」석이 `/project/new` 에서 둘을 지적했고 둘 다 **실측으로
 * 확인됐다**:
 *
 * | 결함 | 실측 |
 * |---|---|
 * | 보조 패널의 「0%」가 페이지 제목과 **동률** | 둘 다 30px |
 * | amber 배너가 *"폴더를 열어야 한다"* 는데 **여는 길이 없다** | 폴더 여는 컨트롤 **0개** |
 *
 * 둘 다 **코드에 아무 값도 안 남기는 결함**이다 — 「0%」는 램프 안의 정당한 칸
 * (`text-hero`)을 쓰고 있었고, 배너는 문구가 멀쩡했다. 값을 보는 lint 도 소스를
 * 훑는 계약도 볼 수 없다. **그려진 화면에서만 보인다.**
 *
 * ## 왜 소스가 아니라 렌더를 재나
 *
 * 「제목보다 큰 것이 없다」는 **두 원소의 관계**이고, 그 둘은 서로 다른 파일에
 * 산다(제목은 페이지, 통계는 폼 위젯). 한 파일의 구문 트리를 보는 검사로는
 * 원리적으로 표현할 수 없다.
 *
 * ## 왜 라우트 하나가 아니라 전수인가 (2026-08-08)
 *
 * 이 파일은 태어날 때 **`/project/new` 한 라우트**만 봤다. 같은 날 태어난 옆
 * 게이트(`open-vault-cta.spec.ts`)가 정확히 그 이유로 전수로 넓혀졌고, 넓히는
 * 순간 같은 병이 **두 곳 더** 나왔다. 이 저장소가 이미 값을 치른 실패형이다
 * (`design-gates.md`): **허용목록으로 만든 검사는 목록에 없는 것에서 실패하고,
 * 목록에 없는 것은 언제나 새로 만든 것이다.**
 *
 * 그래서 라우트 목록은 여기서 손으로 쓰지 않는다 — 정본
 * (`audited-routes.ts`, 17개)을 import 하고, 빠지는 자리는 **「없음」이 아니라
 * 「예외 + 실측치 + 무엇이 대신 재는가」**로 아래에 적는다.
 *
 * ## 전수 측정 (2026-08-08 · 정적 export · 1512×900 · `?guides=off`)
 *
 * | 라우트 | 제목 | 제목≥ 위반 | 채워진 악센트 | 비고 |
 * |---|---|---|---|---|
 * | `/ko/` | 34px | 0 | 1 (`download-primary-cta`) | |
 * | `/ko/topology/` | **없음**(h1 = `sr-only` 1×1) | — | 1 (`first-run-starter-open`) | ①예외 |
 * | `/ko/docs/` | **없음**(h1 = `sr-only` 1×1) | — | 0 | ①예외 |
 * | `/ko/ontology/studio/` | 16px | 0 | 0 | 2026-08-08 에 14px·2건에서 고쳐짐 |
 * | `/ko/ontology/insights/` | 23px | 0 | 0 | |
 * | `/ko/projects/` | 23px | 0 | 0 | 용량 막대 10개는 data-mark(h≤8) |
 * | `/ko/project/storefront/` | 23px | 0 | 0 | h1 이 둘(23·16) — a11y 소관 |
 * | `/ko/project/storefront/edit/` | 30px | 0 | 1 (`project-save-top`) | 2026-08-08 에 2개에서 고쳐짐 |
 * | `/ko/project/new/` | 30px | 0 | 1 (`project-save`) | 이 파일의 출생지 |
 * | `/ko/project/fallback/` | 23px | 0 | 0 | `/projects` 와 같은 화면 |
 * | `/ko/git/` | 23px | 0 | 1 (`atlas-git-web-get-app`) | |
 * | `/ko/download/` | 34px | 0 | 1 (`download-primary-cta`) | |
 * | `/ko/guide/` | 34px | 0 | 0 | |
 * | `/ko/guide/what-is-atlas/` | 34px | 0 | 0 | |
 * | `/ko/changelog/` | 34px | 0 | 0 | 훑은 글자 225 |
 * | `/ko/this-route-does-not-exist/` | 23px | 0 | 1 | |
 * | `/this-route-does-not-exist/` | 23px | 0 | 1 | 같은 루트 파일 |
 *
 * 합계: 훑은 글자 원소 **964** · 채워진 악센트 컨트롤 **8**(2026-08-08 위계 판정
 * 적용 전 9 — 편집 화면의 쌍둥이 저장 중 하나가 보조 톤으로 내려갔다).
 *
 * ## 예외가 셋에서 둘로 줄었다 (2026-08-08, 같은 날 오후)
 *
 * 위 표의 「①예외(실측 등재)」 둘은 **판정을 기다리던 위반**이었고, 소유자 위임
 * 판정으로 고쳐졌다 — 그래서 예외가 아니라 규칙으로 들어왔다:
 *
 * | 고친 것 | 전 | 후 |
 * |---|---|---|
 * | 공방 h1 「무엇을 할까요?」 | `text-body-lg` 14px + secondary (입구 카드 라벨과 동률·색 열세) | `text-title` 16px + primary (동률 0건) |
 * | 편집 폼 끝 저장 | 채워진 인디고 142×40 (상단 sticky 와 쌍둥이) | `outline` — 채워진 악센트는 상단 sticky 하나 |
 *
 * 남은 예외는 「그려진 제목이 없는 화면」 둘(지도·문서함)뿐이고, 그 둘은 아래
 * 「제목 없는 화면은 정말 제목이 없다」가 계속 지킨다.
 */

/** 상호작용 컨트롤 — 「채워진 악센트 면」의 주인이 될 수 있는 것. */
const CONTROL = 'a[href],button,[role="button"],[role="link"],input,select,summary';

/**
 * **채워진 악센트인지 가르는 크기 바닥** — data-mark 와 CTA 를 나눈다.
 *
 * 하드코딩한 «디자인 판단» 이 아니라 실측으로 벌어진 틈이다(2026-08-08):
 * 악센트로 칠해진 data-mark 의 최대 높이는 **8px**(`domain-capacity-bar-*` ·
 * 노드 힌트 점 6 · 공방 추천 점 4 · 문서함 밑줄 h2)이고, 진짜 CTA 의 최소는
 * **36×85**(`atlas-git-web-get-app`)다. 24×44 는 그 사이에 있고, 아래쪽 값은
 * WCAG 2.5.8 의 최소 타깃과도 같다.
 *
 * 색 자체는 절대 하드코딩하지 않는다 — `:root` 에서 읽는다(아래 `readAccents`).
 * 낡은 색 목록은 정상을 결함이라 부르고 결함을 정상이라 부른다.
 */
const ACCENT_MIN_HEIGHT = 24;
const ACCENT_MIN_WIDTH = 44;

/**
 * **프로브 훅 — 결함을 *더하는* 방향으로만 동작한다.**
 *
 * `HIERARCHY_PROBE=title` / `=accent` / `=h1` / `=blind-accent` / `=blind-title`
 * (쉼표로 조합) 을 주면 각 라우트에 위반 원소를 심거나 판정기를 눈멀게 한다. 검사를 **통과시키는** 경로가 아니므로(오직 위반을
 * 더한다) 게이트에 낸 구멍이 아니다 — 이 훅으로 할 수 있는 최악은 «항상
 * 빨강» 이다. 게이트를 고칠 때마다 `/gate-probe` 를 손으로 재현하지 않아도
 * 되게 파일 안에 둔다.
 *
 * 셋째 `h1` 은 **예외 자신을 겨눈다**: 제목 없는 화면(지도·문서함)에 그려진 h1
 * 을 심어, 「예외가 낡으면 빨개진다」는 주장이 실제로 참인지 확인한다. 예외를
 * 등재하면서 그 예외가 빨개질 수 있는지 재지 않으면, 예외는 «영원히 초록인
 * 검사» 와 구별되지 않는다.
 *
 * 2026-08-08 실측:
 *
 * | 프로브 | 빨개진 것 |
 * |---|---|
 * | `title` | ①이 **비예외 15/15** 라우트에서 빨강(예외 2개는 그대로 초록 — 설계대로) |
 * | `accent` | ②가 이미 악센트 1개였던 **8 라우트**에서 빨강 |
 * | `accent` | 「편집의 주 CTA 는 상단 sticky」 가드가 둘째 악센트를 보고 빨강 |
 * | `h1` | 제목 없음 예외 가드가 지도·문서함 둘에서 빨강 |
 * | `blind-accent` | ②가 «악센트 0개(전 라우트)» 를 **통과가 아니라 측정 실패**로 빨강 |
 * | `blind-title` | ①이 «기준 없음» 을 첫 비예외 라우트(`/ko/`)에서 빨강 |
 */
const PROBE = (process.env.HIERARCHY_PROBE ?? "").split(",").map((s) => s.trim());

/** 각 라우트에서 잰 것. */
type RouteMeasurement = {
  route: string;
  /** 그려진 h1 중 가장 큰 글자 크기. 0 이면 그려진 제목이 없다. */
  titlePx: number;
  paintedH1: number;
  offenders: { text: string; px: number; testid: string | null }[];
  scanned: number;
  /** `:root` 에서 실제로 읽어 낸 악센트 토큰 수. */
  accentTokens: number;
  /** 배경색을 들여다본 그려진 원소 수 — 0 이면 스캐너가 죽었다. */
  considered: number;
  filled: { token: string; testid: string | null; text: string; w: number; h: number }[];
};

/**
 * 한 라우트를 열고 **두 속성을 한 번에** 잰다.
 *
 * 브라우저 안에서 도는 함수라 위 상수를 인자로 넘긴다(클로저는 직렬화되지
 * 않는다).
 */
async function measureRoute(
  page: import("@playwright/test").Page,
  route: string,
): Promise<RouteMeasurement> {
  await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);

  if (PROBE.some((k) => k.length > 0)) {
    await page.evaluate((kinds: string[]) => {
      const paintedH1 = [...document.querySelectorAll("h1")].filter((h) => {
        const b = h.getBoundingClientRect();
        return b.width > 2 && b.height > 2;
      });
      const base = Math.max(
        0,
        ...paintedH1.map((h) => parseFloat(getComputedStyle(h).fontSize)),
      );
      if (kinds.includes("title") && base > 0) {
        const d = document.createElement("div");
        d.textContent = "PROBE-제목보다-큼";
        d.style.cssText = `position:fixed;left:0;top:0;z-index:99999;background:#000;color:#fff;font-size:${base + 6}px`;
        d.setAttribute("data-hierarchy-probe", "title");
        document.body.appendChild(d);
      }
      if (kinds.includes("h1")) {
        const h = document.createElement("h1");
        h.textContent = "PROBE-보이는-제목";
        h.style.cssText =
          "position:fixed;left:0;bottom:0;z-index:99999;background:#000;color:#fff;font-size:28px";
        h.setAttribute("data-hierarchy-probe", "h1");
        document.body.appendChild(h);
      }
      if (kinds.includes("accent")) {
        const a = document.createElement("a");
        a.href = "#probe";
        a.textContent = "PROBE";
        a.style.cssText =
          "position:fixed;right:0;top:0;z-index:99999;width:120px;height:48px;background:var(--color-indigo-brand)";
        a.setAttribute("data-hierarchy-probe", "accent");
        document.body.appendChild(a);
      }
      // ── 공회전 방지 자신을 겨누는 둘 ─────────────────────────────────
      //
      // 위 셋은 «결함이 들어오면 빨개지나» 를 재고, 아래 둘은 «판정기가 죽으면
      // 빨개지나» 를 잰다. 이 저장소가 릴리스를 하나 잃은 실패형이 정확히
      // 후자다 — 표식이 컴포넌트보다 오래 살아남은 스모크 게이트는 한 번도
      // 자기가 주장한 것을 확인한 적이 없었다(`AGENTS.md` /gate-probe).
      if (kinds.includes("blind-accent")) {
        // 색 기준을 아무것도 안 맞는 값으로 바꾼다 = 「채워진 악센트 0개」.
        // 규칙(≤1)은 참이 되지만 그건 통과가 아니라 **측정 실패**여야 한다.
        // **서로 다른** 미사용 색으로 바꾼다. 같은 색 넷으로 바꾸면 토큰이
        // 하나로 접혀서 앞단 가드(`accentTokens > 2`)가 먼저 잡고, 정작 재려던
        // 뒷단 가드(`totalFilled > 5`)는 한 번도 안 돈다 — 첫 시도가 그랬다.
        const names = [
          "--color-indigo-brand",
          "--color-indigo-brand-hover",
          "--color-indigo-accent",
          "--color-indigo-hover",
        ];
        names.forEach((name, i) => {
          document.documentElement.style.setProperty(name, `rgb(1, 2, ${3 + i})`);
        });
      }
      if (kinds.includes("blind-title")) {
        // 제목을 안 보이게 한다 = 기준 상실. 「제목보다 큰 글자 0개」가 참이
        // 되지만 그것도 측정 실패다.
        for (const h of document.querySelectorAll("h1")) {
          (h as HTMLElement).style.display = "none";
        }
      }
    }, PROBE);
  }

  const measured = await page.evaluate(
    ({ control, minH, minW }) => {
      const painted = (el: Element) => {
        const c = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return false;
        if (c.visibility === "hidden" || c.display === "none" || Number(c.opacity) < 0.05) {
          return false;
        }
        return !el.closest("details:not([open])");
      };

      // ── ① 제목보다 크거나 같은 글자 ──────────────────────────────────
      //
      // 기준은 **그려진 h1 중 가장 큰 것**이다. `querySelector("h1")` 이 아니다:
      // 실측 2026-08-08 에 두 부류가 그 셀렉터를 배신했다 — 지도/문서함은 h1 이
      // `sr-only`(1×1, 상속된 16px)라 «보이지도 않는 16px» 이 기준이 되고,
      // 프로젝트 상세는 h1 이 둘(23px 표시 제목 + 16px 두 번째)이라 DOM 순서에
      // 기준이 걸린다.
      const h1s = [...document.querySelectorAll("h1")];
      const paintedH1s = h1s.filter(painted);
      let base: Element | null = null;
      let titlePx = 0;
      for (const h of paintedH1s) {
        const px = parseFloat(getComputedStyle(h).fontSize);
        if (px > titlePx) {
          titlePx = px;
          base = h;
        }
      }

      const offenders: { text: string; px: number; testid: string | null }[] = [];
      let scanned = 0;
      for (const el of document.querySelectorAll("*")) {
        if (el.childElementCount > 0) continue;
        const text = (el.textContent || "").trim();
        if (!text) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (el.closest(".sr-only")) continue;
        scanned += 1;
        if (titlePx === 0) continue;
        if (el === base || base?.contains(el)) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px >= titlePx) {
          offenders.push({
            text: text.slice(0, 24),
            px,
            testid:
              el.getAttribute("data-testid") ||
              el.closest("[data-testid]")?.getAttribute("data-testid") ||
              null,
          });
        }
      }

      // ── ② 채워진 악센트 면 ──────────────────────────────────────────
      //
      // 기준값은 `:root` 에서 읽는다. 임의 CSS 표기(hex·rgb·oklch)를 브라우저가
      // 정규화한 뒤 비교해야 하므로, 일회용 원소에 색을 넣고 계산된 값을 받는다.
      const root = getComputedStyle(document.documentElement);
      const normalize = (value: string) => {
        const probe = document.createElement("div");
        probe.style.color = value;
        document.body.appendChild(probe);
        const out = getComputedStyle(probe).color;
        probe.remove();
        return out;
      };
      const accents = new Map<string, string>();
      for (const name of [
        "--color-indigo-brand",
        "--color-indigo-brand-hover",
        "--color-indigo-accent",
        "--color-indigo-hover",
      ]) {
        const raw = root.getPropertyValue(name).trim();
        if (raw) accents.set(normalize(raw), name);
      }

      // 컨트롤 단위로 접는다 — 버튼과 그 안의 칠해진 span 을 두 번 세지 않는다.
      const byControl = new Map<
        Element,
        { token: string; testid: string | null; text: string; w: number; h: number }
      >();
      let considered = 0;
      for (const el of document.querySelectorAll("*")) {
        if (!painted(el)) continue;
        considered += 1;
        const token = accents.get(getComputedStyle(el).backgroundColor);
        if (!token) continue;
        const b = el.getBoundingClientRect();
        if (b.height < minH || b.width < minW) continue; // data-mark 는 여기서 걸러진다
        const ctl = el.closest(control);
        if (!ctl) continue;
        if (byControl.has(ctl)) continue;
        byControl.set(ctl, {
          token,
          testid: ctl.getAttribute("data-testid") || el.getAttribute("data-testid") || null,
          text: (ctl.textContent || "").trim().slice(0, 28),
          w: Math.round(b.width),
          h: Math.round(b.height),
        });
      }

      return {
        titlePx,
        paintedH1: paintedH1s.length,
        offenders,
        scanned,
        accentTokens: accents.size,
        considered,
        filled: [...byControl.values()],
      };
    },
    { control: CONTROL, minH: ACCENT_MIN_HEIGHT, minW: ACCENT_MIN_WIDTH },
  );

  return { route, ...measured };
}

/**
 * **①의 예외 — 라우트 하나 단위로, 실측치와 「무엇이 대신 재는가」를 함께.**
 *
 * ⚠️ 여기 줄을 더하는 것은 그 화면에서 규칙을 끄는 것이다. 그래서 각 줄에는
 * **자기 몫의 검사**(`titleGuard` describe)가 붙는다 — 예외가 낡으면 그 검사가
 * 먼저 빨개져서 사람을 이 목록으로 되돌린다. 사유가 「대기」인 예외는 두지
 * 않는다(2026-08-08 `open-vault-cta` 가 같은 값을 치렀다).
 */
const TITLE_EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  {
    route: "/ko/topology/",
    why:
      "그려진 제목이 없다 — h1 「지형도」는 `sr-only`(1×1 · clip inset(50%) · 상속 16px). " +
      "주목 승자는 지도 자체이고, 제목 급 글자라는 기준이 이 화면엔 없다. " +
      "대신 아래 「제목 없는 화면은 정말 없다」가 «그려진 h1 0개» 를 못박는다",
  },
  {
    route: "/ko/docs/",
    why: "지도와 같다 — h1 「문서함」이 `sr-only` 1×1. 같은 검사가 못박는다",
  },
  /*
   * 공방(`/ko/ontology/studio/`) 예외는 **지웠다** (2026-08-08 위계 판정 적용).
   * h1 「무엇을 할까요?」가 `text-body-lg`(14px) + `text-secondary` 라 입구 카드
   * 라벨(같은 14px + `text-primary`)에 크기는 동률·색은 열세였다. 대화상자 제목
   * 관례(`text-title` 16px + `text-primary`)로 올려서 규칙을 **켰다** — 예외가
   * 아니라 통과다. 자기 감시 장치였던 「공방의 동률 2건이 그대로다」도 같이
   * 지웠다(고쳐졌으므로 그 검사는 이제 빨강이 정상이 아니라 존재 이유가 없다).
   */
];
const TITLE_EXEMPT_ROUTES = new Set(TITLE_EXEMPT.map((e) => e.route));

/**
 * **②의 예외 — 같은 규율.**
 */
const ACCENT_EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  /*
   * 편집(`/ko/project/storefront/edit/`) 예외는 **지웠다** (2026-08-08 위계 판정
   * 적용). `project-save-top`(고정 머리)과 `project-save`(폼 끝)가 같은 행동·같은
   * 라벨·같은 142×40 의 **채워진 인디고 둘**이었다. sticky 는 스크롤 어디서나
   * 보이므로 주 CTA 를 상단이 지고, 폼 끝의 되풀이는 `Button` 의 기존 `outline`
   * 으로 내려왔다 — 편집 모드에서만. 만들기 화면(`/ko/project/new/`)에는 sticky
   * 띠가 없어 그 자리가 유일한 주 CTA 이므로 채워진 채로 남는다(그래서 이 규칙은
   * 두 라우트 모두에서 「정확히 1개」로 참이다).
   */
];
const ACCENT_EXEMPT_ROUTES = new Set(ACCENT_EXEMPT.map((e) => e.route));

test.describe("화면 위계 — 감사 대상 전 라우트", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("① 페이지 제목보다 크거나 같은 글자가 제목 밖에 없다", async ({ page }) => {
    test.setTimeout(240_000);

    const violations: string[] = [];
    let totalScanned = 0;
    let routesWithTitle = 0;

    for (const route of AUDITED_ROUTES) {
      const m = await measureRoute(page, route);
      totalScanned += m.scanned;

      // 공회전 방지 ⓐ — 라우트마다. 글자를 거의 못 훑었으면 아래 0 은
      // 「깨끗해서」가 아니라 「안 봐서」다. 바닥이 3 인 것은 404 가 실제로
      // 4개뿐이기 때문이다(실측) — 가장 얇은 화면이 바닥을 정한다.
      expect(m.scanned, `${route}: 글자 원소를 거의 못 훑었다 — 스캐너가 죽었다`).toBeGreaterThan(2);

      if (TITLE_EXEMPT_ROUTES.has(route)) continue;

      // 예외가 아니면 **기준이 있어야 한다** — 그려진 h1 이 사라지면 이 검사는
      // 조용히 아무것도 안 재게 된다. 그 상태를 통과로 두지 않는다.
      expect(
        m.titlePx,
        `${route}: 그려진 h1 이 없다 — 기준을 잃었다. 의도한 것이면 TITLE_EXEMPT 에 실측치와 함께 등재하라`,
      ).toBeGreaterThan(0);
      routesWithTitle += 1;

      for (const o of m.offenders) {
        violations.push(`${route} → "${o.text}" ${o.px}px ≥ 제목 ${m.titlePx}px (${o.testid ?? "-"})`);
      }
    }

    // 공회전 방지 ⓑ — 스윕 전체. 실측 964(예외 3 라우트 제외 시 887).
    expect(totalScanned, "전 라우트를 합쳐도 훑은 글자가 적다 — 스윕이 죽었다").toBeGreaterThan(600);
    expect(routesWithTitle, "제목을 가진 라우트를 거의 못 찾았다 — 기준 판정기가 죽었다").toBeGreaterThan(10);

    expect(
      violations,
      "페이지 제목과 같거나 큰 글자가 제목 밖에 있다 — 무엇이 먼저인지가 사라진다",
    ).toEqual([]);
  });

  test("② 채워진 강조색 면(주 CTA)이 화면에 최대 하나다", async ({ page }) => {
    test.setTimeout(240_000);

    const violations: string[] = [];
    let totalFilled = 0;
    let totalConsidered = 0;

    for (const route of AUDITED_ROUTES) {
      const m = await measureRoute(page, route);
      totalFilled += m.filled.length;
      totalConsidered += m.considered;

      // 공회전 방지 ⓐ — 색 기준을 `:root` 에서 **실제로 읽었나.**
      // 토큰 이름이 바뀌면 이 검사는 «악센트 0개» 라서 영원히 초록이 된다.
      expect(m.accentTokens, `${route}: 악센트 토큰을 :root 에서 못 읽었다 — 색 기준을 잃었다`).toBeGreaterThan(2);
      expect(m.considered, `${route}: 배경색을 들여다본 원소가 없다 — 스캐너가 죽었다`).toBeGreaterThan(20);

      if (ACCENT_EXEMPT_ROUTES.has(route)) continue;
      if (m.filled.length > 1) {
        violations.push(`${route} → ${m.filled.length}개: ${JSON.stringify(m.filled)}`);
      }
    }

    // 공회전 방지 ⓑ — 하나도 못 찾았으면 «전부 최대 하나» 는 참이지만 그건
    // 측정 실패다. 실측 9개(예외 라우트 2 제외 시 7).
    expect(
      totalFilled,
      "채워진 악센트 컨트롤을 전 라우트에서 하나도 못 찾았다 — 판정기가 죽었다(측정 실패)",
    ).toBeGreaterThan(5);
    // 실측 2974(2026-08-08). 바닥은 추측이 아니라 실측에서 내려온다 — 첫 시도에
    // 3000 을 눌러 박았다가 정상 상태가 빨개졌다(거짓 빨강도 게이트 결함이다).
    expect(totalConsidered, "그려진 원소를 거의 못 봤다 — 스윕이 죽었다").toBeGreaterThan(2000);

    expect(
      violations,
      "채워진 강조색 면이 한 화면에 둘 이상이다 — 주 CTA 가 둘이면 하나는 거짓말이다",
    ).toEqual([]);
  });

  /**
   * ①의 예외가 **낡지 않았는지** 각자 값을 치른다. 예외를 그냥 두면 그 화면에서
   * 이 파일의 어떤 층도 안 돈다 — 제목이 생겨도, 동률이 넷으로 늘어도 초록이다.
   */
  test("예외가 낡지 않았다 — 제목 없는 화면은 정말 제목이 없다", async ({ page }) => {
    for (const route of ["/ko/topology/", "/ko/docs/"]) {
      const m = await measureRoute(page, route);
      expect(
        m.paintedH1,
        `${route}: 그려진 제목이 생겼다 — TITLE_EXEMPT 에서 이 줄을 지우고 규칙을 켜라`,
      ).toBe(0);
      expect(m.titlePx, `${route}: 기준이 생겼다 — 예외가 낡았다`).toBe(0);
    }
  });

  /**
   * **고쳐진 둘은 이제 ①·② 본체가 잰다** — 예외가 없으므로 감시 장치도 없다.
   *
   * 다만 하나는 규칙 ② 로 표현되지 않는다: 편집 화면의 주 CTA 가 **위쪽 sticky
   * 여야 한다**는 것. 「최대 하나」는 그 하나가 어느 쪽이어도 참이라, 반대로 고쳐
   * (상단을 내리고 하단을 채워) 놓아도 초록이다. 그래서 그 방향만 여기서 못박는다.
   */
  test("편집 화면의 채워진 주 CTA 는 위쪽 sticky 저장이다", async ({ page }) => {
    const m = await measureRoute(page, "/ko/project/storefront/edit/");
    expect(
      m.filled.map((f) => f.testid),
      "편집 화면의 채워진 악센트가 상단 sticky 저장 하나가 아니다 — 방향이 뒤집혔거나 둘로 늘었다",
    ).toEqual(["project-save-top"]);
    // 하단 저장은 살아 있어야 한다 — 강등이지 삭제가 아니다.
    await expect(
      page.getByTestId("project-save"),
      "폼 끝의 저장이 사라졌다 — 이건 강등이 아니라 기능 제거다",
    ).toBeVisible();
  });

  /**
   * 쓰기 잠금 배너가 **이유만 말하고 끝나지 않는다.** 여기서는 「갈 길이 그
   * 상자 안에 있는가」까지만 본다.
   *
   * ## 무엇을 이 파일에서 뺐나 (2026-08-07)
   *
   * 종전에는 이 자리에서 CTA 를 눌러 **URL 이 `/ko/` 로 바뀌는지**를 쟀다.
   * 그 단언이 두 가지로 틀렸다:
   *
   * ① **범위** — `/project/new` 한 라우트 · testid 하나에 손으로 박혀 있었고,
   *    같은 병이 두 곳 더 살아 있었다(인사이트 · 프로젝트 상세). 허용목록
   *    게이트의 고전적 실패다(`design-gates.md`).
   * ② **깊이** — URL 이 바뀌는 것과 거기서 폴더를 열 수 있는 것은 다른 사실인데
   *    앞의 것만 쟀다. 실제로 그 갈 곳(`/`)은 볼트 없는 웹 방문자에게
   *    **관문**(내려받기 화면, 폴더 컨트롤 0개)이라 한 홉 뒤의 막다른 길이었고,
   *    이 검사는 그동안 초록이었다.
   *
   * 그래서 그 층은 `tests/e2e/open-vault-cta.spec.ts` 로 옮겼다 — 감사 대상
   * 라우트를 전부 훑고, 그 길이 **실제로 폴더 선택기를 부르는지**까지 잰다.
   * 이 파일은 이름 그대로 **위계**만 맡는다.
   */
  test("쓰기 잠금 배너가 갈 길을 함께 준다 — 막다른 경고가 아니다", async ({ page }) => {
    await page.goto("/ko/project/new/?guides=off");
    await page.waitForLoadState("networkidle");

    const banner = page.getByTestId("project-write-disabled-banner");
    await expect(banner, "쓰기 잠금 배너가 안 뜬다 — 이 검사가 헛돈다").toBeVisible();

    await expect(
      banner.getByTestId("project-write-disabled-open-folder"),
      "배너가 이유만 말하고 갈 길을 안 준다 — 막다른 CTA 다",
    ).toBeVisible();
  });
});
