import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **The edge hover card covers nothing the map drew** (2026-09-19).
 *
 * The card sat at the pointer's lower right, always. On the sample map at
 * 1512×806, hovering the catalog-to-inventory line put it squarely over the
 * fulfillment node and its name: the card explained one relation by hiding
 * another concept. The
 * card now tries the four corners around the pointer and takes the first that
 * covers no drawn disc or name.
 *
 * Measured, not eyeballed: for each domain-to-domain line, the pointer goes to
 * the midpoint of the drawn curve, and the card's rect is compared with every
 * drawn disc and name. The assertion is conditional the same way the placement
 * is — when some corner of that pointer is clear, the card must be clear too; a
 * pointer boxed in on all four sides is allowed the least overlap.
 */
test("hovering a line puts the card beside the drawn nodes, not on them", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 806 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapStill(page);

  const edges = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const drawn = new Set(probe.nodes().filter((node) => !node.hidden && (node.alpha ?? 1) > 0.05).map((node) => node.id));
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    return probe
      .edges()
      .filter((edge) => edge.sourceId.startsWith("domain:") && edge.targetId.startsWith("domain:") && drawn.has(edge.sourceId) && drawn.has(edge.targetId))
      .map((edge) => {
        const t = 0.5;
        const mx = (1 - t) * (1 - t) * edge.ax + 2 * (1 - t) * t * edge.controlX + t * t * edge.bx;
        const my = (1 - t) * (1 - t) * edge.ay + 2 * (1 - t) * t * edge.controlY + t * t * edge.by;
        return { id: `${edge.sourceId}→${edge.targetId}`, x: box.left + mx, y: box.top + my };
      });
  });
  expect(edges.length, "도메인 사이 선이 없으면 이 스펙은 공회전한다").toBeGreaterThan(3);

  let judged = 0;
  const covered: string[] = [];
  for (const edge of edges) {
    await page.mouse.move(edge.x, edge.y);
    const card = page.getByTestId("map-edge-hover-card");
    try {
      await expect(card).toBeVisible({ timeout: 2_000 });
    } catch {
      continue; // The midpoint missed the line's hit band; the next line will do.
    }
    // Let the measured size settle the corner before reading it.
    await page.waitForTimeout(80);
    const verdict = await page.evaluate(
      ({ pointer }) => {
        const probe = window.__atlasMap!;
        const cardBox = document.querySelector('[data-testid="map-edge-hover-card"]')!.getBoundingClientRect();
        const cardRect = { x: cardBox.left, y: cardBox.top, w: cardBox.width, h: cardBox.height };
        const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
        // Discs and names alike: a card over a name hides as much as a card over a disc.
        const drawn = [
          ...probe
            .nodes()
            .filter((node) => !node.hidden && node.radius > 0 && (node.alpha ?? 1) > 0.05)
            .map((node) => ({ x: canvas.left + node.x - node.radius, y: canvas.top + node.y - node.radius, w: node.radius * 2, h: node.radius * 2 })),
          ...probe
            .labels()
            .map((label) => ({ x: canvas.left + label.minX, y: canvas.top + label.minY, w: label.maxX - label.minX, h: label.maxY - label.minY })),
        ];
        type Box = { x: number; y: number; w: number; h: number };
        const meets = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        const hits = (rect: Box) => drawn.filter((d) => meets(rect, d)).length;
        /*
         * A corner counts as free only on the card's own terms (hover-card-placement.ts and
         * OntologyMapEdgeHoverCard.tsx): visibly clear of every disc and name (the 6 px margin),
         * clear of the chrome over the canvas (the INDEX panel and every control), and clamped
         * into the window. Judged on bare shapes instead, a corner the card rightly refuses —
         * touching a name, or under the INDEX panel — read as a free corner it ignored, and
         * the spec failed on Linux CI's font metrics while the card did what it promises.
         */
        const margin = 6;
        const clearOf = drawn.map((d) => ({ x: d.x - margin, y: d.y - margin, w: d.w + 2 * margin, h: d.h + 2 * margin }));
        const chrome: Box[] = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="tab"], [role="button"], [data-testid="topology-index-panel"]')]
          .filter((el) => !document.querySelector('[data-testid="ontology-map-canvas"]')!.contains(el) && !el.closest('[aria-hidden="true"], [inert]'))
          .map((el) => el.getBoundingClientRect())
          .filter((b) => b.width > 0 && b.height > 0)
          .map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height }));
        const edgeMargin = 8;
        const clamp = (r: Box): Box => ({
          ...r,
          x: Math.min(Math.max(r.x, edgeMargin), window.innerWidth - edgeMargin - r.w),
          y: Math.min(Math.max(r.y, edgeMargin), window.innerHeight - edgeMargin - r.h),
        });
        const offset = 14;
        const corners = [
          { x: pointer.x + offset, y: pointer.y + offset },
          { x: pointer.x - offset - cardRect.w, y: pointer.y + offset },
          { x: pointer.x + offset, y: pointer.y - offset - cardRect.h },
          { x: pointer.x - offset - cardRect.w, y: pointer.y - offset - cardRect.h },
        ].map((corner) => clamp({ ...corner, w: cardRect.w, h: cardRect.h }));
        const coversPointer = (corner: Box) =>
          pointer.x >= corner.x && pointer.x <= corner.x + corner.w && pointer.y >= corner.y && pointer.y <= corner.y + corner.h;
        const free = (corner: Box) =>
          !clearOf.some((d) => meets(corner, d)) && !chrome.some((c) => meets(corner, c)) && !coversPointer(corner);
        return { cardHits: hits(cardRect), someCornerClear: corners.some(free) };
      },
      { pointer: { x: edge.x, y: edge.y } },
    );
    if (!verdict.someCornerClear) continue;
    judged += 1;
    if (verdict.cardHits > 0) covered.push(edge.id);
    await page.mouse.move(edge.x + 200, 30); // off the line, so the next hover is a fresh card
    await expect(card).toBeHidden({ timeout: 2_000 });
  }
  expect(judged, "판정할 수 있는 선이 하나도 없었다").toBeGreaterThan(0);
  expect(covered, "카드가 그려진 노드를 덮은 선").toEqual([]);
});
