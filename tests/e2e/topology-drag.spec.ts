import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1920, height: 1080 } });

async function openTopology(page: Page) {
  await page.goto("/en/topology/");
  const viewport = page.getByTestId("sigma-topology-viewport");
  await expect(viewport).toBeVisible({
    timeout: 20_000,
  });
  await expect(viewport).toHaveAttribute(
    "data-initial-reveal-motion-contract",
    "opacity-only-fast-ready-reveal",
  );
  await expect(viewport).toHaveAttribute(
    "data-initial-reveal-transform-policy",
    "no-scale-during-initial-load",
  );
  await expect(viewport).toHaveAttribute("data-initial-reveal-duration-ms", "180");
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-skeleton-cards-ready",
    "true",
    { timeout: 20_000 },
  );
  await page.waitForTimeout(600);
}

async function rectOf(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("missing bounding box");
  return box;
}

test("Relief 지형도에서 드래그가 연결 카드 그룹을 함께 이동한다", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await openTopology(page);

  const target = page.locator("[data-skeleton-card]", { hasText: "Views" }).first();
  await expect(target).toBeVisible();
  const before = await rectOf(target);
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-hull-render-policy",
    "suppressed-boxless-connectors",
  );
  await expect(target).toHaveAttribute(
    "data-card-selection-box-policy",
    "boxless-border-state",
  );
  await expect(page.locator("[data-drag-cluster-hull]")).toHaveCount(0);
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-reposition-policy",
    "raf-coalesced-pointer-move",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-visible-card-state-cache-contract",
    "rect-and-visibility-single-pass",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-visible-card-rect-read-policy",
    "frame-state-no-computed-style",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-frame-budget-contract",
    "measured-reposition-duration",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-active-drag-cluster-size",
    /^[2-9]\d*$/,
  );
  const companionSlug = await page
    .locator('[data-skeleton-card][data-drag-cluster="true"]')
    .evaluateAll((els) => {
      const companion = els.find((el) => !el.textContent?.includes("Views"));
      return companion?.getAttribute("data-slug") ?? null;
    });
  if (!companionSlug) {
    throw new Error("dragging Views should expose a connected companion");
  }
  const companion = page.locator(
    `[data-skeleton-card][data-slug="${companionSlug}"]`,
  );
  const companionBefore = await rectOf(companion);
  await page.mouse.move(before.x + before.width / 2 + 140, before.y + before.height / 2 + 70, {
    steps: 8,
  });
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-dragging-active",
    "true",
  );
  const dragFrameBudgetProof = await page.getByTestId("sigma-skeleton-cards").evaluate((el) => ({
    lastMs: Number(el.getAttribute("data-reposition-duration-last-ms") ?? "NaN"),
    maxMs: Number(el.getAttribute("data-reposition-duration-max-ms") ?? "NaN"),
    passContract: el.getAttribute("data-reposition-pass-duration-contract") ?? "",
    slowestPass: el.getAttribute("data-reposition-pass-slowest") ?? "",
    slowestPassMs: Number(el.getAttribute("data-reposition-pass-slowest-ms") ?? "NaN"),
    maxSlowestPass: el.getAttribute("data-reposition-max-pass-slowest") ?? "",
    maxSlowestPassMs: Number(el.getAttribute("data-reposition-max-pass-slowest-ms") ?? "NaN"),
    relationLabelDragLayoutPolicy:
      el.getAttribute("data-relation-label-drag-layout-policy") ?? "",
    relationLabelGeometrySource:
      el.getAttribute("data-relation-label-geometry-source") ?? "",
  }));
  expect(Number.isFinite(dragFrameBudgetProof.lastMs)).toBe(true);
  expect(Number.isFinite(dragFrameBudgetProof.maxMs)).toBe(true);
  expect(Number.isFinite(dragFrameBudgetProof.slowestPassMs)).toBe(true);
  expect(Number.isFinite(dragFrameBudgetProof.maxSlowestPassMs)).toBe(true);
  expect(dragFrameBudgetProof.lastMs).toBeGreaterThanOrEqual(0);
  expect(dragFrameBudgetProof.maxMs).toBeGreaterThanOrEqual(dragFrameBudgetProof.lastMs);
  expect(dragFrameBudgetProof.passContract).toBe("phase-duration-breakdown");
  expect(["card-placement", "visibility-cache", "connector-label", "popup"]).toContain(
    dragFrameBudgetProof.slowestPass,
  );
  expect(["card-placement", "visibility-cache", "connector-label", "popup"]).toContain(
    dragFrameBudgetProof.maxSlowestPass,
  );
  expect(dragFrameBudgetProof.slowestPassMs).toBeGreaterThanOrEqual(0);
  expect(dragFrameBudgetProof.maxSlowestPassMs).toBeGreaterThanOrEqual(0);
  expect(dragFrameBudgetProof.relationLabelDragLayoutPolicy).toBe("drag-only-svg-labels");
  expect(dragFrameBudgetProof.relationLabelGeometrySource).toBe("drag-only-label-layout-pass");
  const workerFrameProof = await page.getByTestId("sigma-topology-viewport").evaluate((el) => ({
    applied: Number(el.getAttribute("data-layout-worker-position-frame-applied-count") ?? "0"),
    contract: el.getAttribute("data-layout-worker-frame-stats-contract") ?? "",
    epsilon: Number(el.getAttribute("data-layout-worker-position-frame-epsilon-px") ?? "0"),
    received: Number(el.getAttribute("data-layout-worker-position-frame-received-count") ?? "0"),
    skipped: Number(el.getAttribute("data-layout-worker-position-frame-skipped-count") ?? "0"),
  }));
  expect(workerFrameProof.contract).toBe("epsilon-skip-position-frames");
  expect(workerFrameProof.epsilon).toBe(0.05);
  expect(workerFrameProof.received).toBeGreaterThanOrEqual(0);
  expect(workerFrameProof.applied + workerFrameProof.skipped).toBe(workerFrameProof.received);
  await expect(target).toHaveAttribute("data-dragging-active", "true");
  await expect(companion).toHaveAttribute("data-drag-cluster", "true");
  const after = await rectOf(target);
  const companionAfter = await rectOf(companion);
  expect(Math.abs(companionAfter.x - companionBefore.x - (after.x - before.x))).toBeLessThan(72);
  expect(Math.abs(companionAfter.y - companionBefore.y - (after.y - before.y))).toBeLessThan(72);
  await page.mouse.up();
  await page.waitForTimeout(650);
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-settle-overlap-read-policy",
    "reuse-visible-card-rect-cache",
  );
  expect(consoleErrors, consoleErrors.join("\n")).toHaveLength(0);
});

test("Relief dogfood graph exposes scale and bounded visible-card rect reads", async ({
  page,
}) => {
  await page.goto("/en/topology/?mode=focus&p=domain%3Aviews");
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-skeleton-cards-ready",
    "true",
    { timeout: 20_000 },
  );
  await page.waitForTimeout(600);

  const layer = page.getByTestId("sigma-skeleton-cards");
  const target = page.locator("[data-skeleton-card]", { hasText: "Views" }).first();
  await expect(target).toBeVisible();
  const before = await rectOf(target);
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 160, before.y + before.height / 2 + 80, {
    steps: 10,
  });
  await expect(layer).toHaveAttribute(
    "data-visible-card-rect-read-policy",
    "frame-state-no-computed-style",
  );

  const proof = await layer.evaluate((el) => ({
    modelCount: Number(el.getAttribute("data-skeleton-card-model-count") ?? "0"),
    resolvedCount: Number(el.getAttribute("data-skeleton-card-resolved-count") ?? "0"),
    visibleCount: Number(el.getAttribute("data-visible-card-count") ?? "0"),
    totalCount: Number(el.getAttribute("data-total-card-count") ?? "0"),
    visibleRectReads: Number(el.getAttribute("data-visible-card-rect-read-count") ?? "0"),
    hiddenRectSkips: Number(el.getAttribute("data-visible-card-hidden-rect-skip-count") ?? "0"),
    cacheSeedCount: Number(el.getAttribute("data-connector-rect-cache-seed-count") ?? "0"),
    finalVisibleCountPolicy: el.getAttribute("data-final-visible-count-policy") ?? "",
    selectedDockVisibilityPolicy:
      el.getAttribute("data-selected-dock-visibility-policy") ?? "",
    supportRailOverlapReadPolicy:
      el.getAttribute("data-support-rail-overlap-read-policy") ?? "",
    activeDragClusterSize: Number(el.getAttribute("data-active-drag-cluster-size") ?? "0"),
  }));
  expect(proof.modelCount, "dogfood focus route should expose a non-trivial card model").toBeGreaterThanOrEqual(20);
  expect(proof.resolvedCount, "all dogfood skeleton card models should resolve to graph nodes").toBe(proof.modelCount);
  expect(proof.totalCount, "visibility pass should account for every card model").toBe(proof.modelCount);
  expect(proof.activeDragClusterSize, "drag should exercise linked ontology facts").toBeGreaterThanOrEqual(2);
  expect(proof.finalVisibleCountPolicy, "final visibility recount should avoid rect reads").toBe(
    "state-only-no-rect-read",
  );
  expect(proof.selectedDockVisibilityPolicy, "selected dock visibility should avoid rect reads").toBe(
    "state-only-no-rect-read",
  );
  expect(proof.supportRailOverlapReadPolicy, "support rail overlap pass should reuse visible rects").toBe(
    "reuse-visible-card-rect-cache",
  );
  expect(proof.visibleRectReads, "rect reads should be bounded by currently visible cards").toBeLessThanOrEqual(
    proof.visibleCount,
  );
  expect(proof.cacheSeedCount, "connector rect cache should only seed visible cards").toBeLessThanOrEqual(
    proof.visibleCount,
  );
  expect(proof.hiddenRectSkips, "hidden context cards should not pay a rect-read cost").toBeGreaterThan(0);
  await page.mouse.up();
});

test("Relief auto-arrange exposes active settle feedback", async ({ page }) => {
  await openTopology(page);

  const arrange = page.getByTestId("topology-auto-arrange");
  await expect(arrange).toBeVisible();
  await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
    "data-arranging",
    "false",
  );

  await arrange.click();

  await expect(arrange).toHaveAttribute("data-arranging", "true");
  await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
    "data-arranging",
    "true",
  );
  await expect(arrange).toHaveAttribute("data-arranging", "false", {
    timeout: 2_000,
  });
  await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
    "data-arranging",
    "false",
    { timeout: 2_000 },
  );
});

test("Relief 관계 라벨 클릭이 관계 선택 카드만 열고 노드 선택을 유지한다", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await openTopology(page);

  const projectCard = page.locator("[data-skeleton-card]", { hasText: "ontology-atlas" });
  await expect(projectCard).toBeVisible();
  await projectCard.click();
  await expect(page).toHaveURL(/[?&]p=ontology-atlas/);

  const relationBadge = page.locator('button[data-relation-label-hit="true"]').first();
  await expect(relationBadge).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      async () =>
        relationBadge.evaluate((el) => {
          const style = window.getComputedStyle(el);
          return {
            opacity: Number(style.opacity || "0"),
            pointerEvents: style.pointerEvents,
            visibleWidth: el.getBoundingClientRect().width > 8,
          };
        }),
      { timeout: 20_000 },
    )
    .toMatchObject({ opacity: 1, pointerEvents: "auto", visibleWidth: true });

  await relationBadge.click();

  await expect(page).toHaveURL(/[?&]p=ontology-atlas/);
  await expect(page.getByTestId("sigma-selected-edge-card")).toBeVisible();
  await expect(page.getByTestId("sigma-selected-edge-card")).toContainText(
    /Selected relation/i,
  );
  await expect(page.getByTestId("sigma-selected-edge-card")).toContainText(
    /typed ontology fact/i,
  );
  await expect(page.getByTestId("sigma-selected-edge-card")).toContainText(
    /MCP\/CLI ready/i,
  );
  await expect(page.getByTestId("sigma-selected-edge-card")).toHaveAttribute(
    "data-agent-gate-kind",
    "handoff-ready",
  );
  await expect(
    page.locator('button[data-relation-label-hit="true"][data-selected-relation="true"]'),
  ).toHaveCount(1);
  expect(consoleErrors, consoleErrors.join("\n")).toHaveLength(0);
});
