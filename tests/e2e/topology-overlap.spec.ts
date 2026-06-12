import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const VIEWPORTS = [
  { label: "desktop-1920", width: 1920, height: 1080 },
  { label: "desktop-2560", width: 2560, height: 1440 },
];
const OUT = path.resolve("output/ui-audit/topology-drag");

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

async function openRelief(
  page: Page,
  viewport: { width: number; height: number },
  { mode = "path", settle = true }: { mode?: "map" | "path"; settle?: boolean } = {},
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/en/topology/?mode=${mode}`);
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("topology-analysis-panel")).toBeVisible();
  await expect(page.getByTestId("topology-kind-legend")).toBeVisible();
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
      return { totalLength: 0, strokeWidth: 0, stroke: "" };
    }
    const style = window.getComputedStyle(el);
    const strokeWidth = style.strokeWidth || el.getAttribute("stroke-width") || "0";
    return {
      totalLength: el.getTotalLength(),
      strokeWidth: Number.parseFloat(strokeWidth),
      stroke: style.stroke || el.getAttribute("stroke") || "",
    };
  });
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
    expectCardsClear(
      await visibleCardRects(page),
      viewport,
      analysisRect,
      legendRect,
    );
  });

  test(`Relief selected connectors expose relation labels — ${viewport.label}`, async ({
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
    const selectedBadge = page.locator("[data-relation-label-bg]").first();
    const selectedBadgeBox = await selectedBadge.boundingBox();
    expect(
      selectedBadgeBox?.width ?? 0,
      `selected relation badge background should render at ${viewport.label}`,
    ).toBeGreaterThan(labelBox?.width ?? 8);
    const connector = await connectorVisualEvidence(page.locator("[data-connector]").first());
    expect(
      connector.totalLength,
      `selected connector should be drawable at ${viewport.label}`,
    ).toBeGreaterThan(24);
    await page.screenshot({
      path: path.join(OUT, `selected-relation-label-${viewport.label}.png`),
      fullPage: false,
    });
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
    await page.mouse.move(before.left + before.width / 2 + 160, before.top + before.height / 2 + 70, {
      steps: 10,
    });
    await expect(target).toHaveAttribute("data-drag-cluster", "true");
    await expect(
      page.locator("[data-drag-cluster-connector]").first(),
    ).toHaveAttribute("d", /^M /);
    const dragConnector = page.locator("[data-drag-cluster-connector]").first();
    const connector = await connectorVisualEvidence(dragConnector);
    expect(connector.totalLength, `drag connector should be drawable at ${viewport.label}`).toBeGreaterThan(24);
    expect(connector.strokeWidth, `drag connector stroke should be visible at ${viewport.label}`).toBeGreaterThan(1);
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
