import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import type {} from "./atlas-map-probe";

/**
 * **Hovering a datasheet row makes the map beside it point at that node.**
 *
 * Owner request 2026-08-17: *"이부분들 각각 마우스 올리면 옆에 지도에서 반짝이면서
 * 표시되면 좋겠는데 가능할까? 지금은 아무 반응이 없어서.."* (it would be good if
 * hovering each of these highlighted it on the map beside them — right now nothing
 * responds).
 *
 * **Why both state and pixels are measured.** Measuring only one of the two lets
 * this feature **die while staying green**, and it really was dead that way when
 * this spec was written:
 *
 * | What is measured | What it misses |
 * |---|---|
 * | State only (`__atlasMap.hover()`) | The value is right while **nothing is drawn on screen**. While a node is selected the emphasis ramp is 0, so the hover ring's alpha was 0 too — measured **0 pixels** |
 * | Pixels only | It says only "something changed". Pointing at **the wrong node** still passes |
 *
 * So state (does `hover()` return that node) and screen (do canvas pixels really
 * change) are measured in the same step.
 *
 * **Is the instrument idling.** Each step is preceded by a **noise measurement**
 * (two captures with nothing done in between). If noise is non-zero, the claim "N
 * pixels changed because of the hover" does not hold, so the threshold becomes a
 * multiple of the noise. Measuring under `reducedMotion` is for the same reason —
 * the map's ambient animation (comets, breathing) must be off to isolate the
 * pixels a hover changed, and it simultaneously proves **the highlight does not
 * rely on movement** (this repository forbids blinking and glow).
 */
test("데이터시트 줄 호버 — 지도가 그 노드를 가리키고, 떼면 되돌아온다", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.setViewportSize({ width: 1512, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);

  // Select one node to open the datasheet (a canvas-coordinate click, the same method as `map-trail.spec.ts`).
  const target = await page.evaluate(() => {
    const probe = window.__atlasMap;
    const box = document
      .querySelector('[data-testid="topology-map-v2-canvas"]')
      ?.getBoundingClientRect();
    const node = probe?.nodes().find((n) => !n.hidden && n.label === "주문");
    return node && box ? { px: box.left + node.x, py: box.top + node.y } : null;
  });
  expect(target, "주문 도메인을 못 찾았다 — 공회전").not.toBeNull();
  await page.mouse.click(target!.px, target!.py);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe("domain:order");

  const hover = () => page.evaluate(() => window.__atlasMap!.hover());
  /** Raw canvas pixels — the only evidence of what was actually drawn. */
  const pixels = () =>
    page.evaluate(() => {
      const canvas = document.querySelector(
        '[data-testid="topology-map-v2-canvas"]',
      ) as HTMLCanvasElement;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    });
  const changed = (a: number[], b: number[]) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3])
        n += 1;
    }
    return n;
  };
  /** Parks the cursor on empty space off the map — neither a canvas nor a panel hover. */
  const parkCursor = async () => {
    await page.mouse.move(20, 20);
    await page.waitForTimeout(900);
  };

  // Pick a relation row whose node is **currently drawn on the map**. (A child
  // folded by the density gate has no node to draw, so nothing changes — a limit of
  // the feature rather than a violation of this contract, so it is not measured
  // here.)
  const rows = await page.evaluate(() => {
    const byId = new Map(window.__atlasMap!.nodes().map((n) => [n.id, n]));
    return [...document.querySelectorAll("[data-datasheet-connection]")].map((el) => {
      const id = el.getAttribute("data-datasheet-connection")!;
      return { id, drawn: byId.get(id)?.hidden === false };
    });
  });
  const drawnRow = rows.find((r) => r.drawn);
  expect(drawnRow, "지도에 그려진 이웃이 한 줄도 없다 — 이 스펙은 아무것도 못 잰다").toBeTruthy();

  // Noise — the difference between two frames with nothing done. The numbers below only mean something at 0.
  const base = await pixels();
  await page.waitForTimeout(700);
  const noise = changed(base, await pixels());

  // ① Hovering the row — the state is that node and the screen really changes.
  await page.locator(`[data-datasheet-connection="${drawnRow!.id}"]`).hover();
  await page.waitForTimeout(900);
  expect(await hover(), "지도가 그 노드를 가리키지 않는다").toBe(drawnRow!.id);
  const hoveredPixels = changed(base, await pixels());
  expect(
    hoveredPixels,
    `호버 상태는 맞는데 화면은 그대로다 (바뀐 픽셀 ${hoveredPixels}, 소음 ${noise})`,
  ).toBeGreaterThan(Math.max(200, noise * 4));

  // ② Leaving restores it — a highlight left on the map is a new defect.
  await parkCursor();
  expect(await hover()).toBeNull();
  expect(changed(base, await pixels()), "커서를 뗐는데 화면이 안 돌아온다").toBeLessThanOrEqual(
    noise,
  );

  // ③ Evidence document rows — the name arriving is a **vault slug** and must go
  //    through a table to become a map id. This is where two namespaces meet, and
  //    the feature has died here before
  //    (`src/entities/knowledge-graph/lib/chat-node-index.ts`).
  const evidenceSlug = await page.evaluate(
    () =>
      document.querySelector("[data-datasheet-evidence]")?.getAttribute("data-datasheet-evidence") ??
      null,
  );
  if (evidenceSlug !== null) {
    await page.locator(`[data-datasheet-evidence="${evidenceSlug}"]`).hover();
    await page.waitForTimeout(700);
    const resolved = await hover();
    const mapIds = await page.evaluate(() => window.__atlasMap!.nodes().map((n) => n.id));
    expect(resolved, "근거 문서 행이 지도 이름 공간으로 안 옮겨졌다").not.toBe(evidenceSlug);
    expect(mapIds, "근거 문서 행이 지도에 없는 이름을 가리킨다").toContain(resolved);
    await parkCursor();
    expect(await hover()).toBeNull();
  }

  // ④ Hovering a non-node area (a group heading) leaves the map still — the
  //    highlight is bound to a row, not to the panel.
  await page.locator('[data-datasheet-group-total="contains"]').hover();
  await page.waitForTimeout(700);
  expect(await hover(), "패널 아무 데나 올려도 지도가 반응한다").toBeNull();

  expect(pageErrors, "호버 도중 콘솔 예외").toEqual([]);
});
