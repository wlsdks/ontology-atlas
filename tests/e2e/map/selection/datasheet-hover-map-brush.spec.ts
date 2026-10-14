import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import type {} from "../../atlas-map-probe";
import { waitForMapStill, waitFrames } from "../../settle";

/**
 * State and pixels are measured together: state alone can be right while nothing is drawn,
 * and pixels alone cannot tell the wrong node. reducedMotion removes ambient animation;
 * the noise measurement sets the threshold.
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
  await waitForMapStill(page);

  // Select one node to open the datasheet (a canvas-coordinate click, the same method as `map-trail.spec.ts`).
  const target = await page.evaluate(() => {
    const probe = window.__atlasMap;
    const box = document
      .querySelector('[data-testid="ontology-map-canvas"]')
      ?.getBoundingClientRect();
    const node = probe?.nodes().find((n) => !n.hidden && n.label === "주문");
    return node && box ? { px: box.left + node.x, py: box.top + node.y } : null;
  });
  expect(target, "주문 도메인을 못 찾았다 — 공회전").not.toBeNull();
  await page.mouse.click(target!.px, target!.py);
  await expect
    .poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId), { timeout: 15_000 })
    .toBe("domain:order");

  const hover = () => page.evaluate(() => window.__atlasMap!.hover());

  /**
   * Compare in the page and send only the count:
   * raw pixels over the CDP bridge cost about 12s per capture.
   */
  const captureBaseline = () =>
    page.evaluateHandle(() => {
      const canvas = document.querySelector(
        '[data-testid="ontology-map-canvas"]',
      ) as HTMLCanvasElement;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    });
  const changedSince = (baseline: Awaited<ReturnType<typeof captureBaseline>>) =>
    page.evaluate((base) => {
      const canvas = document.querySelector(
        '[data-testid="ontology-map-canvas"]',
      ) as HTMLCanvasElement;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const now = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0;
      for (let i = 0; i < base.length; i += 4) {
        if (
          base[i] !== now[i] ||
          base[i + 1] !== now[i + 1] ||
          base[i + 2] !== now[i + 2] ||
          base[i + 3] !== now[i + 3]
        )
          n += 1;
      }
      return n;
    }, baseline);
  /** Parks the cursor on empty space off the map — neither a canvas nor a panel hover. */
  const parkCursor = async () => {
    await page.mouse.move(20, 20);
    // Parked means the map is pointing at nothing — the state itself, not 900 ms.
    await expect.poll(hover, { message: "커서를 치웠는데 지도가 계속 가리킨다" }).toBeNull();
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
  const base = await captureBaseline();
  // The noise floor is "what two frames differ by with nothing done", so some frames
  // have to be drawn. Counting them in frames measures the thing the number is about.
  await waitFrames(page, 42);
  const noise = await changedSince(base);

  // ① Hovering the row — the state is that node and the screen really changes.
  await page.locator(`[data-datasheet-connection="${drawnRow!.id}"]`).hover();
  await expect.poll(hover, { message: "지도가 그 노드를 가리키지 않는다" }).toBe(drawnRow!.id);
  // …and the frames that carry the change onto the canvas.
  await waitFrames(page, 3);
  const hoveredPixels = await changedSince(base);
  expect(
    hoveredPixels,
    `호버 상태는 맞는데 화면은 그대로다 (바뀐 픽셀 ${hoveredPixels}, 소음 ${noise})`,
  ).toBeGreaterThan(Math.max(200, noise * 4));

  // ② Leaving restores it — a highlight left on the map is a new defect.
  await parkCursor();
  expect(await hover()).toBeNull();
  expect(await changedSince(base), "커서를 뗐는데 화면이 안 돌아온다").toBeLessThanOrEqual(noise);

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
    await expect.poll(hover, { message: "근거 문서 행이 지도를 가리키지 않는다" }).not.toBeNull();
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
  // An **absence**: polling for null would pass on the null already standing. The
  // hover handler runs on the pointer event, so the frames right after the hover are
  // where a reaction would already be.
  await waitFrames(page, 3);
  expect(await hover(), "패널 아무 데나 올려도 지도가 반응한다").toBeNull();

  expect(pageErrors, "호버 도중 콘솔 예외").toEqual([]);
});
