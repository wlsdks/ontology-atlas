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
 * ## 무엇을 재나 (2026-08-18 리메이크 개정)
 *
 * 1. GNB 로고 · 헤드라인 · **지도 절** · 판 · 캡션 · 설치 띠 · 푸터의 x 가
 *    **전부 같다** (일곱 원소).
 * 2. **좌우 여백이 같다** — `밴드.left === vw − 밴드.right`.
 * 3. **상단 바의 우측 그룹 오른끝 === vw − 원점** (소유자의 "공백이 길고" 지적).
 * 4. **판과 지도가 겹치지 않는다** — 구 카메라 예약폭 파생(`원점+판폭+틈` →
 *    `--topology-v2-safe-inset-left`)의 후계다. 리메이크로 지도가 판 뒤
 *    배경에서 자기 절(증거)로 내려가며 파생의 전제(겹침 가능성)가 사라졌고,
 *    지키던 property(그래프가 판 뒤로 파고들지 않는다)는 문서 좌표 비교로
 *    직접 잰다.
 * 5. **리사이즈 뒤에도 전부 유지된다.**
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
    const mapFrame = document.querySelector('[data-testid="download-stage-map-frame"]');
    const mapRect = mapFrame ? mapFrame.getBoundingClientRect() : null;
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
        // 리메이크(2026-08-18): 지도 절도 같은 원점에 선다 — 일곱째 원소.
        map: bx('[data-testid="download-stage-map-frame"]'),
        plate: bx('[data-testid="download-plate"]'),
        caption: bx('[data-testid="download-portrait-caption"] span'),
        install: bx('[data-testid="download-install"]'),
        footer: bx("main footer > div"),
      },
      plateRight: plateRect ? Math.round(plateRect.right) : null,
      // 판↔지도 비겹침의 새 증거 (구 카메라 예약폭의 후계) — 아래 참조.
      plateTop: plateRect ? Math.round(plateRect.top + window.scrollY) : null,
      mapBottom: mapRect ? Math.round(mapRect.bottom + window.scrollY) : null,
      // 밴드(=원점 안쪽 컬럼)의 오른끝 — 좌우 대칭은 이 수와 `vw` 로만 잰다.
      // ⚠️ 자(ruler)는 **컬럼 전폭을 실제로 채우는 원소**여야 한다. 종전엔
      // 설치 3단이었는데, 2026-08-18 설치 절 정돈으로 3단이 판과 같은
      // 880 컬럼으로 내려가면서(두 그리드 겹침 해소 — 소유자 지적) 자 노릇을
      // 잃었다. 계기 스트립(gateway-facts)은 히어로의 바닥 괘선이라 컬럼
      // 전폭이 정의이고, 게시/미게시 어느 분기에서도 그려진다.
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
      // 판 폭의 진실원 — 판이 이 상한을 넘지 않는지만 잰다. (구 카메라
      // 예약폭 파생 — plateGap · safeInsetLeft — 은 2026-08-18 리메이크에서
      // 은퇴했다: 지도가 자기 절로 내려가 판과 겹칠 수 없다.)
      plateWidthToken: Number(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--gateway-plate-width")
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
   * **판과 지도는 겹칠 수 없다** — 구 카메라 예약폭 단언의 후계 (2026-08-18).
   *
   * 예전엔 판이 지도 위에 떠서 `원점+판폭+틈` 파생 예약폭이 겹침을 막았고,
   * 이 시험이 그 파생을 잤다. 리메이크로 지도(증거 절)와 판(설치 절)이 서로
   * 다른 절이 되면서 그 전제 — 겹침 가능성 — 자체가 사라졌다. 시험이 지키던
   * property(「그래프가 판 뒤로 파고들지 않는다」)는 그대로 살아서, 이제
   * 문서 좌표로 직접 잰다: 지도 절의 바닥이 판의 머리보다 위다.
   */
  expect(m.plateTop, `${label}: 판 rect 를 못 읽었다`).not.toBeNull();
  expect(m.mapBottom, `${label}: 지도 절 rect 를 못 읽었다`).not.toBeNull();
  expect(
    m.mapBottom!,
    `${label}: 지도 절이 판을 침범했다 (지도 바닥 ${m.mapBottom} > 판 머리 ${m.plateTop})`,
  ).toBeLessThanOrEqual(m.plateTop!);

  // 판은 자기 폭 상한(토큰)을 넘지 않는다 — 값은 베끼지 않고 라이브로 읽는다.
  expect(m.plateRight, `${label}: 판 오른끝을 못 읽었다`).not.toBeNull();
  expect(m.plateRight! - m.xs.plate!).toBeLessThanOrEqual(m.plateWidthToken + 1);

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
   * **리사이즈 뒤에도 한 벌인가** (2026-07-29 평결의 재발 경로 감시).
   *
   * [개정 2026-08-18] 구 판본의 고유 표적 — JS 파생 카메라 예약폭의 낡음 —
   * 은 리메이크로 파생 자체가 은퇴하며 사라졌다. 남는 property 는 「CSS 원점
   * 공식이 실제로 리사이즈를 따라간다」와 「일곱 원소가 어느 폭에서도 한
   * 벌이다」이고, `assertGrid` 를 각 폭에서 다시 부르는 것이 그 전부다.
   * 두 방향으로 잰다: 넓히기(원점이 자란다)와 좁히기(홈통으로 되돌아간다).
   */
  test("리사이즈하면 일곱 원소가 새 원점을 따라간다", async ({ page }) => {
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

/**
 * **설계 여백은 눌러 담기의 완충재가 아니다** (2026-08-08 실측).
 *
 * 판의 출구 두 개(GitHub · 웹버전)를 640px 부터 두 칸으로 갈랐는데,
 * 640~830 구간에서는 그 칸이 내용보다 좁다. 실측(768 · ko): 행 폭 310px 인데
 * 두 버튼이 설계 여백(`px-6` = 24)을 지키려면 325px 이 필요했고, **부족분
 * 15px 이 여백에서 조용히 깎였다** — GitHub 버튼의 실효 좌우 여백 15.5,
 * 그 옆 형제 22. 나란히 선 두 출구의 여백이 서로 달라진 것이다.
 *
 * ## 왜 기존 게이트가 못 봤나 — 셋 다 각자 이유가 있다
 *
 * | 게이트 | 왜 침묵했나 |
 * |---|---|
 * | 이 파일의 x·넘침 시험 | 폭 목록이 **1440 이상**뿐이었다. 768 은 한 번도 측정된 적이 없다 |
 * | 글자 넘침 계측 | 글자가 **버튼 테두리 안에** 있다 — 잘리지도 삐져나오지도 않는다 |
 * | 단위 시험 | 담김·순서·문구만 본다. 렌더된 px 은 jsdom 에 없다 |
 *
 * 셋 다 자기 일은 했다. 아무도 «여백이 설계값대로인가» 를 묻지 않았을 뿐이다.
 *
 * ## 이 시험이 지키는 property
 *
 * *판 안의 컨트롤은 자기 내용을 담을 만큼 넓다* — 선언한 좌우 여백이 실제로
 * 그만큼 남는다. 이 성질이 깨지는 방식은 잘림이 아니라 **압축**이라, 재는
 * 방법도 rect 비교가 아니라 «content box 대 잉크 폭» 이다.
 */
test.describe("판의 컨트롤은 선언한 여백을 지킨다", () => {
  /** 좁은 쪽 임계 주변 — 여기가 한 번도 측정된 적 없는 구간이다. */
  const NARROW_WIDTHS = [
    { width: 640, height: 900 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1024, height: 768 },
  ];

  for (const locale of ["ko", "en"] as const) {
    for (const { width, height } of NARROW_WIDTHS) {
      test(`${locale} @ ${width}×${height} — 눌린 여백 0`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await seedFirstRunSeen(page);
        await page.goto(`/${locale}/download/`, { waitUntil: "networkidle" });
        await expect(page.getByTestId("download-plate")).toBeVisible({ timeout: 15_000 });

        const squeezed = await page.evaluate(() => {
          const plate = document.querySelector('[data-testid="download-plate"]')!;
          const rows: { id: string; declared: number; effective: number }[] = [];
          for (const el of plate.querySelectorAll("a, button")) {
            const box = el.getBoundingClientRect();
            if (box.width < 40 || box.height < 20) continue;
            const cs = getComputedStyle(el);
            const declared = parseFloat(cs.paddingLeft);
            if (declared < 1) continue; // 여백을 선언하지 않은 텍스트 링크는 대상 밖
            // 실제 잉크 폭 — 자식 rect 의 합집합(텍스트 노드 포함)
            const marks: DOMRect[] = [];
            for (const node of el.childNodes) {
              if (node.nodeType === Node.TEXT_NODE) {
                if (!node.textContent?.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                marks.push(range.getBoundingClientRect());
              } else if (node instanceof Element) {
                marks.push(node.getBoundingClientRect());
              }
            }
            const painted = marks.filter((m) => m.width > 0);
            if (!painted.length) continue;
            const inkLeft = Math.min(...painted.map((m) => m.left));
            const inkRight = Math.max(...painted.map((m) => m.right));
            const effective = Math.min(inkLeft - box.left, box.right - inkRight);
            rows.push({
              id: el.getAttribute("data-testid") ?? el.textContent?.trim().slice(0, 24) ?? "?",
              declared: Math.round(declared),
              effective: Math.round(effective),
            });
          }
          return rows;
        });

        // 공회전 차단 — 여백을 선언한 컨트롤을 하나도 못 찾으면 아래 0 은 무의미하다.
        expect(
          squeezed.length,
          "판에서 여백을 선언한 컨트롤을 못 찾았다 — 계기가 헛돈다",
        ).toBeGreaterThanOrEqual(2);

        // 1px 은 서브픽셀 반올림 몫이다. 그보다 크게 깎였으면 압축이다.
        const offenders = squeezed.filter((r) => r.effective < r.declared - 1);
        expect(
          offenders,
          "선언한 여백보다 좁게 렌더된 컨트롤 — 칸이 내용보다 좁아 여백에서 깎인다. " +
            "칸을 넓히거나, 그 폭에서는 한 줄로 쌓아라.",
        ).toEqual([]);
      });
    }
  }
});
