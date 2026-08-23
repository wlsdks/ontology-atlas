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

test.describe("인사이트 할 일 — 탭 배지와 묶음 배지가 같은 수를 말한다", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("탭 배지 = 묶음 배지 합 + 수리 큐의 차단 신호", async ({ page }) => {
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1800);

    const seen = await page.evaluate(() => {
      const text = (el: Element | null) => (el?.textContent ?? "").trim();
      const num = (s: string) => {
        const m = /(\d+)/.exec(s);
        return m ? Number(m[1]) : null;
      };

      const tab = [...document.querySelectorAll("button")].find((b) => /^할\s*일/.test(text(b)));
      const groups = [...document.querySelectorAll('[data-testid^="do-next-group-"]')]
        .filter((el) => (el.getAttribute("data-testid") ?? "").endsWith("-count"))
        .map((el) => num(text(el)) ?? 0);

      // The repair queue's blocking signals (isolated islands, missing connections) are
      // separate signals rather than queue sections, so they enter the tab badge but not
      // the group badge. Both are read from the screen to balance the equation.
      //
      // ⚠️ **Do not read this as `num(parent text)`** — the first attempt did, grabbed a
      // container further up, and read the concept count **112** as a blocking signal.
      // Match a whole chip's shape (`"0 isolated islands"`) instead, so a failed match turns the
      // count assertion below red rather than **silently yielding 0**.
      const CHIP = /^(\d+)\s*(분리된 섬|누락된 연결)$/;
      const repair = [...document.querySelectorAll("*")]
        .filter((el) => el.childElementCount === 0 && /분리된 섬|누락된 연결/.test(text(el)))
        .map((el) => CHIP.exec((el.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim()))
        .filter(Boolean)
        .map((m) => Number(m![1]));

      return { tab: num(text(tab ?? null)), groups, repair };
    });

    // Idling guard — an unread badge makes the equation below hold because nothing was looked at.
    expect(seen.tab, "탭 배지를 못 읽었다 — 셀렉터가 낡았다").not.toBeNull();
    expect(seen.groups.length, "묶음 배지를 하나도 못 찾았다").toBeGreaterThan(0);
    expect(seen.tab, "샘플 볼트인데 할 일이 0이다 — 이 검사가 헛돈다").toBeGreaterThan(0);
    // Failing to read the two blocking-signal chips silently shrinks the right-hand side.
    expect(seen.repair.length, "수리 큐의 차단 칩(분리된 섬 · 누락된 연결)을 못 읽었다").toBe(2);

    const groupSum = seen.groups.reduce((a, b) => a + b, 0);
    const blocking = seen.repair.reduce((a, b) => a + b, 0);

    expect(
      seen.tab,
      `탭 배지(${seen.tab}) ≠ 묶음 배지 합(${groupSum}) + 차단 신호(${blocking}). ` +
        "같은 일을 두 수로 세고 있다 — 섹션 총계는 " +
        "`queueSectionTotals` 한 곳에서만 갈라져 나가야 한다",
    ).toBe(groupSum + blocking);
  });
});

/**
 * **The large numbers count the same folder** (regression measured 2026-08-12).
 *
 * The composition tab's large numbers (concepts, relations) reported **different
 * values** from the chips above — the chips showed the user's vault (5 concepts, 4
 * relations) while the large numbers showed the bundled sample (125, 258). The cause
 * was the count-up intro: the first render drew the sample and started counting
 * 0→125, and if the user's vault arrived **within** that 400ms the synchronising snap
 * was overwritten by the next frame and it settled permanently on 125. That screen's
 * subtitle says every number is computed from your documents, while the numbers were
 * counting the sample.
 *
 * The mechanism is locked by `use-count-up.test.ts`. This test covers the layer above
 * — **whether the same number is actually painted on screen.** It attaches a vault
 * (stubbed picker), waits for the intro to finish, and reads the large numbers and
 * the chips together. It asserts value agreement rather than timing, so it is
 * independent of machine speed.
 */
test.describe("인사이트 구성 — 큰 숫자와 상단 칩이 같은 폴더를 센다", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("개념·관계 대형 숫자 = 상단 칩", async ({ page }) => {
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

    await page.goto("/ko/ontology/insights/?guides=off&tab=composition", {
      waitUntil: "domcontentloaded",
    });
    // Long enough to outlast the 400ms intro — and the sample→vault swap falls inside it.
    await page.waitForTimeout(2_000);

    const seen = await page.evaluate(() => {
      const chip = [...document.querySelectorAll("header span")].map((el) => (el.textContent ?? "").trim())
        .find((text) => /개념/.test(text) && /관계/.test(text));
      const bignums = [...document.querySelectorAll('[data-testid="insights-bignum"]')].map((el) => {
        const animated = el.querySelector("[data-insights-animated-value]");
        const exact = el.querySelector("[data-insights-exact-value]");
        const read = (node: Element | null) =>
          Number(/(\d[\d,]*)/.exec(node?.textContent ?? "")?.[1]?.replace(/,/g, "") ?? NaN);
        return { animated: read(animated), exact: read(exact) };
      });
      return { chip: chip ?? null, bignums };
    });

    expect(seen.chip, "상단 칩을 못 찾았다 — 이 시험이 공회전한다").not.toBeNull();
    const chipConcepts = Number(/(\d+)\s*개념/.exec(seen.chip!)?.[1]);
    const chipRelations = Number(/(\d+)\s*관계/.exec(seen.chip!)?.[1]);
    console.log(
      `[census-agreement] 칩 ${seen.chip} · painted ${seen.bignums.map((value) => value.animated).join(", ")} · exact ${seen.bignums.map((value) => value.exact).join(", ")}`,
    );

    // Idling guard: with no large numbers present, nothing was measured.
    expect(seen.bignums.length, "대형 숫자를 하나도 못 찾았다").toBeGreaterThanOrEqual(2);
    expect(seen.bignums[0].animated, `화면의 개념 숫자가 칩(${chipConcepts})과 다르다`).toBe(chipConcepts);
    expect(seen.bignums[1].animated, `화면의 관계 숫자가 칩(${chipRelations})과 다르다`).toBe(chipRelations);
    expect(seen.bignums[0].exact, `접근성 개념 숫자가 칩(${chipConcepts})과 다르다`).toBe(chipConcepts);
    expect(seen.bignums[1].exact, `접근성 관계 숫자가 칩(${chipRelations})과 다르다`).toBe(chipRelations);
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
