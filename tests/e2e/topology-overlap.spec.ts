import { expect, test, type Locator, type Page } from "@playwright/test";

const VIEWPORTS = [
  { label: "desktop-1920", width: 1920, height: 1080 },
  { label: "desktop-2560", width: 2560, height: 1440 },
];

async function openRelief(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/topology/");
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("topology-analysis-panel")).toBeVisible();
  await expect(page.getByTestId("topology-kind-legend")).toBeVisible();
  await expect(page.locator("[data-skeleton-card]").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(900);
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

for (const viewport of VIEWPORTS) {
  test(`Relief skeleton cards avoid fixed HUD surfaces — ${viewport.label}`, async ({
    page,
  }) => {
    await openRelief(page, viewport);

    const analysisRect = await rectOf(page.getByTestId("topology-analysis-panel"));
    const legendRect = await rectOf(page.getByTestId("topology-kind-legend"));
    const cardRects = await page.locator("[data-skeleton-card]").evaluateAll((els) =>
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

    const hudViolations = cardRects.filter(
      (card) => intersects(card, analysisRect, 8) || intersects(card, legendRect, 8),
    );
    expect(
      hudViolations.map((card) => card.text),
      `cards overlapping fixed HUD at ${viewport.label}`,
    ).toEqual([]);
  });
}
