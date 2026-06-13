import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const VIEWPORTS = [
  { label: "desktop-1280", width: 1280, height: 800 },
  { label: "desktop-1920", width: 1920, height: 1080 },
  { label: "desktop-2560", width: 2560, height: 1440 },
];
const COMPACT_VIEWPORT = { label: "compact-900", width: 900, height: 760 };
const OUT = path.resolve("output/ui-audit/topology-drag");
const OVERVIEW_DRAG_DELTA_TOLERANCE_PX = 48;

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

async function openRelief(
  page: Page,
  viewport: { width: number; height: number },
  {
    mode = "path",
    requireHud = true,
    settle = true,
  }: { mode?: "map" | "path"; requireHud?: boolean; settle?: boolean } = {},
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/en/topology/?mode=${mode}`);
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  if (requireHud) {
    await expect(page.getByTestId("topology-analysis-panel")).toBeVisible();
    await expect(page.getByTestId("topology-kind-legend")).toBeVisible();
  }
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-skeleton-cards-ready",
    "true",
    { timeout: 20_000 },
  );
  await expect(page.locator("[data-skeleton-card]").first()).toBeVisible({
    timeout: 20_000,
  });
  if (settle) {
    await page.waitForTimeout(1600);
  }
}

async function rectOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("missing bounding box");
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
    width: box.width,
    height: box.height,
  };
}

function intersects(
  a: Awaited<ReturnType<typeof rectOf>>,
  b: Awaited<ReturnType<typeof rectOf>>,
  pad = 0,
) {
  return (
    a.left < b.right + pad &&
    a.right > b.left - pad &&
    a.top < b.bottom + pad &&
    a.bottom > b.top - pad
  );
}

function cardPairsThatIntersect(
  cards: Array<Awaited<ReturnType<typeof rectOf>> & { text: string }>,
) {
  const pairs: string[] = [];
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      if (intersects(cards[i], cards[j], -2)) {
        pairs.push(`${cards[i].text} / ${cards[j].text}`);
      }
    }
  }
  return pairs;
}

async function visibleCardRects(page: Page) {
  return page.locator("[data-skeleton-card]").evaluateAll((els) =>
    els
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          text: el.textContent?.trim() ?? "",
          opacity: Number(style.opacity || "1"),
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((rect) => rect.opacity > 0.05 && rect.width > 0 && rect.height > 0),
  );
}

async function connectorVisualEvidence(locator: Locator) {
  return locator.evaluate((el) => {
    if (!(el instanceof SVGPathElement)) {
      return {
        axis: "",
        d: "",
        end: null,
        start: null,
        stroke: "",
        strokeWidth: 0,
        totalLength: 0,
      };
    }
    const style = window.getComputedStyle(el);
    const strokeWidth = style.strokeWidth || el.getAttribute("stroke-width") || "0";
    const d = el.getAttribute("d") || "";
    const match = d.match(
      /^M ([\d.-]+) ([\d.-]+) C [\d.-]+ [\d.-]+, [\d.-]+ [\d.-]+, ([\d.-]+) ([\d.-]+)/,
    );
    return {
      axis: el.dataset.connectorAxis || "",
      d,
      end: match
        ? { x: Number.parseFloat(match[3]), y: Number.parseFloat(match[4]) }
        : null,
      start: match
        ? { x: Number.parseFloat(match[1]), y: Number.parseFloat(match[2]) }
        : null,
      stroke: style.stroke || el.getAttribute("stroke") || "",
      strokeWidth: Number.parseFloat(strokeWidth),
      totalLength: el.getTotalLength(),
    };
  });
}

function pointInsideRect(
  point: { x: number; y: number } | null,
  rect: Awaited<ReturnType<typeof rectOf>>,
  layerRect: Awaited<ReturnType<typeof rectOf>>,
) {
  if (!point) return false;
  const x = layerRect.left + point.x;
  const y = layerRect.top + point.y;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function pointNearRectPerimeter(
  point: { x: number; y: number } | null,
  rect: Awaited<ReturnType<typeof rectOf>>,
  layerRect: Awaited<ReturnType<typeof rectOf>>,
  clearance = 10,
) {
  if (!point) return false;
  const x = layerRect.left + point.x;
  const y = layerRect.top + point.y;
  const insideExpanded =
    x >= rect.left - clearance &&
    x <= rect.right + clearance &&
    y >= rect.top - clearance &&
    y <= rect.bottom + clearance;
  if (!insideExpanded) return false;
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.max(dx, dy) <= clearance && (dx > 0 || dy > 0);
}

function expectCardsClear(
  cards: Array<Awaited<ReturnType<typeof rectOf>> & { text: string }>,
  viewport: { label: string; width: number; height: number },
  analysisRect: Awaited<ReturnType<typeof rectOf>>,
  legendRect: Awaited<ReturnType<typeof rectOf>>,
) {
  const hudViolations = cards.filter(
    (card) => intersects(card, analysisRect, 8) || intersects(card, legendRect, 8),
  );
  const viewportViolations = cards.filter(
    (card) =>
      card.left < 0 ||
      card.top < 0 ||
      card.right > viewport.width ||
      card.bottom > viewport.height,
  );
  const cardOverlapViolations = cardPairsThatIntersect(cards);
  expect(
    hudViolations.map((card) => card.text),
    `cards overlapping fixed HUD at ${viewport.label}`,
  ).toEqual([]);
  expect(
    viewportViolations.map((card) => card.text),
    `cards outside viewport at ${viewport.label}`,
  ).toEqual([]);
  expect(cardOverlapViolations, `cards overlapping each other at ${viewport.label}`).toEqual(
    [],
  );
}

for (const viewport of VIEWPORTS) {
  test(`Relief skeleton overview ignores stale camera URLs — ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/en/topology/?mode=map&cam=-0.047,0.534,1.805`);
    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-skeleton-cards-ready",
      "true",
      { timeout: 20_000 },
    );
    await page.waitForTimeout(1600);

    expect(new URL(page.url()).searchParams.get("cam")).toBeNull();
    await expect(
      page.locator("[data-skeleton-card]", { hasText: "Views" }).first(),
    ).toBeVisible();
    await expect(
      page.locator("[data-skeleton-card]", { hasText: "Vault — Local-First" }).first(),
    ).toBeVisible();
    expectCardsClear(
      await visibleCardRects(page),
      viewport,
      await rectOf(page.getByTestId("topology-analysis-panel")),
      await rectOf(page.getByTestId("topology-kind-legend")),
    );
  });

  test(`Relief skeleton cards stay separated during initial settle — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport, { settle: false });

    const analysisRect = await rectOf(page.getByTestId("topology-analysis-panel"));
    const legendRect = await rectOf(page.getByTestId("topology-kind-legend"));
    for (let sample = 0; sample < 4; sample += 1) {
      expectCardsClear(
        await visibleCardRects(page),
        viewport,
        analysisRect,
        legendRect,
      );
      await page.waitForTimeout(300);
    }
  });

  test(`Relief skeleton cards avoid fixed HUD surfaces — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport);

    const analysisRect = await rectOf(page.getByTestId("topology-analysis-panel"));
    const legendRect = await rectOf(page.getByTestId("topology-kind-legend"));
    expectCardsClear(await visibleCardRects(page), viewport, analysisRect, legendRect);
    const overviewConnector = page.locator("[data-overview-connector-from]").first();
    await expect(overviewConnector).toHaveAttribute("d", /^M /);
    const connector = await connectorVisualEvidence(overviewConnector);
    expect(
      connector.totalLength,
      `overview backbone connector should be drawable at ${viewport.label}`,
    ).toBeGreaterThan(24);
    expect(
      connector.strokeWidth,
      `overview backbone connector should stay visible at ${viewport.label}`,
    ).toBeGreaterThan(0.8);
    const verticalConnector = page
      .locator('[data-overview-connector-from][data-connector-axis="vertical"]')
      .first();
    await expect(verticalConnector).toHaveAttribute("d", /^M /);
    const vertical = await connectorVisualEvidence(verticalConnector);
    expect(
      vertical.d,
      `vertical overview connector should use top/bottom card ports at ${viewport.label}`,
    ).toMatch(/^M [\d.-]+ [\d.-]+ C [\d.-]+ [\d.-]+, [\d.-]+ [\d.-]+, [\d.-]+ [\d.-]+$/);
  });

  test(`Relief selected connectors expose relation labels — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport, { mode: "map" });

    const analysisRect = await rectOf(page.getByTestId("topology-analysis-panel"));
    const legendRect = await rectOf(page.getByTestId("topology-kind-legend"));
    await expect(page.getByTestId("topology-overview-agent-readiness")).toContainText(
      /Agent readiness|Agent 준비도/i,
    );
    await expect(page.getByTestId("topology-overview-agent-readiness")).toContainText(
      /handoff-ready|handoff 가능/i,
    );
    await expect(page.getByTestId("topology-overview-agent-readiness-meter")).toBeVisible();
    await expect(page.getByTestId("topology-overview-agent-readiness-meter")).toHaveAttribute(
      "aria-label",
      /Agent readiness|Agent 준비도/i,
    );
    await page.locator("[data-skeleton-card]", { hasText: "Views" }).first().click();
    await page.waitForTimeout(650);
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-skeleton-cards-ready",
      "true",
      { timeout: 20_000 },
    );
    await expect(page.locator("[data-connector-relation-label]").first()).toHaveText(
      /contains|depends|relates|describes|uses/,
      { timeout: 20_000 },
    );
    const relationLabel = page.locator("[data-connector-relation-label]").first();
    const labelBox = await relationLabel.boundingBox();
    expect(
      labelBox?.width ?? 0,
      `selected relation label should render at ${viewport.label}`,
    ).toBeGreaterThan(8);
    const selectedBadgeId = await relationLabel.getAttribute("data-relation-label-id");
    if (!selectedBadgeId) {
      throw new Error(`selected relation label should expose a badge id at ${viewport.label}`);
    }
    const selectedBadge = page.locator(
      `[data-relation-label-bg="${selectedBadgeId}"]`,
    );
    const selectedBadgeBox = await selectedBadge.boundingBox();
    expect(
      selectedBadgeBox?.width ?? 0,
      `selected relation badge background should render at ${viewport.label}`,
    ).toBeGreaterThan(labelBox?.width ?? 8);
    const relationButton = page.locator(
      `[data-relation-label-button="${selectedBadgeId}"]`,
    );
    await relationButton.evaluate((element) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error("relation label hit target should be an HTML button");
      }
      element.click();
    });
    await expect(relationButton).toHaveAttribute("data-selected-relation", "true");
    await expect(page.getByTestId("sigma-selected-edge-card")).toBeVisible();
    const claimLens = page.getByTestId("sigma-selected-edge-claim-lens");
    await expect(claimLens).toHaveAttribute("data-relation-quality", /strong|supported|weak|review/);
    await expect(claimLens.locator("[data-relation-quality-dot]")).toBeVisible();
    await expect(claimLens).toContainText(/typed ontology fact|타입이 있는 온톨로지 사실/i);
    await expect(claimLens).toContainText(/strong|supported|weak|review|강한 구조|근거 있음|약한 관련|검토 필요/i);
    const relationContract = page.getByTestId("sigma-selected-edge-contract");
    await expect(relationContract).toHaveAttribute("data-relation-contract", "typed-fact-not-similarity");
    await expect(relationContract).toContainText(/not a similarity score|유사도 점수가 아니라/i);
    await expect(relationContract).toContainText(/handoff confidence|handoff 신뢰도/i);
    const agentGate = page.getByTestId("sigma-selected-edge-agent-gate");
    await expect(agentGate).toContainText(/handoff ready|preflight first|review first|handoff 준비됨|preflight 먼저|검토 먼저/i);
    await expect(page.getByTestId("sigma-selected-edge-card")).toHaveAttribute(
      "data-agent-gate-kind",
      /handoff-ready|preflight-first|review-first/,
    );
    const agentDecision = page.getByTestId("sigma-selected-edge-agent-decision");
    await expect(agentDecision).toHaveAttribute(
      "data-agent-gate-kind",
      /handoff-ready|preflight-first|review-first/,
    );
    await expect(agentDecision).toContainText(/agent handoff|relation_check|agent-ready|관계 근거|handoff/i);
    await expect(page.locator('[data-relation-copy-priority="primary"]')).toHaveAttribute(
      "data-relation-copy-action",
      /relation_check|explain_relation/,
    );
    const popoverRect = await rectOf(page.getByTestId("topology-node-popover"));
    const expectedMaxWidth = viewport.width >= 1024 ? 328 : 568;
    expect(
      popoverRect.width,
      `selected detail popover should stay compact at ${viewport.label}`,
    ).toBeLessThanOrEqual(expectedMaxWidth);
    expect(
      popoverRect.right,
      `selected detail popover should stay inside the viewport at ${viewport.label}`,
    ).toBeLessThanOrEqual(viewport.width - 8);
    expect(
      intersects(popoverRect, analysisRect, 8) || intersects(popoverRect, legendRect, 8),
      `selected detail popover should not cover fixed HUD at ${viewport.label}`,
    ).toBe(false);
    if (viewport.width < 1024) {
      expect(
        popoverRect.top,
        `selected detail popover should dock near the top chrome at ${viewport.label}`,
      ).toBeLessThanOrEqual(128);
      expect(
        popoverRect.bottom,
        `selected detail popover should leave the lower map readable at ${viewport.label}`,
      ).toBeLessThan(viewport.height * 0.72);
      expect(
        Math.abs((popoverRect.left + popoverRect.right) / 2 - viewport.width / 2),
        `selected detail popover should stay centered as a compact top panel at ${viewport.label}`,
      ).toBeLessThan(24);
      await page.getByRole("button", { name: "Map view" }).click();
      const collapsedRect = await rectOf(page.getByTestId("topology-node-popover"));
      await expect(page.getByTestId("topology-node-popover")).toHaveAttribute(
        "data-collapsed",
        "true",
      );
      expect(
        collapsedRect.height,
        `collapsed selected detail should become a compact map chip at ${viewport.label}`,
      ).toBeLessThanOrEqual(88);
      expect(
        collapsedRect.top,
        `collapsed selected detail should remain docked near the top at ${viewport.label}`,
      ).toBeLessThanOrEqual(128);
      expect(
        intersects(collapsedRect, analysisRect, 8) || intersects(collapsedRect, legendRect, 8),
        `collapsed selected detail should not cover fixed HUD at ${viewport.label}`,
      ).toBe(false);
      await page.getByRole("button", { name: "Show detail" }).click();
      await expect(page.getByTestId("topology-node-popover")).not.toHaveAttribute(
        "data-collapsed",
        "true",
      );
    } else {
      await expect(page.getByRole("button", { name: "Map view" })).toBeHidden();
      expect(
        popoverRect.top,
        `selected detail popover should remain a right-side panel at ${viewport.label}`,
      ).toBeLessThan(160);
    }
    const selectedCards = await visibleCardRects(page);
    const currentPopoverRect = await rectOf(page.getByTestId("topology-node-popover"));
    expect(
      selectedCards
        .filter((card) => intersects(card, currentPopoverRect, 8))
        .map((card) => card.text),
      `selected fan-out cards should not sit under the detail popover at ${viewport.label}`,
    ).toEqual([]);
    expectCardsClear(selectedCards, viewport, analysisRect, legendRect);
    await page.screenshot({
      path: path.join(OUT, `selected-relation-label-${viewport.label}.png`),
      fullPage: false,
    });
  });

  test(`Relief selected reveal cards travel with the dragged focus — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport, { mode: "map" });

    await page.locator("[data-skeleton-card]", { hasText: "Views" }).first().click();
    await page.waitForTimeout(650);
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-skeleton-cards-ready",
      "true",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("topology-node-popover")).toBeVisible();

    const focus = page.locator('[data-skeleton-card][data-slug="domain:views"]').first();
    const firstCompanion = page
      .locator('[data-skeleton-card][data-dock-parent="domain:views"]')
      .first();
    await expect(focus).toBeVisible();
    await expect(firstCompanion).toBeVisible();
    const companionSlug = await firstCompanion.getAttribute("data-slug");
    if (!companionSlug) {
      throw new Error(`selected reveal companion should expose a slug at ${viewport.label}`);
    }
    const companion = page.locator(
      `[data-skeleton-card][data-slug="${companionSlug}"]`,
    );

    const focusBefore = await rectOf(focus);
    const companionBefore = await rectOf(companion);
    await page.mouse.move(
      focusBefore.left + focusBefore.width / 2,
      focusBefore.top + focusBefore.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      focusBefore.left + focusBefore.width / 2 - 120,
      focusBefore.top + focusBefore.height / 2 + 54,
      { steps: 10 },
    );

    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-dragging-active",
      "true",
    );
    await expect(focus).toHaveAttribute("data-dragging-active", "true");
    await expect(companion).toHaveAttribute("data-drag-cluster", "true");
    await expect(companion).toHaveAttribute("data-dock-drag-follow", "true");
    await expect(page.getByTestId("skeleton-card-hover")).toHaveCount(0);

    const focusAfter = await rectOf(focus);
    const companionAfter = await rectOf(companion);
    const focusDx = focusAfter.left - focusBefore.left;
    const focusDy = focusAfter.top - focusBefore.top;
    const companionDx = companionAfter.left - companionBefore.left;
    const companionDy = companionAfter.top - companionBefore.top;
    expect(
      Math.abs(companionDx - focusDx),
      `selected reveal companion should travel with focus on x at ${viewport.label}`,
    ).toBeLessThan(18);
    expect(
      Math.abs(companionDy - focusDy),
      `selected reveal companion should travel with focus on y at ${viewport.label}`,
    ).toBeLessThan(18);

    await page.mouse.up();
    await page.waitForTimeout(650);
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-skeleton-cards-ready",
      "true",
      { timeout: 20_000 },
    );
    await expect(companion).not.toHaveAttribute("data-surface-hidden", "true");
    await expect(companion).toHaveCSS("opacity", "1");
    const popoverRect = await rectOf(page.getByTestId("topology-node-popover"));
    expect(
      intersects(await rectOf(focus), popoverRect, 8),
      `dragged selected focus should not settle under the detail popover at ${viewport.label}`,
    ).toBe(false);
    expectCardsClear(
      await visibleCardRects(page),
      viewport,
      await rectOf(page.getByTestId("topology-analysis-panel")),
      await rectOf(page.getByTestId("topology-kind-legend")),
    );
  });

  test(`Relief skeleton cards remain separated after dragging a card — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport);

    const analysisRect = await rectOf(page.getByTestId("topology-analysis-panel"));
    const legendRect = await rectOf(page.getByTestId("topology-kind-legend"));
    const target = page.locator("[data-skeleton-card]", { hasText: "Views" }).first();
    await expect(target).toBeVisible();
    const before = await rectOf(target);

    await page.mouse.move(before.left + before.width / 2, before.top + before.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-dragging-active",
      "false",
    );
    await expect(page.getByText("linked cards move together")).toBeVisible();
    const companionHandle = await page
      .locator('[data-skeleton-card][data-drag-cluster-role="movable"]')
      .evaluateAll((els) => {
        const el = els.find((candidate) => !candidate.textContent?.includes("Views"));
        return el?.getAttribute("data-slug") ?? null;
      });
    if (!companionHandle) {
      throw new Error(`dragging Views should expose a connected companion at ${viewport.label}`);
    }
    const companion = page.locator(
      `[data-skeleton-card][data-slug="${companionHandle}"]`,
    );
    await expect(target).toHaveAttribute("data-drag-cluster-role", "root");
    await expect(companion).toHaveAttribute("data-drag-cluster-role", "movable");
    const companionBefore = await rectOf(companion);
    await page.mouse.move(before.left + before.width / 2 + 160, before.top + before.height / 2 + 70, {
      steps: 10,
    });
    const whileDragging = await rectOf(target);
    const companionAfter = await rectOf(companion);
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-dragging-active",
      "true",
    );
    await expect(target).toHaveAttribute("data-dragging-active", "true");
    await expect(page.locator("[data-drag-cluster-hull]")).toHaveAttribute(
      "data-drag-active",
      "true",
    );
    await expect(page.getByText("moving linked cards")).toBeVisible();
    const targetDx = whileDragging.left - before.left;
    const targetDy = whileDragging.top - before.top;
    const companionDx = companionAfter.left - companionBefore.left;
    const companionDy = companionAfter.top - companionBefore.top;
    expect(
      Math.abs(companionDx - targetDx),
      `connected companion should travel with the dragged card on x at ${viewport.label}`,
    ).toBeLessThan(OVERVIEW_DRAG_DELTA_TOLERANCE_PX);
    expect(
      Math.abs(companionDy - targetDy),
      `connected companion should travel with the dragged card on y at ${viewport.label}`,
    ).toBeLessThan(OVERVIEW_DRAG_DELTA_TOLERANCE_PX);
    await expect(target).toHaveAttribute("data-drag-cluster", "true");
    await expect(
      page.locator("[data-drag-cluster-connector]").first(),
    ).toHaveAttribute("d", /^M /);
    const dragConnector = page.locator("[data-drag-cluster-connector]").first();
    const connector = await connectorVisualEvidence(dragConnector);
    expect(
      connector.totalLength,
      `drag connector should be drawable at ${viewport.label}`,
    ).toBeGreaterThan(24);
    expect(
      connector.strokeWidth,
      `drag connector stroke should be visible at ${viewport.label}`,
    ).toBeGreaterThan(1);
    const layerRect = await rectOf(page.getByTestId("sigma-skeleton-cards"));
    const dragFrom = await dragConnector.getAttribute("data-drag-connector-from");
    const dragTo = await dragConnector.getAttribute("data-drag-connector-to");
    if (!dragFrom || !dragTo) {
      throw new Error(`drag connector should expose endpoints at ${viewport.label}`);
    }
    const dragFromRect = await rectOf(
      page.locator(`[data-skeleton-card][data-slug="${dragFrom}"]`),
    );
    const dragToRect = await rectOf(
      page.locator(`[data-skeleton-card][data-slug="${dragTo}"]`),
    );
    expect(
      pointInsideRect(connector.start, dragFromRect, layerRect),
      `drag connector should not draw through its source card body at ${viewport.label}`,
    ).toBe(false);
    expect(
      pointNearRectPerimeter(connector.start, dragFromRect, layerRect),
      `drag connector should begin on the source card clearance port at ${viewport.label}`,
    ).toBe(true);
    expect(
      pointInsideRect(connector.end, dragToRect, layerRect),
      `drag connector should not draw through its target card body at ${viewport.label}`,
    ).toBe(false);
    expect(
      pointNearRectPerimeter(connector.end, dragToRect, layerRect),
      `drag connector should end on the target card clearance port at ${viewport.label}`,
    ).toBe(true);
    const relationLabel = page.locator("[data-drag-relation-label]").first();
    await expect(relationLabel).toHaveText(/contains|depends|relates|describes|uses/);
    const labelBox = await relationLabel.boundingBox();
    expect(labelBox?.width ?? 0, `drag relation label should render at ${viewport.label}`).toBeGreaterThan(8);
    const dragBadge = page.locator("[data-relation-label-bg]").first();
    const dragBadgeBox = await dragBadge.boundingBox();
    expect(
      dragBadgeBox?.width ?? 0,
      `drag relation badge background should render at ${viewport.label}`,
    ).toBeGreaterThan(labelBox?.width ?? 8);
    expect(
      await page.locator('[data-skeleton-card][data-drag-cluster="true"]').count(),
      `dragging Views should mark a connected card cluster at ${viewport.label}`,
    ).toBeGreaterThan(1);
    const hull = page.locator("[data-drag-cluster-hull]");
    await expect(hull).toHaveAttribute("data-visible", "true");
    await expect(page.locator("[data-drag-cluster-title]")).toHaveText("Views");
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-active-drag-cluster-size",
      /^[2-9]\d*$/,
    );
    await expect(hull).toHaveAttribute("data-drag-cluster-size", /^[2-9]\d*$/);
    const dragClusterCountText =
      (await page.locator("[data-drag-cluster-count]").textContent()) ?? "";
    expect(dragClusterCountText).toMatch(/^[2-9]\d* linked$/);
    const dragClusterCount = Number.parseInt(dragClusterCountText, 10);
    expect(
      dragClusterCount,
      `drag cluster count should explain linked movement at ${viewport.label}`,
    ).toBeGreaterThan(1);
    const hullRect = await rectOf(hull);
    expect(
      hullRect.left,
      `drag cluster hull should cover the dragged card on the left at ${viewport.label}`,
    ).toBeLessThanOrEqual(Math.min(whileDragging.left, companionAfter.left) + 2);
    expect(
      hullRect.right,
      `drag cluster hull should cover the dragged card on the right at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(Math.max(whileDragging.right, companionAfter.right) - 2);
    expect(
      hullRect.top,
      `drag cluster hull should cover the dragged card on top at ${viewport.label}`,
    ).toBeLessThanOrEqual(Math.min(whileDragging.top, companionAfter.top) + 2);
    expect(
      hullRect.bottom,
      `drag cluster hull should cover the dragged card on bottom at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(Math.max(whileDragging.bottom, companionAfter.bottom) - 2);
    await page.screenshot({
      path: path.join(OUT, `drag-connector-${viewport.label}.png`),
      fullPage: false,
    });
    await page.mouse.up();
    await expect(page.locator("[data-drag-cluster-connector]")).toHaveCount(0);
    await page.waitForTimeout(300);

    expectCardsClear(
      await visibleCardRects(page),
      viewport,
      analysisRect,
      legendRect,
    );
  });

  test(`Relief path prompt remains readable — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport);

    const prompt = page.getByTestId("topology-path-start-prompt");
    await expect(prompt).toBeVisible();
    const promptTextFits = await prompt.evaluate((el) => {
      const body = el.querySelector("span.min-w-0") as HTMLElement | null;
      if (!body) return false;
      return body.scrollWidth <= body.clientWidth + 1;
    });
    expect(promptTextFits, `path prompt should not truncate at ${viewport.label}`).toBe(
      true,
    );
  });
}

test("Relief selected detail uses a compact top dock below tablet width", async ({
  page,
}) => {
  const viewport = COMPACT_VIEWPORT;
  await openRelief(page, viewport, { mode: "map", requireHud: false });

  await page.locator('[data-skeleton-card][data-slug="domain:views"]').evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("Views card should be an HTML button");
    }
    element.click();
  });
  await page.waitForTimeout(650);
  await expect(page.locator("[data-connector-relation-label]").first()).toHaveText(
    /contains|depends|relates|describes|uses/,
    { timeout: 20_000 },
  );

  const relationLabel = page.locator("[data-connector-relation-label]").first();
  const selectedBadgeId = await relationLabel.getAttribute("data-relation-label-id");
  if (!selectedBadgeId) {
    throw new Error("selected relation label should expose a badge id on compact viewport");
  }
  await page.locator(`[data-relation-label-button="${selectedBadgeId}"]`).evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("relation label hit target should be an HTML button");
    }
    element.click();
  });

  const popover = page.getByTestId("topology-node-popover");
  await expect(popover).toBeVisible();
  const expandedRect = await rectOf(popover);
  expect(
    expandedRect.top,
    "compact selected detail should open from the top chrome, not as a bottom sheet",
  ).toBeLessThanOrEqual(128);
  expect(
    expandedRect.bottom,
    "compact selected detail should leave the lower graph area readable",
  ).toBeLessThan(viewport.height * 0.72);
  expect(
    Math.abs((expandedRect.left + expandedRect.right) / 2 - viewport.width / 2),
    "compact selected detail should stay horizontally centered",
  ).toBeLessThan(24);
  await page.getByRole("button", { name: "Map view" }).click();
  await expect(popover).toHaveAttribute("data-collapsed", "true");
  const collapsedRect = await rectOf(popover);
  expect(
    collapsedRect.height,
    "compact collapsed detail should stay chip-sized",
  ).toBeLessThanOrEqual(88);
  expect(
    collapsedRect.top,
    "compact collapsed detail should remain near the top chrome",
  ).toBeLessThanOrEqual(128);
});
