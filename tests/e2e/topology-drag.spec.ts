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

function centerOf(rect: Awaited<ReturnType<typeof rectOf>>) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
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
  const layer = page.getByTestId("sigma-skeleton-cards");
  if ((await layer.getAttribute("data-overview-density-fixed-geography-drag-attempt")) === "ignored") {
    await expect(layer).toHaveAttribute("data-drag-dynamic-state", "idle");
    await expect(layer).toHaveAttribute("data-active-drag-cluster-size", "0");
    await expect(target).toHaveAttribute(
      "data-overview-map-fixed-geography-drag-policy",
      "ignore-card-drag-preserve-canvas-layout",
    );
    await page.mouse.move(before.x + before.width / 2 + 140, before.y + before.height / 2 + 70, {
      steps: 8,
    });
    const after = await rectOf(target);
    expect(
      Math.hypot(after.x - before.x, after.y - before.y),
      "fixed overview geography should keep card drag from reshaping the map",
    ).toBeLessThanOrEqual(2);
    await page.mouse.up();
    expect(consoleErrors, consoleErrors.join("\n")).toHaveLength(0);
    return;
  }
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
    "data-drag-dynamic-motion-contract",
    "cluster-follows-pointer-connectors-update",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-dynamic-state",
    "armed-cluster-follow",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-connector-feedback-contract",
    "boxless-connectors-show-linked-motion",
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
  await expect(target).toHaveAttribute(
    "data-drag-interaction-contract",
    "card-announces-connected-ontology-drag",
  );
  await expect(target).toHaveAttribute("data-drag-cluster-role", "root");
  await expect(target).toHaveAttribute("data-drag-interaction-cluster-size", /^[2-9]\d*$/);
  await expect(target).toHaveAttribute("data-drag-interaction-relation-link-count", /\d+/);
  await expect(target).toHaveAttribute(
    "data-drag-interaction-summary",
    /Dragging Views with \d+ connected cards? and \d+ relation links?/,
  );
  await expect(target.locator("[data-drag-interaction-summary-text]")).toHaveText(
    /Dragging Views with \d+ connected cards? and \d+ relation links?/,
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
  await expect(companion).toHaveAttribute(
    "data-drag-interaction-contract",
    "card-announces-connected-ontology-drag",
  );
  await expect(companion).toHaveAttribute(
    "data-drag-interaction-summary",
    /Dragging .+ with \d+ connected cards? and \d+ relation links?/,
  );
  await page.mouse.move(before.x + before.width / 2 + 140, before.y + before.height / 2 + 70, {
    steps: 8,
  });
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-dragging-active",
    "true",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-dynamic-state",
    "active-cluster-follow",
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
    dragRelationLabelVisibilityContract:
      el.getAttribute("data-drag-relation-label-visibility-contract") ?? "",
    dragRelationLabelExpectedCount:
      Number(el.getAttribute("data-drag-relation-label-expected-count") ?? "0"),
    dragRelationLabelVisibleCount:
      Number(el.getAttribute("data-drag-relation-label-visible-count") ?? "0"),
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
  expect(dragFrameBudgetProof.relationLabelDragLayoutPolicy).toBe(
    "drag-connector-labels-follow-cluster",
  );
  expect(dragFrameBudgetProof.relationLabelGeometrySource).toBe(
    "drag-connector-label-follow-pass",
  );
  expect(dragFrameBudgetProof.dragRelationLabelVisibilityContract).toBe(
    "active-drag-connector-labels-remain-readable",
  );
  expect(dragFrameBudgetProof.dragRelationLabelExpectedCount).toBeGreaterThan(0);
  expect(dragFrameBudgetProof.dragRelationLabelVisibleCount).toBeGreaterThan(0);
  await expect(page.locator("[data-drag-relation-label]").first()).toHaveAttribute(
    "data-relation-label-visibility",
    "visible-during-drag",
  );
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
  const beforeCenter = centerOf(before);
  const afterCenter = centerOf(after);
  const companionBeforeCenter = centerOf(companionBefore);
  const companionAfterCenter = centerOf(companionAfter);
  expect(
    Math.abs(
      companionAfterCenter.x -
        companionBeforeCenter.x -
        (afterCenter.x - beforeCenter.x),
    ),
  ).toBeLessThan(72);
  expect(
    Math.abs(
      companionAfterCenter.y -
        companionBeforeCenter.y -
        (afterCenter.y - beforeCenter.y),
    ),
  ).toBeLessThan(72);
  await page.mouse.up();
  await page.waitForTimeout(650);
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-settle-overlap-read-policy",
    "reuse-visible-card-rect-cache",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-dynamic-state",
    /idle|release-settled-cluster/,
  );
  expect(consoleErrors, consoleErrors.join("\n")).toHaveLength(0);
});

test("Relief overview drag keeps the grabbed node readable instead of collapsing it to a pin", async ({
  page,
}) => {
  await openTopology(page);

  const target = page.locator("[data-skeleton-card]", { hasText: "Views" }).first();
  await expect(target).toBeVisible();
  const before = await rectOf(target);
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 160, before.y + before.height / 2 + 90, {
    steps: 10,
  });

  const layer = page.getByTestId("sigma-skeleton-cards");
  if ((await layer.getAttribute("data-overview-density-fixed-geography-drag-attempt")) === "ignored") {
    await expect(layer).toHaveAttribute("data-drag-dynamic-state", "idle");
    await expect(layer).toHaveAttribute("data-active-drag-cluster-size", "0");
    await expect(target).toHaveAttribute("data-zoom-lens-active-card", "false");
    const during = await rectOf(target);
    expect(
      Math.hypot(during.x - before.x, during.y - before.y),
      "fixed overview geography should keep the grabbed node in its map slot",
    ).toBeLessThanOrEqual(2);
    await page.mouse.up();
    return;
  }
  await expect(layer).toHaveAttribute("data-drag-dynamic-state", "active-cluster-follow");
  await expect(target).toHaveAttribute(
    "data-drag-readable-root-contract",
    "grabbed-node-stays-readable-during-overview-density-drag",
  );
  await expect(target).toHaveAttribute("data-zoom-lens-active-card", "false");
  await expect(target).toHaveAttribute("data-zoom-lens-presentation", "full-card-drag-root");
  const during = await rectOf(target);
  expect(
    during.width,
    "dragged overview root should remain a readable card, not a compact kind pin",
  ).toBeGreaterThan(120);

  await page.mouse.up();
});

test("Relief overview drag keeps nearby context fixed on the canvas", async ({
  page,
}) => {
  await openTopology(page);

  const layer = page.getByTestId("sigma-skeleton-cards");
  const target = page.locator("[data-skeleton-card]", { hasText: "Views" }).first();
  await expect(target).toBeVisible();
  const before = await rectOf(target);
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();

  const contextBefore = await page
    .locator('[data-skeleton-card][data-drag-cluster="false"]')
    .evaluateAll((els) =>
      els
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            slug: el.getAttribute("data-slug") ?? "",
            visible:
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0,
            x: rect.x,
            y: rect.y,
          };
        })
        .filter((entry) => entry.slug && entry.visible),
    );
  expect(contextBefore.length).toBeGreaterThan(0);

  await page.mouse.move(before.x + before.width / 2 + 160, before.y + before.height / 2 + 90, {
    steps: 10,
  });
  await expect(layer).toHaveAttribute(
    "data-overview-density-fixed-geography-drag-attempt",
    "ignored",
  );
  await expect(layer).toHaveAttribute(
    "data-overview-density-fixed-geography-drag-lock-scope",
    "map-overview-cards-use-fixed-canvas-slots",
  );
  await expect(layer).toHaveAttribute("data-drag-dynamic-state", "idle");
  await expect(layer).toHaveAttribute("data-active-drag-cluster-size", "0");
  await expect(layer).toHaveAttribute(
    "data-overview-density-fixed-geography-drag-locked",
    "true",
  );

  const contextAfter = await page
    .locator('[data-skeleton-card][data-drag-cluster="false"]')
    .evaluateAll((els) =>
      els
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            dragReactiveMotion: el.getAttribute("data-drag-reactive-motion") ?? "",
            slug: el.getAttribute("data-slug") ?? "",
            visible:
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0,
            x: rect.x,
            y: rect.y,
          };
        })
        .filter((entry) => entry.slug && entry.visible),
    );
  expect(contextAfter.length).toBeGreaterThan(0);
  expect(contextAfter.some((entry) => entry.dragReactiveMotion === "parallax-nudge")).toBe(
    false,
  );

  const movedContextCount = contextAfter.filter((afterEntry) => {
    const beforeEntry = contextBefore.find((entry) => entry.slug === afterEntry.slug);
    if (!beforeEntry) return false;
    return Math.hypot(afterEntry.x - beforeEntry.x, afterEntry.y - beforeEntry.y) > 2;
  }).length;
  expect(movedContextCount).toBe(0);

  await page.mouse.up();
});

test("Relief focus drag keeps selected geography fixed instead of reshaping the map", async ({ page }) => {
  await page.goto("/en/topology/?p=domain%3Aviews&mode=focus");
  const viewport = page.getByTestId("sigma-topology-viewport");
  await expect(viewport).toBeVisible({ timeout: 20_000 });
  const layer = page.getByTestId("sigma-skeleton-cards");
  await expect(layer).toHaveAttribute("data-skeleton-cards-ready", "true", {
    timeout: 20_000,
  });
  await page.waitForTimeout(600);

  const target = page.locator("[data-skeleton-card]", { hasText: "Views" }).first();
  await expect(target).toBeVisible();
  await expect(layer).toHaveAttribute(
    "data-selected-focus-fixed-geography-contract",
    "selected-focus-uses-deterministic-canvas-geography",
  );
  await expect(layer).toHaveAttribute(
    "data-selected-focus-fixed-geography-drag-contract",
    "selected-focus-disables-card-drag-to-preserve-map-layout",
  );
  await expect(layer).toHaveAttribute(
    "data-selected-focus-fixed-geography-drag-locked",
    "true",
  );
  await expect(target).toHaveAttribute("data-selected-focus-fixed-geography", "true");
  await expect(target).toHaveAttribute(
    "data-selected-focus-fixed-geography-drag-policy",
    "ignore-card-drag-preserve-layout",
  );
  const before = await rectOf(target);
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await expect(layer).toHaveAttribute(
    "data-selected-focus-fixed-geography-drag-attempt",
    "ignored",
  );
  await expect(layer).toHaveAttribute("data-drag-dynamic-state", "idle");
  await expect(layer).toHaveAttribute("data-active-drag-cluster-size", "0");
  await page.mouse.move(before.x + before.width / 2 + 160, before.y + before.height / 2 + 80, {
    steps: 10,
  });
  await expect(layer).toHaveAttribute("data-drag-dynamic-state", "idle");
  await expect(target).toHaveAttribute("data-dragging-active", "false");
  await expect(page.locator('[data-drag-tension-connector="true"]')).toHaveCount(0);
  const workerFrameProof = await viewport.evaluate((el) => ({
    applied: Number(el.getAttribute("data-layout-worker-position-frame-applied-count") ?? "0"),
    received: Number(el.getAttribute("data-layout-worker-position-frame-received-count") ?? "0"),
  }));
  expect(workerFrameProof.received).toBeGreaterThan(0);
  expect(workerFrameProof.applied).toBeGreaterThanOrEqual(0);
  await page.mouse.up();
  const released = await rectOf(target);
  expect(
    Math.hypot(released.x - before.x, released.y - before.y),
    "selected focus drag should not rewrite the deterministic focus geography",
  ).toBeLessThan(12);
});

test("Relief map project drag stays responsive for large connected clusters", async ({
  page,
}) => {
  await page.goto("/en/topology/?mode=map");
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  const layer = page.getByTestId("sigma-skeleton-cards");
  await expect(layer).toHaveAttribute("data-skeleton-cards-ready", "true", {
    timeout: 20_000,
  });
  await page.waitForTimeout(600);

  const target = page.locator("[data-skeleton-card]", { hasText: "ontology-atlas" }).first();
  await expect(target).toBeVisible();
  const before = await rectOf(target);
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  if ((await layer.getAttribute("data-overview-density-fixed-geography-drag-attempt")) === "ignored") {
    await expect(layer).toHaveAttribute("data-drag-dynamic-state", "idle");
    await expect(layer).toHaveAttribute("data-active-drag-cluster-size", "0");
    await page.mouse.move(
      before.x + before.width / 2 + 250,
      before.y + before.height / 2 - 130,
      { steps: 12 },
    );
    const after = await rectOf(target);
    const beforeCenter = centerOf(before);
    const afterCenter = centerOf(after);
    expect(
      Math.hypot(afterCenter.x - beforeCenter.x, afterCenter.y - beforeCenter.y),
      "fixed map project geography should not move when a reader drags the root card",
    ).toBeLessThanOrEqual(2);
    await expect(layer).toHaveAttribute("data-drag-physics-sync-active", "false");
    await page.mouse.up();
    return;
  }
  await expect(layer).toHaveAttribute(
    "data-drag-clamp-contract",
    "large-cluster-root-card-priority",
  );
  await expect(layer).toHaveAttribute(
    "data-drag-clamp-scope",
    "root-card-for-large-cluster",
  );
  await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
    "data-layout-worker-position-frame-skip-policy",
    "skip-only-unsynced-skeleton-card-drag",
  );
  await expect(layer).toHaveAttribute(
    "data-drag-physics-sync-contract",
    "skeleton-card-drag-pins-worker-layout-group",
  );
  await expect(layer).toHaveAttribute(
    "data-drag-physics-release-policy",
    "commit-drop-position-no-force-release",
  );
  await expect(layer).toHaveAttribute(
    "data-drag-physics-sync-active",
    "true",
  );
  await expect(layer).toHaveAttribute(
    "data-drag-cluster-policy",
    "root-direct-neighbors-pin-free-context",
  );
  const freeContextBefore = await layer.evaluate((el) => ({
    freeContextCount: Number(el.getAttribute("data-drag-free-context-count") ?? "0"),
    clusterSize: Number(el.getAttribute("data-active-drag-cluster-size") ?? "0"),
    cards: Array.from(el.querySelectorAll<HTMLElement>("[data-skeleton-card]"))
      .filter((card) => card.dataset.dragCluster !== "true")
      .map((card) => {
        const rect = card.getBoundingClientRect();
        const style = window.getComputedStyle(card);
        return {
          slug: card.dataset.slug ?? "",
          visible:
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0,
          x: rect.x,
          y: rect.y,
        };
      })
      .filter((card) => card.slug && card.visible),
  }));
  expect(freeContextBefore.clusterSize).toBeGreaterThanOrEqual(2);
  expect(freeContextBefore.freeContextCount).toBeGreaterThan(0);
  await page.mouse.move(
    before.x + before.width / 2 + 250,
    before.y + before.height / 2 - 130,
    { steps: 12 },
  );
  await expect(layer).toHaveAttribute("data-dragging-active", "true");
  await expect(layer).toHaveAttribute(
    "data-drag-active-overlap-policy",
    "active-cluster-hides-lower-priority-overlaps",
  );
  await expect(layer).toHaveAttribute("data-visible-card-overlap-count", "0");
  const activeOverlapProof = await layer.evaluate((el) => ({
    hiddenCount: Number(el.getAttribute("data-drag-active-overlap-hidden-count") ?? "0"),
    visibleOverlapCount: Number(el.getAttribute("data-visible-card-overlap-count") ?? "0"),
  }));
  expect(activeOverlapProof.hiddenCount).toBeGreaterThanOrEqual(0);
  expect(
    activeOverlapProof.visibleOverlapCount,
    "large project drag should not leave cards visibly stacked during active movement",
  ).toBe(0);
  const dragResponsivenessProof = await layer.evaluate((el) => ({
    previewOffsetX: Number(el.getAttribute("data-drag-preview-offset-x") ?? "0"),
    previewScope: el.getAttribute("data-drag-preview-scope") ?? "",
  }));
  expect(dragResponsivenessProof.previewScope).toBe(
    "viewport-offset-for-large-cluster",
  );
  expect(dragResponsivenessProof.previewOffsetX).toBeGreaterThan(120);
  const freeContextAfter = await layer.evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>("[data-skeleton-card]"))
      .filter((card) => card.dataset.dragCluster !== "true")
      .map((card) => {
        const rect = card.getBoundingClientRect();
        const style = window.getComputedStyle(card);
        return {
          slug: card.dataset.slug ?? "",
          visible:
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0,
          x: rect.x,
          y: rect.y,
        };
      })
      .filter((card) => card.slug && card.visible),
  );
  const movedFreeContextCount = freeContextAfter.filter((afterEntry) => {
    const beforeEntry = freeContextBefore.cards.find(
      (entry) => entry.slug === afterEntry.slug,
    );
    if (!beforeEntry) return false;
    return Math.hypot(afterEntry.x - beforeEntry.x, afterEntry.y - beforeEntry.y) > 12;
  }).length;
  expect(
    movedFreeContextCount,
    "project root drag should leave lower-priority context free to react instead of pinning every visible card as one rigid bundle",
  ).toBeGreaterThan(0);
  const workerDynamicDragProof = await page.getByTestId("sigma-topology-viewport").evaluate((el) => ({
    applied: Number(el.getAttribute("data-layout-worker-position-frame-applied-count") ?? "0"),
    received: Number(el.getAttribute("data-layout-worker-position-frame-received-count") ?? "0"),
    skipped: Number(el.getAttribute("data-layout-worker-position-frame-skipped-count") ?? "0"),
  }));
  expect(workerDynamicDragProof.received).toBeGreaterThan(0);
  expect(workerDynamicDragProof.applied).toBeGreaterThan(0);
  const after = await rectOf(target);
  const beforeCenter = centerOf(before);
  const afterCenter = centerOf(after);
  expect(
    afterCenter.x - beforeCenter.x,
    "large project cluster should not be pinned by far subtree cards",
  ).toBeGreaterThan(120);
  await page.mouse.up();
  await page.waitForTimeout(120);
  await expect(layer).toHaveAttribute(
    "data-drag-physics-sync-active",
    "false",
  );
  const releaseSettle = await rectOf(target);
  expect(
    Math.abs(centerOf(releaseSettle).x - afterCenter.x),
    "large project cluster should stay where it was dropped immediately after release",
  ).toBeLessThan(32);
  const releaseProof = await layer.evaluate((el) => ({
    persistedCount: Number(
      el.getAttribute("data-drag-viewport-offset-persisted-count") ?? "0",
    ),
    previewScope: el.getAttribute("data-drag-preview-scope") ?? "",
    catchupContract: el.getAttribute("data-drag-release-graph-catchup-contract") ?? "",
  }));
  expect(releaseProof.previewScope).toBe("committed-graph-position");
  expect(releaseProof.persistedCount).toBe(0);
  expect(releaseProof.catchupContract).toBe(
    "active-preview-commits-to-graph-before-clearing-offset",
  );
  await page.waitForTimeout(850);
  const finalDrop = await rectOf(target);
  expect(
    Math.abs(centerOf(finalDrop).x - afterCenter.x),
    "large project cluster may breathe with free context physics, but should not snap back after drag feedback clears",
  ).toBeLessThan(128);
  expect(
    centerOf(finalDrop).x - beforeCenter.x,
    "large project cluster should remain near the user's drop area after free context settles",
  ).toBeGreaterThan(120);
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
    visibleSelectedSurfaceRectPolicy:
      el.getAttribute("data-visible-card-selected-surface-rect-policy") ?? "",
    hiddenRectSkips: Number(el.getAttribute("data-visible-card-hidden-rect-skip-count") ?? "0"),
    cacheSeedCount: Number(el.getAttribute("data-connector-rect-cache-seed-count") ?? "0"),
    connectorLabelPassMs: Number(
      el.getAttribute("data-reposition-pass-connector-label-ms") ?? "NaN",
    ),
    connectorRectCacheFrameFallbackContract:
      el.getAttribute("data-connector-rect-cache-frame-fallback-contract") ?? "",
    connectorRectCacheReadCount: Number(
      el.getAttribute("data-connector-rect-cache-read-count") ?? "NaN",
    ),
    finalVisibleCountPolicy: el.getAttribute("data-final-visible-count-policy") ?? "",
    selectedDockVisibilityPolicy:
      el.getAttribute("data-selected-dock-visibility-policy") ?? "",
    supportRailOverlapReadPolicy:
      el.getAttribute("data-support-rail-overlap-read-policy") ?? "",
    selectedFocusFixedGeographyDragAttempt:
      el.getAttribute("data-selected-focus-fixed-geography-drag-attempt") ?? "",
    activeOverlapHiddenCount: Number(
      el.getAttribute("data-drag-active-overlap-hidden-count") ?? "0",
    ),
    activeDragClusterSize: Number(el.getAttribute("data-active-drag-cluster-size") ?? "0"),
  }));
  expect(proof.modelCount, "dogfood focus route should expose a non-trivial card model").toBeGreaterThanOrEqual(20);
  expect(proof.resolvedCount, "all dogfood skeleton card models should resolve to graph nodes").toBe(proof.modelCount);
  expect(proof.totalCount, "visibility pass should account for every card model").toBe(proof.modelCount);
  if (proof.selectedFocusFixedGeographyDragAttempt === "ignored") {
    expect(proof.activeDragClusterSize, "fixed focus geography should not start a drag cluster").toBe(0);
  } else {
    expect(proof.activeDragClusterSize, "drag should exercise linked ontology facts").toBeGreaterThanOrEqual(2);
  }
  expect(proof.finalVisibleCountPolicy, "final visibility recount should avoid rect reads").toBe(
    "state-only-no-rect-read",
  );
  expect(proof.selectedDockVisibilityPolicy, "selected dock visibility should avoid rect reads").toBe(
    "state-only-no-rect-read",
  );
  expect(proof.supportRailOverlapReadPolicy, "support rail overlap pass should reuse visible rects").toBe(
    "reuse-visible-card-rect-cache",
  );
  expect(
    proof.connectorRectCacheFrameFallbackContract,
    "connector rect fallback should reuse same-frame card placement rects before any DOM read",
  ).toBe("reuse-card-placement-frame-rects-before-dom-read");
  expect(
    proof.connectorRectCacheReadCount,
    "connector label pass should not fall back to direct DOM rect reads",
  ).toBe(0);
  expect(
    Number.isFinite(proof.connectorLabelPassMs),
    "connector label pass timing should be exposed for regression proof",
  ).toBe(true);
  expect(
    proof.connectorLabelPassMs,
    "connector label pass should stay below the 3ms regression threshold at 1920 focus",
  ).toBeLessThan(3);
  expect(
    proof.visibleRectReads,
    "rect reads should be bounded by visible cards plus cards hidden by active drag overlap suppression",
  ).toBeLessThanOrEqual(
    proof.visibleCount + proof.activeOverlapHiddenCount,
  );
  expect(
    proof.visibleSelectedSurfaceRectPolicy,
    "selected focus surfaces should use current postprocess geometry for overlap safety",
  ).toBe("live-rects-for-postprocess-overlap-safety");
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

  const layer = page.getByTestId("sigma-skeleton-cards");
  const dragTargetSlug = await page.locator("[data-skeleton-card]").evaluateAll((els) => {
    const target = els.find((el) => {
      const rect = el.getBoundingClientRect();
      return (
        el.getAttribute("data-selected") === "false" &&
        el.getAttribute("data-surface-hidden") !== "true" &&
        !el.textContent?.includes("ontology-atlas") &&
        rect.width > 8 &&
        rect.height > 8
      );
    });
    return target?.getAttribute("data-slug") ?? null;
  });
  if (!dragTargetSlug) {
    throw new Error("selected relation drag should find a visible non-selected card");
  }
  const dragTarget = page.locator(
    `[data-skeleton-card][data-slug="${dragTargetSlug}"]`,
  );
  await expect(dragTarget).toBeVisible();
  const beforeDrag = await rectOf(dragTarget);
  await page.mouse.move(
    beforeDrag.x + beforeDrag.width / 2,
    beforeDrag.y + beforeDrag.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    beforeDrag.x + beforeDrag.width / 2 + 96,
    beforeDrag.y + beforeDrag.height / 2 + 36,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(layer).toHaveAttribute(
    "data-drag-settle-feedback-contract",
    "released-dragged-cluster-keeps-settle-feedback",
  );
  await expect(layer).toHaveAttribute("data-drag-settled-cluster-size", /^[1-9]\d*$/);
  await expect(dragTarget).toHaveAttribute("data-drag-pushed", "true");
  await page.waitForTimeout(750);

  const dragReleaseProof = await layer.evaluate((el) => ({
    connectorRectCacheReadCount: Number(
      el.getAttribute("data-connector-rect-cache-read-count") ?? "NaN",
    ),
    lastDomIndexSize: Number(el.getAttribute("data-drag-last-dom-index-size") ?? "0"),
    lastFrameCacheContract: el.getAttribute("data-drag-last-frame-cache-contract") ?? "",
    lastSnapshotCount: Number(
      el.getAttribute("data-drag-last-frame-cache-snapshot-count") ?? "0",
    ),
    selectedRelationHandoff: el.getAttribute("data-selected-relation-label-handoff") ?? "",
  }));
  expect(dragReleaseProof.lastFrameCacheContract).toBe(
    "release-keeps-last-pointer-down-cache-proof",
  );
  expect(
    dragReleaseProof.lastDomIndexSize,
    "selected relation drag should keep the last pointer-down card index proof",
  ).toBeGreaterThan(0);
  expect(
    dragReleaseProof.lastSnapshotCount,
    "selected relation drag should keep last dock snapshot accounting visible",
  ).toBeGreaterThanOrEqual(0);
  expect(dragReleaseProof.selectedRelationHandoff).toBe("ready");
  expect(dragReleaseProof.connectorRectCacheReadCount).toBe(0);
  await expect(page.getByTestId("sigma-selected-edge-card")).toBeVisible();
  expect(consoleErrors, consoleErrors.join("\n")).toHaveLength(0);
});
