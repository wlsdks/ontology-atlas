import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForBoxStill, waitFrames } from "./settle";

/**
 * The gateway's grid is one grid: width is the independent variable, so neither lint nor jsdom can
 * measure it.
 */

/**
 * Do not copy the origin value here: read `--gateway-origin` live (registered as `@property
 * <length>`), so the test defends the token, not a copy. Only the width list lives here.
 */
const WIDTHS = [
  { width: 1512, height: 982 },
  { width: 2560, height: 1440 },
  // At 1728 origin equals gutter (64) and the two rules meet; 1440 and 1920 are walked by the resize
  // test.
  { width: 1728, height: 1080 },
];

const UNIFIED_ROUTE_VIEWPORTS = [{ width: 1512, height: 982 }];

async function measure(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    /**
     * Measure only what is laid out (`getClientRects()`): a `display:none` first match returns x=0,
     * w=0 as if correct.
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
        footer: bx("main footer > div"),
      },
      // The ruler must fill the column's full width: the facts strip is the hero's bottom rule and
      // renders on both release branches.
      bandRight: right('[data-testid="gateway-facts"]'),
      /**
       * Stage width follows the computed `--gateway-stage-max`; formula invariants live in
       * `tests/contract/layout/gateway-stage-width.contract.test.ts`.
       */
      stage: (() => {
        const demo = laidOut('[data-testid="demo-stage"]');
        if (!demo) return null;
        const demoRect = demo.getBoundingClientRect();
        // From 90rem the head takes a track beside the stage, so the stage track and the section column
        // are different boxes.
        const trackRect = demo.parentElement!.getBoundingClientRect();
        const colRect = document
          .querySelector('[data-testid="gateway-demo-section"] > div')!
          .getBoundingClientRect();
        return {
          maxWidthPx: Number.parseFloat(getComputedStyle(demo).maxWidth),
          demoW: Math.round(demoRect.width),
          demoLeft: Math.round(demoRect.left),
          demoRight: Math.round(demoRect.right),
          trackW: Math.round(trackRect.width),
          colLeft: Math.round(colRect.left),
          colRight: Math.round(colRect.right),
          colW: Math.round(colRect.width),
          /*
           * Where the head's **ink** starts, not its box. The `h2` box fills its track whichever
           * way the text is aligned, so a box edge would agree with the column even while the
           * text is centred — the exact mismatch this is here to catch. A Range over the text
           * measures where the ink is.
           */
          headInkLeft: (() => {
            const head = document.querySelector('[data-testid="gateway-demo-section"] h2');
            if (!head || !head.firstChild) return null;
            const range = document.createRange();
            range.selectNodeContents(head);
            return Math.round(range.getBoundingClientRect().left);
          })(),
        };
      })(),
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

  expect(m.bandRight, `${label}: 밴드 오른끝을 못 읽었다`).not.toBeNull();
  expect(
    m.layoutWidth - m.bandRight!,
    `${label}: 좌우 여백이 다르다 (왼 ${origin} · 스크롤바 ${m.scrollbar})`,
  ).toBe(origin);

  expect(m.gnbActionsRight, `${label}: GNB 우측 그룹을 못 읽었다`).not.toBeNull();
  expect(m.gnbActionsRight, `${label}: 상단 바 우측이 화면 끝과 안 맞는다`).toBe(
    m.layoutWidth - origin,
  );

  expect(m.overflowX, `${label}: 가로 오버플로`).toBe(0);

  /**
   * Rendered stage width equals the token's computed value, or its track if narrower; values are
   * read from the browser, not copied.
   */
  expect(m.stage, `${label}: 무대를 못 읽었다`).not.toBeNull();
  const stage = m.stage!;
  expect(Number.isFinite(stage.maxWidthPx), `${label}: 무대 상한 토큰을 못 읽었다`).toBe(true);
  const expectedStageW = Math.round(Math.min(stage.maxWidthPx, stage.trackW));
  expect(
    Math.abs(stage.demoW - expectedStageW),
    `${label}: 시연 무대 폭(${stage.demoW})이 토큰 계산값(${expectedStageW})과 다르다`,
  ).toBeLessThanOrEqual(1);
  /*
   * The head's ink starts where the column starts and the stage ends where the column ends; either
   * half alone would pass a centred section or a stage floating mid-column.
   */
  expect(stage.headInkLeft, `${label}: 절 제목의 글자를 못 읽었다 — 이 시험이 헛돈다`).not.toBeNull();
  expect(
    Math.abs(stage.headInkLeft! - stage.colLeft),
    `${label}: the demo section title (${stage.headInkLeft}) does not start at the origin (${stage.colLeft}). ` +
      "With two alignment grammars on one page, the eye sees the column break",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(stage.demoRight - stage.colRight),
    `${label}: 시연 무대의 오른쪽(${stage.demoRight})이 컬럼 끝(${stage.colRight})에 닿지 않는다 — 비어 있는 오른쪽이 돌아왔다`,
  ).toBeLessThanOrEqual(1);
}

test.describe("관문 다운로드의 그리드", () => {
  for (const viewport of WIDTHS) {
    test(`${viewport.width}×${viewport.height} — 세 원소가 같은 x 에 서고 좌우가 같다`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedFirstRunSeen(page);
      /**
       * `load` plus an element wait, not `networkidle`: the autoplaying demo video keeps the network
       * busy at large viewports.
       */
      await page.goto("/ko/download/", { waitUntil: "load" });
      await expect(page.getByTestId("gateway-facts")).toBeVisible({ timeout: 15_000 });

      assertGrid(await measure(page), `${viewport.width}`);
    });
  }

  /** Both directions are measured: widening grows the origin, narrowing returns it to the gutter. */
  test("리사이즈하면 세 원소가 새 원점을 따라간다", async ({ page }) => {
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
      // The derivation is coalesced through rAF; measure once the column has stopped moving.
      await waitForBoxStill(page.getByTestId("gateway-facts"));
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
    // Idling guard for stage width: red if the stage stops growing at wide viewports.
    expect(
      sawStageChange,
      "폭 목록이 무대 폭을 한 번도 바꾸지 못했다 — 넓은 폭 비례 성장이 죽었다",
    ).toBe(true);
  });

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
});

test.describe("the headline types only its own sentence (council, 2026-09-03)", () => {
  /*
   * No decoder ghost glyph (it reads as a misspelling), and landing is opacity-only above 4px of
   * drift.
   */
  test("no ghost glyph, and the headline does not wander while it types", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 982 });
    await seedFirstRunSeen(page);
    await page.goto("/en/download/", { waitUntil: "load" });
    const samples: { ghosts: number; after: string; width: number; typed: number; total: number }[] = [];
    /*
     * Sampled every drawn frame **until the sentence is typed**, not for a stretch of wall time: a
     * fixed 2.6s window on a loaded runner can close before the typing it samples has begun. The
     * frame ceiling is a hang guard only; a healthy page finishes in about a hundred frames.
     */
    for (let frame = 0; frame < 3_000; frame += 1) {
      const sample = await page.evaluate(() => {
        const h1 = document.querySelector('[data-testid="gateway-hero"] h1')!;
        const cursor = h1.querySelector(".gateway-type-ch.is-cursor");
        return {
          ghosts: document.querySelectorAll("[data-ghost]").length,
          after: cursor ? getComputedStyle(cursor, "::after").content : "none",
          width: h1.getBoundingClientRect().width,
          typed: h1.querySelectorAll(".gateway-type-ch.is-on").length,
          total: h1.querySelectorAll(".gateway-type-ch").length,
        };
      });
      samples.push(sample);
      if (sample.total > 0 && sample.typed === sample.total) break;
      await waitFrames(page, 1);
    }
    const typing = samples.filter((s) => s.typed > 0);
    expect(samples.at(-1)!.typed, "the headline never finished typing").toBe(samples.at(-1)!.total);
    expect(typing.length, "typing was observed").toBeGreaterThanOrEqual(6);
    for (const s of typing) {
      expect(s.ghosts, "a ghost glyph is back").toBe(0);
      expect(s.after === "none" || s.after === "normal", `the caret slot draws ::after ${s.after}`).toBe(true);
    }
    const widths = typing.map((s) => s.width);
    expect(Math.max(...widths) - Math.min(...widths), "the headline's width wandered").toBeLessThanOrEqual(4);
  });

  test("the changelog is offered once per viewport on /download, and once in the chrome on /guide", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 982 });
    await seedFirstRunSeen(page);
    const visibleChangelogLinks = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
          .filter((a) => /\/changelog\/?$/.test(new URL(a.href).pathname))
          .filter((a) => {
            const r = a.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== "hidden";
          })
          .map((a) => a.getAttribute("data-testid")),
      );
    await page.goto("/en/download/", { waitUntil: "load" });
    // The list of links **is** the condition, so it is polled rather than slept in front of.
    await expect.poll(visibleChangelogLinks, { timeout: 20_000 }).toEqual(["gateway-facts-changelog"]);
    await page.goto("/en/guide/", { waitUntil: "load" });
    await expect
      .poll(visibleChangelogLinks, {
        timeout: 20_000,
        message: "the chrome keeps the chip off the gateway face",
      })
      .toContain("gateway-nav-changelog");
    const onGuide = await visibleChangelogLinks();
    expect(onGuide, "the chrome keeps the chip off the gateway face").toContain("gateway-nav-changelog");
  });
});

test.describe("the decision block reads over the stage at every split width", () => {
  /*
   * The object is the stage behind the first screen, so the contract is legibility over it: the lit
   * canvas share under the decision block and headline. Destinations keep their rows, none narrower
   * than its label.
   */
  /* 1280 and 1366 sit below the 90rem split, 1440 is its first band, 1512 a common laptop width. */
  /* Both engines draw this stage: the 2D engine is what a software renderer (this headless
     browser) gets, and `?hero=three` forces the WebGL object a hardware-backed browser gets
     (`HeroAtlas`). The type must stay clear of either. */
  for (const engine of ["2d", "three"] as const) {
  for (const width of [1280, 1440]) {
    test(`${width}px (${engine}) — every destination keeps its row, and the type stays clear of the ink`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedFirstRunSeen(page);
      await page.goto(engine === "three" ? "/en/download/?hero=three&e2e=1" : "/en/download/", { waitUntil: "load" });
      if (engine === "three") {
        await page.waitForFunction(
          () => document.querySelector('[data-testid="gateway-hero-object"]')?.getAttribute("data-hero-engine") === "three",
        );
      }
      await page.evaluate(() => document.fonts.ready);
      /*
       * Wait for layout and ink, not for the headline to finish typing: the h1 box is complete from the
       * first frame, and typing is starved under this headless browser's software WebGL.
       */
      await waitForBoxStill(page.locator('[data-testid="gateway-hero"]'));
      await waitForAnimationsDone(page.locator('[data-testid="gateway-hero-object"]'));
      const m = await page.evaluate(() => {
        const stage = document.querySelector('[data-testid="gateway-hero-object"]')!.getBoundingClientRect();
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="gateway-hero-object"] canvas')!;
        // The hero is a WebGL canvas with no 2D context; copy its last frame into one (`?e2e=1` keeps the
        // drawing buffer).
        const ctx =
          canvas.getContext("2d") ??
          (() => {
            const copy = document.createElement("canvas");
            copy.width = canvas.width;
            copy.height = canvas.height;
            const c2 = copy.getContext("2d")!;
            c2.drawImage(canvas, 0, 0);
            return c2;
          })();
        const dpr = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
        const litShare = (el: Element): number => {
          const r = el.getBoundingClientRect();
          const x0 = Math.max(0, Math.round((r.left - stage.left) * dpr));
          const y0 = Math.max(0, Math.round((r.top - stage.top) * dpr));
          const w = Math.max(1, Math.min(canvas.width - x0, Math.round(r.width * dpr)));
          const h = Math.max(1, Math.min(canvas.height - y0, Math.round(r.height * dpr)));
          const d = ctx.getImageData(x0, y0, w, h).data;
          let lit = 0;
          let total = 0;
          for (let i = 3; i < d.length; i += 16) {
            total += 1;
            if (d[i] > 40) lit += 1;
          }
          return total ? lit / total : 0;
        };
        const out: string[] = [];
        const rows = new Set<number>();
        for (const a of document.querySelectorAll('a[data-testid^="gateway-hero-"]')) {
          const r = a.getBoundingClientRect();
          rows.add(Math.round(r.top));
          if (a.scrollWidth > a.clientWidth + 1) out.push(`${a.getAttribute("data-testid")} is narrower than its label by ${a.scrollWidth - a.clientWidth}px`);
        }
        const block = document.querySelector('[data-testid="gateway-hero-cta"]')!.parentElement!.parentElement!;
        const widths = [...document.querySelectorAll('a[data-testid^="gateway-hero-"]')].map((a) => `${a.getAttribute("data-testid")}=${Math.round(a.getBoundingClientRect().width)}`);
        return {
          out,
          rows: rows.size,
          stageWidth: Math.round(stage.width),
          inkUnderHeadline: litShare(document.querySelector('[data-testid="gateway-hero"] h1')!),
          inkUnderBlock: litShare(block),
          widths,
        };
      });
      expect(m.out, `at ${width}`).toEqual([]);
      /* Two rows plus one for the destination the second row cannot hold; five is a column. */
      expect(m.rows, `the destinations stand ${m.rows} rows tall at ${width}: ${m.widths.join(" ")}`).toBeLessThanOrEqual(3);
      expect(m.stageWidth, "the stage is the hero's whole width").toBeGreaterThanOrEqual(width - 1);
      /* The thresholds leave room for narrower widths, where the plane sits closer to the type. */
      expect(m.inkUnderHeadline, `ink under the headline at ${width}`).toBeLessThanOrEqual(0.03);
      expect(m.inkUnderBlock, `ink under the decision block at ${width}`).toBeLessThanOrEqual(0.06);
    });
  }
  }
});
