import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1920, height: 1080 } });

async function openTopology(page: Page) {
  await page.goto("/en/topology/");
  await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
    timeout: 20_000,
  });
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
  await expect(page.getByText("linked group")).toBeVisible();
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
  await expect(target).toHaveAttribute("data-dragging-active", "true");
  await expect(companion).toHaveAttribute("data-drag-cluster", "true");
  const after = await rectOf(target);
  const companionAfter = await rectOf(companion);
  expect(Math.abs(companionAfter.x - companionBefore.x - (after.x - before.x))).toBeLessThan(56);
  expect(Math.abs(companionAfter.y - companionBefore.y - (after.y - before.y))).toBeLessThan(56);
  await page.mouse.up();
  await page.waitForTimeout(650);
  expect(consoleErrors, consoleErrors.join("\n")).toHaveLength(0);
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
  await expect(page.getByTestId("sigma-selected-edge-card")).toContainText(/MCP ready/i);
  await expect(
    page.locator('button[data-relation-label-hit="true"][data-selected-relation="true"]'),
  ).toHaveCount(1);
  expect(consoleErrors, consoleErrors.join("\n")).toHaveLength(0);
});
