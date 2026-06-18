import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const VIEWPORTS = [
  { label: "desktop-1280", width: 1280, height: 800 },
  { label: "desktop-1920", width: 1920, height: 1080 },
  { label: "desktop-2560", width: 2560, height: 1440 },
];
const MBP14_FULLSCREEN = { label: "mbp14-fullscreen", width: 1512, height: 949 };
const INSTALLED_APP_WEBVIEW = { label: "installed-app-webview", width: 1512, height: 917 };
const COMPACT_VIEWPORT = { label: "compact-900", width: 900, height: 760 };
const PHONE_VIEWPORT = { label: "phone-390", width: 390, height: 844 };
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
    selectedSlug = null,
    pathFrom = null,
    pathTo = null,
    settle = true,
  }: {
    mode?: "map" | "focus" | "path";
    requireHud?: boolean;
    selectedSlug?: string | null;
    pathFrom?: string | null;
    pathTo?: string | null;
    settle?: boolean;
  } = {},
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const params = new URLSearchParams({ mode });
  if (selectedSlug) params.set("p", selectedSlug);
  if (pathFrom) params.set("pathFrom", pathFrom);
  if (pathTo) params.set("pathTo", pathTo);
  await page.goto(`/en/topology/?${params.toString()}`);
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  if (requireHud) {
    await expect(page.getByTestId("topology-analysis-panel")).toBeVisible();
    await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
      "data-kind-legend-state",
      /visible-support-chrome|collapsed-support-chrome/,
    );
    if (mode === "path" || selectedSlug) {
      await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
        "data-kind-legend-state",
        "collapsed-support-chrome",
      );
      await expect(page.getByTestId("topology-kind-legend")).toHaveCount(0);
      await expect(page.getByTestId("topology-minimap")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("topology-minimap")).toBeVisible();
    }
  }
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-skeleton-cards-ready",
    "true",
    { timeout: 20_000 },
  );
  await expect(
    page.locator('[data-skeleton-card]:not([data-surface-hidden="true"])').first(),
  ).toBeVisible({
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

type Rect = Awaited<ReturnType<typeof rectOf>>;

async function kindLegendRectOrNull(page: Page): Promise<Rect | null> {
  const viewport = page.getByTestId("sigma-topology-viewport");
  await expect(viewport).toHaveAttribute(
    "data-kind-legend-state",
    /visible-support-chrome|collapsed-support-chrome/,
  );
  const state = await viewport.getAttribute("data-kind-legend-state");
  const legend = page.getByTestId("topology-kind-legend");
  if (state === "collapsed-support-chrome") {
    await expect(legend).toHaveCount(0);
    return null;
  }
  await expect(legend).toBeVisible();
  await expect(legend).toHaveAttribute("data-legend-density", "compact");
  return rectOf(legend);
}

function intersects(
  a: Rect,
  b: Rect,
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
          pathRole: el.getAttribute("data-path-role"),
          display: style.display,
          opacity: Number(style.opacity || "1"),
          surfaceHidden: el.getAttribute("data-surface-hidden") === "true",
          visibility: style.visibility,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(
        (rect) =>
          !rect.surfaceHidden &&
          rect.display !== "none" &&
          rect.visibility !== "hidden" &&
          rect.opacity > 0.05 &&
          rect.width > 0 &&
          rect.height > 0,
      ),
  );
}

async function visibleCardScrollWidthViolations(page: Page) {
  return page.locator("[data-skeleton-card]").evaluateAll((els) =>
    els
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          text: el.textContent?.trim() ?? "",
          display: style.display,
          opacity: Number(style.opacity || "1"),
          surfaceHidden: el.getAttribute("data-surface-hidden") === "true",
          visibility: style.visibility,
          width: rect.width,
          height: rect.height,
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          maskContract: el
            .querySelector("[data-edge-mask]")
            ?.getAttribute("data-edge-mask-contract"),
        };
      })
      .filter(
        (card) =>
          !card.surfaceHidden &&
          card.display !== "none" &&
          card.visibility !== "hidden" &&
          card.opacity > 0.05 &&
          card.width > 0 &&
          card.height > 0,
      )
      .filter((card) => card.scrollWidth > card.clientWidth + 1),
  );
}

async function visibleRelationLabelCardOverlaps(page: Page) {
  return page.locator("[data-relation-label-button]").evaluateAll((labels) => {
    const cardRects = Array.from(document.querySelectorAll<HTMLElement>("[data-skeleton-card]"))
      .map((card) => {
        const rect = card.getBoundingClientRect();
        const style = window.getComputedStyle(card);
        return {
          slug: card.getAttribute("data-slug") ?? "",
          surfaceHidden: card.getAttribute("data-surface-hidden") === "true",
          display: style.display,
          opacity: Number(style.opacity || "1"),
          visibility: style.visibility,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(
        (rect) =>
          !rect.surfaceHidden &&
          rect.display !== "none" &&
          rect.visibility !== "hidden" &&
          rect.opacity > 0.05 &&
          rect.width > 0 &&
          rect.height > 0,
      );
    const rectsIntersect = (
      a: { left: number; top: number; right: number; bottom: number },
      b: { left: number; top: number; right: number; bottom: number },
    ) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const hull = document.querySelector<HTMLElement>("[data-drag-cluster-hull]");
    const hullRect = hull?.getBoundingClientRect() ?? null;
    const hullBorderBands = hullRect
      ? [
          {
            edge: "top",
            left: hullRect.left,
            top: hullRect.top - 2,
            right: hullRect.right,
            bottom: hullRect.top + 2,
          },
          {
            edge: "right",
            left: hullRect.right - 2,
            top: hullRect.top,
            right: hullRect.right + 2,
            bottom: hullRect.bottom,
          },
          {
            edge: "bottom",
            left: hullRect.left,
            top: hullRect.bottom - 2,
            right: hullRect.right,
            bottom: hullRect.bottom + 2,
          },
          {
            edge: "left",
            left: hullRect.left - 2,
            top: hullRect.top,
            right: hullRect.left + 2,
            bottom: hullRect.bottom,
          },
        ]
      : [];

    return labels
      .map((label) => {
        const rect = label.getBoundingClientRect();
        const style = window.getComputedStyle(label);
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0.05 &&
          rect.width > 0 &&
          rect.height > 0;
        return {
          id: label.getAttribute("data-relation-label-button") ?? "",
          text: label.textContent?.trim() ?? "",
          visible,
          top: rect.top,
          bottom: rect.bottom,
          clearance: label.getAttribute("data-relation-label-card-clearance"),
          clearanceToken: label.getAttribute("data-relation-label-card-clearance-token"),
          overlapCount: label.getAttribute("data-relation-label-card-overlap-count"),
          policy: label.getAttribute("data-relation-label-card-clearance-policy"),
          hullBorderOverlaps: visible
            ? hullBorderBands
                .filter((band) => rectsIntersect(rect, band))
                .map((band) => band.edge)
            : [],
          overlapsCards: visible
            ? cardRects
                .filter((card) => rectsIntersect(rect, card))
                .map((card) => card.slug)
            : [],
        };
      })
      .filter((label) => label.visible);
  });
}

async function firstVisibleSkeletonCard(page: Page) {
  const slug = await page.locator("[data-skeleton-card]").evaluateAll((els) => {
    const visible = els.find((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        el.getAttribute("data-surface-hidden") !== "true" &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0.05 &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    return visible?.getAttribute("data-slug") ?? null;
  });
  if (!slug) {
    throw new Error("Relief should expose at least one visible skeleton card");
  }
  return page.locator(`[data-skeleton-card][data-slug="${slug}"]`).first();
}

async function expectSelectedCardRelationSummary(page: Page, selectedSlug: string) {
  const selectedCard = page
    .locator(`[data-skeleton-card][data-slug="${selectedSlug}"]`)
    .first();
  await expect(selectedCard).toBeVisible();
  await expect(selectedCard).toHaveAttribute("data-selected", "true");
  await expect(selectedCard).toHaveAttribute(
    "data-card-selected-title-priority",
    "selected-title-before-subtree-count",
  );
  await expect(selectedCard).toHaveAttribute(
    "data-card-max-width-token",
    "--topology-card-selected-focus-max-width",
  );
  const selectedTitle = selectedCard.locator("[data-card-title]");
  await expect(selectedTitle).toHaveAttribute(
    "data-card-title-lane-contract",
    "selected-title-keeps-current-focus-readable",
  );
  const selectedTitleFits = await selectedTitle.evaluate(
    (element) => element.scrollWidth <= element.clientWidth + 1,
  );
  expect(
    selectedTitleFits,
    `selected map card title should stay readable for ${selectedSlug}`,
  ).toBe(true);
  const subtreeCount = selectedCard.locator("[data-skeleton-card-count]");
  await expect(subtreeCount).toHaveAttribute(
    "data-count-chip-visibility",
    "sr-only-selected-relation-summary",
  );
  const summary = selectedCard.getByTestId("sigma-selected-card-relation-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute(
    "data-relation-summary-contract",
    "selected-card-direct-facts",
  );
  await expect(summary).toHaveAttribute(
    "data-relation-summary-surface-token",
    "--topology-relation-summary-surface",
  );
  await expect(summary).toHaveAttribute(
    "data-relation-summary-border-token",
    "--topology-relation-summary-border",
  );
  await expect(summary).toHaveAttribute(
    "data-relation-summary-text-token",
    "--topology-relation-summary-text",
  );
  await expect(summary).toHaveAttribute("data-relation-count", /^[1-9]\d*$/);
  await expect(summary).toHaveAttribute("data-relation-type-count", /^[1-9]\d*$/);
  await expect(summary).toHaveAttribute(
    "data-relation-summary-readable-text",
    /\d+ facts? · \d+ types? · inspect/,
  );
  await expect(summary).toHaveAttribute(
    "data-relation-summary-visible-contract",
    "primary-count-plus-inspect-action-visible-full-summary-accessible",
  );
  await expect(summary).toHaveAttribute(
    "data-relation-summary-map-label-fallback",
    "selected-card-keeps-action-when-map-labels-collapse",
  );
  await expect(summary).toHaveAttribute(
    "data-relation-summary-visible-text",
    /\d+ facts? · inspect/,
  );
  await expect(summary).not.toHaveText(/^\d+f · \d+t$/);
}

async function expectSelectedCardHiddenForCompactRail(page: Page, selectedSlug: string) {
  const layer = page.getByTestId("sigma-skeleton-cards");
  await expect(layer).toHaveAttribute(
    "data-selected-focus-card-visibility-contract",
    "compact-rail-hides-selected-map-card",
  );
  await expect(layer).toHaveAttribute(
    "data-selected-focus-card-visibility-policy",
    "hide-selected-card",
  );
  await expect(layer).toHaveAttribute(
    "data-selected-focus-card-hide-max-width-px",
    "1280",
  );
  const selectedCard = page
    .locator(`[data-skeleton-card][data-slug="${selectedSlug}"]`)
    .first();
  await expect(selectedCard).toHaveAttribute("data-selected", "true");
  await expect(selectedCard).toHaveAttribute("data-surface-hidden", "true");
}

test("Relief left panel stays readable on MacBook Pro 14-inch fullscreen", async ({
  page,
}) => {
  await openRelief(page, MBP14_FULLSCREEN, { mode: "map" });

  const panel = page.getByTestId("topology-analysis-panel");
  const minimap = page.getByTestId("topology-minimap");
  const panelRect = await rectOf(panel);
  const legendRect = await kindLegendRectOrNull(page);
  const minimapRect = await rectOf(minimap);

  await expect(panel).toHaveAttribute("data-panel-width-policy", "overview-support");
  await expect(panel).toHaveAttribute("data-panel-width-band", "header-aligned");
  await expect(panel).toHaveAttribute("data-panel-width-target", "overview-14-inch-compact");
  await expect(panel).toHaveAttribute("data-panel-width-css", "var(--topology-panel-overview-responsive-width)");
  await expect(panel).toHaveAttribute("data-panel-width-token", "--topology-panel-overview-responsive-width");
  await expect(panel).toHaveAttribute(
    "data-panel-phone-utility-reserve-token",
    "--topology-panel-phone-utility-rail-reserve",
  );
  expect(panelRect.width, "analysis panel should keep the compact 14-inch support width").toBeGreaterThanOrEqual(318);
  expect(panelRect.width, "analysis panel should not compete with the map on 14-inch fullscreen").toBeLessThanOrEqual(342);
  expect(panelRect.height, "analysis panel should expose the overview stack").toBeGreaterThan(420);
  await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
    "data-kind-legend-state",
    "collapsed-support-chrome",
  );
  await expect(panel.getByText(/Relation provenance|관계 출처/i)).toBeVisible();
  await expect(panel.getByText(/Agent readiness|Agent 준비도/i)).toBeVisible();
  await expect(page.getByTestId("topology-overview-signal-grid")).toBeVisible();
  await expect(page.getByTestId("topology-overview-signal-grid")).toHaveAttribute(
    "data-surface-token",
    "--topology-overview-signal-grid-surface",
  );
  await expect(page.getByTestId("topology-overview-relation-progress")).toHaveAttribute(
    "data-surface-token",
    "--topology-overview-signal-neutral-surface",
  );
  await expect(page.getByTestId("topology-overview-relation-provenance")).toHaveAttribute(
    "data-border-token",
    "--topology-overview-signal-indigo-border",
  );
  await expect(page.getByTestId("topology-overview-relation-provenance")).toHaveAttribute(
    "data-overview-provenance-contract",
    "scan-counts-not-wrapped-summary",
  );
  const relationQuality = page.getByTestId("topology-overview-relation-quality");
  await expect(relationQuality).toHaveAttribute(
    "data-quality-meter-contract",
    "distribution-bar-maps-relation-quality",
  );
  const relationQualityMeter = page.getByTestId("topology-overview-relation-quality-meter");
  await expect(relationQualityMeter).toHaveAttribute(
    "data-surface-token",
    "--topology-overview-quality-meter-surface",
  );
  await expect(relationQualityMeter).toHaveAttribute(
    "data-border-token",
    "--topology-overview-quality-meter-border",
  );
  await expect(relationQualityMeter.locator('[data-relation-quality-segment="strong"]')).toHaveAttribute(
    "data-meter-token",
    "--topology-overview-quality-strong-meter",
  );
  await expect(relationQualityMeter.locator('[data-relation-quality-segment="weak"]')).toHaveAttribute(
    "data-meter-token",
    "--topology-overview-quality-weak-meter",
  );
  await expect(page.getByTestId("topology-overview-relation-notice")).toHaveAttribute(
    "data-border-token",
    "--topology-overview-notice-border",
  );
  await expect(panel.getByRole("button", { name: /Copy topology overview brief|토폴로지 개요/i })).toBeVisible();
  await expect(page.getByTestId("topology-overview-brief-copy")).toHaveAttribute(
    "data-border-token",
    "--topology-overview-handoff-primary-border",
  );
  await expect(panel.getByTestId("topology-overview-handoff-summary")).toBeVisible();
  await expect(panel.getByTestId("topology-overview-handoff-actions")).toHaveAttribute(
    "data-divider-token",
    "--topology-overview-handoff-divider",
  );
  const panelOverflow = await panel.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: window.getComputedStyle(element).overflowY,
  }));
  expect(panelOverflow.overflowY, "overview panel should not introduce its own scrollbar").toBe("hidden");
  expect(
    panelOverflow.scrollHeight - panelOverflow.clientHeight,
    "overview panel content should fit the first MacBook 14-inch view",
  ).toBeLessThanOrEqual(2);

  const copyButtonRect = await rectOf(
    panel.getByRole("button", { name: /Copy topology overview brief|토폴로지 개요/i }),
  );
  const copyToolsRect = await rectOf(panel.getByTestId("topology-overview-handoff-summary"));
  expect(copyButtonRect.height, "copy actions need a MacBook-sized hit target").toBeGreaterThanOrEqual(34);
  expect(copyButtonRect.width, "copy action should use the compact support panel width").toBeGreaterThanOrEqual(
    panelRect.width - 40,
  );
  expect(
    copyToolsRect.bottom,
    "secondary handoff disclosure should stay inside the first panel view",
  ).toBeLessThanOrEqual(panelRect.bottom);
  expect(
    minimapRect.left,
    "overview minimap should stay on the map side, not inside the analysis rail",
  ).toBeGreaterThan(panelRect.right);
  expectCardsClear(
    await visibleCardRects(page),
    MBP14_FULLSCREEN,
    panelRect,
    legendRect,
    minimapRect,
  );
  const capabilityCard = page
    .locator(
      [
        '[data-skeleton-card][data-tier="2"]',
        '[data-card-max-width-token="--topology-card-max-width-capability"]',
        ':not([data-surface-hidden="true"])',
      ].join(""),
    )
    .first();
  await expect(capabilityCard).toBeVisible();
  await expect(capabilityCard).toHaveAttribute(
    "data-card-readable-width-contract",
    "tier-token-preserves-title-lane",
  );
  const capabilityTitle = capabilityCard.locator("[data-card-title]");
  await expect(capabilityTitle).toHaveAttribute(
    "data-card-title-lane-contract",
    "title-shrinks-before-meta-chips",
  );
  const capabilityTitleFits = await capabilityTitle.evaluate(
    (el) => el.scrollWidth <= el.clientWidth + 1,
  );
  expect(
    capabilityTitleFits,
    "14-inch overview capability card title should fit its tokenized map-card lane",
  ).toBe(true);
});

test("Relief overview panel owns the phone read layer above map cards", async ({ page }) => {
  await openRelief(page, PHONE_VIEWPORT, { mode: "map", requireHud: false });

  const panel = page.getByTestId("topology-analysis-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-analysis-mode", "overview");
  await expect(panel).toHaveAttribute("data-panel-layer-contract", "read-surface-above-map-cards");
  await expect(panel).toHaveAttribute("data-panel-z-index-token", "--topology-panel-read-layer-z-index");

  const layerProof = await panel.evaluate((el) => {
    const panelRect = el.getBoundingClientRect();
    const target = document.elementFromPoint(
      panelRect.left + panelRect.width / 2,
      panelRect.top + panelRect.height / 2,
    );
    const owner = target?.closest('[data-testid="topology-analysis-panel"], [data-skeleton-card]');
    return {
      panelZ: getComputedStyle(el).zIndex,
      ownerTestId: owner?.getAttribute("data-testid") || "",
      ownerSlug: owner?.getAttribute("data-slug") || "",
    };
  });

  expect(layerProof.panelZ, "phone overview panel should use the read layer z-index").toBe("30");
  expect(layerProof.ownerTestId, "phone overview panel center should not hit a map card").toBe(
    "topology-analysis-panel",
  );
  expect(layerProof.ownerSlug, "phone overview panel center should not expose a skeleton card slug").toBe("");
  const provenanceRowsFit = await panel
    .locator("[data-overview-provenance-row]")
    .evaluateAll((rows) => rows.every((row) => row.scrollWidth <= row.clientWidth + 1));
  expect(provenanceRowsFit, "phone overview provenance rows should not truncate").toBe(true);
  await expect(page.getByTestId("topology-overview-relation-quality-supported")).toHaveAttribute(
    "data-compact-label",
    "support",
  );
  await expect(page.getByTestId("topology-overview-relation-quality-meter")).toHaveAttribute(
    "data-quality-meter-contract",
    "distribution-bar-maps-relation-quality",
  );
  const overviewProofLabelsFit = await panel
    .locator("[data-proof-label-contract='compact-visible-full-aria'] span:last-child")
    .evaluateAll((labels) => labels.every((label) => label.scrollWidth <= label.clientWidth + 1));
  expect(overviewProofLabelsFit, "phone overview proof labels should not truncate").toBe(true);
});

test("Relief default route renders the readable card skeleton without panel scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 789 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/topology/");
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("topology-analysis-panel")).toBeVisible();
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-skeleton-cards-ready",
    "true",
    { timeout: 20_000 },
  );

  await expect(page.locator("[data-skeleton-card]")).toHaveCount(21);
  await expect(
    page.locator('[data-skeleton-card]:not([data-surface-hidden="true"])').first(),
  ).toBeVisible();

  const panelOverflow = await page
    .getByTestId("topology-analysis-panel")
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: window.getComputedStyle(element).overflowY,
    }));
  expect(panelOverflow.overflowY, "default overview panel should not scroll").toBe("hidden");
  expect(
    panelOverflow.scrollHeight - panelOverflow.clientHeight,
    "default overview panel content should fit at the deployed verifier size",
  ).toBeLessThanOrEqual(2);
});

test("Korean Relief top actions stay localized", async ({
  page,
}) => {
  await page.goto("/ko/topology/?mode=map");
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-skeleton-cards-ready",
    "true",
    { timeout: 20_000 },
  );

  await expect(page.getByRole("button", { name: "자동 정렬" })).toContainText("자동 정렬");
  await expect(page.getByRole("button", { name: "개념 검색" })).toContainText("검색");
  await expect(
    page.getByRole("button", { name: "온톨로지 워크스페이스 빠른 보기 열기 (D)" }),
  ).toContainText("작업공간");
  await expect(page.getByTestId("topology-overview-agent-readiness")).toContainText(
    "에이전트 준비도",
  );
  await expect(page.getByTestId("topology-overview-agent-readiness")).toContainText(
    "전달 가능",
  );
  await expect(page.getByTestId("topology-overview-agent-readiness")).toContainText(
    "사전 점검",
  );
  await expect(page.getByTestId("topology-overview-agent-readiness")).not.toContainText(
    /\b(Agent|handoff|preflight)\b/,
  );
});

test("Relief minimap pans the viewport with visible feedback", async ({
  page,
}) => {
  await openRelief(page, { width: 1920, height: 1080 }, { mode: "map" });

  const minimap = page.getByTestId("topology-minimap");
  await expect(minimap).toBeVisible();
  await expect(minimap).toHaveAttribute(
    "data-minimap-camera-sync-contract",
    "raf-coalesced-camera-updates",
  );
  await expect(minimap).toHaveAttribute(
    "data-minimap-surface-token",
    "--topology-minimap-surface",
  );
  await expect(minimap).toHaveAttribute(
    "data-minimap-pan-search-contract",
    "precomputed-navigation-targets",
  );
  const beforeTick = Number(await minimap.getAttribute("data-camera-tick"));
  const beforeFrameCount = Number(await minimap.getAttribute("data-camera-frame-count"));
  const beforePanSearchCount = Number(
    await minimap.getAttribute("data-minimap-pan-search-count"),
  );
  const panTargetCount = Number(await minimap.getAttribute("data-minimap-pan-target-count"));
  expect(panTargetCount).toBeGreaterThan(0);
  const box = await minimap.boundingBox();
  if (!box) {
    throw new Error("missing minimap bounding box");
  }

  await page.mouse.click(box.x + box.width * 0.78, box.y + box.height * 0.32);
  await expect(minimap).toHaveAttribute("data-navigating", "true");
  await expect.poll(async () => {
    return Number(await minimap.getAttribute("data-camera-tick"));
  }, {
    message: "minimap click should update the Relief camera",
    timeout: 4_000,
  }).toBeGreaterThan(beforeTick);
  await expect.poll(async () => {
    return Number(await minimap.getAttribute("data-camera-frame-count"));
  }, {
    message: "minimap camera updates should be folded into render frames",
    timeout: 4_000,
  }).toBeGreaterThan(beforeFrameCount);
  const updateEventCount = Number(await minimap.getAttribute("data-camera-update-event-count"));
  const frameCount = Number(await minimap.getAttribute("data-camera-frame-count"));
  expect(frameCount).toBeLessThanOrEqual(updateEventCount);
  expect(Number(await minimap.getAttribute("data-minimap-pan-search-count"))).toBeGreaterThan(
    beforePanSearchCount,
  );
  await expect(minimap).toHaveAttribute("data-navigating", "false", {
    timeout: 1_500,
  });
});

async function connectorVisualEvidence(locator: Locator) {
  return locator.evaluate((el) => {
    if (!(el instanceof SVGPathElement)) {
      return {
        axis: "",
        d: "",
        end: null,
        start: null,
        clearance: 0,
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
      clearance: Number.parseFloat(el.dataset.connectorClearance || "0"),
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

function pointDistanceFromRect(
  point: { x: number; y: number } | null,
  rect: Awaited<ReturnType<typeof rectOf>>,
  layerRect: Awaited<ReturnType<typeof rectOf>>,
) {
  if (!point) return 0;
  const x = layerRect.left + point.x;
  const y = layerRect.top + point.y;
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.max(dx, dy);
}

function expectCardsClear(
  cards: Array<Rect & { text: string }>,
  viewport: { label: string; width: number; height: number },
  analysisRect: Rect,
  legendRect: Rect | null,
  minimapRect?: Rect,
) {
  const hudViolations = cards.filter(
    (card) =>
      intersects(card, analysisRect, 8) ||
      (legendRect ? intersects(card, legendRect, 8) : false) ||
      (minimapRect ? intersects(card, minimapRect, 8) : false),
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
    const legendRect = await kindLegendRectOrNull(page);
    expect(
      (await visibleCardRects(page)).length,
      `stale camera URL should still settle into a readable skeleton at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(8);
    expectCardsClear(
      await visibleCardRects(page),
      viewport,
      await rectOf(page.getByTestId("topology-analysis-panel")),
      legendRect,
    );
  });

  test(`Relief skeleton cards stay separated during initial settle — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport, { settle: false });

    const analysisRect = await rectOf(page.getByTestId("topology-analysis-panel"));
    const legendRect = await kindLegendRectOrNull(page);
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
    const legendRect = await kindLegendRectOrNull(page);
    await expect(page.getByTestId("topology-analysis-panel-prompt")).toHaveAttribute(
      "data-prompt-text-token",
      "--topology-analysis-panel-prompt-text",
    );
    await expect(page.getByTestId("topology-analysis-panel-metrics")).toHaveAttribute(
      "data-metric-label-text-token",
      "--topology-analysis-panel-metric-label-text",
    );
    await expect(page.getByTestId("topology-analysis-panel-metrics")).toHaveAttribute(
      "data-metric-value-text-token",
      "--topology-analysis-panel-metric-value-text",
    );
    expectCardsClear(await visibleCardRects(page), viewport, analysisRect, legendRect);
    const overviewConnector = page
      .locator('[data-overview-connector-from][data-relation-stroke-contract="quality-token"]')
      .first();
    await expect(overviewConnector).toHaveAttribute("d", /^M /);
    await expect(overviewConnector).toHaveAttribute(
      "data-relation-stroke-token",
      /--topology-relation-stroke-(strong|supported|weak|review|selected)/,
    );
    await expect(overviewConnector).toHaveAttribute(
      "data-relation-stroke-width-token",
      /--topology-relation-stroke-(strong|supported|weak|review|selected)-width/,
    );
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
      .locator(
        '[data-overview-connector-from][data-connector-axis="vertical"][data-relation-stroke-contract="quality-token"]',
      )
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

    await expect(page.getByTestId("topology-overview-agent-readiness")).toHaveAttribute(
      "data-agent-readiness-summary",
      /handoff-ready|handoff 가능/i,
    );
    await expect(page.locator('[data-agent-readiness-chip="ready"]')).toHaveAttribute(
      "data-compact-label",
      "ready",
    );
    await expect(page.locator('[data-agent-readiness-chip="ready"]')).toHaveAttribute(
      "data-full-label",
      /handoff-ready|handoff 가능/i,
    );
    await expect(page.getByTestId("topology-overview-agent-readiness-meter")).toBeVisible();
    await expect(page.getByTestId("topology-overview-agent-readiness-meter")).toHaveAttribute(
      "aria-label",
      /Agent readiness|Agent 준비도/i,
    );
    await expect(page.getByTestId("topology-overview-agent-readiness-meter")).toHaveAttribute(
      "data-border-token",
      "--topology-overview-readiness-meter-border",
    );
    await expect(
      page.locator('[data-agent-readiness-segment="ready"]'),
    ).toHaveAttribute("data-meter-token", "--topology-overview-readiness-ready-meter");
    const selectableCard = page
      .locator('[data-skeleton-card]:not([data-surface-hidden="true"])', {
        hasText: "AI Agent Partner",
      })
      .first();
    await expect(selectableCard).toBeVisible();
    await selectableCard.click();
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
    const relationButton = page
      .locator(
        '[data-relation-label-button][data-label-geometry-source="html-hit-target"][data-relation-label-visibility="visible-clear"]',
      )
      .first();
    const skeletonCards = page.getByTestId("sigma-skeleton-cards");
    if ((await relationButton.count()) === 0) {
      const suppressedLabel = page.locator("[data-relation-label-button]").first();
      await expect(suppressedLabel).toHaveAttribute(
        "data-relation-label-visibility",
        /suppressed-hidden-endpoint|suppressed-card-overlap/,
      );
      await expect(suppressedLabel).toBeHidden();
      await expect(suppressedLabel).toHaveCSS("pointer-events", "none");
      return;
    }
    await expect(relationButton).toHaveAttribute("data-label-geometry-source", "html-hit-target");
    await expect(relationButton).toHaveAttribute("data-relation-label-visibility", "visible-clear");
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-token-contract",
      "hit-target-and-visible-badge-share-relation-label-tokens",
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-surface-token",
      "--topology-relation-label-surface",
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-border-token",
      "--topology-relation-label-border",
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-shadow-token",
      "--topology-relation-label-shadow",
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-focus-ring-token",
      "--topology-relation-label-focus-ring",
    );
    await expect(skeletonCards).toHaveAttribute(
      "data-relation-label-geometry-contract",
      "frame-positioned-hit-targets",
    );
    await expect(skeletonCards).toHaveAttribute(
      "data-relation-label-geometry-source",
      "after-render-layout-pass",
    );
    const geometryReadyCount = Number(
      await skeletonCards.getAttribute("data-relation-label-geometry-ready-count"),
    );
    const geometryExpectedCount = Number(
      await skeletonCards.getAttribute("data-relation-label-geometry-expected-count"),
    );
    expect(
      geometryReadyCount,
      `relation label frame geometry ready count should cover expected labels at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(geometryExpectedCount);
    if (geometryExpectedCount > 0) {
      expect(
        geometryReadyCount,
        `visible relation label frame geometry should be ready before selection at ${viewport.label}`,
      ).toBeGreaterThanOrEqual(1);
    }
    await expect(skeletonCards).toHaveAttribute(
      "data-relation-label-geometry-pending-count",
      "0",
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-quality",
      /strong|supported|weak|review/,
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-evidence-state",
      /source-backed|authored|needs-review/,
    );
    await expect(relationButton.locator("[data-relation-evidence-glyph]")).toHaveText(
      /S\d+|S9\+|A|R/,
    );
    await expect(relationButton).toHaveAttribute(
      "data-agent-gate-kind",
      /handoff-ready|preflight-first|review-first/,
    );
    await expect(relationButton).toHaveAttribute(
      "data-primary-copy-action",
      /relation_check|explain_relation/,
    );
    await expect(relationButton).toHaveAttribute(
      "data-cli-fallback-command",
      /ontology-atlas (relation-check|explain)/,
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-fact-route",
      "fact>evidence>gate>action",
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-fact-segmentation",
      "type>evidence>gate",
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-agent-gate-visible",
      "true",
    );
    const visibleRelationBadge = relationButton.locator(
      "[data-relation-label-visible-badge]",
    );
    await expect(visibleRelationBadge).toHaveAttribute(
      "data-relation-label-fact-segmentation",
      "type>evidence>gate",
    );
    await expect(visibleRelationBadge).toHaveAttribute(
      "data-relation-label-segment-gap-token",
      "--topology-relation-label-segment-gap",
    );
    await expect(visibleRelationBadge).toHaveAttribute(
      "data-relation-label-segment-divider-token",
      "--topology-relation-label-border",
    );
    const scanGateChip = relationButton.locator("[data-relation-label-agent-gate]");
    await expect(scanGateChip).toBeVisible();
    await expect(scanGateChip).toHaveAttribute("data-relation-label-segment", "gate");
    await expect(scanGateChip).toHaveAttribute(
      "data-route-chip-text",
      /explain|check|review/,
    );
    const relationButtonBox = await relationButton.boundingBox();
    if (!relationButtonBox) {
      throw new Error(`selected relation HTML badge should expose a box at ${viewport.label}`);
    }
    const visibleBadgeWidth = Number(await relationButton.getAttribute("data-visible-badge-width"));
    expect(
      visibleBadgeWidth,
      `selected relation visual badge should expose geometry at ${viewport.label}`,
    ).toBeGreaterThan(8);
    expect(
      relationButtonBox.width,
      `selected relation hit target should cover its visible badge at ${viewport.label}`,
    ).toBeGreaterThan(visibleBadgeWidth);
    expect(
      relationButtonBox.width,
      `selected relation label should stay compact while the inspector carries details at ${viewport.label}`,
    ).toBeLessThanOrEqual(180);
    expect(
      relationButtonBox.height,
      `selected relation hit target should be comfortably clickable at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(28);
    const visibleBadgeHeight = Number(
      await relationButton.getAttribute("data-visible-badge-height"),
    );
    expect(
      visibleBadgeHeight,
      `selected relation visual badge should remain visually compact at ${viewport.label}`,
    ).toBeLessThan(relationButtonBox.height);
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-pointer-contract",
      "html-hit-target-click-selects-relation",
    );
    await relationButton.click();
    await expect(relationButton).toHaveAttribute("data-selected-relation", "true");
    await expect(skeletonCards).toHaveAttribute(
      "data-relation-label-geometry-ready-count",
      /[1-9]\d*/,
    );
    await expect(skeletonCards).toHaveAttribute(
      "data-relation-label-geometry-pending-count",
      "0",
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-viewport-clamp-contract",
      /centered-within-viewport|compacted-to-viewport-edge/,
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-viewport-clamp-side",
      /left|right|none/,
    );
    await expect(skeletonCards).toHaveAttribute(
      "data-relation-label-handoff-contract",
      "label-level-mcp-cli-fallback",
    );
    await expect(skeletonCards).toHaveAttribute(
      "data-selected-relation-label-handoff",
      "ready",
    );
    await expect(skeletonCards).toHaveAttribute(
      "data-selected-relation-label-gate",
      /handoff-ready|preflight-first|review-first/,
    );
    await expect(skeletonCards).toHaveAttribute(
      "data-selected-relation-label-primary-action",
      /relation_check|explain_relation/,
    );
    await expect(skeletonCards).toHaveAttribute(
      "data-selected-relation-label-cli-fallback",
      /ontology-atlas (relation-check|explain)/,
    );
    await expect(skeletonCards).toHaveAttribute(
      "data-selected-relation-label-fact-route",
      "fact>evidence>gate>action",
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-fact-route",
      "fact>evidence>gate>action",
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-fact-route-gate",
      /handoff-ready|preflight-first|review-first/,
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-fact-route-action",
      /relation_check|explain_relation/,
    );
    await expect(relationButton).toHaveAttribute(
      "data-relation-label-agent-gate-visible",
      "true",
    );
    const visibleGateChip = relationButton.locator("[data-relation-label-agent-gate]");
    await expect(visibleGateChip).toBeVisible();
    await expect(visibleGateChip).toHaveAttribute(
      "data-route-chip-text",
      /explain|check|review/,
    );
    await expect(visibleGateChip).toHaveAttribute(
      "data-surface-token",
      /--topology-relation-gate-(ready|preflight|review)-surface/,
    );
    const relationTypeText = relationButton.locator("[data-relation-label-type-text]");
    await expect(relationTypeText).toHaveAttribute(
      "data-relation-label-type-text-contract",
      "typed-fact-label-stays-readable",
    );
    await expect(relationTypeText).toHaveAttribute("data-relation-label-segment", "type");
    await expect(relationTypeText).toHaveAttribute(
      "data-segment-divider-token",
      "--topology-relation-label-border",
    );
    await expect(relationTypeText).toHaveText(/contains|depends|relates|describes|uses/);
    const relationTypeTextFit = await relationTypeText.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    );
    expect(
      relationTypeTextFit,
      `selected relation type text should not truncate before evidence/gate chips at ${viewport.label}`,
    ).toBe(true);
    const visibleRelationSegmentsFit = await relationButton
      .locator("[data-relation-label-segment]")
      .evaluateAll((segments) =>
        segments.every((segment) => segment.scrollWidth <= segment.clientWidth + 1),
      );
    expect(
      visibleRelationSegmentsFit,
      `relation label type/evidence/gate segments should fit inside the visible badge at ${viewport.label}`,
    ).toBe(true);
    await expect(relationButton.locator('[data-route-chip="fact"]')).toHaveAttribute(
      "data-route-chip-text",
      "fact",
    );
    await expect(relationButton.locator('[data-route-chip="evidence"]')).toHaveAttribute(
      "data-route-chip-text",
      /src|auth|review/,
    );
    await expect(page.getByTestId("sigma-selected-edge-card")).toBeVisible();
    await expect(page.getByTestId("sigma-selected-edge-card")).toHaveAttribute(
      "data-surface-token",
      "--topology-selected-relation-card-surface",
    );
    await expect(page.getByTestId("sigma-selected-edge-card")).toHaveAttribute(
      "data-border-token",
      "--topology-selected-relation-card-border",
    );
    await expect(page.getByTestId("sigma-selected-edge-card")).toHaveAttribute(
      "data-typography-contract",
      "legible-compact-relation-inspector",
    );
    const claimLens = page.getByTestId("sigma-selected-edge-claim-lens");
    await expect(claimLens).toHaveAttribute("data-relation-quality", /strong|supported|weak|review/);
    await expect(claimLens).toHaveAttribute(
      "data-claim-lens-copy-contract",
      "visible-proof-full-proof-accessible",
    );
    await expect(claimLens).toHaveAttribute(
      "data-claim-lens-visible-text",
      /src|authored|review|출처|작성자|검토/,
    );
    await expect(claimLens).toHaveAttribute(
      "data-claim-lens-full-text",
      /typed ontology fact|타입이 있는 온톨로지 사실/i,
    );
    await expect(claimLens.locator("[data-relation-quality-dot]")).toBeVisible();
    const claimLensVisibleFits = await claimLens
      .locator("[data-claim-lens-visible-summary]")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
    expect(
      claimLensVisibleFits,
      `selected relation claim lens visible proof should fit at ${viewport.label}`,
    ).toBe(true);
    await expect(claimLens).toContainText(/typed ontology fact|타입이 있는 온톨로지 사실/i);
    await expect(claimLens).toContainText(/strong|supported|weak|review|강한 구조|근거 있음|약한 관련|검토 필요/i);
    const relationContract = page.getByTestId("sigma-selected-edge-contract");
    await expect(relationContract).toHaveAttribute("data-relation-contract", "typed-fact-not-similarity");
    await expect(relationContract).toHaveAttribute(
      "data-relation-contract-copy-contract",
      "visible-judgment-full-explanation-accessible",
    );
    await expect(relationContract).toHaveAttribute(
      "data-relation-contract-visible-text",
      /Typed fact|타입 사실/,
    );
    await expect(relationContract).toContainText(/not a similarity score|유사도 점수가 아니라/i);
    await expect(relationContract).toContainText(/handoff confidence|handoff 신뢰도|전달 신뢰도/i);
    const relationContractVisibleSummary = relationContract.locator(
      "[data-relation-contract-visible-summary]",
    );
    const relationContractVisibleFits = await relationContractVisibleSummary.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    );
    expect(
      relationContractVisibleFits,
      `selected relation contract visible judgment should fit at ${viewport.label}`,
    ).toBe(true);
    const agentGate = page.getByTestId("sigma-selected-edge-agent-gate");
    await expect(agentGate).toContainText(/handoff ready|preflight first|review first|handoff 준비됨|전달 준비됨|preflight 먼저|사전 점검 먼저|검토 먼저/i);
    await expect(page.getByTestId("sigma-selected-edge-card")).toHaveAttribute(
      "data-agent-gate-kind",
      /handoff-ready|preflight-first|review-first/,
    );
    const agentDecision = page.getByTestId("sigma-selected-edge-agent-decision");
    await expect(agentDecision).toHaveAttribute(
      "data-agent-gate-kind",
      /handoff-ready|preflight-first|review-first/,
    );
    await expect(agentDecision).toHaveAttribute(
      "data-agent-decision-copy-contract",
      "visible-judgment-full-decision-accessible",
    );
    await expect(agentDecision).toHaveAttribute(
      "data-agent-decision-visible-text",
      /Agent-ready|Check first|Review first|전달 준비|점검 먼저|검토 먼저/,
    );
    await expect(agentDecision).toContainText(/agent handoff|에이전트 전달|relation_check|agent-ready|관계 근거|handoff|전달/i);
    const agentDecisionVisibleSummary = agentDecision.locator(
      "[data-agent-decision-visible-summary]",
    );
    const agentDecisionVisibleFits = await agentDecisionVisibleSummary.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    );
    expect(
      agentDecisionVisibleFits,
      `selected relation agent decision visible judgment should fit at ${viewport.label}`,
    ).toBe(true);
    const agentRoute = page.getByTestId("sigma-selected-edge-agent-route");
    await expect(agentRoute).toHaveAttribute(
      "data-agent-gate-kind",
      /handoff-ready|preflight-first|review-first/,
    );
    await expect(agentRoute).toHaveAttribute(
      "data-route-layout-contract",
      "compact-two-column-route-grid",
    );
    await expect(agentRoute).toHaveAttribute(
      "data-primary-copy-action",
      /relation_check|explain_relation/,
    );
    await expect(agentRoute.locator("[data-route-step]")).toHaveCount(4);
    await expect(agentRoute.locator('[data-route-step="fact"]')).toHaveAttribute(
      "data-route-step-value",
      /typed ontology fact|타입이 있는 온톨로지 사실/i,
    );
    await expect(agentRoute.locator('[data-route-step="fact"]')).toHaveAttribute(
      "data-route-step-visible-value",
      /typed|타입/i,
    );
    await expect(agentRoute.locator('[data-route-step="evidence"]')).toHaveAttribute(
      "data-route-step-value",
      /source|authored|review|출처|작성자|검토/i,
    );
    await expect(agentRoute.locator('[data-route-step="gate"]')).toHaveAttribute(
      "data-route-step-value",
      /handoff ready|preflight first|review first|handoff 준비됨|전달 준비됨|preflight 먼저|사전 점검 먼저|검토 먼저/i,
    );
    await expect(agentRoute.locator('[data-route-step="gate"]')).toHaveAttribute(
      "data-route-step-visible-value",
      /handoff|check|review|전달|점검|검토/i,
    );
    await expect(agentRoute.locator('[data-route-step="action"]')).toHaveAttribute(
      "data-route-step-value",
      /relation_check|explain_relation/,
    );
    await expect(agentRoute.locator('[data-route-step="action"]')).toHaveAttribute(
      "data-route-step-visible-value",
      /check|explain|점검|설명/,
    );
    const routeVisibleValuesFit = await agentRoute
      .locator("[data-route-step-value-text]")
      .evaluateAll((values) =>
        values.every((element) => element.scrollWidth <= element.clientWidth + 1),
      );
    expect(
      routeVisibleValuesFit,
      `selected relation route visible values should fit at ${viewport.label}`,
    ).toBe(true);
    await expect(agentRoute).toContainText(/typed ontology fact|타입이 있는 온톨로지 사실/i);
    await expect(agentRoute).toContainText(/MCP action|MCP 액션/i);
    const handleStrip = page.getByTestId("sigma-selected-edge-handle-strip");
    await expect(handleStrip).toHaveAttribute("data-source-handle", /.+/);
    await expect(handleStrip).toHaveAttribute("data-target-handle", /.+/);
    await expect(handleStrip).toHaveAttribute(
      "data-relation-type",
      /contains|depends|relates|describes|uses/,
    );
    const sourceHandle = await handleStrip.getAttribute("data-source-handle");
    const targetHandle = await handleStrip.getAttribute("data-target-handle");
    await expect(handleStrip).toContainText(sourceHandle ?? "");
    await expect(handleStrip).toContainText(targetHandle ?? "");
    await expect(page.locator('[data-relation-copy-priority="primary"]')).toHaveAttribute(
      "data-relation-copy-action",
      /relation_check|explain_relation/,
    );
    const primaryCopyAction = await page
      .locator('[data-relation-copy-priority="primary"]')
      .getAttribute("data-relation-copy-action");
    const nextActionRail = page.getByTestId("sigma-selected-edge-next-action");
    await expect(nextActionRail).toHaveAttribute(
      "data-next-action-contract",
      "primary-action-first",
    );
    await expect(nextActionRail).toHaveAttribute("data-next-action", primaryCopyAction ?? "");
    await expect(nextActionRail).toHaveAttribute(
      "data-next-action-surface-token",
      "--topology-selected-relation-next-action-surface",
    );
    const copyPayload = page.getByTestId("sigma-selected-edge-copy-payload");
    await expect(copyPayload).toHaveAttribute("data-copy-payload-tool", "query_ontology");
    await expect(copyPayload).toHaveAttribute(
      "data-copy-payload-action",
      primaryCopyAction ?? "",
    );
    await expect(copyPayload).toHaveAttribute("data-copy-payload-from", /.+/);
    await expect(copyPayload).toHaveAttribute("data-copy-payload-to", /.+/);
    await expect(copyPayload).toHaveAttribute(
      "data-copy-payload-handle-summary",
      `${sourceHandle ?? ""} → ${targetHandle ?? ""}`,
    );
    await expect(copyPayload).toContainText(/query_ontology/);
    await expect(copyPayload).toContainText(/relation_check|explain_relation/);
    await expect(copyPayload).toContainText(sourceHandle ?? "");
    await expect(copyPayload).toContainText(targetHandle ?? "");
    const visiblePayloadSummary = copyPayload.locator("[data-copy-payload-visible-summary]");
    await expect(visiblePayloadSummary).toHaveAttribute(
      "data-copy-payload-visible-contract",
      "tool-action-visible-handles-accessible",
    );
    await expect(visiblePayloadSummary).toHaveAttribute(
      "data-copy-payload-visible-summary",
      new RegExp(`^query_ontology · ${primaryCopyAction ?? ""}$`),
    );
    const visiblePayloadSummaryFits = await visiblePayloadSummary.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    );
    expect(
      visiblePayloadSummaryFits,
      `selected relation payload visible summary should fit the MCP action at ${viewport.label}`,
    ).toBe(true);
    await expect(page.getByTestId("topology-analysis-panel")).toHaveCount(0);
    await expect(page.getByTestId("topology-minimap")).toHaveCount(0);
    await expect(page.getByTestId("topology-command-chrome")).toHaveAttribute(
      "data-command-chrome-state",
      "collapsed-active-relation",
    );
    await expect(page.getByTestId("topology-auto-arrange")).toHaveCount(0);
    await expect(page.getByTestId("topology-concept-search")).toHaveCount(0);
    await expect(page.getByTestId("topology-create-node-toggle")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Fit map to view" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open graph controls" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "View keyboard shortcuts" })).toHaveCount(0);
    const workspaceContext = page.getByTestId("topology-top-left-chrome-group");
    await expect(workspaceContext).toHaveAttribute(
      "data-workspace-context-state",
      "compact-active-relation",
    );
    const workspaceContextRect = await rectOf(workspaceContext);
    expect(
      workspaceContextRect.width,
      `workspace context should stay breadcrumb-sized during relation inspect at ${viewport.label}`,
    ).toBeLessThanOrEqual(210);
    await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
      "data-kind-legend-state",
      "collapsed-support-chrome",
    );
    await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
      "data-camera-motion-trigger",
      "selected-focus-safe-fit",
    );
    const reducedCameraMotion = await page
      .getByTestId("sigma-topology-viewport")
      .getAttribute("data-camera-motion-reduced");
    await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
      "data-camera-motion-duration-ms",
      reducedCameraMotion === "true" ? "0" : "420",
    );
    await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
      "data-camera-motion-easing",
      "ease-out-quart",
    );
    await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
      "data-camera-motion-state",
      reducedCameraMotion === "true" ? "reduced-motion" : /^(animating|settled)$/,
    );
    await expect(page.getByTestId("topology-kind-legend")).toHaveCount(0);
    const currentAnalysisRect = {
      left: -1,
      top: -1,
      right: -1,
      bottom: -1,
      width: 0,
      height: 0,
    };
    const currentLegendRect = await kindLegendRectOrNull(page);
    const selectedRelationCardRect = await rectOf(page.getByTestId("sigma-selected-edge-card"));
    const expectedMaxWidth = viewport.width >= 2400 ? 480 : viewport.width >= 1920 ? 360 : 330;
    expect(
      selectedRelationCardRect.width,
      `selected relation card should stay compact at ${viewport.label}`,
    ).toBeLessThanOrEqual(expectedMaxWidth);
    expect(
      selectedRelationCardRect.right,
      `selected relation card should stay inside the viewport at ${viewport.label}`,
    ).toBeLessThanOrEqual(viewport.width - 8);
    expect(
      selectedRelationCardRect.top,
      `selected relation card should clear top utility chrome at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(88);
    expect(
      currentLegendRect ? intersects(selectedRelationCardRect, currentLegendRect, 8) : false,
      `selected relation card should not cover fixed HUD at ${viewport.label}`,
    ).toBe(false);
    await expect(page.getByRole("button", { name: "Map view" })).toBeHidden();
    await expect(page.getByTestId("topology-node-popover")).toHaveCount(0);
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-skeleton-cards-ready",
      "true",
      { timeout: 20_000 },
    );
    await page.waitForTimeout(650);
    const selectedCards = await visibleCardRects(page);
    expect(
      selectedCards
        .filter((card) => intersects(card, selectedRelationCardRect, 8))
        .map((card) => card.text),
      `selected fan-out cards should not sit under the relation card at ${viewport.label}`,
    ).toEqual([]);
    expectCardsClear(selectedCards, viewport, currentAnalysisRect, currentLegendRect);
    await page.screenshot({
      path: path.join(OUT, `selected-relation-label-${viewport.label}.png`),
      fullPage: false,
    });
  });

  test(`Relief selected reveal cards travel with the dragged focus — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport, { mode: "map", selectedSlug: "domain:views" });

    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-skeleton-cards-ready",
      "true",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("topology-node-popover")).toBeVisible();
    const selectedFocusPanel = page.getByTestId("topology-analysis-panel");
    await expect(selectedFocusPanel).toHaveAttribute("data-analysis-mode", "focus");
    await expect(selectedFocusPanel).toHaveAttribute(
      "data-panel-width-contract",
      "selected-focus-rail-max-320",
    );
    const selectedFocusPanelRect = await rectOf(selectedFocusPanel);
    const selectedFocusPanelMaxWidth = viewport.width <= 1600 ? 322 : 380;
    expect(
      selectedFocusPanelRect.width,
      `selected node support rail should not compete with the graph at ${viewport.label}`,
    ).toBeLessThanOrEqual(selectedFocusPanelMaxWidth);
    await expect(page.getByTestId("topology-minimap")).toHaveCount(0);
    await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
      "data-kind-legend-state",
      "collapsed-support-chrome",
    );
    await expect(page.getByTestId("topology-kind-legend")).toHaveCount(0);
    const focusHull = page.locator("[data-drag-cluster-hull]");
    await expect(focusHull).toHaveAttribute("data-cluster-mode", "focus");
    await expect(focusHull).toHaveAttribute("data-focus-cluster-density", "quiet-outline");
    await expect(focusHull).toHaveAttribute(
      "data-focus-breathing-room-contract",
      "viewport-edge-clearance",
    );
    await expect(focusHull).toHaveAttribute(
      "data-focus-label-clearance-contract",
      "quiet-outline-does-not-slice-card-labels",
    );
    const focusHullBreathingRoom = Number(
      await focusHull.getAttribute("data-focus-breathing-room-px"),
    );
    const focusHullLabelClearance = Number(
      await focusHull.getAttribute("data-focus-label-clearance-px"),
    );
    expect(
      focusHullLabelClearance,
      `selected focus hull should expose label clearance at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(32);
    const focusHullRightClearance = Number(
      await focusHull.getAttribute("data-focus-right-clearance"),
    );
    const focusHullBottomClearance = Number(
      await focusHull.getAttribute("data-focus-bottom-clearance"),
    );
    expect(
      focusHullRightClearance,
      `selected focus hull should leave viewport right breathing room at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(focusHullBreathingRoom);
    expect(
      focusHullBottomClearance,
      `selected focus hull should leave viewport bottom breathing room at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(focusHullBreathingRoom);
    expect(
      await visibleCardScrollWidthViolations(page),
      `visible skeleton cards should keep edge masks paint-only at ${viewport.label}`,
    ).toEqual([]);
    await expect(page.locator("[data-drag-cluster-title]")).toHaveCount(0);
    await expect(page.locator("[data-drag-cluster-count]")).toHaveCount(0);
    if (viewport.label === "desktop-1280") {
      await expectSelectedCardHiddenForCompactRail(page, "domain:views");
      return;
    }

    const focus = page.locator('[data-skeleton-card][data-slug="domain:views"]').first();
    const firstCompanion = page
      .locator(
        '[data-skeleton-card][data-dock-parent="domain:views"]:not([data-surface-hidden="true"])',
      )
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
      selectedFocusPanelRect,
      null,
    );
  });

  test(`Relief selected node focus uses a compact support rail — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport, { mode: "focus", selectedSlug: "domain:views" });

    const selectedFocusPanel = page.getByTestId("topology-analysis-panel");
    await expect(selectedFocusPanel).toHaveAttribute("data-analysis-mode", "focus");
    await expect(selectedFocusPanel).toHaveAttribute("data-selected-focus-rail", "true");
    await expect(selectedFocusPanel).toHaveAttribute(
      "data-panel-width-token",
      "--topology-panel-selected-rail-width",
    );
    await expect(selectedFocusPanel).toHaveAttribute("data-attention-role", "support");
    await expect(selectedFocusPanel).toHaveAttribute(
      "data-panel-surface-token",
      "--topology-panel-support-surface",
    );
    await expect(selectedFocusPanel).toHaveAttribute(
      "data-command-spine-padding-token",
      "--topology-command-spine-padding",
    );
    await expect(selectedFocusPanel).toHaveAttribute(
      "data-command-primary-height-token",
      "--topology-command-primary-min-height",
    );
    const commandSpine = page.getByTestId("topology-focus-command-spine");
    await expect(commandSpine).toBeVisible();
    await expect(commandSpine).toHaveAttribute(
      "data-command-hierarchy",
      "brief-primary-review-agent-proof",
    );
    await expect(commandSpine).toHaveAttribute(
      "data-tokenized-surface",
      "topology-command-spine",
    );
    await expect(commandSpine).toHaveAttribute(
      "data-command-spine-surface-token",
      "--topology-command-spine-surface",
    );
    await expect(commandSpine).toHaveAttribute(
      "data-command-spine-border-token",
      "--topology-command-spine-border",
    );
    await expect(page.getByTestId("topology-focus-primary-action")).toHaveAttribute(
      "data-command-primary-surface-token",
      "--topology-command-primary-surface",
    );
    await expect(page.getByTestId("topology-focus-primary-action")).toBeVisible();
    await expect(page.getByTestId("topology-command-chrome")).toHaveAttribute(
      "data-command-chrome-state",
      "compact-focus",
    );
    await expect(page.getByTestId("topology-command-chrome")).toHaveAttribute(
      "data-utility-lane-height-token",
      "--topology-utility-lane-height",
    );
    const utilityLane = page.getByTestId("topology-utility-action-lane");
    await expect(utilityLane).toBeVisible();
    await expect(utilityLane).toHaveAttribute(
      "data-utility-lane-density",
      "compact-focus",
    );
    await expect(utilityLane).toHaveAttribute(
      "data-utility-lane-contract",
      "icon-first-focus-utility",
    );
    await expect(utilityLane).toHaveAttribute(
      "data-utility-lane-surface-token",
      "--topology-utility-lane-surface",
    );
    await expect(utilityLane).toHaveAttribute(
      "data-utility-lane-border-token",
      "--topology-utility-lane-border",
    );
    await expect(utilityLane).toHaveAttribute(
      "data-utility-lane-shadow-token",
      "--topology-utility-lane-shadow",
    );
    const utilityActions = utilityLane.locator("[data-utility-action-token-contract]");
    const utilityActionCount = await utilityActions.count();
    expect(utilityActionCount, "compact focus utility lane should expose actions").toBeGreaterThan(
      0,
    );
    for (let index = 0; index < utilityActionCount; index += 1) {
      await expect(utilityActions.nth(index)).toHaveAttribute(
        "data-utility-action-focus-ring-token",
        "--topology-utility-lane-focus-ring",
      );
    }
    const searchLane = page.getByTestId("topology-search-action-lane");
    await expect(searchLane).toBeVisible();
    await expect(searchLane).toHaveAttribute("data-search-lane-density", "compact-focus");
    await expect(searchLane).toHaveAttribute(
      "data-search-lane-contract",
      "icon-first-focus-search",
    );
    await expect(searchLane).toHaveAttribute(
      "data-search-lane-compact-width-token",
      "--topology-search-lane-compact-width",
    );
    await expect(searchLane).toHaveAttribute(
      "data-search-lane-surface-token",
      "--topology-utility-lane-surface",
    );
    await expect(searchLane).toHaveAttribute(
      "data-search-lane-border-token",
      "--topology-utility-lane-border",
    );
    await expect(searchLane).toHaveAttribute(
      "data-search-lane-shadow-token",
      "--topology-utility-lane-shadow",
    );
    const searchActions = searchLane.locator("[data-utility-action-token-contract]");
    await expect(searchActions).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      await expect(searchActions.nth(index)).toHaveAttribute(
        "data-utility-action-token-contract",
        "support-surface-family",
      );
      await expect(searchActions.nth(index)).toHaveAttribute(
        "data-utility-action-focus-ring-token",
        "--topology-utility-lane-focus-ring",
      );
      await expect(searchActions.nth(index)).toHaveAttribute(
        "data-utility-action-hover-surface-token",
        "--topology-utility-lane-hover-surface",
      );
    }
    const controlsStack = page.getByTestId("topology-sigma-controls-stack");
    await expect(controlsStack).toBeVisible();
    await expect(controlsStack).toHaveAttribute("data-controls-density", "compact-focus");
    await expect(controlsStack).toHaveAttribute(
      "data-controls-contract",
      "focus-support-utility-stack",
    );
    await expect(controlsStack).toHaveAttribute(
      "data-control-surface-token",
      "--topology-floating-control-surface",
    );
    await expect(controlsStack).toHaveAttribute(
      "data-control-border-token",
      "--topology-floating-control-border",
    );
    await expect(controlsStack).toHaveAttribute(
      "data-control-phone-bottom-token",
      "--topology-floating-control-phone-bottom",
    );
    await expect(controlsStack).toHaveAttribute(
      "data-control-desktop-top-token",
      "--topology-floating-control-desktop-top",
    );
    const helpButton = page.getByTestId("topology-shortcuts-help-button");
    await expect(helpButton).toBeVisible();
    await expect(helpButton).toHaveAttribute("data-controls-density", "compact-focus");
    await expect(helpButton).toHaveAttribute(
      "data-controls-contract",
      "focus-support-help-entry",
    );
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-drag-collision-policy",
      "release-settle",
    );
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-drag-frame-cache-contract",
      "pointer-move-reuses-drag-indexes",
    );
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-drag-dom-index-contract",
      "drag-release-reuses-card-elements",
    );
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-drag-dom-index-size",
      /^\d+$/,
    );
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-drag-frame-cache-snapshot-count",
      /^\d+$/,
    );
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-dock-drag-snapshot-contract",
      "single-pass-card-rect-read",
    );
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-visibility-count-contract",
      "single-pass-unless-fallback",
    );
    await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-fixed-surface-measure-contract",
      "single-pass-rect-read",
    );
    if (viewport.label === "desktop-1280") {
      await expectSelectedCardHiddenForCompactRail(page, "domain:views");
    } else {
      await expectSelectedCardRelationSummary(page, "domain:views");
    }
    await expect(page.getByTestId("topology-node-popover")).toBeVisible();
    await expect(page.getByTestId("topology-node-popover")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    await expect(page.getByTestId("topology-node-popover")).toHaveAttribute(
      "data-compact-handoff-contract",
      "selected-node-actions-visible",
    );
    await expect(page.getByTestId("topology-node-popover")).toHaveAttribute(
      "data-popover-surface-token",
      "--topology-node-popover-surface",
    );
    await expect(page.getByTestId("topology-node-popover")).toHaveAttribute(
      "data-popover-border-token",
      "--topology-node-popover-border",
    );
    await expect(page.getByTestId("topology-node-popover-compact-brief-action")).toBeVisible();
    await expect(page.getByTestId("topology-node-popover-compact-brief-action")).toHaveAttribute(
      "data-agent-handoff-action",
      "copy-focus-brief",
    );
    await expect(page.getByTestId("topology-node-popover-compact-brief-action")).toHaveAttribute(
      "data-popover-action-surface-token",
      "--topology-node-popover-action-icon-surface",
    );
    await expect(page.getByTestId("topology-node-popover-compact-brief-action")).toHaveAttribute(
      "data-popover-action-text-token",
      "--topology-node-popover-action-text",
    );
    await expect(page.getByTestId("topology-node-popover-compact-brief-action")).toHaveAttribute(
      "data-popover-action-hover-text-token",
      "--topology-node-popover-action-hover-text",
    );
    await expect(page.getByTestId("topology-node-popover")).toHaveAttribute(
      "data-size-policy",
      "context-chip",
    );
    await expect(page.getByTestId("topology-node-popover")).toHaveAttribute(
      "data-compact-facts-layout-contract",
      "facts-before-actions",
    );
    await expect(page.getByTestId("topology-node-popover-compact-actions")).toHaveAttribute(
      "data-compact-actions-layout-contract",
      "actions-after-facts",
    );
    const selectedNodeCountLine = page.locator("[data-selected-node-count-line]");
    const selectedNodeCountLineFits = await selectedNodeCountLine.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    );
    expect(
      selectedNodeCountLineFits,
      `selected node count line should keep its own width before compact actions at ${viewport.label}`,
    ).toBe(true);
    const compactRelationFacts = page.getByTestId(
      "topology-node-popover-compact-relation-facts",
    );
    await expect(compactRelationFacts).toBeVisible();
    const compactRelationFactsFit = await compactRelationFacts.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    );
    expect(
      compactRelationFactsFit,
      `compact relation fact pill should keep direct facts readable at ${viewport.label}`,
    ).toBe(true);
    const selectedFocusPanelRect = await rectOf(selectedFocusPanel);
    const selectedFocusPanelMaxWidth = viewport.width <= 1600 ? 322 : 380;
    expect(
      selectedFocusPanelRect.width,
      `focus URL support rail should stay compact at ${viewport.label}`,
    ).toBeLessThanOrEqual(selectedFocusPanelMaxWidth);
    expectCardsClear(await visibleCardRects(page), viewport, selectedFocusPanelRect, null);
  });

  test(`Relief skeleton cards remain separated after dragging a card — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport);

    const analysisRect = await rectOf(page.getByTestId("topology-analysis-panel"));
    const legendRect = await kindLegendRectOrNull(page);
    const target = await firstVisibleSkeletonCard(page);
    await expect(target).toBeVisible();
    const before = await rectOf(target);
    const targetText = (await target.textContent())?.trim() ?? "";
    const targetTitle = (await target.getAttribute("title")) ?? targetText.replace(/\s*\d+$/, "");
    const targetSlug = await target.getAttribute("data-slug");
    if (!targetSlug) {
      throw new Error(`visible drag target should expose a slug at ${viewport.label}`);
    }

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
        const el = els.find((candidate) => candidate.getAttribute("data-drag-cluster-role") === "movable");
        return el?.getAttribute("data-slug") ?? null;
      });
    if (!companionHandle) {
      throw new Error(`dragging ${targetText || targetSlug} should expose a connected companion at ${viewport.label}`);
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
    const dragCacheProof = await page.getByTestId("sigma-skeleton-cards").evaluate((el) => ({
      domIndexSize: Number(el.getAttribute("data-drag-dom-index-size") ?? "0"),
      snapshotCount: Number(el.getAttribute("data-drag-frame-cache-snapshot-count") ?? "0"),
    }));
    expect(
      dragCacheProof.domIndexSize,
      `drag should reuse a pointer-down DOM index at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(2);
    expect(
      dragCacheProof.snapshotCount,
      `drag should expose dock snapshot accounting during pointer move at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(0);
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
    expect(
      connector.clearance,
      `drag connector should expose a clearance halo at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(6);
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
      pointNearRectPerimeter(connector.start, dragFromRect, layerRect, connector.clearance + 1),
      `drag connector should begin on the source card clearance port at ${viewport.label}`,
    ).toBe(true);
    expect(
      pointDistanceFromRect(connector.start, dragFromRect, layerRect),
      `drag connector start should clear the source card mask at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(connector.clearance - 1);
    expect(
      pointInsideRect(connector.end, dragToRect, layerRect),
      `drag connector should not draw through its target card body at ${viewport.label}`,
    ).toBe(false);
    expect(
      pointNearRectPerimeter(connector.end, dragToRect, layerRect, connector.clearance + 1),
      `drag connector should end on the target card clearance port at ${viewport.label}`,
    ).toBe(true);
    expect(
      pointDistanceFromRect(connector.end, dragToRect, layerRect),
      `drag connector end should clear the target card mask at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(connector.clearance - 1);
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
    await expect(page.locator("[data-drag-cluster-title]")).toHaveText(
      targetTitle,
    );
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
    const hullCoverageTolerance = 2.5;
    expect(
      hullRect.left,
      `drag cluster hull should cover the dragged card on the left at ${viewport.label}`,
    ).toBeLessThanOrEqual(
      Math.min(whileDragging.left, companionAfter.left) + hullCoverageTolerance,
    );
    expect(
      hullRect.right,
      `drag cluster hull should cover the dragged card on the right at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(
      Math.max(whileDragging.right, companionAfter.right) - hullCoverageTolerance,
    );
    expect(
      hullRect.top,
      `drag cluster hull should cover the dragged card on top at ${viewport.label}`,
    ).toBeLessThanOrEqual(
      Math.min(whileDragging.top, companionAfter.top) + hullCoverageTolerance,
    );
    expect(
      hullRect.bottom,
      `drag cluster hull should cover the dragged card on bottom at ${viewport.label}`,
    ).toBeGreaterThanOrEqual(
      Math.max(whileDragging.bottom, companionAfter.bottom) - hullCoverageTolerance,
    );
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

    const panel = page.getByTestId("topology-analysis-panel");
    await expect(panel).toHaveAttribute("data-analysis-mode", "path");
    await expect(panel).toHaveAttribute("data-attention-role", "support");
    await expect(panel).toHaveAttribute(
      "data-panel-width-contract",
      "path-support-rail-max-360-phone-utility-reserve",
    );
    await expect(panel).toHaveAttribute(
      "data-panel-width-token",
      "--topology-panel-path-responsive-width",
    );
    await expect(panel).toHaveAttribute(
      "data-panel-phone-utility-reserve-token",
      "--topology-panel-phone-utility-rail-reserve",
    );
    await expect(panel).toHaveAttribute("data-path-guidance-owner", "analysis-rail");
    await expect(panel).toHaveAttribute(
      "data-path-prompt-policy",
      "panel-owned-when-card-mode",
    );
    const panelRect = await rectOf(panel);
    expect(
      panelRect.width,
      `path support rail should not compete with candidate cards at ${viewport.label}`,
    ).toBeLessThanOrEqual(viewport.width <= 1600 ? 362 : 480);

    const prompt = page.getByTestId("topology-path-start-prompt");
    if ((await prompt.count()) > 0 && (await prompt.first().isVisible())) {
      await expect(prompt.first()).toHaveAttribute(
        "data-path-prompt-lane",
        "chrome-clear-path-lane",
      );
      await expect(prompt.first()).toHaveAttribute(
        "data-attention-layer",
        "focus-path-state",
      );
      await expect(prompt.first()).toHaveAttribute(
        "data-handoff-contract",
        "agent-next-action-visible",
      );
      await expect(prompt.first()).toHaveAttribute(
        "data-overflow-contract",
        "no-horizontal-scroll",
      );
      await expect(prompt.first()).toHaveAttribute(
        "data-path-prompt-left-token",
        "--topology-path-prompt-left",
      );
      await expect(prompt.first()).toHaveAttribute(
        "data-path-prompt-half-token",
        "--topology-path-prompt-half",
      );
      await expect(prompt.first()).toHaveAttribute(
        "data-path-prompt-panel-width-token",
        "--topology-path-prompt-panel-width",
      );
      const promptRect = await rectOf(prompt.first());
      expect(
        promptRect.top,
        `path prompt should sit below top chrome at ${viewport.label}`,
      ).toBeGreaterThanOrEqual(viewport.width >= 900 ? 124 : 0);
      const promptTextFits = await prompt.first().evaluate((el) => {
        const body = el.querySelector("span.min-w-0") as HTMLElement | null;
        if (!body) return false;
        return body.scrollWidth <= body.clientWidth + 1;
      });
      expect(promptTextFits, `path prompt should not truncate at ${viewport.label}`).toBe(
        true,
      );
      const promptDoesNotOverflow = await prompt.first().evaluate((el) => {
        return el.scrollWidth <= el.clientWidth + 1;
      });
      expect(
        promptDoesNotOverflow,
        `path prompt should not horizontally overflow at ${viewport.label}`,
      ).toBe(true);
      await expect(prompt.first()).toHaveAttribute("data-mcp-action", "find_path");
      await expect(prompt.first()).toHaveAttribute("data-cli-fallback", "ontology-atlas path");
    }
    await expect(page.getByTestId("topology-path-agent-handoff")).toBeVisible();
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-mcp-action",
      "find_path",
    );
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-guidance-owner",
      "analysis-rail",
    );
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-path-prompt-policy",
      "panel-owned-when-card-mode",
    );
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-handoff-contract",
      "agent-next-action-visible",
    );
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-handoff-layout-contract",
      "compact-proof-strip",
    );
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-primary-evidence-visible",
      "false",
    );
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-overflow-contract",
      "no-horizontal-scroll",
    );
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-surface-token",
      "--topology-path-handoff-surface",
    );
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-text-token",
      "--topology-path-handoff-text",
    );
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-label-text-token",
      "--topology-path-handoff-label-text",
    );
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-action-min-height-token",
      "--topology-path-handoff-action-min-height",
    );
    await expect(page.getByTestId("topology-path-handoff-mcp-chip")).toHaveAttribute(
      "data-surface-token",
      "--topology-path-handoff-mcp-surface",
    );
    await expect(page.getByTestId("topology-path-handoff-cli-chip")).toHaveAttribute(
      "data-border-token",
      "--topology-path-handoff-cli-border",
    );
    await expect(page.getByTestId("topology-path-handoff-cli-chip")).toHaveAttribute(
      "data-text-token",
      "--topology-path-handoff-cli-text",
    );
    const handoffDoesNotOverflow = await page
      .getByTestId("topology-path-agent-handoff")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(
      handoffDoesNotOverflow,
      `path rail handoff should not horizontally overflow at ${viewport.label}`,
    ).toBe(true);
    await expect(page.getByTestId("topology-path-agent-handoff")).toHaveAttribute(
      "data-cli-fallback",
      "ontology-atlas path",
    );
    await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
      "data-kind-legend-state",
      "collapsed-support-chrome",
    );
    await expect(page.getByTestId("topology-kind-legend")).toHaveCount(0);
    await expect(page.getByTestId("topology-minimap")).toHaveCount(0);
  });
}

test("Relief selected Path route keeps path guidance primary on 14-inch fullscreen", async ({
  page,
}) => {
  await openRelief(page, MBP14_FULLSCREEN, {
    mode: "path",
    selectedSlug: "domain:views",
  });

  const panel = page.getByTestId("topology-analysis-panel");
  await expect(panel).toHaveAttribute("data-analysis-mode", "path");
  await expect(panel).toHaveAttribute("data-panel-width-band", "header-aligned");
  await expect(panel).toHaveAttribute("data-panel-width-target", "path-14-inch-rail");
  await expect(panel).toHaveAttribute(
    "data-panel-width-contract",
    "path-support-rail-max-360-phone-utility-reserve",
  );
  await expect(panel).toHaveAttribute("data-path-guidance-owner", "analysis-rail");
  await expect(page.getByTestId("topology-node-popover")).toHaveCount(0);
  await expect(page.getByTestId("topology-minimap")).toHaveCount(0);
  await expect(page.getByTestId("topology-kind-legend")).toHaveCount(0);

  const sourceCard = page
    .locator('[data-skeleton-card][data-slug="domain:views"][data-path-role="source"]')
    .first();
  await expect(sourceCard).toBeVisible();
  await expect(sourceCard).toHaveAttribute(
    "data-path-role-contract",
    "source-anchor-visible",
  );
  await expect(sourceCard).toHaveAttribute("data-path-attention-layer", "focus-path-state");
  await expect(sourceCard).toHaveAttribute("data-path-next-action", "pick-target");
  await expect(sourceCard).toHaveAttribute("data-path-anchor", "source");
  await expect(sourceCard.locator('[data-path-card-badge="source"]')).toHaveText("A");
  await expect(sourceCard.locator('[data-path-card-badge="source"]')).toHaveAttribute(
    "data-surface-token",
    "--topology-path-endpoint-surface",
  );

  const panelRect = await rectOf(panel);
  expect(
    panelRect.width,
    "selected Path route rail should keep the 14-inch path width contract",
  ).toBeLessThanOrEqual(362);
});

test("Relief selected Path route keeps the source card visible in the installed app WebView size", async ({
  page,
}) => {
  await openRelief(page, INSTALLED_APP_WEBVIEW, {
    mode: "path",
    selectedSlug: "domain:views",
  });

  const sourceCard = page
    .locator('[data-skeleton-card][data-slug="domain:views"][data-path-role="source"]')
    .first();
  await expect(sourceCard).toBeVisible();
  await expect(sourceCard).toHaveAttribute(
    "data-path-role-contract",
    "source-anchor-visible",
  );
  await expect(sourceCard).toHaveAttribute("data-path-next-action", "pick-target");
  await expect(page.getByTestId("topology-node-popover")).toHaveCount(0);
  await expect(page.getByTestId("topology-minimap")).toHaveCount(0);
  await expect(page.getByTestId("topology-kind-legend")).toHaveCount(0);
});

test("Relief Path result keeps both endpoint cards visible in the installed app WebView size", async ({
  page,
}) => {
  await openRelief(page, INSTALLED_APP_WEBVIEW, {
    mode: "path",
    pathFrom: "domain:views",
    pathTo: "capability:topology-analysis-modes",
  });

  const sourceCard = page
    .locator('[data-skeleton-card][data-slug="domain:views"][data-path-role="source"]')
    .first();
  const targetCard = page
    .locator('[data-skeleton-card][data-path-role="target"]')
    .first();
  await expect(sourceCard).toBeVisible();
  await expect(targetCard).toBeVisible();
  await expect(targetCard).toHaveAttribute("data-slug", /topology-analysis-modes$/);
  await expect(sourceCard.locator('[data-path-card-badge="source"]')).toHaveText("A");
  await expect(targetCard.locator('[data-path-card-badge="target"]')).toHaveText("B");
  await expect(sourceCard.locator('[data-path-card-badge="source"]')).toHaveAttribute(
    "data-border-token",
    "--topology-path-endpoint-border",
  );
  await expect(targetCard.locator('[data-path-card-badge="target"]')).toHaveAttribute(
    "data-text-token",
    "--topology-path-endpoint-text",
  );
  expect(
    cardPairsThatIntersect(await visibleCardRects(page)),
    "Path result endpoint cards must not overlap other visible Relief cards",
  ).toEqual([]);
  await expect(page.getByTestId("topology-path-result-banner")).toBeVisible();
  await expect(page.getByTestId("topology-path-result-banner")).toHaveAttribute(
    "data-path-result-responsive-contract",
    "hidden-under-md-panel-owned",
  );
  await expect(page.getByTestId("topology-node-popover")).toHaveCount(0);
  await expect(page.getByTestId("topology-minimap")).toHaveCount(0);
  await expect(page.getByTestId("topology-kind-legend")).toHaveCount(0);
});

test("Relief path result keeps phone viewport panel-owned", async ({ page }) => {
  const viewport = PHONE_VIEWPORT;
  await openRelief(page, viewport, {
    mode: "path",
    requireHud: false,
    pathFrom: "domain:views",
    pathTo: "capability:topology-analysis-modes",
  });

  const panel = page.getByTestId("topology-analysis-panel");
  const banner = page.getByTestId("topology-path-result-banner");
  const handoff = page.getByTestId("topology-path-agent-handoff");
  const route = page.getByTestId("topology-path-visible-route");
  const candidateVisibility = page.getByTestId("topology-path-candidate-visibility");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-analysis-mode", "path");
  await expect(panel).toHaveAttribute("data-path-guidance-owner", "analysis-rail");
  await expect(panel).toHaveAttribute(
    "data-panel-width-contract",
    "path-support-rail-max-360-phone-utility-reserve",
  );
  await expect(panel).toHaveAttribute(
    "data-panel-width-token",
    "--topology-panel-path-responsive-width",
  );
  await expect(panel).toHaveAttribute(
    "data-panel-phone-utility-reserve-token",
    "--topology-panel-phone-utility-rail-reserve",
  );
  await expect(panel).toHaveAttribute(
    "data-panel-compact-scroll-end-reserve-token",
    "--topology-analysis-panel-path-collapsed-scroll-end-reserve",
  );
  const panelBody = page.getByTestId("topology-analysis-panel-body");
  await expect(panelBody).toHaveAttribute("data-analysis-body-mode", "path");
  await expect(panelBody).toHaveAttribute(
    "data-panel-body-scroll-end-reserve-token",
    "--topology-analysis-panel-path-collapsed-scroll-end-reserve",
  );
  const collapsedPanelRect = await rectOf(panel);
  expect(
    collapsedPanelRect.height,
    "phone Path panel should not carry the bottom-tab reserve while proof is collapsed",
  ).toBeLessThanOrEqual(500);
  await expect(route).toBeVisible();
  await expect(route).toHaveAttribute(
    "data-route-contract",
    "source-target-visible-before-proof-disclosure",
  );
  await expect(route).toHaveAttribute("data-attention-layer", "focus-path-state");
  await expect(route).toHaveAttribute("data-guidance-owner", "analysis-rail");
  await expect(route).toHaveAttribute("data-overflow-contract", "no-horizontal-scroll");
  await expect(route).toHaveAttribute("data-source-slug", "domain:views");
  await expect(route).toHaveAttribute(
    "data-target-slug",
    "capability:topology-analysis-modes",
  );
  await expect(route).toHaveAttribute("data-surface-token", "--topology-path-route-surface");
  await expect(route).toHaveAttribute("data-border-token", "--topology-path-route-border");
  await expect(route).toHaveAttribute(
    "data-chip-surface-token",
    "--topology-path-route-chip-surface",
  );
  await expect(route).toHaveAttribute(
    "data-chip-border-token",
    "--topology-path-route-chip-border",
  );
  await expect(route).toHaveAttribute(
    "data-source-surface-token",
    "--topology-path-route-source-surface",
  );
  await expect(route).toHaveAttribute(
    "data-source-border-token",
    "--topology-path-route-source-border",
  );
  await expect(route).toHaveAttribute(
    "data-source-text-token",
    "--topology-path-route-source-text",
  );
  await expect(route).toHaveAttribute(
    "data-target-surface-token",
    "--topology-path-route-target-surface",
  );
  await expect(route).toHaveAttribute(
    "data-target-border-token",
    "--topology-path-route-target-border",
  );
  await expect(route).toHaveAttribute(
    "data-target-text-token",
    "--topology-path-route-target-text",
  );
  await expect(route).toHaveAttribute(
    "data-endpoint-marker-surface-token",
    "--topology-path-route-endpoint-marker-surface",
  );
  await expect(route).toHaveAttribute(
    "data-endpoint-marker-border-token",
    "--topology-path-route-endpoint-marker-border",
  );
  await expect(route).toHaveAttribute(
    "data-endpoint-marker-text-token",
    "--topology-path-route-endpoint-marker-text",
  );
  await expect(route.locator('[data-route-endpoint-marker="source"]')).toHaveText("A");
  await expect(route.locator('[data-route-endpoint-marker="target"]')).toHaveText("B");
  await expect(route).toHaveAttribute(
    "data-route-responsive-contract",
    "target-weighted-endpoints",
  );
  await expect(candidateVisibility).toBeVisible();
  await expect(candidateVisibility).toHaveAttribute(
    "data-surface-token",
    "--topology-path-candidate-visibility-surface",
  );
  await expect(candidateVisibility).toHaveAttribute(
    "data-border-token",
    "--topology-path-candidate-visibility-border",
  );
  await expect(candidateVisibility).toHaveAttribute(
    "data-copy-contract",
    "reader-facing-map-readability",
  );
  await expect(candidateVisibility).toContainText("map stays readable");
  await expect(candidateVisibility).not.toContainText(/panel clearance|hidden/i);
  const routeDoesNotOverflow = await route.evaluate(
    (el) => el.scrollWidth <= el.clientWidth + 1,
  );
  expect(routeDoesNotOverflow, "phone path visible route should not overflow").toBe(true);
  const routeTargetTitleFits = await route
    .locator('[data-route-endpoint-title="target"]')
    .evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(routeTargetTitleFits, "phone path route target title should not truncate").toBe(true);
  await expect(handoff).toHaveAttribute("data-handoff-layout-contract", "compact-proof-strip");
  await expect(handoff).toHaveAttribute("data-primary-evidence-visible", "true");
  await expect(handoff).toHaveAttribute(
    "data-path-primary-evidence-contract",
    "visible-before-proof-disclosure",
  );
  const primaryEvidenceAction = page.getByTestId("topology-path-primary-evidence-action");
  await expect(primaryEvidenceAction).toBeVisible();
  await expect(primaryEvidenceAction).toHaveAttribute(
    "data-path-primary-evidence-contract",
    "visible-before-proof-disclosure",
  );
  await expect(primaryEvidenceAction).toHaveAttribute(
    "data-surface-token",
    "--topology-path-primary-evidence-surface",
  );
  await expect(primaryEvidenceAction).toHaveAttribute(
    "data-text-token",
    "--topology-path-primary-evidence-text",
  );
  await expect(primaryEvidenceAction).toHaveAttribute(
    "data-hover-surface-token",
    "--topology-path-primary-evidence-hover-surface",
  );
  await expect(primaryEvidenceAction).toHaveAttribute(
    "data-hover-text-token",
    "--topology-path-primary-evidence-hover-text",
  );
  await expect(page.getByTestId("topology-path-proof-summary")).toHaveAttribute(
    "data-text-token",
    "--topology-path-proof-summary-text",
  );
  await expect(page.getByTestId("topology-path-proof-summary")).toHaveAttribute(
    "data-hover-text-token",
    "--topology-path-proof-summary-hover-text",
  );
  const preProofPanelRect = await rectOf(panel);
  const preProofVisibleCards = await visibleCardRects(page);
  expect(
    cardPairsThatIntersect(preProofVisibleCards),
    "Phone path endpoint cards must not overlap before proof disclosure owns the panel",
  ).toEqual([]);
  const preProofEndpointPanelOverlap = preProofVisibleCards
    .filter((card) => card.pathRole === "source" || card.pathRole === "target")
    .filter((card) => intersects(card, preProofPanelRect, 8))
    .map((card) => card.text);
  expect(
    preProofEndpointPanelOverlap,
    "Phone path endpoint cards must stay clear before proof disclosure owns the panel",
  ).toEqual([]);
  await page.getByTestId("topology-path-proof-summary").click();
  await expect(page.getByTestId("topology-path-proof-kicker")).toHaveAttribute(
    "data-text-token",
    "--topology-path-proof-kicker-text",
  );
  await expect(page.getByTestId("topology-path-proof-route")).toHaveAttribute(
    "data-chip-text-token",
    "--topology-path-route-chip-text",
  );
  await expect(page.getByTestId("topology-path-proof-route")).toHaveAttribute(
    "data-arrow-text-token",
    "--topology-path-route-arrow-text",
  );
  await expect(page.getByTestId("topology-path-proof-description")).toHaveAttribute(
    "data-text-token",
    "--topology-path-proof-desc-text",
  );
  await expect(page.getByTestId("topology-path-checks-summary")).toHaveAttribute(
    "data-text-token",
    "--topology-path-check-summary-text",
  );
  await expect(page.getByTestId("topology-path-checks-summary")).toHaveAttribute(
    "data-hover-text-token",
    "--topology-path-check-summary-hover-text",
  );
  await expect(page.locator('[data-path-proof-status="ready"]')).toHaveAttribute(
    "data-border-token",
    "--topology-path-proof-ready-border",
  );
  await expect(page.locator('[data-path-proof-status="after-write"]')).toHaveAttribute(
    "data-text-token",
    "--topology-path-proof-after-write-text",
  );
  await expect(handoff).toHaveAttribute("data-overflow-contract", "no-horizontal-scroll");
  const handoffDoesNotOverflow = await handoff.evaluate(
    (el) => el.scrollWidth <= el.clientWidth + 1,
  );
  expect(handoffDoesNotOverflow, "phone path handoff strip should not overflow").toBe(true);
  await expect(banner).toHaveAttribute(
    "data-path-result-responsive-contract",
    "hidden-under-md-panel-owned",
  );
  await expect(banner).toHaveAttribute(
    "data-path-prompt-left-token",
    "--topology-path-prompt-left",
  );
  await expect(banner).toHaveAttribute(
    "data-path-prompt-half-token",
    "--topology-path-prompt-half",
  );
  await expect(banner).toHaveAttribute(
    "data-path-prompt-panel-width-token",
    "--topology-path-prompt-panel-width",
  );
  await expect(banner).not.toBeVisible();
  const helpButton = page.getByTestId("topology-shortcuts-help-button").first();
  await expect(helpButton).toHaveAttribute(
    "data-phone-help-entry-contract",
    "hidden-during-path-panel",
  );
  await expect(helpButton).not.toBeVisible();
  const panelRect = await rectOf(panel);
  const controlsRect = await rectOf(page.getByTestId("topology-sigma-controls-stack"));
  expect(
    controlsRect.left - panelRect.right,
    "phone path analysis rail should reserve space before the right utility rail",
  ).toBeGreaterThanOrEqual(12);
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-path-endpoint-separation-contract",
    "source-target-min-gap",
  );

  const sourceCard = page
    .locator('[data-skeleton-card][data-slug="domain:views"][data-path-role="source"]')
    .first();
  const targetCard = page
    .locator('[data-skeleton-card][data-path-role="target"]')
    .first();
  await expect(sourceCard).toBeVisible();
  await expect(targetCard).toBeVisible();
  await expect(targetCard).toHaveAttribute(
    "data-path-endpoint-max-width-token",
    "--topology-path-endpoint-card-max-width",
  );
  const targetTitleFits = await targetCard.locator("[data-card-title]").evaluate(
    (el) => el.scrollWidth <= el.clientWidth + 1,
  );
  expect(targetTitleFits, "Phone Path target endpoint title should not truncate").toBe(true);
  await expect(page.getByTestId("topology-node-popover")).toHaveCount(0);
  const scrollOverflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(scrollOverflow.x, "phone path should not introduce horizontal overflow").toBe(0);
  expect(
    scrollOverflow.y,
    "phone path vertical overflow should stay within the mobile bottom-nav reserve",
  ).toBeLessThanOrEqual(56);
});

test("Relief Path accepts short from/to shared-link aliases", async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    "/en/topology/?mode=path&from=domain%3Aviews&to=capability%3Aagent-graph-readiness",
  );

  const panel = page.getByTestId("topology-analysis-panel");
  const handoff = page.getByTestId("topology-path-agent-handoff");
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-analysis-mode", "path");
  await expect(panel).toContainText("Views");
  await expect(panel).toContainText("Agent Graph Readiness");
  await expect(handoff).toHaveAttribute("data-handoff-layout-contract", "compact-proof-strip");
  await expect(handoff).toHaveAttribute("data-primary-evidence-visible", "true");
  await expect(page.getByTestId("topology-path-handoff-mcp-chip")).toHaveAttribute(
    "data-text-token",
    "--topology-path-handoff-mcp-text",
  );
  await expect(page.getByTestId("topology-path-handoff-cli-chip")).toHaveAttribute(
    "data-text-token",
    "--topology-path-handoff-cli-text",
  );
  const primaryEvidenceAction = page.getByTestId("topology-path-primary-evidence-action");
  await expect(primaryEvidenceAction).toBeVisible();
  await expect(primaryEvidenceAction).toHaveAttribute(
    "data-border-token",
    "--topology-path-primary-evidence-border",
  );
  await expect(page.getByTestId("topology-path-result-banner")).not.toBeVisible();
  await expect(
    page.locator('[data-skeleton-card][data-slug="domain:views"][data-path-role="source"]').first(),
  ).toBeVisible();
  await expect(
    page
      .locator(
        '[data-skeleton-card][data-slug="capability:agent-graph-readiness"][data-path-role="target"]',
      )
      .first(),
  ).toBeVisible();
});

test("Relief selected node focus keeps compact viewport clear", async ({ page }) => {
  const viewport = COMPACT_VIEWPORT;
  await openRelief(page, viewport, {
    mode: "focus",
    requireHud: false,
    selectedSlug: "domain:views",
  });

  const selectedFocusPanel = page.getByTestId("topology-analysis-panel");
  await expect(selectedFocusPanel).toHaveAttribute("data-analysis-mode", "focus");
  await expect(selectedFocusPanel).toHaveAttribute("data-selected-focus-rail", "true");
  await expect(selectedFocusPanel).toHaveAttribute(
    "data-compact-focus-collapse-contract",
    "selected-focus-support-hidden-under-md",
  );
  await expect(selectedFocusPanel).not.toBeVisible();

  const popover = page.getByTestId("topology-node-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute(
    "data-compact-handoff-contract",
    "selected-node-actions-visible",
  );
  await expect(popover).toHaveAttribute("data-responsive-width-contract", "fluid-chip-to-rail");
  await expect(popover).toHaveAttribute(
    "data-compact-action-contract",
    "compact-label-visible-under-480",
  );
  await expect(popover).toHaveAttribute(
    "data-compact-gap-token",
    "--topology-node-popover-chip-gap",
  );
  await expect(popover).toHaveAttribute(
    "data-compact-action-size-token",
    "--topology-node-popover-compact-action-size",
  );
  await expect(popover).toHaveAttribute(
    "data-title-lines-token",
    "--topology-node-popover-title-lines",
  );
  await expect(popover.locator("[data-selected-node-kind-label]").first()).toHaveAttribute(
    "data-kind-text-token",
    "--topology-node-popover-kind-text",
  );
  await expect(popover).toHaveAttribute(
    "data-title-readability-contract",
    "selected-node-title-readable",
  );
  await expect(popover).toHaveAttribute(
    "data-compact-facts-layout-contract",
    "facts-before-actions",
  );
  await expect(page.getByTestId("topology-node-popover-compact-actions")).toHaveAttribute(
    "data-compact-actions-layout-contract",
    "actions-after-facts",
  );
  await expect(popover).toHaveAttribute(
    "data-popover-surface-token",
    "--topology-node-popover-surface",
  );
  await expect(popover).toHaveAttribute(
    "data-popover-border-token",
    "--topology-node-popover-border",
  );
  const compactBriefAction = page.getByTestId("topology-node-popover-compact-brief-action");
  await expect(compactBriefAction).toBeVisible();
  const popoverTitle = page.getByTestId("topology-node-popover-title");
  await expect(popoverTitle).toHaveAttribute(
    "data-title-readability-contract",
    "selected-node-title-readable",
  );
  await expect(popoverTitle).toHaveAttribute(
    "data-title-lines-token",
    "--topology-node-popover-title-lines",
  );
  await expect(popoverTitle).toHaveAttribute(
    "data-title-text-token",
    "--topology-node-popover-title-text",
  );
  const titleReadability = await popoverTitle.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      lineClamp: style.getPropertyValue("-webkit-line-clamp"),
      overflowsMoreThanTwoLines: el.scrollHeight > el.clientHeight + 2,
    };
  });
  expect(titleReadability.lineClamp).toBe("2");
  expect(
    titleReadability.overflowsMoreThanTwoLines,
    "selected node title should clamp at two lines instead of one-line truncation",
  ).toBe(false);
  const compactRelationFacts = page.getByTestId("topology-node-popover-compact-relation-facts");
  await expect(compactRelationFacts).toBeVisible();
  await expect(compactRelationFacts).toHaveAttribute(
    "data-compact-relation-facts-contract",
    "collapsed-dock-surfaces-typed-facts",
  );
  await expect(compactRelationFacts).toHaveAttribute("data-relation-fact-count", /^[1-9]\d*$/);
  await expect(compactRelationFacts).toHaveAttribute("data-relation-type-count", /^[1-9]\d*$/);
  await expect(compactRelationFacts).toHaveAttribute(
    "data-compact-relation-facts-surface-token",
    "--topology-node-popover-context-surface",
  );
  await expect(compactRelationFacts).toHaveAttribute(
    "data-compact-relation-facts-border-token",
    "--topology-node-popover-context-border",
  );
  await expect(compactRelationFacts).toHaveAttribute(
    "data-compact-relation-facts-text-token",
    "--topology-node-popover-context-text",
  );
  const compactRelationFactsFit = await compactRelationFacts.evaluate(
    (el) => el.scrollWidth <= el.clientWidth + 1,
  );
  expect(compactRelationFactsFit, "compact relation fact pill should not overflow").toBe(true);
  await expect(compactBriefAction).toHaveAttribute(
    "data-agent-handoff-action",
    "copy-focus-brief",
  );
  await expect(compactBriefAction).toHaveAttribute(
    "data-popover-action-surface-token",
    "--topology-node-popover-action-icon-surface",
  );
  await expect(compactBriefAction).toHaveAttribute(
    "data-popover-action-text-token",
    "--topology-node-popover-action-text",
  );
  await expect(compactBriefAction).toHaveAttribute(
    "data-popover-action-hover-text-token",
    "--topology-node-popover-action-hover-text",
  );
  await expect(compactBriefAction).toHaveAttribute(
    "data-popover-action-max-width-token",
    "--topology-node-popover-compact-handoff-action-max-width",
  );
  await expect(compactBriefAction).toHaveAttribute(
    "data-popover-action-label-contract",
    "compact-visible-full-aria",
  );
  await expect(compactBriefAction).toHaveAttribute("data-popover-action-compact-label", /.+/);
  await expect(compactBriefAction).toHaveText(/.+/);
  await expect(page.locator('[data-node-popover-toggle="expand"]')).toHaveAttribute(
    "data-compact-action-contract",
    "icon-only-under-480",
  );
  const compactExpandAction = page.locator('[data-node-popover-toggle="expand"]');
  await expect(compactExpandAction).toHaveAttribute(
    "data-chrome-action-border-token",
    "--topology-node-popover-chrome-action-border",
  );
  await expect(compactExpandAction).toHaveAttribute(
    "data-chrome-action-text-token",
    "--topology-node-popover-chrome-action-text",
  );
  const compactCloseAction = page.locator('[data-node-popover-close="true"]');
  await expect(compactCloseAction).toHaveAttribute(
    "data-chrome-action-text-token",
    "--topology-node-popover-chrome-action-text",
  );
  const popoverRect = await rectOf(popover);
  expect(popoverRect.top, "compact focus popover should stay under top chrome").toBeLessThanOrEqual(96);
  expect(popoverRect.left, "compact focus popover should stay inside viewport").toBeGreaterThanOrEqual(8);
  expect(popoverRect.right, "compact focus popover should stay inside viewport").toBeLessThanOrEqual(
    viewport.width - 8,
  );

  const controlsStack = page.getByTestId("topology-sigma-controls-stack");
  const helpButton = page.getByTestId("topology-shortcuts-help-button");
  await expect(controlsStack).toHaveAttribute("data-controls-density", "compact-focus");
  await expect(controlsStack).toHaveAttribute(
    "data-controls-contract",
    "focus-support-utility-stack",
  );
  await expect(controlsStack).toHaveAttribute(
    "data-control-surface-token",
    "--topology-floating-control-surface",
  );
  await expect(controlsStack).toHaveAttribute(
    "data-control-border-token",
    "--topology-floating-control-border",
  );
  await expect(controlsStack).toHaveAttribute(
    "data-control-phone-bottom-token",
    "--topology-floating-control-phone-bottom",
  );
  await expect(controlsStack).toHaveAttribute(
    "data-control-desktop-top-token",
    "--topology-floating-control-desktop-top",
  );
  await expect(helpButton).toHaveAttribute("data-controls-density", "compact-focus");
  await expect(helpButton).toHaveAttribute(
    "data-controls-contract",
    "focus-support-help-entry",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-collision-policy",
    "release-settle",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-frame-cache-contract",
    "pointer-move-reuses-drag-indexes",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-dom-index-contract",
    "drag-release-reuses-card-elements",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-dom-index-size",
    /^\d+$/,
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-drag-frame-cache-snapshot-count",
    /^\d+$/,
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-connector-dom-index-contract",
    "reuse-card-index",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-connector-rect-cache-contract",
    "frame-local-card-rect-cache",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-connector-rect-cache-accounting",
    "reads-plus-hits",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-connector-rect-cache-read-count",
    /^\d+$/,
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-connector-rect-cache-hit-count",
    /^\d+$/,
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-dock-drag-snapshot-contract",
    "single-pass-card-rect-read",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-visibility-count-contract",
    "single-pass-unless-fallback",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-responsive-reposition-contract",
    "resize-immediate-and-settled",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-fixed-surface-measure-contract",
    "single-pass-rect-read",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-connector-dom-index-contract",
    "reuse-card-index",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-connector-rect-cache-contract",
    "frame-local-card-rect-cache",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-relation-label-blocker-contract",
    "reuse-visible-card-rects",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-relation-label-blocker-source",
    /visibility-pass|fallback-visibility-pass/,
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-relation-label-query-contract",
    "indexed-once",
  );
  await expectSelectedCardRelationSummary(page, "domain:views");

  const controlsRect = await rectOf(controlsStack);
  const helpRect = await rectOf(helpButton);
  expect(
    intersects(controlsRect, popoverRect),
    "compact controls must not overlap selected popover",
  ).toBe(false);
  expect(
    intersects(helpRect, popoverRect),
    "compact help must not overlap selected popover",
  ).toBe(false);
  expect(
    await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    })),
    "compact focus should not introduce page scroll overflow",
  ).toEqual({ x: 0, y: 0 });
});

test("Relief selected node focus keeps phone viewport map primary", async ({ page }) => {
  const viewport = PHONE_VIEWPORT;
  await openRelief(page, viewport, {
    mode: "focus",
    requireHud: false,
    selectedSlug: "domain:views",
  });

  const selectedFocusPanel = page.getByTestId("topology-analysis-panel");
  await expect(selectedFocusPanel).toHaveAttribute("data-analysis-mode", "focus");
  await expect(selectedFocusPanel).toHaveAttribute("data-selected-focus-rail", "true");
  await expect(selectedFocusPanel).toHaveAttribute(
    "data-compact-focus-collapse-contract",
    "selected-focus-support-hidden-under-md",
  );
  await expect(selectedFocusPanel).not.toBeVisible();

  const popover = page.getByTestId("topology-node-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute(
    "data-compact-action-contract",
    "compact-label-visible-under-480",
  );
  const compactBriefAction = page.getByTestId("topology-node-popover-compact-brief-action");
  await expect(compactBriefAction).toHaveAttribute(
    "data-popover-action-label-contract",
    "compact-visible-full-aria",
  );
  await expect(compactBriefAction).toHaveAttribute(
    "data-popover-action-max-width-token",
    "--topology-node-popover-compact-handoff-action-max-width",
  );
  await expect(compactBriefAction).toHaveText(/.+/);
  const focusHull = page.locator("[data-drag-cluster-hull]");
  await expect(focusHull).toHaveAttribute("data-cluster-mode", "focus");
  await expect(focusHull).toHaveAttribute("data-focus-cluster-density", "quiet-outline");
  await expect(focusHull).toHaveAttribute(
    "data-focus-label-clearance-contract",
    "quiet-outline-does-not-slice-card-labels",
  );
  await expect(page.locator("[data-focus-relation-label]")).toHaveCount(0);
  await expect(page.locator('[data-skeleton-card][data-slug="domain:views"]').first()).toBeVisible();
  await expectSelectedCardRelationSummary(page, "domain:views");
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-visibility-count-contract",
    "single-pass-unless-fallback",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-fixed-surface-measure-contract",
    "single-pass-rect-read",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-relation-label-blocker-contract",
    "reuse-visible-card-rects",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-relation-label-blocker-source",
    /visibility-pass|fallback-visibility-pass/,
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-relation-label-query-contract",
    "indexed-once",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-focus-relation-label-density-contract",
    "click-focus-uses-ego-label-only",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-focus-relation-label-source",
    "ego-relation-labels",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-connector-rect-cache-accounting",
    "reads-plus-hits",
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-connector-rect-cache-read-count",
    /^\d+$/,
  );
  await expect(page.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
    "data-connector-rect-cache-hit-count",
    /^\d+$/,
  );

  const popoverRect = await rectOf(popover);
  expect(popoverRect.left, "phone focus popover should stay inside viewport").toBeGreaterThanOrEqual(8);
  expect(popoverRect.right, "phone focus popover should stay inside viewport").toBeLessThanOrEqual(
    viewport.width - 8,
  );
  const helpButton = page.getByTestId("topology-shortcuts-help-button").first();
  const controlsStack = page.getByTestId("topology-sigma-controls-stack");
  await expect(controlsStack).toBeVisible();
  await expect(controlsStack).toHaveAttribute(
    "data-control-phone-bottom-token",
    "--topology-floating-control-phone-bottom",
  );
  await expect(controlsStack).toHaveAttribute(
    "data-control-desktop-top-token",
    "--topology-floating-control-desktop-top",
  );
  await expect(helpButton).toBeVisible();
  await expect(helpButton).toHaveAttribute(
    "data-phone-help-entry-contract",
    "visible-outside-path-panel",
  );
  await expect(helpButton).toHaveAttribute(
    "data-phone-help-position-contract",
    "map-card-clearance",
  );
  await expect(helpButton).toHaveAttribute(
    "data-phone-help-top-token",
    "--topology-shortcuts-help-phone-top",
  );
  const helpRect = await rectOf(helpButton);
  expect(intersects(helpRect, popoverRect), "phone help entry must not overlap focus popover").toBe(
    false,
  );
  const cardsUnderHelp = (await visibleCardRects(page)).filter((card) =>
    intersects(helpRect, card),
  );
  expect(cardsUnderHelp, "phone focus help entry must not cover map cards").toEqual([]);
  const visibleRelationLabels = await visibleRelationLabelCardOverlaps(page);
  const skeletonLayer = page.getByTestId("sigma-skeleton-cards");
  await expect(skeletonLayer).toHaveAttribute(
    "data-relation-label-phone-bottom-reserve-contract",
    "avoid-floating-controls",
  );
  await expect(skeletonLayer).toHaveAttribute(
    "data-relation-label-phone-bottom-reserve-token",
    "--topology-floating-control-phone-bottom",
  );
  const phoneBottomReserve = Number(
    await skeletonLayer.getAttribute("data-relation-label-phone-bottom-reserve-px"),
  );
  expect(
    visibleRelationLabels.length,
    "phone focus should keep relation labels to one ego fact instead of duplicating focus-hull labels",
  ).toBeLessThanOrEqual(1);
  for (const label of visibleRelationLabels) {
    expect(label.policy, `${label.id} should use the relation label clearance policy`).toBe(
      "reposition-or-hide",
    );
    expect(
      label.clearanceToken,
      `${label.id} should expose the topology relation label clearance token`,
    ).toBe("--topology-relation-label-card-clearance");
    expect(
      label.overlapsCards,
      `${label.id} (${label.text}) relation label must not overlap visible map cards`,
    ).toEqual([]);
    expect(
      label.hullBorderOverlaps,
      `${label.id} (${label.text}) relation label must not sit on the focus hull stroke`,
    ).toEqual([]);
    expect(
      label.bottom,
      `${label.id} (${label.text}) relation label must stay above the phone controls reserve`,
    ).toBeLessThanOrEqual(viewport.height - phoneBottomReserve);
  }
  await controlsStack.locator("button").last().click();
  const controlsPanel = page.getByTestId("topology-sigma-controls-panel");
  await expect(controlsPanel).toBeVisible();
  await expect(controlsPanel).toHaveAttribute(
    "data-panel-phone-bottom-token",
    "--topology-floating-panel-phone-bottom",
  );
  await expect(controlsPanel).toHaveAttribute(
    "data-panel-phone-max-height-token",
    "--topology-floating-panel-phone-max-height",
  );
  await expect(controlsPanel).toHaveAttribute(
    "data-panel-desktop-top-token",
    "--topology-floating-panel-desktop-top",
  );
  await expect(controlsPanel).toHaveAttribute(
    "data-panel-desktop-max-height-token",
    "--topology-floating-panel-desktop-max-height",
  );
  await expect(controlsPanel).toHaveAttribute(
    "data-controls-panel-contract",
    "single-support-sheet",
  );
  await expect(controlsPanel).toHaveAttribute(
    "data-panel-surface-token",
    "--topology-floating-panel-surface",
  );
  await expect(controlsPanel).toHaveAttribute(
    "data-panel-border-token",
    "--topology-floating-panel-border",
  );
  await expect(controlsPanel).toHaveAttribute(
    "data-panel-shadow-token",
    "--topology-floating-panel-shadow",
  );
  const controlsPanelRect = await rectOf(controlsPanel);
  const mobileBottomReserve = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.inset = "auto auto 0 0";
    probe.style.height = "var(--topology-mobile-bottom-tab-reserve)";
    probe.style.width = "0";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
  expect(
    viewport.height - controlsPanelRect.bottom,
    "expanded phone controls panel should stay above the bottom navigation reserve",
  ).toBeGreaterThanOrEqual(mobileBottomReserve);
  const scrollOverflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(scrollOverflow.x, "phone focus should not introduce horizontal overflow").toBe(0);
  expect(
    scrollOverflow.y,
    "phone focus vertical overflow should stay within the mobile bottom-nav reserve",
  ).toBeLessThanOrEqual(56);
});

test("Relief selected node expanded detail scrolls internally on phone", async ({ page }) => {
  const viewport = PHONE_VIEWPORT;
  await openRelief(page, viewport, {
    mode: "focus",
    requireHud: false,
    selectedSlug: "domain:views",
  });

  const popover = page.getByTestId("topology-node-popover");
  await expect(popover).toBeVisible();
  await page.locator('[data-node-popover-toggle="expand"]').click();
  await expect(popover).toHaveAttribute(
    "data-popover-scroll-contract",
    "expanded-internal-scroll",
  );
  await expect(popover).toHaveAttribute(
    "data-expanded-focus-contract",
    "first-relation-row-on-expand",
  );
  await expect(popover).toHaveAttribute("data-responsive-width-contract", "fluid-inspector-to-rail");
  await expect(popover).toHaveAttribute(
    "data-max-height-token",
    "--topology-node-popover-max-height",
  );
  const expandedCloseAction = page.locator('[data-node-popover-close="true"]');
  await expect(expandedCloseAction).toHaveAttribute(
    "data-chrome-action-text-token",
    "--topology-node-popover-chrome-action-text",
  );
  await expect(expandedCloseAction).toHaveAttribute(
    "data-chrome-action-hover-text-token",
    "--topology-node-popover-chrome-action-hover-text",
  );
  const usedByMetric = page.locator('[data-node-popover-metric="Used by"]');
  await expect(usedByMetric).toHaveAttribute(
    "data-metric-surface-token",
    "--topology-node-popover-metric-surface",
  );
  await expect(usedByMetric).toHaveAttribute(
    "data-metric-border-token",
    "--topology-node-popover-metric-border",
  );
  await expect(usedByMetric).toHaveAttribute(
    "data-metric-value-text-token",
    "--topology-node-popover-metric-value-text",
  );

  const connectionList = page.getByTestId("topology-node-connection-list");
  const connectionSection = page.getByTestId("topology-connections-section");
  await expect(connectionSection).toHaveAttribute(
    "data-relation-section-min-height-token",
    "--topology-node-popover-relation-section-min-height",
  );
  await expect(connectionSection).toHaveAttribute(
    "data-relation-section-border-token",
    "--topology-node-popover-relation-section-border",
  );
  await expect(connectionSection).toHaveAttribute(
    "data-relation-section-title-text-token",
    "--topology-node-popover-relation-section-title-text",
  );
  await expect(connectionSection).toHaveAttribute(
    "data-relation-section-lens-text-token",
    "--topology-node-popover-relation-section-lens-text",
  );
  await expect(connectionList).toHaveAttribute(
    "data-relation-list-min-height-token",
    "--topology-node-popover-relation-list-min-height",
  );
  await expect(connectionList).toHaveAttribute(
    "data-readable-row-contract",
    "at-least-one-full-relation-row",
  );
  await expect(connectionList).toHaveAttribute(
    "data-relation-list-surface-token",
    "--topology-node-popover-relation-list-surface",
  );
  await expect(connectionList).toHaveAttribute(
    "data-relation-list-border-token",
    "--topology-node-popover-relation-list-border",
  );
  await expect(connectionList).toHaveAttribute(
    "data-relation-row-divider-token",
    "--topology-node-popover-relation-row-divider",
  );
  await expect(connectionList).toHaveAttribute(
    "data-relation-row-hover-surface-token",
    "--topology-node-popover-relation-row-hover-surface",
  );
  await expect(connectionList).toBeVisible();
  const firstRelationRow = connectionList.locator("[data-relation-row]").first();
  await expect(firstRelationRow).toBeVisible();
  await expect(firstRelationRow).toHaveAttribute(
    "data-expanded-focus-entry",
    "selected-node-first-relation-row",
  );
  await expect(firstRelationRow).toBeFocused();
  await expect(firstRelationRow).toHaveAttribute(
    "data-row-hover-surface-token",
    "--topology-node-popover-relation-row-hover-surface",
  );
  await expect(firstRelationRow).toHaveAttribute(
    "data-row-focus-surface-token",
    "--topology-node-popover-relation-row-focus-surface",
  );
  await expect(firstRelationRow).toHaveAttribute(
    "data-row-focus-border-token",
    "--topology-node-popover-relation-row-focus-border",
  );
  await expect(firstRelationRow).toHaveAttribute(
    "data-row-focus-ring-token",
    "--topology-node-popover-relation-row-focus-ring",
  );
  const conceptSearch = page.getByTestId("topology-concept-search");
  await conceptSearch.focus();
  await page.keyboard.press("Tab");
  await expect(
    conceptSearch,
    "graph keyboard navigation should not trap native Tab movement on the search action",
  ).not.toBeFocused();
  await expect(
    firstRelationRow.locator("[data-relation-direction-marker]").first(),
  ).toHaveAttribute(
    "data-direction-surface-token",
    "--topology-node-popover-direction-surface",
  );
  await expect(
    firstRelationRow.locator("[data-relation-direction-marker]").first(),
  ).toHaveAttribute(
    "data-direction-hover-text-token",
    "--topology-node-popover-direction-hover-text",
  );
  await expect(firstRelationRow.locator("[data-relation-type-label]").first()).toHaveAttribute(
    "data-fact-type-surface-token",
    "--topology-node-popover-fact-type-surface",
  );
  await expect(firstRelationRow.locator("[data-relation-type-label]").first()).toHaveAttribute(
    "data-fact-type-text-token",
    "--topology-node-popover-fact-type-text",
  );
  await expect(firstRelationRow.locator("[data-relation-title]").first()).toHaveAttribute(
    "data-relation-title-text-token",
    "--topology-node-popover-relation-row-title-text",
  );
  await expect(firstRelationRow.locator("[data-relation-row-meta]").first()).toHaveAttribute(
    "data-row-meta-text-token",
    "--topology-node-popover-relation-row-meta-text",
  );
  await expect(popover.locator("[data-selected-node-kind-label]").first()).toHaveAttribute(
    "data-kind-text-token",
    "--topology-node-popover-kind-text",
  );
  await expect(popover.getByTestId("topology-node-popover-title")).toHaveAttribute(
    "data-title-text-token",
    "--topology-node-popover-title-text",
  );
  await expect(popover.locator("[data-selected-node-count-line]").first()).toHaveAttribute(
    "data-count-text-token",
    "--topology-node-popover-count-text",
  );
  await expect(popover.locator("[data-selected-node-importance-line]").first()).toHaveAttribute(
    "data-importance-text-token",
    "--topology-node-popover-significance-core-text",
  );
  await expect(firstRelationRow.locator("[data-relation-quality-dot]").first()).toHaveAttribute(
    "data-dot-token",
    /--topology-relation-quality-(strong|supported|weak|review)-dot/,
  );
  await expect(firstRelationRow.locator("[data-relation-quality-dot]").first()).toHaveAttribute(
    "data-glow-token",
    /--topology-relation-quality-(strong|supported|weak|review)-glow/,
  );
  await expect(
    firstRelationRow.locator("[data-relation-evidence-glyph]").first(),
  ).toHaveAttribute(
    "data-evidence-surface-token",
    /--topology-node-popover-evidence-(source|authored|review)-surface/,
  );
  await expect(
    firstRelationRow.locator("[data-relation-evidence-glyph]").first(),
  ).toHaveAttribute(
    "data-evidence-text-token",
    /--topology-node-popover-evidence-(source|authored|review)-text/,
  );
  const firstEndpointRoute = firstRelationRow
    .locator("[data-relation-endpoint-route-label]")
    .first();
  await expect(firstEndpointRoute).toHaveAttribute(
    "data-endpoint-route-text-token",
    "--topology-node-popover-endpoint-text",
  );
  await expect(firstEndpointRoute).toHaveAttribute(
    "data-endpoint-chip-text-token",
    "--topology-node-popover-endpoint-chip-text",
  );
  await expect(firstEndpointRoute).toHaveAttribute(
    "data-endpoint-separator-token",
    "--topology-node-popover-endpoint-separator",
  );
  await expect(
    firstRelationRow.locator("[data-relation-row-agent-gate]").first(),
  ).toHaveAttribute(
    "data-agent-gate-surface-token",
    /--topology-node-popover-gate-(handoff|preflight|review)-surface/,
  );
  const firstRouteRail = firstRelationRow.locator("[data-relation-route]").first();
  await expect(firstRouteRail).toHaveAttribute(
    "data-relation-payload-layout",
    "tokenized-compact-route-rail",
  );
  await expect(firstRouteRail).toHaveAttribute(
    "data-route-surface-token",
    "--topology-node-popover-route-surface",
  );
  await expect(firstRouteRail).toHaveAttribute(
    "data-route-chip-surface-token",
    "--topology-node-popover-route-chip-surface",
  );
  await expect(firstRouteRail).toHaveAttribute(
    "data-route-text-token",
    "--topology-node-popover-route-text",
  );
  await expect(firstRouteRail).toHaveAttribute(
    "data-route-chip-text-token",
    "--topology-node-popover-route-chip-text",
  );
  await expect(firstRelationRow).toHaveAttribute(
    "data-row-quality-accent-token",
    /--topology-overview-quality-(strong|supported|weak|review)-meter/,
  );
  const firstQualityAccent = firstRelationRow
    .locator("[data-relation-quality-accent]")
    .first();
  await expect(firstQualityAccent).toHaveAttribute(
    "data-quality-accent-contract",
    "row-scan-rail-maps-relation-quality",
  );
  await expect(firstQualityAccent).toHaveAttribute(
    "data-quality-accent-token",
    /--topology-overview-quality-(strong|supported|weak|review)-meter/,
  );
  await expect(
    page
      .getByTestId("topology-relation-quality-lens")
      .locator("[data-relation-quality-chip]")
      .first(),
  ).toHaveAttribute(
    "data-relation-quality-surface-token",
    /--topology-selected-relation-quality-(strong|supported|weak|review)-surface/,
  );
  const nodeQualityMeter = page.getByTestId("topology-node-relation-quality-meter");
  await expect(nodeQualityMeter).toHaveAttribute(
    "data-quality-meter-contract",
    "distribution-bar-maps-relation-quality",
  );
  await expect(nodeQualityMeter).toHaveAttribute(
    "data-surface-token",
    "--topology-overview-quality-meter-surface",
  );
  await expect(nodeQualityMeter).toHaveAttribute(
    "data-border-token",
    "--topology-overview-quality-meter-border",
  );
  await expect(
    nodeQualityMeter.locator('[data-relation-quality-meter-segment="strong"]'),
  ).toHaveAttribute(
    "data-meter-token",
    "--topology-overview-quality-strong-meter",
  );
  await expect(
    page
      .getByTestId("topology-node-agent-readiness-lens")
      .locator("[data-agent-readiness-chip]")
      .first(),
  ).toHaveAttribute(
    "data-agent-readiness-surface-token",
    /--topology-node-popover-agent-(ready|preflight|review)-surface/,
  );
  const readyReadinessChip = page
    .getByTestId("topology-node-agent-readiness-lens")
    .locator('[data-agent-readiness-chip="ready"]');
  await expect(readyReadinessChip).toHaveAttribute(
    "data-agent-readiness-label-contract",
    "compact-visible-full-aria",
  );
  await expect(readyReadinessChip).toHaveAttribute(
    "data-agent-readiness-full-label",
    "handoff-ready",
  );
  await expect(readyReadinessChip).toHaveAttribute(
    "data-agent-readiness-compact-label",
    "ready",
  );
  await expect(readyReadinessChip).toContainText("ready");
  await expect(readyReadinessChip).not.toContainText("handoff-ready");
  await expect(page.getByTestId("topology-node-agent-readiness-lens")).toHaveAttribute(
    "data-agent-readiness-layout",
    "separate-readiness-strip",
  );
  await expect(page.getByTestId("topology-node-agent-readiness-lens")).toHaveAttribute(
    "data-agent-readiness-strip-surface-token",
    "--topology-node-popover-context-surface",
  );
  await expect(page.getByTestId("topology-node-agent-readiness-lens")).toHaveAttribute(
    "data-agent-readiness-strip-border-token",
    "--topology-node-popover-context-border",
  );
  await expect(page.getByTestId("topology-node-agent-readiness-lens")).toHaveAttribute(
    "data-agent-readiness-strip-title-text-token",
    "--topology-node-popover-relation-section-title-text",
  );
  const nodeReadinessMeter = page.getByTestId("topology-node-agent-readiness-meter");
  await expect(nodeReadinessMeter).toHaveAttribute(
    "data-agent-readiness-meter-contract",
    "distribution-bar-maps-agent-readiness",
  );
  await expect(nodeReadinessMeter).toHaveAttribute(
    "data-surface-token",
    "--topology-overview-readiness-meter-surface",
  );
  await expect(nodeReadinessMeter).toHaveAttribute(
    "data-border-token",
    "--topology-overview-readiness-meter-border",
  );
  await expect(
    nodeReadinessMeter.locator('[data-agent-readiness-meter-segment="ready"]'),
  ).toHaveAttribute(
    "data-meter-token",
    "--topology-overview-readiness-ready-meter",
  );
  const firstHandoffAction = page
    .getByTestId("topology-node-popover-action-rail")
    .locator("[data-popover-action]")
    .first();
  const footer = page.getByTestId("topology-node-popover-footer");
  await expect(footer).toHaveAttribute(
    "data-popover-footer-border-token",
    "--topology-node-popover-footer-border",
  );
  await expect(footer).toHaveAttribute(
    "data-popover-footer-title-text-token",
    "--topology-node-popover-footer-title-text",
  );
  await expect(footer.locator('[data-agent-handoff-title="footer"]')).toBeVisible();
  await expect(firstHandoffAction).toHaveAttribute(
    "data-popover-action-text-token",
    "--topology-node-popover-action-text",
  );
  await expect(firstHandoffAction).toHaveAttribute(
    "data-popover-action-hover-text-token",
    "--topology-node-popover-action-hover-text",
  );
  await expect(firstHandoffAction).toHaveAttribute(
    "data-popover-action-label-contract",
    "compact-visible-full-aria",
  );
  await expect(firstHandoffAction).toHaveAttribute(
    "data-popover-action-icon-contract",
    "icon-marks-agent-handoff-kind",
  );
  await expect(firstHandoffAction).toHaveAttribute("data-popover-action-icon", /brief|node|impact/);
  await expect(firstHandoffAction).toHaveAttribute(
    "data-popover-action-icon-token",
    "--topology-node-popover-action-text",
  );
  await expect(firstHandoffAction.locator("[data-popover-action-icon-glyph]")).toHaveAttribute(
    "data-popover-action-icon-glyph",
    /brief|node|impact/,
  );
  await expect(firstHandoffAction).toHaveAttribute("data-popover-action-full-label", /.+/);
  await expect(firstHandoffAction).toHaveAttribute("data-popover-action-compact-label", /.+/);
  const handoffActionsFit = await page
    .getByTestId("topology-node-popover-action-rail")
    .locator("[data-popover-action] span")
    .evaluateAll((labels) =>
      labels.every((label) => label.scrollWidth <= label.clientWidth + 1),
    );
  expect(
    handoffActionsFit,
    "expanded phone handoff action labels should fit their compact footer buttons",
  ).toBe(true);
  const footerMapAction = page.locator('[data-node-popover-toggle="collapse"]');
  await expect(footerMapAction).toHaveAttribute(
    "data-footer-action-border-token",
    "--topology-node-popover-footer-action-border",
  );
  await expect(footerMapAction).toHaveAttribute(
    "data-footer-action-text-token",
    "--topology-node-popover-footer-action-text",
  );
  const footerFullDetailAction = page.locator('[data-footer-action="open-full-detail"]');
  await expect(footerFullDetailAction).toHaveAttribute(
    "data-footer-action-border-token",
    "--topology-node-popover-footer-action-border",
  );
  await expect(footerFullDetailAction).toHaveAttribute(
    "data-footer-action-text-token",
    "--topology-node-popover-footer-action-text",
  );
  const relationRemainder = page.locator("[data-relation-hidden-remainder]");
  await expect(relationRemainder).toHaveAttribute(
    "data-remainder-text-token",
    "--topology-node-popover-remainder-text",
  );
  await expect(page.locator("[data-footer-hidden-count]").first()).toHaveAttribute(
    "data-footer-count-text-token",
    "--topology-node-popover-footer-count-text",
  );

  const popoverScroll = await popover.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const body = element.querySelector<HTMLElement>('[data-testid="topology-node-popover-body"]');
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    return {
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      bodyOverflowX: bodyStyle?.overflowX ?? "",
      bodyOverflowY: bodyStyle?.overflowY ?? "",
      bodyClientHeight: body?.clientHeight ?? 0,
      bodyScrollHeight: body?.scrollHeight ?? 0,
      bodyScrollContract: body?.getAttribute("data-body-scroll-contract") ?? "",
    };
  });
  const readableRelationProof = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="topology-node-popover"]');
    const list = document.querySelector<HTMLElement>('[data-testid="topology-node-connection-list"]');
    const row = document.querySelector<HTMLElement>('[data-testid="topology-node-connection-list"] [data-relation-row]');
    const route = row?.querySelector<HTMLElement>("[data-relation-route]") ?? null;
    const footer = document.querySelector<HTMLElement>('[data-testid="topology-node-popover-footer"]');
    const actionRail = document.querySelector<HTMLElement>(
      '[data-testid="topology-node-popover-action-rail"]',
    );
    if (!root || !list || !row) return null;
    const rootRect = root.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const routeRect = route?.getBoundingClientRect() ?? null;
    const footerRect = footer?.getBoundingClientRect() ?? null;
    const actionRailRect = actionRail?.getBoundingClientRect() ?? null;
    const visibleRowHeight = Math.max(
      0,
      Math.min(rowRect.bottom, rootRect.bottom, footerRect?.top ?? rootRect.bottom) -
        Math.max(rowRect.top, rootRect.top),
    );
    return {
      token: getComputedStyle(document.documentElement)
        .getPropertyValue("--topology-node-popover-mobile-expanded-max-height")
        .trim(),
      popoverHeight: rootRect.height,
      listTop: listRect.top,
      listHeight: listRect.height,
      firstRowHeight: rowRect.height,
      routeChipCount: route?.querySelectorAll("[data-relation-route-chip]").length ?? 0,
      routeClientWidth: route?.clientWidth ?? 0,
      routeScrollWidth: route?.scrollWidth ?? 0,
      routeHeight: routeRect?.height ?? 0,
      routeBottom: routeRect?.bottom ?? null,
      visibleRowHeight,
      footerTop: footerRect?.top ?? null,
      footerBottom: footerRect?.bottom ?? null,
      footerPositionContract: footer?.getAttribute("data-footer-position-contract") ?? "",
      actionRailTop: actionRailRect?.top ?? null,
      actionRailBottom: actionRailRect?.bottom ?? null,
      actionRailHeight: actionRailRect?.height ?? 0,
      popoverBottom: rootRect.bottom,
      firstRowBottom: rowRect.bottom,
    };
  });
  expect(readableRelationProof).not.toBeNull();
  expect(
    readableRelationProof?.token,
    "expanded phone popover should use the responsive mobile height token",
  ).not.toBe("");
  expect(
    readableRelationProof?.listHeight ?? 0,
    "expanded phone popover should give the relation list visible reading space",
  ).toBeGreaterThanOrEqual(88);
  expect(
    readableRelationProof?.visibleRowHeight ?? 0,
    "expanded phone popover should show a complete relation row before scrolling",
  ).toBeGreaterThanOrEqual((readableRelationProof?.firstRowHeight ?? 0) - 1);
  expect(
    readableRelationProof?.routeChipCount ?? 0,
    "expanded phone relation row should expose fact/evidence/gate/action/payload chips",
  ).toBe(5);
  expect(
    readableRelationProof?.routeScrollWidth ?? 0,
    "expanded phone relation route rail should not horizontally overflow",
  ).toBeLessThanOrEqual((readableRelationProof?.routeClientWidth ?? 0) + 1);
  expect(
    readableRelationProof?.routeHeight ?? 0,
    "expanded phone relation route rail should remain a compact proof strip",
  ).toBeLessThanOrEqual(26);
  expect(
    readableRelationProof?.routeBottom ?? Infinity,
    "expanded phone relation route rail should stay fully readable above the fixed footer",
  ).toBeLessThanOrEqual((readableRelationProof?.footerTop ?? 0) - 4);
  expect(
    readableRelationProof?.footerPositionContract,
    "expanded phone popover should keep the MCP/CLI footer anchored in the visible frame",
  ).toBe("anchored-bottom-visible");
  expect(
    readableRelationProof?.footerTop ?? 0,
    "expanded phone footer should not cover the first readable relation row",
  ).toBeGreaterThanOrEqual((readableRelationProof?.firstRowBottom ?? 0) - 1);
  expect(
    readableRelationProof?.footerBottom ?? Infinity,
    "expanded phone footer should stay inside the popover visible frame",
  ).toBeLessThanOrEqual((readableRelationProof?.popoverBottom ?? 0) + 1);
  expect(
    readableRelationProof?.actionRailHeight ?? 0,
    "expanded phone action rail should have a visible tap target",
  ).toBeGreaterThanOrEqual(32);
  expect(
    readableRelationProof?.actionRailBottom ?? Infinity,
    "expanded phone action rail should stay inside the popover visible frame",
  ).toBeLessThanOrEqual((readableRelationProof?.popoverBottom ?? 0) + 1);
  expect(
    popoverScroll.overflowY,
    "expanded phone popover should keep overflow clipped so the footer owns the bottom edge",
  ).toBe("hidden");
  expect(
    popoverScroll.bodyScrollContract,
    "expanded phone popover body should own internal scrolling above the footer",
  ).toBe("content-scrolls-above-fixed-footer");
  expect(
    popoverScroll.bodyOverflowY,
    "expanded phone popover body should allow internal vertical scroll",
  ).toBe(
    "auto",
  );
  expect(popoverScroll.overflowX, "expanded phone popover should not allow horizontal scroll").toBe(
    "hidden",
  );
  expect(
    popoverScroll.bodyScrollHeight,
    "expanded phone popover should expose clipped detail through body internal scroll",
  ).toBeGreaterThanOrEqual(popoverScroll.bodyClientHeight);
  expect(
    popoverScroll.scrollWidth - popoverScroll.clientWidth,
    "expanded phone popover should not horizontally overflow",
  ).toBeLessThanOrEqual(2);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    "expanded phone popover should not introduce page horizontal overflow",
  ).toBe(0);
});

test("Relief global search uses a phone sheet instead of a floating card", async ({ page }) => {
  const viewport = PHONE_VIEWPORT;
  await openRelief(page, viewport, {
    mode: "focus",
    requireHud: false,
    selectedSlug: "domain:views",
  });

  await page.keyboard.press("Meta+Shift+K");

  const content = page.locator('[data-global-search-responsive-contract="mobile-sheet-md-floating"]');
  await expect(content).toBeVisible();
  await expect(page.getByTestId("topology-command-chrome")).toHaveAttribute(
    "data-blocking-overlay-state",
    "global-search",
  );
  await expect(page.getByTestId("topology-command-chrome")).toHaveAttribute(
    "data-attention-role",
    "demoted-under-blocking-overlay",
  );
  await expect(page.getByTestId("topology-shortcuts-help-button")).toHaveCount(0);
  await expect(page.getByTestId("topology-sigma-controls-stack")).toHaveCount(0);
  await expect(content).toHaveAttribute(
    "data-global-search-floating-width-token",
    "--topology-search-sheet-floating-width",
  );
  await expect(content).toHaveAttribute(
    "data-global-search-radius-token",
    "--topology-search-sheet-radius",
  );
  await expect(content).toHaveAttribute(
    "data-global-search-mobile-bottom-reserve-token",
    "--topology-mobile-bottom-tab-reserve",
  );
  const command = page.locator("[cmdk-root]");
  await expect(command).toBeVisible();
  const tabBar = page.locator('[data-tabbar="primary"]');
  await expect(tabBar).toHaveAttribute(
    "data-tabbar-min-height-token",
    "--topology-bottom-tab-min-height",
  );
  await expect(tabBar).toHaveAttribute(
    "data-tabbar-bottom-reserve-token",
    "--topology-mobile-bottom-tab-reserve",
  );
  await expect(tabBar).toHaveAttribute(
    "data-tabbar-surface-token",
    "--topology-bottom-tab-surface",
  );
  await expect(tabBar).toHaveAttribute(
    "data-tabbar-border-token",
    "--topology-bottom-tab-border",
  );
  const searchReserveScrim = page.getByTestId("global-search-bottom-reserve-scrim");
  await expect(searchReserveScrim).toBeVisible();
  await expect(searchReserveScrim).toHaveAttribute(
    "data-bottom-reserve-scrim-contract",
    "opaque-sheet-continuation",
  );
  await expect(searchReserveScrim).toHaveAttribute(
    "data-bottom-reserve-token",
    "--topology-mobile-bottom-tab-reserve",
  );
  await expect(page.locator("[cmdk-input]")).toBeFocused();
  await expect(page.locator("[cmdk-list]")).toBeVisible();
  const closeButton = page.getByTestId("global-search-close");
  await expect(closeButton).toBeVisible();
  await expect(closeButton).toHaveAttribute(
    "data-global-search-close-contract",
    "touch-visible",
  );
  await expect(closeButton).toHaveAttribute(
    "data-global-search-close-size-token",
    "--topology-search-sheet-close-size",
  );

  const contentRect = await rectOf(content);
  const commandRect = await rectOf(command);
  expect(contentRect.left, "global search content should start at the phone viewport edge").toBe(0);
  expect(contentRect.top, "global search content should start at the phone viewport top").toBe(0);
  expect(contentRect.width, "global search content should span the phone viewport").toBe(viewport.width);
  expect(contentRect.height, "global search overlay should block the full phone viewport").toBe(
    viewport.height,
  );
  expect(commandRect.left, "global search command sheet should start at the phone viewport edge").toBe(0);
  expect(commandRect.top, "global search command sheet should start at the phone viewport top").toBe(0);
  expect(commandRect.width, "global search command sheet should span the phone viewport").toBe(viewport.width);
  const searchBottomReserve = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.inset = "auto auto 0 0";
    probe.style.height = "var(--topology-mobile-bottom-tab-reserve)";
    probe.style.width = "0";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
  const tabBarRect = await rectOf(tabBar);
  expect(
    searchBottomReserve,
    "mobile bottom reserve should include the tab bar and safe-area height",
  ).toBeGreaterThanOrEqual(tabBarRect.height - 1);
  expect(commandRect.height, "global search command sheet should reserve the mobile tab bar").toBe(
    viewport.height - searchBottomReserve,
  );
  expect(
    viewport.height - commandRect.bottom,
    "global search command sheet should leave the mobile bottom reserve clear",
  ).toBe(searchBottomReserve);
  const searchReserveOwner = await page.evaluate(() => {
    const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 8);
    return {
      testId: element?.getAttribute("data-testid") ?? "",
      tabbar: element?.closest('[data-tabbar="primary"]') !== null,
      contract: element?.getAttribute("data-bottom-reserve-scrim-contract") ?? "",
    };
  });
  expect(searchReserveOwner.tabbar, "global search bottom reserve should cover the tab bar").toBe(false);
  expect(searchReserveOwner.testId, "global search bottom reserve should own the bottom hit point").toBe(
    "global-search-bottom-reserve-scrim",
  );
  expect(searchReserveOwner.contract).toBe("opaque-sheet-continuation");

  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow.x, "global search phone sheet should not introduce horizontal overflow").toBe(0);
  expect(
    overflow.y,
    "global search phone sheet should stay within the mobile bottom-nav reserve",
  ).toBeLessThanOrEqual(56);

  await closeButton.click();
  await expect(content).toHaveCount(0);
});

test("Relief shortcut sheet uses a phone sheet instead of an inset help card", async ({ page }) => {
  const viewport = PHONE_VIEWPORT;
  await openRelief(page, viewport, {
    mode: "focus",
    requireHud: false,
    selectedSlug: "domain:views",
  });

  const helpEntry = page.getByTestId("topology-shortcuts-help-button").first();
  await expect(helpEntry).toBeVisible();
  await expect(helpEntry).toHaveAttribute(
    "data-phone-help-entry-contract",
    "visible-outside-path-panel",
  );
  await helpEntry.click();

  const overlay = page.locator('[data-shortcut-sheet-responsive-contract="mobile-sheet-sm-floating"]');
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId("topology-command-chrome")).toHaveAttribute(
    "data-blocking-overlay-state",
    "shortcuts",
  );
  await expect(page.getByTestId("topology-command-chrome")).toHaveAttribute(
    "data-attention-role",
    "demoted-under-blocking-overlay",
  );
  await expect(page.getByTestId("topology-shortcuts-help-button")).toHaveCount(0);
  await expect(page.getByTestId("topology-sigma-controls-stack")).toHaveCount(0);
  await expect(overlay).toHaveAttribute(
    "data-shortcut-sheet-floating-width-token",
    "--topology-shortcut-sheet-floating-width",
  );
  await expect(overlay).toHaveAttribute(
    "data-shortcut-sheet-radius-token",
    "--topology-shortcut-sheet-radius",
  );
  await expect(overlay).toHaveAttribute(
    "data-shortcut-sheet-mobile-bottom-reserve-token",
    "--topology-mobile-bottom-tab-reserve",
  );
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  const tabBar = page.locator('[data-tabbar="primary"]');
  await expect(tabBar).toHaveAttribute(
    "data-tabbar-min-height-token",
    "--topology-bottom-tab-min-height",
  );
  await expect(tabBar).toHaveAttribute(
    "data-tabbar-bottom-reserve-token",
    "--topology-mobile-bottom-tab-reserve",
  );
  await expect(tabBar).toHaveAttribute(
    "data-tabbar-surface-token",
    "--topology-bottom-tab-surface",
  );
  await expect(tabBar).toHaveAttribute(
    "data-tabbar-border-token",
    "--topology-bottom-tab-border",
  );
  const shortcutReserveScrim = page.getByTestId("shortcut-sheet-bottom-reserve-scrim");
  await expect(shortcutReserveScrim).toBeVisible();
  await expect(shortcutReserveScrim).toHaveAttribute(
    "data-bottom-reserve-scrim-contract",
    "opaque-sheet-continuation",
  );
  await expect(shortcutReserveScrim).toHaveAttribute(
    "data-bottom-reserve-token",
    "--topology-mobile-bottom-tab-reserve",
  );
  const closeButton = page.getByTestId("shortcut-sheet-close");
  await expect(closeButton).toBeVisible();
  await expect(closeButton).toBeFocused();
  await expect(closeButton).toHaveAttribute(
    "data-shortcut-sheet-close-contract",
    "touch-visible",
  );
  await expect(closeButton).toHaveAttribute(
    "data-shortcut-sheet-close-size-token",
    "--topology-shortcut-sheet-close-size",
  );

  const overlayRect = await rectOf(overlay);
  const dialogRect = await rectOf(dialog);
  expect(overlayRect.left, "shortcut overlay should span from phone viewport edge").toBe(0);
  expect(overlayRect.top, "shortcut overlay should span from phone viewport top").toBe(0);
  expect(overlayRect.width, "shortcut overlay should span phone viewport width").toBe(viewport.width);
  expect(overlayRect.height, "shortcut overlay should block the full phone viewport").toBe(
    viewport.height,
  );
  expect(dialogRect.left, "shortcut dialog should start at phone viewport edge").toBe(0);
  expect(dialogRect.top, "shortcut dialog should start at phone viewport top").toBe(0);
  expect(dialogRect.width, "shortcut dialog should span phone viewport width").toBe(viewport.width);
  const shortcutBottomReserve = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.inset = "auto auto 0 0";
    probe.style.height = "var(--topology-mobile-bottom-tab-reserve)";
    probe.style.width = "0";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
  const tabBarRect = await rectOf(tabBar);
  expect(
    shortcutBottomReserve,
    "mobile bottom reserve should include the shortcut tab bar and safe-area height",
  ).toBeGreaterThanOrEqual(tabBarRect.height - 1);
  expect(dialogRect.height, "shortcut dialog should reserve the mobile tab bar").toBe(
    viewport.height - shortcutBottomReserve,
  );
  expect(
    viewport.height - dialogRect.bottom,
    "shortcut dialog should leave the mobile bottom reserve clear",
  ).toBe(shortcutBottomReserve);
  const shortcutReserveOwner = await page.evaluate(() => {
    const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 8);
    return {
      testId: element?.getAttribute("data-testid") ?? "",
      tabbar: element?.closest('[data-tabbar="primary"]') !== null,
      contract: element?.getAttribute("data-bottom-reserve-scrim-contract") ?? "",
    };
  });
  expect(shortcutReserveOwner.tabbar, "shortcut sheet bottom reserve should cover the tab bar").toBe(false);
  expect(shortcutReserveOwner.testId, "shortcut sheet bottom reserve should own the bottom hit point").toBe(
    "shortcut-sheet-bottom-reserve-scrim",
  );
  expect(shortcutReserveOwner.contract).toBe("opaque-sheet-continuation");

  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow.x, "shortcut phone sheet should not introduce horizontal overflow").toBe(0);
  expect(
    overflow.y,
    "shortcut phone sheet should stay within the mobile bottom-nav reserve",
  ).toBeLessThanOrEqual(56);

  await closeButton.click();
  await expect(overlay).toHaveCount(0);
});

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

  const popover = page.getByTestId("topology-node-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute(
    "data-popover-scroll-contract",
    "expanded-internal-scroll",
  );
  const popoverScroll = await popover.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('[data-testid="topology-node-popover-body"]');
    const style = window.getComputedStyle(element);
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    return {
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      bodyScrollContract: body?.dataset.bodyScrollContract ?? "",
      bodyOverflowY: bodyStyle?.overflowY ?? "",
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  });
  expect(
    popoverScroll.overflowY,
    "expanded compact popover should clip the shell while the body owns scrolling",
  ).toBe("hidden");
  expect(
    popoverScroll.bodyScrollContract,
    "expanded compact popover body should own internal scrolling above the footer",
  ).toBe("content-scrolls-above-fixed-footer");
  expect(
    popoverScroll.bodyOverflowY,
    "expanded compact popover body should allow internal vertical scroll",
  ).toBe(
    "auto",
  );
  expect(popoverScroll.overflowX, "expanded compact popover should not allow horizontal scroll").toBe(
    "hidden",
  );
  expect(
    popoverScroll.scrollWidth - popoverScroll.clientWidth,
    "expanded compact popover should not horizontally overflow",
  ).toBeLessThanOrEqual(2);
  const expandedRect = await rectOf(popover);
  expect(
    expandedRect.top,
    "compact selected detail should open from the top chrome, not as a bottom sheet",
  ).toBeLessThanOrEqual(128);
  expect(
    viewport.height - expandedRect.bottom,
    "compact selected detail should leave the lower graph area readable",
  ).toBeGreaterThanOrEqual(144);
  expect(
    Math.abs((expandedRect.left + expandedRect.right) / 2 - viewport.width / 2),
    "compact selected detail should stay horizontally centered",
  ).toBeLessThan(24);

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
  const selectedRelationLabelButton = page.locator(
    `[data-relation-label-button="${selectedBadgeId}"]`,
  );
  await expect(selectedRelationLabelButton).toHaveAttribute(
    "data-relation-label-hover-contract",
    "compact-edge-tooltip",
  );
  await selectedRelationLabelButton.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("relation label hit target should be an HTML button");
    }
    const rect = element.getBoundingClientRect();
    const x = rect.left + Math.max(12, rect.width / 2);
    const y = rect.top + Math.max(12, rect.height / 2);
    element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: y }));
  });
  const edgeTooltip = page.getByTestId("topology-edge-tooltip");
  await expect(edgeTooltip).toBeVisible();
  await expect(edgeTooltip).toHaveAttribute(
    "data-edge-tooltip-contract",
    "compact-relation-fact",
  );
  await expect(edgeTooltip).toHaveAttribute(
    "data-edge-tooltip-surface-token",
    "--topology-edge-tooltip-surface",
  );
  await expect(edgeTooltip).toHaveAttribute("data-relation-evidence-state", "source-backed");

  const selectedEdgeCard = page.getByTestId("sigma-selected-edge-card");
  await expect(selectedEdgeCard).toBeVisible();
  await expect(selectedEdgeCard).toHaveAttribute(
    "data-surface-token",
    "--topology-selected-relation-card-surface",
  );
  await expect(selectedEdgeCard).toHaveAttribute(
    "data-border-token",
    "--topology-selected-relation-card-border",
  );
  await expect(selectedEdgeCard).toHaveAttribute(
    "data-typography-contract",
    "legible-compact-relation-inspector",
  );
  const selectedRelationQuality = await selectedEdgeCard.getAttribute("data-relation-quality");
  if (!selectedRelationQuality) {
    throw new Error("selected relation card should expose relation quality");
  }
  const claimLens = page.getByTestId("sigma-selected-edge-claim-lens");
  await expect(claimLens).toHaveAttribute(
    "data-claim-lens-copy-contract",
    "visible-proof-full-proof-accessible",
  );
  const compactClaimLensVisibleFits = await claimLens
    .locator("[data-claim-lens-visible-summary]")
    .evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(
    compactClaimLensVisibleFits,
    "compact selected relation claim lens visible proof should fit",
  ).toBe(true);
  await expect(claimLens).toHaveAttribute(
    "data-claim-lens-surface-token",
    `--topology-selected-relation-claim-${selectedRelationQuality}-surface`,
  );
  await expect(claimLens).toHaveAttribute(
    "data-claim-lens-border-token",
    `--topology-selected-relation-claim-${selectedRelationQuality}-border`,
  );
  await expect(claimLens).toHaveAttribute(
    "data-claim-lens-dot-token",
    `--topology-selected-relation-claim-${selectedRelationQuality}-dot`,
  );
  await expect(claimLens.locator("[data-relation-quality-dot]")).toHaveAttribute(
    "data-dot-token",
    `--topology-selected-relation-claim-${selectedRelationQuality}-dot`,
  );
  await expect(
    selectedEdgeCard.locator("[data-relation-quality-tone-token]"),
  ).toHaveAttribute(
    "data-relation-quality-tone-token",
    `--topology-selected-relation-quality-${selectedRelationQuality}`,
  );
  const agentDecision = page.getByTestId("sigma-selected-edge-agent-decision");
  const agentGateKind = await agentDecision.getAttribute("data-agent-gate-kind");
  const agentGateToken =
    agentGateKind === "handoff-ready"
      ? "handoff"
      : agentGateKind === "preflight-first"
        ? "preflight"
        : "review";
  await expect(agentDecision).toHaveAttribute(
    "data-agent-gate-surface-token",
    `--topology-selected-relation-gate-${agentGateToken}-surface`,
  );
  await expect(agentDecision).toHaveAttribute(
    "data-agent-gate-text-token",
    `--topology-selected-relation-gate-${agentGateToken}-text`,
  );
  await expect(agentDecision).toHaveAttribute(
    "data-agent-decision-copy-contract",
    "visible-judgment-full-decision-accessible",
  );
  const compactAgentDecisionVisibleFits = await agentDecision
    .locator("[data-agent-decision-visible-summary]")
    .evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(
    compactAgentDecisionVisibleFits,
    "compact relation agent decision visible judgment should fit",
  ).toBe(true);
  const relationContract = page.getByTestId("sigma-selected-edge-contract");
  await expect(relationContract).toHaveAttribute(
    "data-relation-contract-copy-contract",
    "visible-judgment-full-explanation-accessible",
  );
  const compactRelationContractVisibleFits = await relationContract
    .locator("[data-relation-contract-visible-summary]")
    .evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(
    compactRelationContractVisibleFits,
    "compact relation contract visible judgment should fit",
  ).toBe(true);
  const agentRoute = page.getByTestId("sigma-selected-edge-agent-route");
  await expect(agentRoute.locator("[data-route-step]")).toHaveCount(4);
  await expect(agentRoute.locator('[data-route-step="fact"]')).toHaveAttribute(
    "data-route-step-copy-contract",
    "visible-route-value-full-value-accessible",
  );
  const compactRouteVisibleValuesFit = await agentRoute
    .locator("[data-route-step-value-text]")
    .evaluateAll((values) =>
      values.every((element) => element.scrollWidth <= element.clientWidth + 1),
    );
  expect(
    compactRouteVisibleValuesFit,
    "compact relation route visible values should fit",
  ).toBe(true);
  const primaryCopyAction = await agentRoute.getAttribute("data-primary-copy-action");
  if (!primaryCopyAction) {
    throw new Error("selected relation route should expose a primary copy action");
  }
  const primaryCopyButton = page.locator(
    `[data-relation-copy-action="${primaryCopyAction}"]`,
  );
  await expect(primaryCopyButton).toHaveAttribute(
    "data-copy-surface-token",
    `--topology-selected-relation-copy-${agentGateToken}-surface`,
  );
  await expect(
    page.locator(
      `[data-relation-copy-priority="secondary"][data-relation-copy-action]`,
    ),
  ).toHaveAttribute(
    "data-copy-surface-token",
    "--topology-selected-relation-copy-secondary-surface",
  );
  const routeRect = await rectOf(agentRoute);
  const nextActionRect = await rectOf(page.getByTestId("sigma-selected-edge-next-action"));
  expect(routeRect.left, "compact relation route should stay inside the viewport").toBeGreaterThanOrEqual(8);
  expect(routeRect.right, "compact relation route should stay inside the viewport").toBeLessThanOrEqual(
    viewport.width - 8,
  );
  expect(
    routeRect.bottom,
    "compact relation route should clear the next-action rail",
  ).toBeLessThanOrEqual(nextActionRect.top + 1);
  const routeStepRects = await agentRoute.locator("[data-route-step]").evaluateAll((steps) =>
    steps.map((step) => {
      const rect = step.getBoundingClientRect();
      return {
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    }),
  );
  expect(
    routeStepRects.every((rect) => rect.width <= routeRect.width + 1 && rect.height >= 32),
    "compact relation route steps should keep readable lanes",
  ).toBe(true);
  const compactRouteRows = new Set(routeStepRects.map((rect) => rect.top));
  expect(
    compactRouteRows.size,
    "compact relation route should use at most two rows before the next-action rail",
  ).toBeLessThanOrEqual(2);
  expect(
    routeStepRects[1].left > routeStepRects[0].left &&
      routeStepRects[2].top > routeStepRects[0].top &&
      routeStepRects[3].left > routeStepRects[2].left,
    "compact relation route should form a two-column fact/evidence/gate/action grid",
  ).toBe(true);
  const compactCopyButtons = page.locator("[data-relation-copy-action]");
  await expect(compactCopyButtons).toHaveCount(2);
  await expect(page.locator('[data-relation-copy-action="relation_check"]')).toHaveAttribute(
    "data-copy-label-contract",
    "visible-action-full-label-accessible",
  );
  await expect(page.locator('[data-relation-copy-action="relation_check"]')).toHaveAttribute(
    "data-copy-visible-label",
    "relation_check",
  );
  await expect(page.locator('[data-relation-copy-action="explain_relation"]')).toHaveAttribute(
    "data-copy-visible-label",
    "explain_relation",
  );
  const compactCopyLabelsFit = await compactCopyButtons.evaluateAll((buttons) =>
    buttons.every((button) => {
      const label = button.querySelector("span");
      return label ? label.scrollWidth <= label.clientWidth + 1 : false;
    }),
  );
  expect(
    compactCopyLabelsFit,
    "compact relation copy action labels should fit without truncating the MCP action",
  ).toBe(true);

  await expect(popover).toHaveCount(0);
});
