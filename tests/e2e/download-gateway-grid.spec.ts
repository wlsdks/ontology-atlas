import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The gateway's grid is one grid** — width is the independent variable, so
 * neither lint nor jsdom can measure it.
 *
 * **The regression this gate blocks.** Measured 2026-07-29: `/download` is designed
 * to pin the plate to **the left of the stage**, but the wrapper around it used the
 * same `mx-auto max-w-[var(--page-max)]` as the body. So the plate's x became a
 * function of viewport width:
 *
 * | Width | Plate right edge | Inset the camera reserved | Divergence |
 * |---|---|---|---|
 * | 1512 | 520 | 544 | 0 (correct only here) |
 * | 1920 | 640 | 544 | **+96** |
 * | 2560 | 960 | 544 | **+416** |
 *
 * The camera avoids only the 544 the token declares, so the wider the screen the
 * further the graph burrows behind the plate. It is the kind of defect that
 * **looks right at one width and is silently wrong at every other**, so it passes
 * human review.
 *
 * On top of that the footer section was centred again by `--page-col-utility`, so
 * one page had **two** alignment origins (at 1920: plate x=160, footer x=480).
 *
 * **And that same night: left/right asymmetry (promoting the origin).** After
 * fixing the above, the column still stopped at `--page-max` (1600) and all the
 * spare width piled up **on the right**. Measured:
 *
 * | Width | Left | Right | Ratio |
 * |---|---|---|---|
 * | 1512 | 40 | 40 | 1.0 |
 * | 1728 | 64 | 64 | 1.0 |
 * | 1920 | 64 | **256** | 4.0 |
 * | 2560 | 96 | **864** | 9.0 |
 *
 * Asymmetry starts **at 1728** — below that the column fills the screen and is
 * symmetric by itself. So the alignment origin was promoted to
 * `max(gutter, (vw − page-max)/2)`, and the six elements plus the camera's
 * reserved width all consume **that one value**.
 *
 * **What is measured (revised 2026-08-19, after the install section was deleted).**
 *
 * 1. The x of the GNB logo, headline, **map section**, caption, and footer are
 *    **all identical** (five elements).
 * 2. **Left and right margins are equal** — `band.left === vw − band.right`.
 * 3. **The top bar's right group ends at `vw − origin`** (the owner's "the gap is
 *    long" report).
 * 4. **All of it survives a resize.**
 * 5. **Both addresses show the same thing** — `/` and `/download` both render the
 *    demo section.
 * 6. Zero horizontal overflow at 320px (both ko and en).
 * 7. **Stage width follows the token** (wide-width revision 2026-08-19) — the demo
 *    stage's rendered width equals the computed value of `--gateway-stage-max`, it
 *    is centred within the column, and the agent scene takes the same width. The
 *    resize test also measures whether the stage width **actually moved** with the
 *    viewport — watching for a recurrence of the defect in the owner's 2560
 *    screenshot, where the stage was pinned at 30% of the viewport and the screen
 *    looked empty.
 *
 * **[Deleted 2026-08-19] four assertions whose subject was the plate or the
 * three-step install.** The owner removed the install section entirely (*"this last one can probably go; it
 * is all at the top anyway"* — this last one can probably go; it
 * is all at the top anyway). Removed with it:
 *
 * - The **plate** and the **install strip** from the seven elements (subject gone)
 * - **Plate/map non-overlap** — with both sections gone there is nothing to overlap
 * - **The plate does not exceed its width token (`--gateway-plate-width`)**
 * - **The three-step install does not wrap**, **controls inside the plate do not
 *   break out of it**, and **the plate's controls honour their declared margins**
 *   (zero crushed margin)
 *
 * Only "both addresses show the same thing" was kept, with a new vessel — that is a
 * property of **address unification** rather than of the three-step install, and
 * its subject (`demo-stage`) is still alive.
 *
 * ⚠️ **Confusing the vessel with the content makes a gate wrong in both
 * directions.** Guarding only the vessel turns it red on a legitimate design
 * change; deleting the vessel takes the content with it. If you cannot write in a
 * sentence what a test guards, it is not yet a property.
 */

/**
 * ⚠️ **Do not copy the origin value here** (prescription from the design-systems
 * seat, 2026-07-29).
 *
 * It used to be `width >= 768 ? 40 : 24`. That makes this file **a second source of
 * truth** — the test then verifies "does the rendered x equal the number I copied
 * here" rather than "does the rendered x equal what the token says", and changing
 * the token turns the test red **defending its own copy instead of the product**.
 *
 * Now `--gateway-origin` is read live (registered as `@property <length>`, so the
 * computed value settles as `160px`). Only the width list lives here; every number
 * expected at those widths is read from what the browser computed.
 *
 * The `<md` band is governed by `max(1.5rem, safe-area)` rather than this token, so
 * it is not in the x-test width list — the 320px test measures **overflow**, not
 * x.
 */
const WIDTHS = [
  { width: 1512, height: 982 },
  { width: 1512, height: 850 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1440, height: 900 },
  // The gutter step boundary (≥1536) — the last band where the gutter beats the origin.
  { width: 1536, height: 960 },
  // The threshold where symmetry used to break. At 1728 origin = gutter = 64 and the
  // two rules meet exactly — the witness that the promotion left existing bands
  // untouched.
  { width: 1728, height: 1080 },
  { width: 2400, height: 1350 },
];

/** Widths for measuring that both addresses show the same thing — a real 14-inch window, fullscreen, and above. */
const UNIFIED_ROUTE_VIEWPORTS = [
  { width: 1512, height: 982 },
  { width: 1512, height: 850 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

async function measure(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    /**
     * ⚠️ **Measure only what is laid out** (caught by council measurement,
     * 2026-08-08).
     *
     * This used to measure the **first match** from `querySelector`, so when that place
     * was `display:none` it returned `x=0, w=0` as if correct. It really happened:
     * `GatewayReadingLinks`, added to the front of the footer on 2026-08-07, is
     * `sm:hidden` and is not rendered at `≥sm`, yet it became the first match for
     * `main footer > div` and **all eight widths** went red with *"footer is outside
     * the origin (200) — 0"*. The layout was fine and the instrument was wrong.
     *
     * The discriminator is not "is it visible" but **"is it laid out"**
     * (`getClientRects()`): something transparent or pushed off screen is still part of
     * the grid, while `display:none` does not participate in that width's grid at
     * all.
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
        // Remake (2026-08-18): the map section stands at the same origin.
        map: bx('[data-testid="download-stage-map-frame"]'),
        caption: bx('[data-testid="download-portrait-caption"] span'),
        footer: bx("main footer > div"),
      },
      // The right edge of the band (the column inside the origin) — symmetry is measured
      // from this number and `vw` alone.
      // ⚠️ The ruler must be **an element that really fills the column's full width**.
      // The facts strip (gateway-facts) is the hero's bottom rule, so full column width
      // is its definition, and it renders on both the published and unpublished
      // branches. (The previous ruler, the three-step install, left the page on
      // 2026-08-19.)
      bandRight: right('[data-testid="gateway-facts"]'),
      /**
       * Stage width (wide-width revision 2026-08-19). The no-copying rule is the same as
       * for the origin — `--gateway-stage-max` is clamp(rem, vw, rem), so the browser
       * settles the computed `max-width` in px. The test only checks that computed value
       * against the rendered rect (the formula's own invariants live in
       * `tests/contract/gateway-stage-width.contract.test.ts`).
       */
      stage: (() => {
        const demo = laidOut('[data-testid="demo-stage"]');
        const agent = laidOut('[data-testid="gateway-agent-scene"]');
        if (!demo) return null;
        const demoRect = demo.getBoundingClientRect();
        const colRect = demo.parentElement!.getBoundingClientRect();
        return {
          maxWidthPx: Number.parseFloat(getComputedStyle(demo).maxWidth),
          demoW: Math.round(demoRect.width),
          demoLeft: Math.round(demoRect.left),
          colLeft: Math.round(colRect.left),
          colW: Math.round(colRect.width),
          agentW: agent ? Math.round(agent.getBoundingClientRect().width) : null,
          /*
           * The head's **text** centre, not the element's. The `h2` fills the column whichever
           * way its text is aligned, so its box centre is the column centre either way and would
           * agree with a centred stage even when the text is hard left — which is the exact
           * mismatch this is here to catch. A Range over the text node measures where the ink is.
           */
          headInkMid: (() => {
            const head = document.querySelector('[data-testid="gateway-demo-section"] h2');
            if (!head || !head.firstChild) return null;
            const range = document.createRange();
            range.selectNodeContents(head);
            const r = range.getBoundingClientRect();
            return Math.round(r.left + r.width / 2);
          })(),
        };
      })(),
      // The right edge of the top bar's right group — the gate for the owner's "why is the gap so long?".
      gnbActionsRight: right('[data-testid="download-gnb-actions"]'),
      /**
       * ⚠️ **The ruler for symmetry is `clientWidth`, not `innerWidth`.**
       *
       * `getBoundingClientRect` is relative to the layout viewport (width minus the
       * vertical scrollbar), while CSS `100vw` **includes** the scrollbar. In a window
       * with a scrollbar, measuring with `innerWidth` makes the right side wider by the
       * scrollbar width, so a perfectly symmetric layout turns the test red (the measured
       * delta is exactly the scrollbar width).
       *
       * Because the column fills the remaining width, `clientWidth − band.right` is
       * exactly the origin in both bands — narrow (the column fills the screen) and wide
       * (the column stops at `--page-max − scrollbar`).
       */
      layoutWidth: document.documentElement.clientWidth,
      scrollbar: window.innerWidth - document.documentElement.clientWidth,
      // The gateway grid's value, from `:root` in `app/globals.css`. The test reads
      // rather than copies it, confirming the derivation actually ran.
      // `--gateway-origin` is registered as `@property <length>`, so its computed value
      // settles as `160px` and `parseFloat` yields the same number the screen uses for
      // x.
      originToken: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--gateway-origin").trim(),
      ),
      scrollDelta,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

/**
 * Judges **whether the grid is one grid** at a given width, in full.
 *
 * The resize test calls the same function again — if the two tests each copied the
 * assertions, a day comes when only one is updated, and the side that quietly
 * weakens is always the less-read one (resize).
 */
function assertGrid(m: Awaited<ReturnType<typeof measure>>, label: string) {
  const origin = m.originToken;
  expect(Number.isFinite(origin), `${label}: 원점 토큰을 못 읽었다`).toBe(true);

  for (const [name, x] of Object.entries(m.xs)) {
    expect(x, `${label}: ${name} 의 x 를 못 읽었다`).not.toBeNull();
    expect(x, `${label}: ${name} 이 원점(${origin}) 밖에 있다`).toBe(origin);
  }

  /**
   * **Are left and right equal** (owner report 2026-07-29: *"Left and right must match."*
   *
   * This is the defect that passed while only the left was measured: when the origin
   * was a fixed value, 1920 gave left 64 and right 256 while all six elements
   * **shared** x=64. The alignment principle can be honoured while the screen still
   * leans one way, so symmetry needs its own assertion.
   */
  expect(m.bandRight, `${label}: 밴드 오른끝을 못 읽었다`).not.toBeNull();
  expect(
    m.layoutWidth - m.bandRight!,
    `${label}: 좌우 여백이 다르다 (왼 ${origin} · 스크롤바 ${m.scrollbar})`,
  ).toBe(origin);

  /**
   * **The top bar is inside the same frame** (owner: *"The gap is long, why is that?"*). The right group stops at the column's right edge, so
   * this edge follows when the origin grows.
   */
  expect(m.gnbActionsRight, `${label}: GNB 우측 그룹을 못 읽었다`).not.toBeNull();
  expect(m.gnbActionsRight, `${label}: 상단 바 우측이 화면 끝과 안 맞는다`).toBe(
    m.layoutWidth - origin,
  );

  expect(m.overflowX, `${label}: 가로 오버플로`).toBe(0);

  /**
   * **The stage follows the token** (wide-width revision 2026-08-19 — the owner's
   * 2560 screenshot: the stage was pinned at 768px, floating at 30% of the viewport
   * and leaving the screen looking empty).
   *
   * Rendered width = the token's computed value (or the column, if narrower);
   * centred within the column; the same width as the agent scene. Values are read
   * from what the browser computed — copying numbers here would make this file a
   * second source of truth (the rule at the top).
   */
  expect(m.stage, `${label}: 무대를 못 읽었다`).not.toBeNull();
  const stage = m.stage!;
  expect(Number.isFinite(stage.maxWidthPx), `${label}: 무대 상한 토큰을 못 읽었다`).toBe(true);
  const expectedStageW = Math.round(Math.min(stage.maxWidthPx, stage.colW));
  expect(
    Math.abs(stage.demoW - expectedStageW),
    `${label}: 시연 무대 폭(${stage.demoW})이 토큰 계산값(${expectedStageW})과 다르다`,
  ).toBeLessThanOrEqual(1);
  /*
   * **The demo section is one axis: the stage is centred, and so is its heading** (2026-08-23).
   *
   * The first half of this — "the stage is centred" — is what this file asserted from the start,
   * and it was green the whole time the section was visibly wrong. The stage sat centred under a
   * hard-left heading, so the section ran two axes; measured at 1920, the ink of the head began at
   * x=200 while the video began at 569. **A half-checked axis is what let that ship.**
   *
   * So the assertion is now the relation, not one side of it: whatever axis the section uses, the
   * heading's ink and the stage must share it. That stays true if the section is ever moved back
   * to the left, which the previous wording of this test would not have.
   */
  const stageMid = stage.demoLeft + stage.demoW / 2;
  const colMid = stage.colLeft + stage.colW / 2;
  expect(
    Math.abs(stageMid - colMid),
    `${label}: 시연 무대가 컬럼 가운데에 서지 않았다`,
  ).toBeLessThanOrEqual(1);
  expect(stage.headInkMid, `${label}: 절 제목의 글자를 못 읽었다 — 이 시험이 헛돈다`).not.toBeNull();
  expect(
    Math.abs(stage.headInkMid! - stageMid),
    `${label}: 절 제목(${stage.headInkMid})과 시연 무대(${Math.round(stageMid)})의 축이 다르다 — ` +
      "한 절에 격자가 둘이면 눈에는 기둥이 끊겨 보인다",
  ).toBeLessThanOrEqual(2);
  expect(
    stage.agentW,
    `${label}: 에이전트 장면(${stage.agentW})과 시연 무대(${stage.demoW})의 폭이 갈렸다 — ` +
      "「이만큼이 무대다」는 한 번만 말해져야 한다",
  ).toBe(stage.demoW);
}

test.describe("관문 다운로드의 그리드", () => {
  for (const viewport of WIDTHS) {
    test(`${viewport.width}×${viewport.height} — 다섯 원소가 같은 x 에 서고 좌우가 같다`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedFirstRunSeen(page);
      /**
       * `load` plus an explicit element wait, not `networkidle` (measured 2026-08-19).
       * At large viewports (2560×1440) the demo section falls within the first screen and
       * the video starts autoplaying, and while that streams `networkidle` **by
       * definition never arrives** — the same timeout reproduced on pre-fix builds. What
       * this test measures is the grid, and the grid is already settled once the facts
       * strip is visible.
       */
      await page.goto("/ko/download/", { waitUntil: "load" });
      await expect(page.getByTestId("gateway-facts")).toBeVisible({ timeout: 15_000 });

      assertGrid(await measure(page), `${viewport.width}`);
    });
  }

  /**
   * **Is it still one grid after a resize** (watching the recurrence path of the
   * 2026-07-29 verdict).
   *
   * [Revised 2026-08-18] The old version's unique target — a stale JS-derived camera
   * reservation width — disappeared when the remake retired that derivation. The
   * remaining properties are "the CSS origin formula really follows a resize" and
   * "the five elements share one grid at every width", and calling `assertGrid` again
   * at each width is all of it. Both directions are measured: widening (the origin
   * grows) and narrowing (it returns to the gutter).
   */
  test("리사이즈하면 다섯 원소가 새 원점을 따라간다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
    // `load` plus an element wait — `networkidle` by definition never arrives at large
    // viewports because of the autoplaying demo's streaming (see the grid test above).
    await page.goto("/ko/download/", { waitUntil: "load" });
    await expect(page.getByTestId("gateway-facts")).toBeVisible({ timeout: 15_000 });

    const mounted = await measure(page);
    assertGrid(mounted, "1440 (마운트)");

    // Whether the width list actually moved the origin and the stage width at least once — see below.
    let sawOriginChange = false;
    let sawStageChange = false;

    for (const width of [2560, 1920, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // The derivation is coalesced through rAF — wait two frames before measuring.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const m = await measure(page);
      assertGrid(m, `${width} (리사이즈)`);
      // Only record whether the width list moved the origin — the origin value itself
      // is never copied (the rule at the top). With a list that never moves the origin,
      // this test goes green while measuring nothing about following a resize.
      if (m.originToken !== mounted.originToken) {
        sawOriginChange = true;
      }
      if (m.stage!.demoW !== mounted.stage!.demoW) {
        sawStageChange = true;
      }
    }

    // Stops the conditionals above from **quietly becoming meaningless**. If the
    // gutter grows so that no width in the list moves the origin, this test goes green
    // while measuring nothing — that is loss of view, not a pass. Widen the width list
    // when it happens.
    expect(
      sawOriginChange,
      "폭 목록이 원점을 한 번도 바꾸지 못했다 — 이 시험은 지금 아무것도 지키지 않는다",
    ).toBe(true);
    // The same idling guard for stage width — if the stage reverts to a fixed 768px at
    // wide viewports (the defect in the owner's 2560 screenshot, 2026-08-19), this
    // turns red.
    expect(
      sawStageChange,
      "폭 목록이 무대 폭을 한 번도 바꾸지 못했다 — 넓은 폭 비례 성장이 죽었다",
    ).toBe(true);
  });

  /**
   * **Both addresses show the same thing** (owner decision 2026-08-01).
   *
   * A single `showDemo` line used to branch on the address, and no test knew about
   * that branch.
   *
   * [Vessel replaced 2026-08-19] This assertion originally rode inside the "the
   * three-step install does not wrap" test as its idling guard. Deleting the
   * three-step install removed the outer test, but this property belongs to
   * **address unification** rather than to those three steps, so it becomes its own
   * test.
   */
  for (const viewport of UNIFIED_ROUTE_VIEWPORTS) {
    for (const route of ["/ko/", "/ko/download/"]) {
      test(`${viewport.width}×${viewport.height} ${route} — 시연 절이 두 주소 모두에 있다`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await seedFirstRunSeen(page);
        // `load` — `networkidle` never arrives at large viewports because of the
        // autoplaying demo's streaming. This test's waiting is carried by the
        // `toBeVisible` below anyway.
        await page.goto(route, { waitUntil: "load" });

        const demo = page.getByTestId("demo-stage");
        await demo.scrollIntoViewIfNeeded();
        await expect(
          demo,
          `${route} 에 시연 절이 없다 — 두 주소는 같은 것을 보여줘야 한다`,
        ).toBeVisible({ timeout: 15_000 });

        // Unreachable even by scrolling, or clipped by an ancestor, is the same as absent.
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
   * **No horizontal overflow at 320px** (both ko and en).
   *
   * [Vessel replaced 2026-08-19] The old test's subject was the download plate. The
   * plate is gone, but what it really blocked at this width — a long label pushing a
   * control past the screen, and the stage being `overflow-hidden` so it is simply
   * clipped with no scrollbar to show for it — is a property of the whole page, so it
   * is measured at document level. The `WIDTHS` list only covers 1440 and above, so
   * this width is measured here alone.
   */
  for (const locale of ["ko", "en"]) {
    test(`320px ${locale} — 가로 오버플로 0`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await seedFirstRunSeen(page);
      await page.goto(`/${locale}/download/`, { waitUntil: "load" });
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

      // `buttonVariants` is `whitespace-nowrap`, so a long label pushes the button out
      // of its container — measured at 320 in en: the primary CTA overflowed by 22px.
      expect(worst.overflow, `화면을 넘는 원소: ${worst.culprit}`).toBeLessThanOrEqual(0);
      expect(worst.documentOverflow, "문서가 가로로 넘친다").toBeLessThanOrEqual(0);
    });
  }

});

test.describe("the hero split waits for a column that can hold the decision", () => {
  /*
   * ⚠️ Measured 2026-08-30: the split opened at `lg`, where the page column is 624px. The object
   * took its 320px minimum, the decision block got 256px, the Windows button (304px) ran into
   * the object, and from 1024 to 1439 all five destinations stood one per row. The split opens
   * at `xl` now with a 500px floor for the decision block. This measures the two things a
   * reader would see: no destination leaves its column, and none stands on the object.
   */
  for (const width of [1024, 1100, 1280, 1440, 1512]) {
    test(`${width}px — every destination stays in its column and off the object`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedFirstRunSeen(page);
      await page.goto("/en/download/", { waitUntil: "load" });
      await page.waitForTimeout(1500);
      const m = await page.evaluate(() => {
        const object = document.querySelector('[data-testid="gateway-hero-object"]')!.getBoundingClientRect();
        const out: string[] = [];
        const rows = new Set<number>();
        for (const a of document.querySelectorAll('a[data-testid^="gateway-hero-"]')) {
          const r = a.getBoundingClientRect();
          rows.add(Math.round(r.top));
          /* A destination squeezed narrower than its label is the column failing, not the label. */
          if (a.scrollWidth > a.clientWidth + 1) out.push(`${a.getAttribute("data-testid")} is narrower than its label by ${a.scrollWidth - a.clientWidth}px`);
          const overlap = Math.min(r.right, object.right) - Math.max(r.left, object.left) > 0 && Math.min(r.bottom, object.bottom) - Math.max(r.top, object.top) > 0;
          if (overlap) out.push(`${a.getAttribute("data-testid")} stands on the object`);
        }
        return { out, rows: rows.size, objectWidth: Math.round(object.width) };
      });
      expect(m.out, `at ${width}`).toEqual([]);
      /* Two rows plus one for the destination the second row cannot hold; five is a column. */
      expect(m.rows, `the destinations stand ${m.rows} rows tall at ${width}`).toBeLessThanOrEqual(3);
      expect(m.objectWidth, "the object keeps its minimum").toBeGreaterThanOrEqual(320);
    });
  }
});
