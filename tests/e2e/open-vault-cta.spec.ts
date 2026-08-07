import { expect, test } from "@playwright/test";

import { AUDITED_ROUTES } from "./audited-routes";

/**
 * **막다른 CTA 금지 — 폴더 편.** 「폴더를 열면 …」이라고 말하는 자리에는 그
 * 폴더를 여는 길이 있어야 하고, 그 길은 **실제로 선택기를 불러야** 한다.
 *
 * ## 왜 라우트 하나가 아니라 전수인가
 *
 * 2026-08-06 에 `/project/new` 에서 이 병을 한 번 고치고 게이트도 만들었다
 * (`screen-hierarchy.spec.ts`). 그 게이트가 **라우트 하나 · testid 하나**에
 * 손으로 박혀 있었고, 2026-08-07 전수 측정에서 같은 병이 **두 곳 더** 살아
 * 있었다 — 인사이트의 읽기 전용 묶음 머리(화면 컨트롤 25개 중 폴더를 여는 것
 * 0개)와 프로젝트 상세의 「보기 전용」 배지.
 *
 * 이 저장소가 이미 값을 치른 실패형이다(`design-gates.md`): **허용목록으로
 * 만든 검사는 목록에 없는 것에서 실패하고, 목록에 없는 것은 언제나 새로 만든
 * 것이다.** 그래서 이 게이트는 감사 대상 라우트를 **전부 덮고 예외만 뺀다**.
 *
 * ## 왜 「있다」가 아니라 「부른다」까지 재나
 *
 * 종전 게이트는 CTA 를 누르고 **URL 이 바뀌었는지**까지만 봤다. 그 사이로
 * 진짜 결함이 지나갔다: 갈 곳이 `/` 였는데 볼트를 안 고른 웹 방문자에게 `/`
 * 는 **관문**(내려받기 화면)이고 거기 폴더를 여는 컨트롤은 **0개**다. URL 은
 * 멀쩡히 바뀌었고 게이트는 초록이었으며, 사람은 한 홉 뒤의 막다른 길에
 * 도착했다. 설치된 앱에서는 `/` 가 지도라 맞았다 — **앱에서만 확인하면
 * 안 보이는 결함**이다.
 */

/** 「폴더를 열어라 / 열면 된다」고 말하는 문장. */
const PROMISE = /폴더[를을]? ?(열|여|고르|골라)|볼트[를을]? ?(열|고르)/;
/** 그 일을 하는 길 — 폴더를 여는 컨트롤이거나 그것이 있는 곳으로 보내는 링크. */
const PATH = /폴더|볼트|문서함|앱 받기|앱에서 열기|내 데이터/;

/**
 * 예외 — **자리 하나 단위로, 사유와 함께.** 디렉터리나 정규식으로 빼지 않는다.
 *
 * ## 관문의 예외는 「대기」가 아니라 **다른 계약으로 갈아탔다** (2026-08-08 카운슬)
 *
 * 2026-08-07 에는 여기 `/ko/` 와 `/ko/download/` 두 줄이 *"「위계」 판정 대기"*
 * 라는 사유로 앉아 있었다. 그 판정이 났다 — **관문에 폴더 여는 길을 놓지
 * 않는다.** `/topology` 의 첫 실행 패널이 이미 진짜 첫 실행 표면이라 복제하면
 * 유지할 첫 실행 표면이 둘이 되고, 같은 일을 하는 길이 둘이면 하나는 반드시
 * 거짓말이 된다(2026-07-30 「같은 일 링크 둘」).
 *
 * 그래서 이 스윕은 관문에서 돌 수 없다 — 이 스윕이 요구하는 것(문장 옆에
 * 컨트롤)이 바로 그 결정이 **하지 않기로 한 것**이다. 하지만 **「대기」라는
 * 사유로 남겨 두면 그 화면에서는 이 파일의 어떤 층도 안 돈다**: 판 안의 웹
 * CTA 가 사라져도, 착지점이 막다른 길이 되어도 영원히 초록이다(체계석 지적).
 *
 * 그래서 예외의 값을 **갚았다** — 아래 `관문은 폴더를 여는 화면이 아니다`
 * describe 가 폭마다 ①폴드 안에 지도로 가는 홉이 그려져 있고 ②눌러서 도착하며
 * ③착지점이 시트를 거쳐 **실제로 선택기를 부르는지**를 잰다. 그리고 같은 검사가
 * 「관문에 폴더 컨트롤 0개」를 못박아, 결정을 뒤집으려면 원장으로 돌아오게 한다.
 *
 * ⚠️ 이 목록에 줄을 더하는 것은 그 화면에서 규칙을 끄는 것이다. 늘리려면
 * 사유를 여기 적고, 무엇이 대신 그 자리를 재는지도 같이 적는다.
 */
const EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  {
    route: "/ko/",
    why: "관문 — 「놓지 않는다」 판정 확정(2026-08-08 원장). 대신 아래 도달 계약이 잰다",
  },
  { route: "/ko/download/", why: "관문과 같은 뷰 — 같은 도달 계약이 잰다" },
  { route: "/ko/changelog/", why: "지난 결정을 인용하는 산문 — 지시가 아니다" },
];
const EXEMPT_ROUTES = new Set(EXEMPT.map((e) => e.route));

test.describe("막다른 CTA 금지 — 폴더를 열라고 말한 자리", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("말한 자리마다 여는 길이 있다 (감사 대상 전 라우트)", async ({ page }) => {
    test.setTimeout(180_000);

    const unpaired: string[] = [];
    let sentences = 0;
    let paired = 0;

    for (const route of AUDITED_ROUTES) {
      if (route.includes("this-route-does-not-exist")) continue;
      await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);

      const found = await page.evaluate(
        ({ promise, path }) => {
          const say = new RegExp(promise);
          const act = new RegExp(path);
          const painted = (el: Element) => {
            const c = getComputedStyle(el);
            const b = el.getBoundingClientRect();
            if (b.width < 2 || b.height < 2) return false;
            if (c.visibility === "hidden" || c.display === "none" || Number(c.opacity) < 0.05) {
              return false;
            }
            return !el.closest("details:not([open])");
          };
          const out: { text: string; ok: boolean }[] = [];
          for (const el of document.querySelectorAll("p,span,div,h1,h2,h3,li")) {
            // 잎 노드만 — 조상까지 세면 같은 문장을 여러 번 신고한다.
            if (el.childElementCount > 0) continue;
            const text = (el.textContent || "").trim();
            if (!text || !say.test(text) || !painted(el)) continue;
            let box: Element | null = el;
            let ok = false;
            for (let i = 0; i < 4 && box; i += 1) {
              box = box.parentElement;
              if (!box) break;
              const near = [...box.querySelectorAll('button,a[href],[role="button"]')]
                .filter(painted)
                .some(
                  (c) =>
                    c.hasAttribute("data-open-vault-cta") ||
                    act.test((c.textContent || c.getAttribute("aria-label") || "").trim()),
                );
              if (near) {
                ok = true;
                break;
              }
            }
            out.push({ text: text.slice(0, 60), ok });
          }
          return out;
        },
        { promise: PROMISE.source, path: PATH.source },
      );

      for (const f of found) {
        sentences += 1;
        if (f.ok) paired += 1;
        else if (!EXEMPT_ROUTES.has(route)) unpaired.push(`${route} → ${f.text}`);
      }
    }

    // 공회전 차단 둘. 하나로는 부족하다 — 문장을 하나도 못 찾아도 «어긋난 것
    // 없음» 이고, 짝을 **한 번도 못 맞춰도** 마찬가지로 초록이다(그 경우
    // 「길 있음」 판정기가 죽어 있는 것이고, 그러면 이 검사는 상시 빨강이
    // 되어야 정상인데 예외 목록이 그걸 가려 준다).
    expect(sentences, "폴더 문장을 하나도 못 찾았다 — 스캐너가 죽었다").toBeGreaterThan(4);
    expect(paired, "짝을 한 번도 못 맞췄다 — 「길 있음」 판정기가 죽었다").toBeGreaterThan(2);

    expect(
      unpaired,
      "「폴더를 열면 …」이라 말하면서 그 자리에 여는 길이 없다 — 막다른 CTA 다. " +
        "`OpenVaultCta` 를 그 상자 안에 놓아라",
    ).toEqual([]);
  });

  /**
   * **있다 ≠ 한다.** 이 층이 없으면 «보이기만 하고 아무 일도 안 하는 버튼» 이
   * 그대로 통과한다 — 종전 게이트가 정확히 그 상태였다(URL 만 봤다).
   */
  test("그 길은 실제로 폴더 선택기를 부른다", async ({ page, context }) => {
    const SITES = [
      { route: "/ko/ontology/insights/", testId: "do-next-open-vault" },
      { route: "/ko/project/storefront/", testId: "project-detail-open-vault" },
      { route: "/ko/project/new/", testId: "project-write-disabled-open-folder" },
    ];

    await context.addInitScript(() => {
      const w = window as unknown as { __picked?: number; showDirectoryPicker?: () => Promise<never> };
      w.__picked = 0;
      // 취소한 것처럼 던진다 — 앱이 정상 취소로 다루므로 화면 상태가 안 바뀌고,
      // 다음 자리를 같은 조건에서 잴 수 있다.
      w.showDirectoryPicker = async () => {
        w.__picked = (w.__picked ?? 0) + 1;
        throw new DOMException("stub", "AbortError");
      };
    });

    for (const site of SITES) {
      await page.goto(`${site.route}?guides=off`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);

      const cta = page.getByTestId(site.testId);
      await expect(cta, `${site.route}: 폴더 여는 길이 안 보인다`).toBeVisible();
      await expect(
        cta,
        `${site.route}: FSA 를 지원하는데 내려받기로 강등됐다 — 능력 판정이 틀렸다`,
      ).toHaveAttribute("data-open-vault-cta", "picker");

      await cta.click();
      await page.waitForTimeout(400);
      const picked = await page.evaluate(
        () => (window as unknown as { __picked?: number }).__picked ?? 0,
      );
      expect(picked, `${site.route}: 눌러도 폴더 선택기가 안 열렸다`).toBeGreaterThan(0);
    }
  });

  /**
   * **쓸 수 없으면 누르기 전에 말한다 — 만들기와 편집이 같아야 한다.**
   *
   * 2026-08-07 실측: `/project/new` 는 저장 버튼을 잠그고 배너로 미리 말하는데
   * `/project/[slug]/edit` 은 볼트가 없어도 버튼이 활성이었다. 눌러야 비로소
   * *"데모 모드에서는 저장할 수 없습니다"* 가 떴고, 390×844 에서 그 알림은
   * **top 802 · bottom 872** — 뷰포트 844 라 위아래로 잘린 채 하단 탭바 뒤에
   * 걸렸다. 누른 사람 화면에서는 아무 일도 안 일어난 것과 같다.
   *
   * 같은 사실을 두 화면이 다른 시점에 말하고 있었다. 능력 플래그(`canEdit`)는
   * 처음부터 있었고 주석에 «UI 사전 게이트용» 이라 적혀 있었는데 이 폼만 안
   * 쓰고 있었다.
   */
  test("쓸 수 없으면 누르기 전에 말한다 — 만들기와 편집이 같다", async ({ page }) => {
    for (const route of ["/ko/project/new/", "/ko/project/storefront/edit/"]) {
      await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);

      await expect(
        page.getByTestId("project-write-disabled-banner").first(),
        `${route}: 쓰기 잠금을 미리 말하지 않는다`,
      ).toBeVisible();

      const submits = await page.evaluate(() =>
        [...document.querySelectorAll("button[type=submit]")]
          .filter((b) => b.getBoundingClientRect().width > 2)
          .map((b) => ({
            label: (b.textContent ?? "").trim().slice(0, 20),
            disabled: (b as HTMLButtonElement).disabled,
          })),
      );

      // 공회전 차단 — 버튼을 못 찾으면 «전부 잠김» 이 참이 되어 버린다.
      expect(submits.length, `${route}: 저장 버튼을 하나도 못 찾았다`).toBeGreaterThan(0);
      expect(
        submits.filter((b) => !b.disabled),
        `${route}: 저장할 수 없는데 저장 버튼이 열려 있다 — 눌러야 거절을 알게 된다`,
      ).toEqual([]);
    }
  });

  /**
   * FSA 를 못 쓰는 브라우저(Firefox 등)에서는 **왜 + 어디로**로 강등된다.
   * 「곧 됩니다」는 쓰지 않는다(`surfaces.md`).
   */
  test("FSA 미지원이면 앱 내려받기로 강등된다", async ({ page, context }) => {
    await context.addInitScript(() => {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    });
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);

    const cta = page.getByTestId("do-next-open-vault");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("data-open-vault-cta", "download");
    // 갈 곳이 실제로 열려야 한다 — 눌러도 아무 데도 안 가는 버튼 0개.
    // `waitForLoadState` 로는 못 잰다: 클라이언트 라우팅이라 이동이 시작되기
    // 전에 «이미 로드됨» 으로 즉시 돌아온다(첫 시도가 그렇게 헛통과했다).
    await cta.click();
    await page.waitForURL(/\/download/, { timeout: 15_000 });
    await expect(page.getByTestId("download-bottom-band")).toBeVisible();
  });
});

/**
 * **관문은 폴더를 여는 화면이 아니다 — 그러니 「닿는가」를 잰다** (2026-08-08 카운슬).
 *
 * 위 스윕의 규칙(문장 옆에 컨트롤)을 관문에는 적용할 수 없다. 그것이 바로 이
 * 판정이 **하지 않기로 한 것**이기 때문이다: `/topology` 첫 실행 패널이 이미
 * 진짜 첫 실행 표면이고, 같은 일을 하는 길을 둘 두면 하나는 반드시 거짓말이
 * 된다(2026-07-30). 그래서 관문에는 다른 계약을 건다.
 *
 * ## 「길이 있다」의 기준 셋 — 클릭 수는 기준이 아니다
 *
 * ① 첫 홉이 **그 폭의 접힘 안에** 그려져 있다 ② 눌러서 도착한다 ③ 착지점이
 * 그 일을 실제로 한다. 첫 실행 시트는 착지 표면의 정당한 안내이지 장벽이
 * 아니므로 홉 수를 세지 않는다.
 *
 * ## 왜 **폭마다** 재나
 *
 * 실측(2026-08-08, 정적 export): 판 안 웹 CTA 는 1512×900 에서 `y 638` 로
 * 접힘 안이지만 **390×844 에서는 `y 1136`** — 접힘 아래다. 390 에서 기준 ①을
 * 만족시키는 것은 하단 탭바의 「지도」(`y 788`, 바닥 844)다. 폭 하나만 재면
 * 그 사실이 안 보이고, 언젠가 탭바가 사라져도 초록이다.
 *
 * ## ⚠️ 「한 홉」으로 재면 상시 빨강 게이트가 된다
 *
 * 첫 프로브가 그랬다. `first-run-starter-open` 은 선택기를 **직접 안 부른다** —
 * `VaultOpenGuideSheet` 를 열고, 거기 `vault-guide-pick-existing` 에서야 부른다.
 * 그걸 모르고 재서 «호출 0» 이라는 거짓 빨강이 났다. 지키려는 사실을 그것을
 * 구현한 방식과 헷갈리면 게이트가 양쪽으로 틀린다(`/gate-probe` §0).
 */
test.describe("관문은 폴더를 여는 화면이 아니다 — 대신 그 화면에 닿는다", () => {
  const REACH_WIDTHS = [
    { width: 1512, height: 900 },
    { width: 390, height: 844 },
  ] as const;

  for (const viewport of REACH_WIDTHS) {
    test(`${viewport.width}: 접힘 안 홉 → 지도 → 시트 → 선택기 호출`, async ({ page, context }) => {
      await context.addInitScript(() => {
        const w = window as unknown as {
          __picked?: number;
          showDirectoryPicker?: () => Promise<never>;
        };
        w.__picked = 0;
        w.showDirectoryPicker = async () => {
          w.__picked = (w.__picked ?? 0) + 1;
          throw new DOMException("stub", "AbortError");
        };
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/ko/?guides=off", { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);

      /**
       * **결정 자신을 검사가 진다.** 관문에 폴더 컨트롤이 생기면 여기서 빨개지고,
       * 그때 사람은 원장으로 돌아온다 — 조용히 두 번째 첫 실행 표면이 자라는 것을
       * 막는 유일한 자리다.
       */
      const folderControls = await page.evaluate(
        () =>
          [...document.querySelectorAll("[data-open-vault-cta]")].filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width > 2 && b.height > 2;
          }).length,
      );
      expect(
        folderControls,
        "관문에 폴더 여는 컨트롤이 생겼다 — 첫 실행 표면이 둘이 된다. 되돌리려면 원장부터",
      ).toBe(0);

      // ① 그 폭의 접힘 안에 지도로 가는 홉이 **그려져** 있다.
      const hops = await page.evaluate(() => {
        const painted = (el: Element) => {
          const c = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          return (
            b.width > 2 &&
            b.height > 2 &&
            c.visibility !== "hidden" &&
            c.display !== "none" &&
            Number(c.opacity) >= 0.05
          );
        };
        return [...document.querySelectorAll("a[href]")]
          .filter(painted)
          .filter((a) =>
            /\/topology\/?$/.test(new URL((a as HTMLAnchorElement).href, location.href).pathname),
          )
          .map((a, i) => {
            const b = a.getBoundingClientRect();
            a.setAttribute("data-reach-hop", String(i));
            return {
              index: i,
              label: (a.textContent ?? "").trim().slice(0, 24),
              top: Math.round(b.top),
              bottom: Math.round(b.bottom),
              // 하단 고정 탭바는 바닥이 뷰포트와 정확히 같으므로 1px 여유를 준다.
              inFold: b.top >= 0 && b.bottom <= innerHeight + 1,
            };
          });
      });

      const inFold = hops.filter((h) => h.inFold);
      expect(
        inFold.map((h) => h.label),
        `${viewport.width}: 관문 접힘 안에 지도로 가는 길이 없다 — 폴더를 열 수 있는 화면에 닿지 못한다 (전체 홉: ${JSON.stringify(hops)})`,
      ).not.toEqual([]);

      // ② 눌러서 도착한다.
      await page.locator(`[data-reach-hop="${inFold[0].index}"]`).click();
      await page.waitForURL(/\/topology/, { timeout: 15_000 });
      await page.waitForTimeout(2200);

      // ③ 착지점의 주 행동이 그 일이다 — 시트를 거쳐 선택기를 **실제로** 부른다.
      const starter = page.getByTestId("first-run-starter-open");
      await expect(
        starter,
        `${viewport.width}: 착지점에 폴더 여는 주 행동이 안 보인다`,
      ).toBeVisible();
      await starter.click();
      await page.waitForTimeout(500);

      await expect(
        page.getByTestId("vault-guide-sheet"),
        `${viewport.width}: 안내 시트가 안 열렸다 — 착지점의 경로가 바뀌었다`,
      ).toBeVisible();
      await page.getByTestId("vault-guide-pick-existing").click();
      await page.waitForTimeout(500);

      const picked = await page.evaluate(
        () => (window as unknown as { __picked?: number }).__picked ?? 0,
      );
      expect(
        picked,
        `${viewport.width}: 착지점까지 갔는데 폴더 선택기가 안 열렸다 — 한 홉 뒤 막다른 길`,
      ).toBeGreaterThan(0);
    });
  }
});
