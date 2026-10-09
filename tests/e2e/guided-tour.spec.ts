import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * Guided tour (`src/features/guided-tour`) click-through — walks all 8
 * declarative steps (dev persona branch at step 7) at 1440x900 and asserts the
 * cutout/card render sane, resolvable rects.
 *
 * Manual-verification companion for the 2026-07-24 tour polish pass — not a
 * committed CI spec (guided tour has no prior e2e coverage; unit coverage
 * lives in `src/features/guided-tour/**\/*.test.ts(x)`).
 */

async function gotoAndSettle(page: import("@playwright/test").Page, url: string) {
  // This spec opens the tour **manually**. Without seeding away the first-visit
  // automatic surfaces (the folder-first guidance sheet and the auto tour), the 900ms
  // trigger races the manual click and on a slow CI runner the tour button is covered
  // by the overlay and the click times out (the cause of the 2026-07-24 CI flake).
  // Seeding "done" does not prevent a rerun — the tour button always calls
  // tour.start() regardless of stored state.
  await seedFirstRunSeen(page);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/** The card's box, and the lit node's box in the same viewport coordinates. */
async function readCardAgainstLitNode(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const probe = window.__atlasMap;
    const cardEl = document.querySelector<HTMLElement>('[data-testid="guided-tour-card"]');
    const canvasEl = document.querySelector<HTMLElement>('[data-testid="ontology-map-canvas"]');
    if (!probe || !cardEl || !canvasEl) return null;
    const canvas = canvasEl.getBoundingClientRect();
    const cut = document.querySelector<HTMLElement>('[data-testid="guided-tour-cutout"]');
    const nodes = probe.nodes();
    const lit = nodes.find((n) => n.kind === "domain") ?? nodes.find((n) => n.kind === "project");
    if (!lit) return null;
    const cutBox = cut?.getBoundingClientRect();
    const targetX = canvas.left + lit.x;
    const targetY = canvas.top + lit.y;
    const name = probe.labels().find((l) => l.nodeId === lit.id);
    const card = cardEl.getBoundingClientRect();
    // The node plus the name hanging under it — what the card has to clear.
    const node = {
      left: canvas.left + lit.x - lit.radius,
      right: canvas.left + lit.x + lit.radius,
      top: canvas.top + lit.y - lit.radius,
      bottom: canvas.top + (name ? Math.max(lit.y + lit.radius, name.maxY) : lit.y + lit.radius),
    };
    return {
      lit: lit.label,
      cutout: cutBox?.toJSON() ?? null,
      targetInCutout: Boolean(cutBox && targetX >= cutBox.left && targetX <= cutBox.right &&
        targetY >= cutBox.top && targetY <= cutBox.bottom),
      hasName: Boolean(name),
      node,
      card: { left: card.left, right: card.right, top: card.top, bottom: card.bottom },
      overlaps:
        card.left < node.right && card.right > node.left && card.top < node.bottom && card.bottom > node.top,
    };
  });
}

test("tour clearance identifies the requested domain even when the cutout points elsewhere", async ({ page }) => {
  await page.setContent(`<main>
    <canvas data-testid="ontology-map-canvas" style="position:fixed;inset:0"></canvas>
    <div data-testid="guided-tour-card" style="position:fixed;left:200px;top:200px;width:100px;height:100px"></div>
    <div data-testid="guided-tour-cutout" style="position:fixed;left:80px;top:80px;width:40px;height:40px"></div>
  </main>`);
  await page.evaluate(() => {
    Object.defineProperty(window, "__atlasMap", { value: {
      nodes: () => [
        { id: "project:shop", kind: "project", label: "Shop", x: 100, y: 100, radius: 10 },
        { id: "domain:catalog", kind: "domain", label: "Catalog", x: 250, y: 250, radius: 10 },
      ],
      labels: () => [],
    } });
  });
  const covered = await readCardAgainstLitNode(page);
  expect(covered?.lit).toBe("Catalog");
  expect(covered?.overlaps).toBe(true);
  expect(covered?.targetInCutout).toBe(false);
  await page.getByTestId("guided-tour-cutout").evaluate((el) => {
    el.style.left = "230px";
    el.style.top = "230px";
  });
  await page.getByTestId("guided-tour-card").evaluate((el) => { el.style.left = "400px"; });
  const clear = await readCardAgainstLitNode(page);
  expect(clear?.lit).toBe("Catalog");
  expect(clear?.targetInCutout).toBe(true);
  expect(clear?.overlaps).toBe(false);
});

type TourStepReading = { step: string; text: string; legendOnScreen: boolean };

/** A step may name a legend only while a legend is on the screen. */
async function readTourStep(page: import("@playwright/test").Page, seen: TourStepReading[]) {
  const reading = await page.evaluate(() => {
    const tourCard = document.querySelector<HTMLElement>('[data-testid="guided-tour-card"]');
    if (!tourCard) return null;
    const legends = [...document.querySelectorAll<HTMLElement>("[data-testid]")].filter((el) => {
      if (!/legend/i.test(el.dataset.testid ?? "")) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.opacity !== "0";
    });
    return {
      step: document.querySelector('[data-testid="guided-tour-overlay"]')?.getAttribute("data-tour-step") ?? "",
      text: (tourCard.textContent ?? "").trim(),
      legendOnScreen: legends.length > 0,
    };
  });
  if (reading && !seen.some((s) => s.step === reading.step)) seen.push(reading);
}

function expectNoLyingLegend(seen: TourStepReading[]) {
  expect(seen.length, `The tour was not walked: ${JSON.stringify(seen.map((s) => s.step))}`).toBeGreaterThanOrEqual(3);
  const lying = seen.filter((s) => /범례|legend/i.test(s.text) && !s.legendOnScreen);
  expect(
    lying.map((s) => s.step),
    `Tour steps that point at a legend while none is on screen: ${JSON.stringify(lying.map((s) => s.text.slice(0, 80)))}`,
  ).toEqual([]);
}

async function expectCardClearsLitNode(page: import("@playwright/test").Page) {
  // The opening paint — no settling wait, because the defect lived in the first frames.
  const opening = await readCardAgainstLitNode(page);
  expect(opening, "The map target and card must be measurable").not.toBeNull();
  expect(opening!.targetInCutout, JSON.stringify(opening)).toBe(true);
  expect(
    opening!.overlaps,
    `The card (${JSON.stringify(opening!.card)}) covers the lit node ${opening!.lit} (${JSON.stringify(opening!.node)}) the moment the step opens`,
  ).toBe(false);

  // And once the camera has come to rest.
  await waitForMapStill(page);
  const settled = await readCardAgainstLitNode(page);
  expect(settled!.targetInCutout, JSON.stringify(settled)).toBe(true);
  expect(settled!.hasName, `The lit node ${settled!.lit} has no drawn name`).toBe(true);
  expect(
    settled!.overlaps,
    `The card (${JSON.stringify(settled!.card)}) covers the lit node ${settled!.lit} (${JSON.stringify(settled!.node)}) after the map came to rest`,
  ).toBe(false);
}

test.describe("guided tour click-through (dev branch, 1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("all 8 steps render a resolvable anchor + card", async ({ page }) => {
    // The tour runs on the map — since 2026-07-30 `/` is the gateway.
    await gotoAndSettle(page, "/en/topology/?e2e=1");

    const tourButton = page.getByTestId("topology-tour-button");
    await expect(tourButton).toBeVisible({ timeout: 15_000 });
    await tourButton.click();

    const card = page.getByTestId("guided-tour-card");
    const overlay = page.getByTestId("guided-tour-overlay");

    const seen: TourStepReading[] = [];
    const readLegend = () => readTourStep(page, seen);

    // Step 1 — welcome (no anchor, centered card, full scrim)
    await expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    await readLegend();
    await expect(card).toBeVisible();

    // Step 2 — nodes (canvas-node: project)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "nodes");
    await readLegend();
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });

    // Step 3 — relations (centered explanation; the persistent corner legend is retired)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "relations");
    await readLegend();
    await expect(page.getByTestId("guided-tour-cutout")).toHaveCount(0);

    // Step 4 — try-click (interactive canvas-node: domain). Click through the
    // funnel cutout by reading its rect rather than guessing a coordinate.
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "try-click");
    await readLegend();
    await expect(page.getByTestId("guided-tour-waiting")).toBeVisible();

    await expectCardClearsLitNode(page);

    const cutout = page.getByTestId("guided-tour-cutout");
    await expect(cutout).toBeVisible({ timeout: 5_000 });
    const cutoutBox = await cutout.boundingBox();
    expect(cutoutBox).not.toBeNull();
    // The card asks the person to press the lit node; it must not sit on that
    // node's name (2026-09-19: the card's top cut the hub's name in half).
    const nameClearance = await page.evaluate(() => {
      const probe = window.__atlasMap!;
      const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
      const cut = document.querySelector('[data-testid="guided-tour-cutout"]')!.getBoundingClientRect();
      const cx = cut.left + cut.width / 2 - canvas.left;
      const cy = cut.top + cut.height / 2 - canvas.top;
      const lit = probe.nodes().reduce((best, n) => (Math.hypot(n.x - cx, n.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? n : best));
      const name = probe.labels().find((l) => l.nodeId === lit.id);
      const card = document.querySelector('[data-testid="guided-tour-card"]')!.getBoundingClientRect();
      return { lit: lit.label, nameBottom: name ? canvas.top + name.maxY : null, cardTop: card.top, cardBelow: card.top > cut.top };
    });
    expect(nameClearance.nameBottom, `켜진 노드 ${nameClearance.lit} 의 이름이 안 그려졌다`).not.toBeNull();
    if (nameClearance.cardBelow) {
      expect(nameClearance.cardTop, `카드 위쪽(${Math.round(nameClearance.cardTop)})이 켜진 노드의 이름(${Math.round(nameClearance.nameBottom!)})을 덮는다`).toBeGreaterThanOrEqual(nameClearance.nameBottom!);
    }
    /* Regression for the 2026-07-24 live defect: if the spotlight hole is misaligned with the
       drawn node, the four-strip blocker swallows the click on the lit node and the tour stalls.
       The probe (`topology-tour-anchor`) reports the engine's real worldToScreen coordinates, so
       its centre must be the canvas itself, not a blocker strip, and a press there advances. */
    const anchor = (await page.getByTestId("topology-tour-anchor").boundingBox())!;
    const cx = anchor.x + anchor.width / 2;
    const cy = anchor.y + anchor.height / 2;
    expect(
      await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName ?? "NONE", [cx, cy]),
    ).toBe("CANVAS");
    await page.mouse.click(cx, cy);

    // Step 5 — datasheet (auto-advanced after the click above resolves a selection)
    await expect(overlay).toHaveAttribute("data-tour-step", "datasheet", { timeout: 5_000 });
    await readLegend();
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });

    // Step 6 — index
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "index");
    await readLegend();
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });

    // Step 7 — recent (branch step)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "recent");
    await readLegend();
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });

    // Step 8 — agent (dev branch)
    const devBranchButton = card.getByTestId("guided-tour-dev-branch");
    await expect(devBranchButton).toBeVisible();
    await devBranchButton.click();
    await expect(overlay).toHaveAttribute("data-tour-step", "agent", { timeout: 5_000 });
    await readLegend();

    // Finish
    await card.getByTestId("guided-tour-finish").click();
    await expect(overlay).toHaveCount(0);

    expectNoLyingLegend(seen);

    // The place the line guide really lives, so the step's pointer is not a second empty promise.
    await page.getByTestId("topology-shortcuts-help-button").click();
    await expect(page.getByTestId("shortcut-sheet-relation-guide")).toBeVisible();
  });
});

test.describe("guided tour at a laptop window in Korean (1200x863)", () => {
  test.use({ viewport: { width: 1200, height: 863 } });

  test("every step clears the lit node and names only legends on screen, and Escape closes the tour", async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?e2e=1", { waitUntil: "domcontentloaded" });
    await waitForMapStill(page);

    await page.getByTestId("topology-tour-button").click();
    const overlay = page.getByTestId("guided-tour-overlay");
    const card = page.getByTestId("guided-tour-card");
    await expect(card).toBeVisible();

    const seen: TourStepReading[] = [];
    await readTourStep(page, seen);
    for (const step of ["nodes", "relations", "try-click"]) {
      await card.getByTestId("guided-tour-next").first().click();
      await expect(overlay).toHaveAttribute("data-tour-step", step);
      await readTourStep(page, seen);
    }
    await expect(page.getByTestId("guided-tour-waiting")).toBeVisible();
    await expectCardClearsLitNode(page);

    const activate = page.getByTestId("guided-tour-activate-target");
    await activate.focus();
    await expect(activate).toBeFocused();
    await page.keyboard.press("Enter");
    for (const step of ["datasheet", "index", "recent"]) {
      if (step !== "datasheet") await card.getByTestId("guided-tour-next").first().click();
      await expect(overlay).toHaveAttribute("data-tour-step", step, { timeout: 5_000 });
      await readTourStep(page, seen);
    }
    await card.getByTestId("guided-tour-dev-branch").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "agent", { timeout: 5_000 });
    await readTourStep(page, seen);
    expectNoLyingLegend(seen);

    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
    await page.getByTestId("topology-shortcuts-help-button").click();
    await expect(page.getByTestId("shortcut-sheet-relation-guide")).toBeVisible();
  });
});

/**
 * **The INDEX step shows the INDEX, not the first-run card** (2026-09-19).
 *
 * A first-run person starts the tour from the first-run card, so at the
 * "INDEX: the map's table of contents" step that card was still standing where
 * the list should be, and the cutout lit a sample picker and an open-folder
 * button while the copy described a list of names. The card gives way to the
 * list for that step; the other specs seed the card away and could not see it.
 */
test.describe("guided tour on a true first run", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the INDEX step lights the list, not the first-run card", async ({ page }) => {
    await page.goto("/en/topology/?e2e=1&guides=off");
    await page.waitForLoadState("networkidle");
    const starterTour = page.getByTestId("first-run-tour-cta");
    await expect(starterTour, "이 스펙은 첫 실행 카드에서 출발한다").toBeVisible();
    await starterTour.click();
    const overlay = page.getByTestId("guided-tour-overlay");
    await expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    const card = page.getByTestId("guided-tour-card");
    for (const step of ["nodes", "relations", "try-click"]) {
      await card.getByTestId("guided-tour-next").click();
      await expect(overlay).toHaveAttribute("data-tour-step", step);
    }
    const cutout = page.getByTestId("guided-tour-cutout");
    await expect(cutout).toBeVisible({ timeout: 5_000 });
    const box = (await cutout.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(overlay).toHaveAttribute("data-tour-step", "datasheet", { timeout: 5_000 });
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "index");

    await expect(page.getByTestId("topology-index-tree"), "INDEX 단계인데 목록이 안 보인다").toBeVisible();
    await expect(page.getByTestId("first-run-starter"), "INDEX 단계인데 첫 실행 카드가 서 있다").toHaveCount(0);

    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "recent");
    await page.evaluate(() => {
      const samples: Array<{ left: number; top: number; opacity: number }> = [];
      (window as unknown as { __tourCardSamples: typeof samples }).__tourCardSamples = samples;
      const tick = () => {
        const step = document.querySelector('[data-testid="guided-tour-overlay"]')?.getAttribute("data-tour-step");
        const tourCard = document.querySelector<HTMLElement>('[data-testid="guided-tour-card"]');
        if (step === "agent" && tourCard) {
          const box = tourCard.getBoundingClientRect();
          samples.push({ left: box.left, top: box.top, opacity: Number(getComputedStyle(tourCard).opacity) });
        }
        if (samples.length < 30) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await card.getByTestId("guided-tour-dev-branch").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "agent");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __tourCardSamples: unknown[] }).__tourCardSamples.length))
      .toBe(30);
    const cardPath = await page.evaluate(
      () => (window as unknown as { __tourCardSamples: Array<{ left: number; top: number; opacity: number }> }).__tourCardSamples,
    );
    const shown = cardPath.filter((sample) => sample.opacity > 0.05);
    expect(shown.length, "the developer step's card never became visible in the sampled frames").toBeGreaterThan(10);
    const jumps = shown.slice(1).map((sample, index) =>
      Math.max(Math.abs(sample.left - shown[index]!.left), Math.abs(sample.top - shown[index]!.top)),
    );
    expect(Math.max(...jumps), `the developer step's card moved after it appeared: ${JSON.stringify(shown.map((s) => [Math.round(s.left), Math.round(s.top)]))}`).toBeLessThanOrEqual(2);
    await expect(page.getByTestId("first-run-starter-more-toggle"), "the developer step left the group holding the command folded").toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("first-run-starter-cli-toggle"), "개발자 단계인데 명령 한 줄이 접혀 있다").toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const block = document.querySelector('[data-testid="first-run-starter-cli-bridge"]')!.getBoundingClientRect();
            const card = document.querySelector('[data-testid="first-run-starter"]')!.getBoundingClientRect();
            return Math.round(block.bottom - card.bottom);
          }),
        { timeout: 5_000, message: "명령 블록이 카드 아래로 잘려 있다" },
      )
      .toBeLessThanOrEqual(1);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const rect = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
            const block = rect("first-run-starter-cli-bridge");
            const cutout = rect("guided-tour-cutout");
            const tourCard = rect("guided-tour-card");
            const inside =
              block.top >= cutout.top - 1 &&
              block.bottom <= cutout.bottom + 1 &&
              block.left >= cutout.left - 1 &&
              block.right <= cutout.right + 1;
            const covered =
              block.left < tourCard.right && block.right > tourCard.left && block.top < tourCard.bottom && block.bottom > tourCard.top;
            return { inside, covered };
          }),
        { timeout: 5_000, message: "the developer step lights the card but the command sits outside the cutout or under the tour card" },
      )
      .toEqual({ inside: true, covered: false });
  });
});
