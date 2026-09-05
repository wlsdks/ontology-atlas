import { expect, test } from "@playwright/test";

/**
 * Insights "to do" — **one screen must not count the same thing as two numbers.**
 *
 * ## What happened (measured 2026-08-07, sample vault)
 *
 * The tab badge read "to do **7**" while the group heading **immediately below** read
 * **8**. The difference was one duplicate pair: the two numbers each came from their
 * own **hand-maintained section list**, and duplicates were missing from only one.
 *
 * This screen's judgement module had already recorded the same accident in its own
 * preamble (#63: "to do 0" + "the graph is healthy" + "missing connections 1" all
 * showing at once). That fix inserted `meaningGaps` to make the values agree but
 * **left the two-list structure in place**, and the same disease returned at the next
 * section (duplicates).
 *
 * ## What cannot replace this check
 *
 * The values now branch from a single `Record<QueueSectionKey, number>`, so
 * **adding a section is blocked by the type checker first.** That is the primary
 * defence. This check covers what comes after — **whether the same number is
 * actually painted on screen**. Which value a badge reads, and the conditions under
 * which it is overridden to 0, are visible only in the render (this screen really
 * does have branches such as "0 concepts means a 0 badge").
 */

test.describe("인사이트 할 일 — 탭 배지와 목록 제목이 같은 수를 말한다", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  /**
   * **What changed on 2026-08-31.** The tab used to carry group badges and a repair-queue chip
   * row, and this check balanced the tab badge against their sum. The owner's one-list decision
   * removed both, so there are exactly **two** numbers on this screen now: the tab badge and the
   * list heading. Fewer places to disagree is the point of the change; that they still agree is
   * what this measures.
   */
  test("탭 배지 = 목록 제목이 말하는 규모", async ({ page }) => {
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("do-next-list")).toBeVisible({ timeout: 20_000 });

    const seen = await page.evaluate(() => {
      const text = (el: Element | null) => (el?.textContent ?? "").trim();
      const num = (s: string) => {
        const m = /(\d+)/.exec(s);
        return m ? Number(m[1]) : null;
      };
      const tab = [...document.querySelectorAll("button")].find((b) => /^할\s*일/.test(text(b)));
      const heading = document.querySelector('[data-testid="do-next-list-title"]');
      // Every counter that used to live on this tab. Any of them coming back means the same work
      // is being counted in a second place again.
      const removed = [
        "insights-agent-readiness",
        "insights-repair-queue",
        "insights-activity-digest",
        "do-next-groups",
      ].filter((id) => document.querySelector(`[data-testid="${id}"]`) !== null);
      return { tab: num(text(tab ?? null)), heading: num(text(heading)), removed };
    });

    // Idling guards — an unread badge makes the equation below hold because nothing was looked at.
    expect(seen.tab, "탭 배지를 못 읽었다 — 셀렉터가 낡았다").not.toBeNull();
    expect(seen.heading, "목록 제목의 수를 못 읽었다 — 셀렉터가 낡았다").not.toBeNull();
    expect(seen.tab, "샘플 볼트인데 할 일이 0이다 — 이 검사가 헛돈다").toBeGreaterThan(0);

    expect(
      seen.removed,
      "같은 일을 세는 자리가 다시 생겼다 — 「할 일」 탭은 목록 하나다",
    ).toEqual([]);
    expect(
      seen.heading,
      `탭 배지(${seen.tab}) ≠ 목록 제목(${seen.heading}). 같은 일을 두 수로 세고 있다 — ` +
        "둘 다 `insightsVerdict.total` 한 곳에서만 갈라져 나가야 한다",
    ).toBe(seen.tab);
  });
});

/**
 * **The large numbers count the same folder** (regression measured 2026-08-12).
 *
 * The census large numbers once reported **different values** from the smaller census line above
 * them — the line showed the user's vault (5 concepts, 4 relations) while the large numbers showed
 * the bundled sample (125, 258). The cause was the count-up intro: the first render drew the
 * sample and started counting 0→125, and if the user's vault arrived **within** that 400ms the
 * synchronising snap was overwritten by the next frame and it settled permanently on 125. That
 * screen's subtitle says every number is computed from your documents, while the numbers were
 * counting the sample.
 *
 * **What changed on 2026-09-06.** The monospace census line in the header corner is gone; the
 * census moved into a four-tile strip above the tab bar, and the tab bar's own badges
 * (`composition N` / `connections N`) are now the second reading of the same two facts. So this
 * measures the tiles against the badges. The mechanism is locked by `use-count-up.test.ts`; this
 * covers the layer above — **whether the same number is actually painted on screen.** It attaches
 * a vault (stubbed picker), waits for the intro to finish, and reads both together. It asserts
 * value agreement rather than timing, so it is independent of machine speed.
 */
test.describe("인사이트 인구조사 — 타일 큰 숫자와 탭 배지가 같은 폴더를 센다", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("개념·관계 대형 숫자 = 구성·연결 탭 배지", async ({ page }) => {
    const { seedFirstRunSeen } = await import("./first-run-seed");
    const { stubDirectoryPicker } = await import("./vault-picker-stub");
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, {
      "shop.md": [
        "---",
        "uid: 11111111-1111-4111-8111-111111111111",
        "slug: shop",
        "kind: project",
        "title: Census Shop",
        "contains:",
        "  - capabilities/pay",
        "---",
        "",
        "# Census Shop",
        "",
      ].join("\n"),
      "capabilities/pay.md": [
        "---",
        "uid: 22222222-2222-4222-8222-222222222222",
        "slug: capabilities/pay",
        "kind: capability",
        "title: Pay",
        "---",
        "",
        "# Pay",
        "",
      ].join("\n"),
    });

    await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-starter-open").click();
    await page.getByTestId("vault-guide-pick-existing").click();
    await expect(page.getByTestId("topology-index-panel")).toContainText("Census Shop", {
      timeout: 30_000,
    });

    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    // Long enough to outlast the 400ms intro — and the sample→vault swap falls inside it.
    await page.waitForTimeout(2_000);

    const seen = await page.evaluate(() => {
      const text = (el: Element | null) => (el?.textContent ?? "").trim();
      const badge = (label: RegExp) => {
        const tab = [...document.querySelectorAll("button")].find((b) => label.test(text(b)));
        const match = /(\d+)/.exec(text(tab ?? null));
        return match ? Number(match[1]) : null;
      };
      const bignums = [...document.querySelectorAll('[data-testid="insights-bignum"]')].map((el) => {
        const animated = el.querySelector("[data-insights-animated-value]");
        const exact = el.querySelector("[data-insights-exact-value]");
        const read = (node: Element | null) =>
          Number(/(\d[\d,]*)/.exec(node?.textContent ?? "")?.[1]?.replace(/,/g, "") ?? NaN);
        return { animated: read(animated), exact: read(exact) };
      });
      return {
        composition: badge(/^구성/),
        connections: badge(/^연결/),
        bignums,
        tiles: document.querySelectorAll('[data-testid="insights-census-tile"]').length,
      };
    });

    console.log(
      `[census-agreement] badges ${seen.composition}/${seen.connections} · painted ${seen.bignums
        .map((value) => value.animated)
        .join(", ")} · exact ${seen.bignums.map((value) => value.exact).join(", ")}`,
    );

    // Idling guards: with no tiles or no badges, nothing was measured.
    expect(seen.tiles, "인구조사 타일이 없다 — 이 시험이 공회전한다").toBe(4);
    expect(seen.composition, "구성 배지를 못 읽었다 — 셀렉터가 낡았다").not.toBeNull();
    expect(seen.connections, "연결 배지를 못 읽었다 — 셀렉터가 낡았다").not.toBeNull();
    expect(seen.bignums.length, "대형 숫자를 하나도 못 찾았다").toBeGreaterThanOrEqual(2);

    expect(seen.bignums[0].animated, `화면의 개념 숫자가 구성 배지(${seen.composition})와 다르다`).toBe(
      seen.composition,
    );
    expect(seen.bignums[1].animated, `화면의 관계 숫자가 연결 배지(${seen.connections})와 다르다`).toBe(
      seen.connections,
    );
    expect(seen.bignums[0].exact, `접근성 개념 숫자가 구성 배지(${seen.composition})와 다르다`).toBe(
      seen.composition,
    );
    expect(seen.bignums[1].exact, `접근성 관계 숫자가 연결 배지(${seen.connections})와 다르다`).toBe(
      seen.connections,
    );
  });
});

test.describe("인사이트 구성 — 도메인 행이 한 축과 읽을 수 있는 꼬리를 공유한다", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("Storefront 아홉 행의 192px 꼬리가 잘리지 않고 트랙 끝이 정렬된다", async ({ page }) => {
    const { seedFirstRunSeen } = await import("./first-run-seed");
    await seedFirstRunSeen(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("demo:sample-source:v1", "storefront");
      window.sessionStorage.setItem("demo:first-run-starter-dismissed:v1", "1");
    });
    await page.goto("/en/ontology/insights/?guides=off&tab=composition", {
      waitUntil: "domcontentloaded",
    });

    const rows = page.getByTestId("domain-capacity-bar-row");
    await expect(rows).toHaveCount(9, { timeout: 20_000 });
    const kindStack = page.getByTestId("insights-kind-stack");
    await expect(kindStack).toBeVisible();
    const kindStackMetrics = await kindStack.evaluate((element) => {
      const segments = [...element.querySelectorAll<HTMLElement>('[data-testid="insights-kind-stack-segment"]')]
        .map((segment) => segment.getBoundingClientRect());
      return {
        gap: Number.parseFloat(getComputedStyle(element).columnGap),
        segmentCount: segments.length,
        seams: segments.slice(1).map((segment, index) => segment.left - segments[index].right),
      };
    });
    expect(kindStackMetrics.segmentCount).toBe(4);
    expect(kindStackMetrics.gap).toBeCloseTo(1, 1);
    expect(kindStackMetrics.seams.every((gap) => gap >= 0.9)).toBe(true);
    const metrics = await rows.evaluateAll((elements) =>
      elements.map((row) => {
        const tail = row.querySelector<HTMLElement>('[data-testid="domain-capacity-bar-tail"]');
        const breakdown = row.querySelector<HTMLElement>('[data-testid="domain-capacity-bar-breakdown"]');
        const track = row.querySelector<HTMLElement>('[data-testid="domain-capacity-bar-track"]');
        if (!tail || !breakdown || !track) return null;
        return {
          rowOverflow: row.scrollWidth - row.clientWidth,
          tailWidth: tail.getBoundingClientRect().width,
          tailCssWidth: Number.parseFloat(getComputedStyle(tail).width),
          breakdownOverflow: breakdown.scrollWidth - breakdown.clientWidth,
          trackRight: track.getBoundingClientRect().right,
        };
      }),
    );
    expect(metrics.every(Boolean), "every domain row must expose track, tail, and breakdown").toBe(true);
    const concrete = metrics.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    expect(concrete.every(({ rowOverflow }) => rowOverflow <= 1)).toBe(true);
    expect(concrete.every(({ breakdownOverflow }) => breakdownOverflow <= 1)).toBe(true);
    expect(concrete.every(({ tailCssWidth }) => Math.abs(tailCssWidth - 192) <= 1)).toBe(true);
    const tailVariance = Math.max(...concrete.map(({ tailWidth }) => tailWidth)) -
      Math.min(...concrete.map(({ tailWidth }) => tailWidth));
    const trackEndVariance = Math.max(...concrete.map(({ trackRight }) => trackRight)) -
      Math.min(...concrete.map(({ trackRight }) => trackRight));
    expect(tailVariance).toBeLessThanOrEqual(1);
    expect(trackEndVariance).toBeLessThanOrEqual(1);
  });
});
