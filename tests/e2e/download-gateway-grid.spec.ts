import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **관문의 그리드는 한 벌이다** — 폭이 독립 변수라 lint 도 jsdom 도 못 잰다.
 *
 * ## 이 게이트가 막는 회귀
 *
 * 2026-07-29 실측: `/download` 는 판을 무대 **왼쪽에 붙이는** 설계인데, 판을
 * 감싼 래퍼가 본문과 같은 `mx-auto max-w-[var(--page-max)]` 를 쓰고 있었다.
 * 그래서 판의 x 가 뷰포트 폭의 함수가 됐다:
 *
 * | 폭 | 판 오른끝 | 카메라가 예약한 인셋 | 어긋남 |
 * |---|---|---|---|
 * | 1512 | 520 | 544 | 0 (여기서만 맞았다) |
 * | 1920 | 640 | 544 | **+96** |
 * | 2560 | 960 | 544 | **+416** |
 *
 * 카메라는 토큰이 말한 544 만 피하므로, 넓은 화면일수록 그래프가 판 뒤로
 * 파고든다. **한 폭에서 눈으로 맞춰 놓으면 나머지 폭에서 조용히 틀리는**
 * 종류라 사람 검수를 통과한다.
 *
 * 게다가 바닥 절은 `--page-col-utility` 로 한 번 더 중앙정렬돼 있어서, 같은
 * 페이지 안에 정렬 기준이 **둘**이었다(1920 에서 판 x=160 · 바닥 x=480).
 *
 * ## 그리고 같은 날 밤: 좌우 비대칭 (원점 승격)
 *
 * 위 사고를 고친 뒤에도 컬럼은 `--page-max`(1600) 에서 멈췄고, 남는 폭이 전부
 * **오른쪽에** 쌓였다. 실측:
 *
 * | 폭 | 왼쪽 | 오른쪽 | 비 |
 * |---|---|---|---|
 * | 1512 | 40 | 40 | 1.0 |
 * | 1728 | 64 | 64 | 1.0 |
 * | 1920 | 64 | **256** | 4.0 |
 * | 2560 | 96 | **864** | 9.0 |
 *
 * 비대칭은 **1728 부터** 시작한다 — 그 아래는 컬럼이 화면을 다 써서 저절로
 * 대칭이었다. 그래서 정렬 원점을 `max(홈통, (vw − page-max)/2)` 로 승격시키고,
 * 여섯 원소와 카메라 예약폭이 **그 하나**를 소비하게 했다.
 *
 * ## 무엇을 재나 (2026-08-19 개정 — 설치 절 삭제)
 *
 * 1. GNB 로고 · 헤드라인 · **지도 절** · 캡션 · 푸터의 x 가 **전부 같다**
 *    (다섯 원소).
 * 2. **좌우 여백이 같다** — `밴드.left === vw − 밴드.right`.
 * 3. **상단 바의 우측 그룹 오른끝 === vw − 원점** (소유자의 "공백이 길고" 지적).
 * 4. **리사이즈 뒤에도 전부 유지된다.**
 * 5. **두 주소가 같은 것을 보여준다** — `/` 와 `/download` 둘 다 시연 절을 낸다.
 * 6. 320px 에서 가로 오버플로 0 (ko/en 둘 다).
 *
 * ## [삭제 2026-08-19] 판·설치 3단을 주어로 쓰던 단언 넷
 *
 * 소유자가 설치 절을 통째로 걷어냈다(*"맨 마지막 이거는 없어도 될듯? 어차피
 * 맨 위에 다 있어서"*). 함께 지운 것:
 *
 * - 일곱 원소 중 **판**과 **설치 띠** (주어 소멸)
 * - **판↔지도 비겹침** — 두 절이 다 없어졌으므로 겹칠 것이 없다
 * - **판이 폭 토큰(`--gateway-plate-width`)을 안 넘는다**
 * - **설치 3단이 접히지 않는다** · **판 안 컨트롤이 판을 안 뚫는다** ·
 *   **판의 컨트롤이 선언한 여백을 지킨다**(눌린 여백 0)
 *
 * 그중 「두 주소가 같은 것을 보여준다」만은 그릇을 갈아 끼워 남긴다 — 그건
 * 설치 3단의 성질이 아니라 **주소 통일**의 성질이고, 주어(`demo-stage`)가
 * 그대로 살아 있다.
 *
 * ⚠️ **그릇과 내용물을 헷갈리면 게이트가 두 방향으로 틀린다.** 그릇만 지키면
 * 정당한 설계 변경에 빨개지고, 그릇을 지우면 내용물까지 같이 사라진다.
 * 시험이 무엇을 지키는지 문장으로 못 쓰면 그건 아직 property 가 아니다.
 */

/**
 * ⚠️ **원점 값을 여기 베끼지 않는다** (2026-07-29 「체계」 처방).
 *
 * 예전엔 `width >= 768 ? 40 : 24` 였다. 그러면 이 파일이 **두 번째 진실원**이
 * 된다 — 시험이 검증하는 것이 "렌더된 x 가 토큰이 말하는 값과 같은가" 가
 * 아니라 "렌더된 x 가 내가 여기 베껴 둔 숫자와 같은가" 가 되고, 토큰을
 * 바꾸면 시험이 **제품이 아니라 자기 복사본을 지키느라** 빨개진다.
 *
 * 이제 `--gateway-origin` 을 라이브로 읽는다(`@property <length>` 등록이라
 * 계산값이 `160px` 로 굳는다). 폭 목록만 여기 있고, 그 폭에서 나와야 할 수는
 * 전부 브라우저가 계산한 것을 읽는다.
 *
 * `<md` 구간은 이 토큰이 아니라 `max(1.5rem, safe-area)` 가 지배하므로 아래
 * x 시험의 폭 목록에 넣지 않는다 — 320px 시험은 x 가 아니라 **넘침**을 잰다.
 */
const WIDTHS = [
  { width: 1512, height: 982 },
  { width: 1512, height: 850 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1440, height: 900 },
  // 홈통 스텝 경계(≥1536) — 홈통이 원점을 이기는 마지막 구간이 여기다.
  { width: 1536, height: 960 },
  // 대칭이 깨지기 시작하던 문턱. 1728 에서는 원점 = 홈통 = 64 로 두 규칙이
  // 정확히 만난다 — 승격이 기존 구간을 안 건드렸다는 증인.
  { width: 1728, height: 1080 },
  { width: 2400, height: 1350 },
];

/** 두 주소가 같은 것을 보여주는지 재는 폭 — 14인치 실창과 풀스크린, 그 위. */
const UNIFIED_ROUTE_VIEWPORTS = [
  { width: 1512, height: 982 },
  { width: 1512, height: 850 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

async function measure(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    /**
     * ⚠️ **그려진 것만 잰다** (2026-08-08 카운슬 실측에서 걸림).
     *
     * 종전엔 `querySelector` 로 **첫 일치**를 재서, 그 자리가 `display:none`
     * 이면 `x=0 · w=0` 을 정답인 양 돌려줬다. 실제로 그 일이 났다 —
     * 2026-08-07 에 푸터 맨 앞으로 들어온 `GatewayReadingLinks` 는
     * `sm:hidden` 이라 `≥sm` 에서 안 그려지는데, 그것이 `main footer > div`
     * 의 첫 일치가 되면서 **여덟 폭 전부**가 *"footer 이 원점(200) 밖에
     * 있다 — 0"* 으로 빨개졌다. 레이아웃은 멀쩡했고 계기가 틀렸다.
     *
     * 「보이나」가 아니라 **「배치됐나」**로 가른다(`getClientRects()`):
     * 투명도나 화면 밖으로 밀린 것은 여전히 그리드의 일원이지만,
     * `display:none` 은 그 폭의 그리드에 참여하지 않는다.
     */
    const laidOut = (sel: string) =>
      [...document.querySelectorAll(sel)].find((el) => el.getClientRects().length > 0) ?? null;
    const bx = (sel: string) => {
      const el = laidOut(sel);
      return el ? Math.round(el.getBoundingClientRect().x) : null;
    };
    const right = (sel: string) => {
      const el = laidOut(sel);
      return el ? Math.round(el.getBoundingClientRect().right) : null;
    };
    const scrollDelta = [...document.querySelectorAll("*")]
      .filter(
        (el) =>
          el.scrollHeight - el.clientHeight > 2 &&
          ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
      )
      .map((el) => el.scrollHeight - el.clientHeight);
    return {
      xs: {
        gnb: bx('[data-testid="download-gnb"] a'),
        headline: bx("h1"),
        // 리메이크(2026-08-18): 지도 절도 같은 원점에 선다.
        map: bx('[data-testid="download-stage-map-frame"]'),
        caption: bx('[data-testid="download-portrait-caption"] span'),
        footer: bx("main footer > div"),
      },
      // 밴드(=원점 안쪽 컬럼)의 오른끝 — 좌우 대칭은 이 수와 `vw` 로만 잰다.
      // ⚠️ 자(ruler)는 **컬럼 전폭을 실제로 채우는 원소**여야 한다. 계기
      // 스트립(gateway-facts)은 히어로의 바닥 괘선이라 컬럼 전폭이 정의이고,
      // 게시/미게시 어느 분기에서도 그려진다. (구 자였던 설치 3단은
      // 2026-08-19 에 페이지에서 사라졌다.)
      bandRight: right('[data-testid="gateway-facts"]'),
      // 상단 바 우측 그룹의 오른끝. 소유자의 "공백이 길고 왜이러지?" 게이트.
      gnbActionsRight: right('[data-testid="download-gnb-actions"]'),
      /**
       * ⚠️ **대칭의 기준자는 `innerWidth` 가 아니라 `clientWidth` 다.**
       *
       * `getBoundingClientRect` 는 레이아웃 뷰포트(세로 스크롤바를 뺀 폭)
       * 기준인데 CSS `100vw` 는 스크롤바를 **포함**한다. 스크롤바가 있는 창에서
       * `innerWidth` 로 재면 오른쪽이 스크롤바 폭만큼 더 넓게 나와서, 레이아웃은
       * 완벽히 대칭인데 시험만 빨개진다(실측 델타 = 스크롤바 폭 그 자체).
       *
       * 컬럼이 남는 폭을 채우므로 두 구간 모두에서 `clientWidth − 밴드.right`
       * 는 정확히 원점이다 — 좁은 구간이든(컬럼이 화면을 다 씀) 넓은 구간이든
       * (컬럼이 `--page-max − 스크롤바` 에서 멈춤).
       */
      layoutWidth: document.documentElement.clientWidth,
      scrollbar: window.innerWidth - document.documentElement.clientWidth,
      // 관문 그리드의 값 — `app/globals.css` 의 `:root`. 시험은 값을
      // 베끼지 않고 읽어서 파생이 실제로 돌았는지 확인한다. `--gateway-origin`
      // 은 `@property <length>` 등록이라 계산값이 `160px` 로 굳는다 —
      // `parseFloat` 가 화면이 실제로 쓰는 x 와 같은 수를 준다.
      originToken: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--gateway-origin").trim(),
      ),
      scrollDelta,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

/**
 * 한 폭에서 **그리드가 한 벌인가**를 통째로 판정한다.
 *
 * 리사이즈 시험이 같은 함수를 다시 부른다 — 두 시험이 각자 단언을 베끼면
 * 한쪽만 갱신되는 날이 오고, 그때 조용히 약해지는 쪽은 언제나 덜 읽히는
 * 쪽(리사이즈)이다.
 */
function assertGrid(m: Awaited<ReturnType<typeof measure>>, label: string) {
  const origin = m.originToken;
  expect(Number.isFinite(origin), `${label}: 원점 토큰을 못 읽었다`).toBe(true);

  for (const [name, x] of Object.entries(m.xs)) {
    expect(x, `${label}: ${name} 의 x 를 못 읽었다`).not.toBeNull();
    expect(x, `${label}: ${name} 이 원점(${origin}) 밖에 있다`).toBe(origin);
  }

  /**
   * **좌우가 같은가** (2026-07-29 소유자 지적: *"좌우가 같아야함"*).
   *
   * 왼쪽만 재면 통과하던 결함이다 — 원점이 고정값이던 시절 1920 에서 좌 64 ·
   * 우 256 이었고, 여섯 원소는 전부 x=64 로 **한 벌이었다**. 정렬 원칙을
   * 지키면서도 화면은 한쪽으로 쏠릴 수 있으니, 대칭은 따로 단언해야 한다.
   */
  expect(m.bandRight, `${label}: 밴드 오른끝을 못 읽었다`).not.toBeNull();
  expect(
    m.layoutWidth - m.bandRight!,
    `${label}: 좌우 여백이 다르다 (왼 ${origin} · 스크롤바 ${m.scrollbar})`,
  ).toBe(origin);

  /**
   * **상단 바도 같은 프레임 안이다** (소유자: *"공백이 길고 왜이러지?"*).
   * 우측 그룹이 컬럼 오른끝에서 멈추므로, 원점이 자라면 이 끝도 따라온다.
   */
  expect(m.gnbActionsRight, `${label}: GNB 우측 그룹을 못 읽었다`).not.toBeNull();
  expect(m.gnbActionsRight, `${label}: 상단 바 우측이 화면 끝과 안 맞는다`).toBe(
    m.layoutWidth - origin,
  );

  expect(m.overflowX, `${label}: 가로 오버플로`).toBe(0);
}

test.describe("관문 다운로드의 그리드", () => {
  for (const viewport of WIDTHS) {
    test(`${viewport.width}×${viewport.height} — 다섯 원소가 같은 x 에 서고 좌우가 같다`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedFirstRunSeen(page);
      await page.goto("/ko/download/", { waitUntil: "networkidle" });
      await expect(page.getByTestId("gateway-facts")).toBeVisible({ timeout: 15_000 });

      assertGrid(await measure(page), `${viewport.width}`);
    });
  }

  /**
   * **리사이즈 뒤에도 한 벌인가** (2026-07-29 평결의 재발 경로 감시).
   *
   * [개정 2026-08-18] 구 판본의 고유 표적 — JS 파생 카메라 예약폭의 낡음 —
   * 은 리메이크로 파생 자체가 은퇴하며 사라졌다. 남는 property 는 「CSS 원점
   * 공식이 실제로 리사이즈를 따라간다」와 「다섯 원소가 어느 폭에서도 한
   * 벌이다」이고, `assertGrid` 를 각 폭에서 다시 부르는 것이 그 전부다.
   * 두 방향으로 잰다: 넓히기(원점이 자란다)와 좁히기(홈통으로 되돌아간다).
   */
  test("리사이즈하면 다섯 원소가 새 원점을 따라간다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/download/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("gateway-facts")).toBeVisible({ timeout: 15_000 });

    const mounted = await measure(page);
    assertGrid(mounted, "1440 (마운트)");

    // 폭 목록이 원점을 한 번이라도 실제로 움직였는지 — 아래 참조.
    let sawOriginChange = false;

    for (const width of [2560, 1920, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // 파생은 rAF 로 코얼레싱된다 — 두 프레임을 기다린 뒤 잰다.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const m = await measure(page);
      assertGrid(m, `${width} (리사이즈)`);
      // 폭 목록이 원점을 실제로 움직였는지 표시만 남긴다 — 원점 값 자체는
      // 베끼지 않는다(맨 위 규율). 원점이 한 번도 안 움직이는 목록이면 이
      // 시험은 «리사이즈 추종»에 대해 아무것도 안 재면서 초록이 된다.
      if (m.originToken !== mounted.originToken) {
        sawOriginChange = true;
      }
    }

    // 위 조건부가 **조용히 무의미해지는** 것을 막는다. 홈통이 더 커져서 폭
    // 목록 전체가 원점을 못 움직이게 되면 이 시험은 아무것도 안 재면서 초록이
    // 된다 — 그건 통과가 아니라 시야 상실이다. 그때는 폭 목록을 넓혀라.
    expect(
      sawOriginChange,
      "폭 목록이 원점을 한 번도 바꾸지 못했다 — 이 시험은 지금 아무것도 지키지 않는다",
    ).toBe(true);
  });

  /**
   * **두 주소가 같은 것을 보여준다** (2026-08-01 소유자 확정).
   *
   * 종전엔 `showDemo` 한 줄이 주소로 갈랐고 아무 시험도 그 갈림을 몰랐다.
   *
   * [그릇 교체 2026-08-19] 이 단언은 원래 「설치 3단이 접히지 않는다」 시험의
   * 공회전 방지 장치로 그 안에 얹혀 있었다. 설치 3단이 삭제되면서 바깥 시험은
   * 사라졌지만 이 property 는 3단의 성질이 아니라 **주소 통일**의 성질이라,
   * 자기 시험으로 독립시킨다.
   */
  for (const viewport of UNIFIED_ROUTE_VIEWPORTS) {
    for (const route of ["/ko/", "/ko/download/"]) {
      test(`${viewport.width}×${viewport.height} ${route} — 시연 절이 두 주소 모두에 있다`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await seedFirstRunSeen(page);
        await page.goto(route, { waitUntil: "networkidle" });

        const demo = page.getByTestId("demo-stage");
        await demo.scrollIntoViewIfNeeded();
        await expect(
          demo,
          `${route} 에 시연 절이 없다 — 두 주소는 같은 것을 보여줘야 한다`,
        ).toBeVisible({ timeout: 15_000 });

        // 스크롤로도 못 닿거나 조상이 잘라 놓았으면 그건 없는 것과 같다.
        const cut = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="demo-stage"]')!;
          const rect = el.getBoundingClientRect();
          let clippedBy: string | null = null;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (cs.overflowY !== "hidden") continue;
            const pr = p.getBoundingClientRect();
            if (rect.bottom - pr.bottom > 1) {
              clippedBy = `${p.tagName.toLowerCase()}${p.className ? "." + String(p.className).split(/\s+/)[0] : ""}`;
              break;
            }
          }
          return { clippedBy, height: Math.round(rect.height) };
        });
        expect(cut.height, "시연 절의 높이가 0 이다").toBeGreaterThan(0);
        expect(cut.clippedBy, `조상 컨테이너가 시연 절을 잘랐다: ${cut.clippedBy}`).toBeNull();
      });
    }
  }

  /**
   * **320px 에서 가로로 넘치지 않는다** (ko/en 둘 다).
   *
   * [그릇 교체 2026-08-19] 종전 시험의 주어는 다운로드 판이었다. 판은
   * 삭제됐지만 이 폭에서 진짜로 막던 것 — 라벨이 길어 컨트롤이 화면을 뚫고,
   * 무대가 `overflow-hidden` 이라 스크롤바도 안 생긴 채 그냥 잘리는 것 — 은
   * 페이지 전체의 성질이라 문서 단위로 잰다. `WIDTHS` 목록은 1440 이상만
   * 보므로 이 폭은 여기서만 측정된다.
   */
  for (const locale of ["ko", "en"]) {
    test(`320px ${locale} — 가로 오버플로 0`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await seedFirstRunSeen(page);
      await page.goto(`/${locale}/download/`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("gateway-facts")).toBeVisible({ timeout: 15_000 });

      const worst = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        let overflow = -Infinity;
        let culprit = "";
        for (const el of document.querySelectorAll(
          "main a, main button, main p, main h1, main h2",
        )) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          const over = Math.max(r.right - vw, -r.left);
          if (over > overflow) {
            overflow = over;
            culprit =
              (el.getAttribute("data-testid") ?? el.tagName) + ": " + el.textContent?.slice(0, 40);
          }
        }
        return {
          overflow: Math.round(overflow),
          culprit,
          documentOverflow: document.documentElement.scrollWidth - vw,
        };
      });

      // `buttonVariants` 는 `whitespace-nowrap` 이라 라벨이 길면 버튼이
      // 컨테이너를 뚫는다 — 실측(320, en): 주 CTA 가 22px 넘쳤다.
      expect(worst.overflow, `화면을 넘는 원소: ${worst.culprit}`).toBeLessThanOrEqual(0);
      expect(worst.documentOverflow, "문서가 가로로 넘친다").toBeLessThanOrEqual(0);
    });
  }

});
