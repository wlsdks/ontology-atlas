import { writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { waitForAnimationsDone } from "../settle";

/**
 * Counts distinct surface box combinations (cards, panels, notices); today's count is a ceiling.
 * Swapping one combination for another is -1 +1, not caught; lower the ceiling when the count falls.
 */

/**
 * Surfaces and controls are counted separately: `controlClass` owns controls, so many combinations
 * there are expected. Both counts are ratcheted so new ones cannot hide on either side.
 */
const BASELINE_SURFACE_COMBOS = 7;
const BASELINE_CONTROL_COMBOS = 17;

const ROUTES = [
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/project/storefront/",
  "/ko/agents/",
  "/ko/git/",
  "/ko/",
  "/ko/download/",
] as const;

function collectSurfaceVocabulary() {
  const out: { key: string; interactive: boolean; detail: unknown }[] = [];
  for (const el of document.querySelectorAll("main *")) {
    if (el.parentElement?.closest('svg, [role="img"]')) continue;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    if (box.width < 40 || box.height < 24) continue;
    if (style.visibility === "hidden" || style.display === "none") continue;
    if (Number(style.opacity) < 0.05) continue;
    if (box.top >= innerHeight || box.bottom <= 0) continue;

    const hasBorder = style.borderTopWidth !== "0px" && style.borderTopStyle !== "none";
    const hasBackground = style.backgroundColor !== "rgba(0, 0, 0, 0)";
    const radius = style.borderTopLeftRadius;
    if (radius === "0px" || (!hasBorder && !hasBackground)) continue;

    const tag = el.tagName.toLowerCase();
    const interactive =
      ["button", "a", "input", "textarea", "select", "summary", "label"].includes(tag) ||
      el.getAttribute("role") === "button" ||
      el.hasAttribute("data-selection-indicator") ||
      el.closest("button,a[href]") !== null;

    out.push({
      key: `${radius} | ${hasBorder ? style.borderTopColor : "none"} | ${
        hasBackground ? style.backgroundColor : "none"
      }`,
      interactive,
      detail: { tag: el.tagName, testId: el.getAttribute("data-testid"), text: el.textContent?.trim().slice(0, 90), top: box.top, bottom: box.bottom, width: box.width },
    });
  }
  return out;
}

test("data marks do not add card vocabulary, while real cards and chart frames do", async ({ page }) => {
  await page.setContent(`<main>
    <section style="width:80px;height:40px;border-radius:9px;background:rgb(10,10,10)">Card</section>
    <div role="img" aria-label="Synthetic chart">
      <span id="mark" style="display:block;width:64px;height:40px;border-radius:4px;background:rgb(255,0,0)"></span>
    </div>
  </main>`);
  const initial = await page.evaluate(collectSurfaceVocabulary);
  expect(initial).toHaveLength(1);
  await page.locator("#mark").evaluate((mark) => {
    mark.style.height = "80px";
    mark.style.backgroundColor = "rgb(0,0,255)";
  });
  expect(await page.evaluate(collectSurfaceVocabulary)).toEqual(initial);
  await page.locator("main").evaluate((main) => {
    const card = document.createElement("section");
    card.style.cssText = "width:64px;height:40px;border-radius:4px;background:rgb(255,0,0)";
    main.append(card);
  });
  expect(new Set((await page.evaluate(collectSurfaceVocabulary)).map((row) => row.key)).size).toBe(2);
  await page.locator('[role="img"]').evaluate((frame) => {
    frame.style.cssText = "width:100px;height:100px;border-radius:12px;background:rgb(0,255,0)";
  });
  expect(new Set((await page.evaluate(collectSurfaceVocabulary)).map((row) => row.key)).size).toBe(3);
});

test("표면 조합이 늘지 않는다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const surfaces = new Set<string>();
  const controls = new Set<string>();
  let painted = 0;
  const census: unknown[] = [];

  for (const route of ROUTES) {
    const destination = route === "/ko/docs/" ? "/ko/library/?tab=ontology" : route;
    await page.goto(`${destination}${destination.includes("?") ? "&" : "?"}guides=off`);
    if (route === "/ko/docs/") {
      await expect(page).toHaveURL(
        (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
      );
      await expect(
        page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
      ).toBeVisible();
    }
    // Fetches answered, fonts in, entrances finished: the census reads the settled page.
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await waitForAnimationsDone(page.locator("body"));
    const found = await page.evaluate(collectSurfaceVocabulary);

    census.push({ route, found });
    painted += found.length;
    for (const item of found) (item.interactive ? controls : surfaces).add(item.key);
  }

  const evidencePath = test.info().outputPath("surface-census.json");
  await writeFile(evidencePath, JSON.stringify(census, null, 2));
  await test.info().attach("surface-census", { path: evidencePath, contentType: "application/json" });

  // Idling guard — measuring nothing and passing with "0 combinations" is this
  // ratchet's worst failure.
  expect(painted, "표면을 하나도 못 쟀다 — 이 래칫이 헛돈다").toBeGreaterThan(40);

  expect(
    surfaces.size,
    `Surface combinations grew from ${BASELINE_SURFACE_COMBOS} to ${surfaces.size}.\n` +
      `Do not assemble a new box look (radius × border × background); use a combination that exists.\n` +
      `If it truly is a new role, convene the System seat to set the spec first. Raising the ceiling unlocks the ratchet.\n` +
      [...surfaces].sort().join("\n"),
  ).toBeLessThanOrEqual(BASELINE_SURFACE_COMBOS);

  expect(
    surfaces.size,
    `Surface combinations fell from ${BASELINE_SURFACE_COMBOS} to ${surfaces.size}. ` +
      `Lower BASELINE_SURFACE_COMBOS to ${surfaces.size} too; otherwise what you cut becomes slack again.\n` +
      `Runner: ${process.platform}\n${[...surfaces].sort().join("\n")}`,
  ).toBe(BASELINE_SURFACE_COMBOS);

  // Locked alongside so new combinations cannot hide on the control side.
  expect(
    controls.size,
    `Control combinations grew from ${BASELINE_CONTROL_COMBOS} to ${controls.size}.\n` +
      `Express them with the tones and shapes of the value layer (controlClass · fieldClass).\n` +
      [...controls].sort().join("\n"),
  ).toBeLessThanOrEqual(BASELINE_CONTROL_COMBOS);
});
