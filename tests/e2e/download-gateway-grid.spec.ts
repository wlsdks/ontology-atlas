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
 * ## 무엇을 재나
 *
 * 1. GNB 로고 · 헤드라인 · 판 · 캡션 · 설치 띠 · 푸터의 x 가 **전부 같다**.
 * 2. **좌우 여백이 같다** — `밴드.left === vw − 밴드.right`.
 * 3. **상단 바의 우측 그룹 오른끝 === vw − 원점** (소유자의 "공백이 길고" 지적).
 * 4. 판의 오른끝이 카메라 인셋 안에 든다(`plate.right + 갭 ≤ safeInsetLeft`).
 * 5. **리사이즈 뒤에도 전부 유지된다** — 원점이 뷰포트의 함수가 된 순간
 *    마운트 1회 파생은 낡는다. 그게 이 페이지가 이미 한 번 당한 사고의 형태다.
 * 6. **설치 3단이 접히지 않는다** — 끝까지 스크롤하면 세 단이 전부 뷰포트
 *    안에 온전히 들어오고, 조상 컨테이너가 잘라 놓지 않았다.
 * 7. 판 안의 어떤 컨트롤도 판의 안쪽 폭을 넘지 않는다(ko/en 둘 다).
 *
 * ## 6번의 사정거리는 2026-08-01 에 좁혀졌다 (넓힌 게 아니라 좁혔다)
 *
 * 종전 6번은 **「페이지 전체가 한 화면」** 이었다(`/download` 에서 세로 스크롤 0).
 * 그건 시연 절이 `/` 에만 있던 시절의 형태다 — 소유자가 두 주소를 통일하면서
 * (*"download는 결국 홍보 페이지랑 같잖아"*) `/download` 도 스크롤되는 페이지가
 * 됐고, 그 순간 옛 6번은 **제품이 아니라 자기 전제를 지키는** 시험이 됐다.
 *
 * 그래서 지우지 않고 **원래 지키던 것**으로 돌려놨다. 그 게이트가 실제로 잡은
 * 회귀는 "스크롤이 생겼다" 가 아니라 **"접힌 것이 하필 설치 3단이었다"** 다
 * (구 `min(46rem,88vh)` 고정 바닥이 850 창에서 270px 을 접었다). 스크롤 0 은
 * 그 property 를 담는 그릇이었지 property 자체가 아니었다.
 *
 * ⚠️ **그릇과 내용물을 헷갈리면 게이트가 두 방향으로 틀린다.** 그릇만 지키면
 * 오늘처럼 정당한 설계 변경에 빨개지고, 그릇을 지우면 내용물까지 같이 사라진다.
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

/** 스크롤 0 을 약속하는 폭 — 14인치 실창과 풀스크린, 그리고 그 위. */
const NO_SCROLL_VIEWPORTS = [
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
    const plate = document.querySelector('[data-testid="download-plate"]');
    const plateRect = plate ? plate.getBoundingClientRect() : null;
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
        plate: bx('[data-testid="download-plate"]'),
        caption: bx('[data-testid="download-portrait-caption"] span'),
        install: bx('[data-testid="download-install"]'),
        footer: bx("main footer > div"),
      },
      plateRight: plateRect ? Math.round(plateRect.right) : null,
      // 밴드(=원점 안쪽 컬럼)의 오른끝 — 좌우 대칭은 이 수와 `vw` 로만 잰다.
      bandRight: right('[data-testid="download-install"]'),
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
      plateWidthToken: Number(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--gateway-plate-width")
          .trim(),
      ),
      plateGapToken: Number(
        getComputedStyle(document.documentElement).getPropertyValue("--gateway-plate-gap").trim(),
      ),
      safeInsetLeft: Number(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--topology-v2-safe-inset-left")
          .trim(),
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

  /**
   * **파생이 실제로 돌았는가.**
   *
   * 예약폭은 이제 리터럴이 아니라 `원점 + 판 폭 + 틈` 이다
   * (`src/views/download/lib/gateway-grid.ts`, `StageMap` effect). 그 effect 가
   * 삭제되거나 깨지면 CSS 폴백(544)이 살아남아 **그럴듯한 값**이 나오므로,
   * 합을 직접 확인하지 않으면 아무도 모른다.
   *
   * 첫 항이 원점인 것이 핵심이다 — 홈통이면 넓은 화면에서 판은 원점에 서는데
   * 카메라는 홈통을 피해서 1920 에 +96, 2560 에 +416 이 어긋난다.
   */
  expect(
    Number.isFinite(m.safeInsetLeft),
    `${label}: 예약폭이 숫자가 아니다 — 파생이 안 돌았다`,
  ).toBe(true);
  expect(m.safeInsetLeft, `${label}: 예약폭이 원점+판폭+틈 이 아니다`).toBe(
    origin + m.plateWidthToken + m.plateGapToken,
  );

  // 판이 카메라가 예약한 영역 안에 있어야 그래프가 판 뒤로 안 파고든다.
  // 틈도 토큰에서 읽는다 — 구 판본은 `+ 24` 리터럴이라 틈을 바꾸면
  // 시험이 옛 값을 지키느라 빨개졌다.
  expect(m.plateRight, `${label}: 판 오른끝을 못 읽었다`).not.toBeNull();
  expect(m.plateRight! + m.plateGapToken).toBeLessThanOrEqual(m.safeInsetLeft);

  expect(m.overflowX, `${label}: 가로 오버플로`).toBe(0);
}

test.describe("관문 다운로드의 그리드", () => {
  for (const viewport of WIDTHS) {
    test(`${viewport.width}×${viewport.height} — 여섯 원소가 같은 x 에 서고 좌우가 같다`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedFirstRunSeen(page);
      await page.goto("/ko/download/", { waitUntil: "networkidle" });
      await expect(page.getByTestId("download-plate")).toBeVisible({ timeout: 15_000 });

      assertGrid(await measure(page), `${viewport.width}`);
    });
  }

  /**
   * **리사이즈 뒤에도 한 벌인가** — 원점이 뷰포트의 함수가 된 순간 생긴
   * 재발 경로다 (2026-07-29 평결이 명시).
   *
   * CSS 쪽(여섯 원소의 x)은 `@property` 등록 덕에 공짜로 따라온다. 따라오지
   * **않는** 것은 JS 파생인 카메라 예약폭이다 — 마운트 1회로 두면 판은 새
   * 원점으로 옮겨 가는데 카메라는 옛 수를 계속 피한다. 그게 아침 사고
   * (1920 +96 · 2560 +416)와 정확히 같은 형태라, 이 시험이 유일한 눈이다.
   *
   * 두 방향으로 잰다: 넓히기(원점이 자란다)와 좁히기(원점이 홈통으로 되돌아
   * 간다). 한 방향만 재면 "커지기만 하는" 구현이 통과한다.
   */
  test("리사이즈하면 여섯 원소도 카메라 예약폭도 새 원점을 따라간다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/download/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("download-plate")).toBeVisible({ timeout: 15_000 });

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
      // 마운트 값이 그대로 남아 있으면 구독이 없는 것이다 — 단, 그렇게 말할 수
      // 있는 것은 **원점이 실제로 달라진 폭**에서뿐이다.
      //
      // ⚠️ 예전엔 `width !== 1440` 이면 무조건 달라지라고 했다. 그건 "1920 의
      // 원점은 1440 보다 크다" 는 **홈통 크기에 대한 가정**을 시험이 들고 있는
      // 것이고, 이 파일이 맨 위에서 금지한 「원점 값 베끼기」와 같은 실수다.
      // 원점은 `max(홈통, (vw − page-max)/2)` 라 홈통이 커지면 앞항이 이겨
      // 넓혀도 그대로일 수 있다 — 홈통 200 에서 1440·1920 이 둘 다 200 이다.
      // 그때 "달라져야 한다"고 우기면 시험이 제품이 아니라 옛 가정을 지킨다.
      //
      // 조건을 라이브 원점에 걸면 의도("원점이 움직였으면 예약폭도 움직였어야
      // 한다")는 그대로고, 홈통을 어떻게 바꿔도 이 시험은 계속 참을 잰다.
      if (m.originToken !== mounted.originToken) {
        sawOriginChange = true;
        expect(
          m.safeInsetLeft,
          `${width}: 원점은 ${mounted.originToken} → ${m.originToken} 로 움직였는데 예약폭이 마운트 값에 묶여 있다`,
        ).not.toBe(mounted.safeInsetLeft);
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

  for (const viewport of NO_SCROLL_VIEWPORTS) {
    for (const route of ["/ko/", "/ko/download/"]) {
      test(`${viewport.width}×${viewport.height} ${route} — 설치 3단이 접히지 않는다`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await seedFirstRunSeen(page);
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.getByTestId("download-plate")).toBeVisible({ timeout: 15_000 });

        /**
         * **두 주소가 같은 것을 보여준다** (2026-08-01 소유자 확정).
         *
         * 이 단언이 없으면 아래 시험은 **조용히 무의미해진다** — 시연 절이
         * 사라지면 페이지가 짧아져 설치 3단은 저절로 접힘 위에 오고, 시험은
         * 아무것도 안 재면서 초록이 된다. 그건 통과가 아니라 시야 상실이다
         * (이 파일의 `sawOriginChange` 와 같은 규율).
         *
         * 동시에 이것이 통일 자체의 게이트다. 종전엔 `showDemo` 한 줄이 주소로
         * 갈랐고 아무 시험도 그 갈림을 몰랐다.
         */
        await expect(
          page.getByTestId("demo-stage"),
          `${route} 에 시연 절이 없다 — 두 주소는 같은 것을 보여줘야 한다`,
        ).toBeVisible({ timeout: 15_000 });

        const install = page.getByTestId("download-install");
        // 스크롤되는 페이지가 됐으므로 **끝까지 가서** 잰다. 도달 자체가
        // 시험의 일부다 — 스크롤로도 못 닿으면 그건 접힌 것보다 나쁘다.
        await install.scrollIntoViewIfNeeded();
        await expect(install).toBeVisible();

        const cut = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="download-install"]')!;
          const rect = el.getBoundingClientRect();
          const vh = window.innerHeight;
          const steps = [...el.querySelectorAll("li")].map((li) => {
            const r = li.getBoundingClientRect();
            return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
          });
          /**
           * 조상이 잘라 놓았는가 — `overflow:hidden` 인 조상의 하단보다
           * 아래로 삐져나온 픽셀. 스크롤 컨테이너와 달리 이건 **도달 불가**다.
           */
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
          return {
            vh,
            bandBottom: Math.round(rect.bottom),
            steps,
            clippedBy,
          };
        });

        // 구 `min(46rem,88vh)` 고정 바닥이 850 창에서 접은 것이 바로 이 셋이다.
        expect(cut.steps, "설치 단계가 셋이 아니다").toHaveLength(3);
        for (const [i, s] of cut.steps.entries()) {
          expect(s.h, `설치 ${i + 1}단의 높이가 0 이다`).toBeGreaterThan(0);
          expect(
            s.bottom,
            `설치 ${i + 1}단이 뷰포트 아래로 잘렸다: ${JSON.stringify(cut)}`,
          ).toBeLessThanOrEqual(cut.vh + 1);
          expect(s.top, `설치 ${i + 1}단이 뷰포트 위로 잘렸다`).toBeGreaterThanOrEqual(-1);
        }
        expect(cut.clippedBy, `조상 컨테이너가 설치 띠를 잘랐다: ${cut.clippedBy}`).toBeNull();
      });
    }
  }

  for (const locale of ["ko", "en"]) {
    test(`320px ${locale} — 판 안의 컨트롤이 판을 뚫지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await seedFirstRunSeen(page);
      await page.goto(`/${locale}/download/`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("download-plate")).toBeVisible({ timeout: 15_000 });

      const worst = await page.evaluate(() => {
        const plate = document.querySelector('[data-testid="download-plate"]')!;
        const cs = getComputedStyle(plate);
        const innerLeft = plate.getBoundingClientRect().left + parseFloat(cs.paddingLeft);
        const innerRight = plate.getBoundingClientRect().right - parseFloat(cs.paddingRight);
        let overflow = -Infinity;
        let culprit = "";
        for (const el of plate.querySelectorAll("a, button, p, div")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          const over = Math.max(r.right - innerRight, innerLeft - r.left);
          if (over > overflow) {
            overflow = over;
            culprit = (el.getAttribute("data-testid") ?? el.tagName) + ": " + el.textContent?.slice(0, 40);
          }
        }
        return { overflow: Math.round(overflow), culprit };
      });

      // `buttonVariants` 는 `whitespace-nowrap` 이라 라벨이 길면 버튼이
      // 컨테이너를 뚫는다. 무대가 `overflow-hidden` 이라 스크롤바도 안 생기고
      // 그냥 잘렸다 — 실측(320, en): 주 CTA 가 22px 넘쳤다.
      expect(worst.overflow, `판을 넘는 원소: ${worst.culprit}`).toBeLessThanOrEqual(0);
    });
  }
});
