import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Surface vocabulary ratchet — stops the number of box appearances growing.**
 *
 * **What was measured (2026-08-09).** This repository has specs for things you press
 * (`controlClass`), inputs (`fieldClass`), and the page frame (`page-frame`). But the
 * **boxes in between** — cards, panels, sections, notices — have no owner.
 * `surface.tsx`, despite its name, owns **motion only** (enter and exit classes).
 *
 * Measuring the 76 boxes rendered across 10 screens at the time found **30 distinct
 * combinations**. Every value is on the ramp (radius 6/9/12px, all colours tokens) —
 * what diverges is the **combination**. The same 9px card appears as
 * `border-soft + panel`, as `border-soft + overlay-1`, and as
 * `border-soft + rgba(16,17,24,.96)`.
 *
 * **Why 30 is not reduced to 4 now.** Which combination folds into which role is a
 * **design verdict** per site and touches dozens of files. The repository's method for
 * that is a ratchet — pin today's number as the ceiling so it **cannot grow**, while
 * reductions are welcome at any time.
 *
 ## ⚠️ When probing this ratchet (two false starts on 2026-08-09)
 *
 * **Swapping a combination is not caught — adding one is.** If a combination exists on
 * only one screen, replacing it with a new one is −1 +1 and the total is unchanged.
 * That produced two "passes" that led to suspecting the gate, and the gate was right.
 *
 * Also **confirm the build actually succeeded after the change** — with `pnpm build`
 * output silenced, you measure the old result of a failed build and conclude "it is not
 * caught".
 *
 * ⚠️ **When the count falls, lower the ceiling with it.** Otherwise the ratchet
 * loosens again and the slack won by the reduction is handed straight back to the next
 * person.
 */

/**
 * **Surfaces and controls are counted separately** (corrected 2026-08-09).
 *
 * The first count included every box with a radius plus a border or background and
 * reported **30 combinations**. But **17 of them were buttons and chips** — a layer
 * `controlClass` already owns, where 8 tone steps × 8 shapes producing many
 * combinations is **correct**.
 *
 * Mixing two layers made 30 a number that said nothing about the problem. What has no
 * owner is **15 surface combinations**, and those 15 are what this ratchet locks.
 *
 * ⚠️ **The control count is tracked too** — splitting them and then watching only one
 * side lets new combinations hide on the control side. Controls are owned by the value
 * layer so their ceiling is looser, but it is not unbounded.
 */
/*
 * 2026-08-18 — the gateway remake brought this from 14 to **12**. Boxes stacked into
 * one panel unfolded into a section-by-section narrative, removing two one-off
 * surfaces. Per the ratchet's discipline **the ceiling drops with the count** —
 * otherwise the reduction becomes slack again and the next person spends it on a new
 * combination.
 */
const BASELINE_SURFACE_COMBOS = 11;
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

test("표면 조합이 늘지 않는다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const surfaces = new Set<string>();
  const controls = new Set<string>();
  let painted = 0;

  for (const route of ROUTES) {
    await page.goto(`${route}?guides=off`);
    await page.waitForTimeout(900);
    const found = await page.evaluate(() => {
      const out: { key: string; interactive: boolean }[] = [];
      for (const el of document.querySelectorAll("main *")) {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        // Small fragments and invisible elements are not surfaces.
        if (box.width < 40 || box.height < 24) continue;
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (Number(style.opacity) < 0.05) continue;
        if (box.top >= innerHeight || box.bottom <= 0) continue;

        const hasBorder = style.borderTopWidth !== "0px" && style.borderTopStyle !== "none";
        const hasBackground = style.backgroundColor !== "rgba(0, 0, 0, 0)";
        const radius = style.borderTopLeftRadius;
        if (radius === "0px" || (!hasBorder && !hasBackground)) continue;

        // Is it something you press? Then it belongs to the layer `controlClass` owns.
        const tag = el.tagName.toLowerCase();
        const interactive =
          ["button", "a", "input", "textarea", "select", "summary", "label"].includes(tag) ||
          el.getAttribute("role") === "button" ||
          el.closest("button,a[href]") !== null;

        out.push({
          key: `${radius} | ${hasBorder ? style.borderTopColor : "none"} | ${
            hasBackground ? style.backgroundColor : "none"
          }`,
          interactive,
        });
      }
      return out;
    });

    painted += found.length;
    for (const item of found) (item.interactive ? controls : surfaces).add(item.key);
  }

  // Idling guard — measuring nothing and passing with "0 combinations" is this
  // ratchet's worst failure.
  expect(painted, "표면을 하나도 못 쟀다 — 이 래칫이 헛돈다").toBeGreaterThan(40);

  expect(
    surfaces.size,
    `표면 조합이 ${BASELINE_SURFACE_COMBOS} → ${surfaces.size} 로 늘었다.\n` +
      `상자의 생김새(반경×보더×배경)를 새로 조립하지 말고 이미 있는 조합을 쓴다.\n` +
      `정말 새 역할이면 「체계」를 소집해 규격을 먼저 세워라. 상한을 올리는 것은 래칫을 푸는 것이다.\n` +
      [...surfaces].sort().join("\n"),
  ).toBeLessThanOrEqual(BASELINE_SURFACE_COMBOS);

  expect(
    surfaces.size,
    `표면 조합이 ${BASELINE_SURFACE_COMBOS} → ${surfaces.size} 로 줄었다. ` +
      `BASELINE_SURFACE_COMBOS 도 ${surfaces.size} 로 내려라. 안 내리면 줄인 만큼이 다시 여유가 된다.`,
  ).toBe(BASELINE_SURFACE_COMBOS);

  // Locked alongside so new combinations cannot hide on the control side.
  expect(
    controls.size,
    `컨트롤 조합이 ${BASELINE_CONTROL_COMBOS} → ${controls.size} 로 늘었다.\n` +
      `값 층(controlClass · fieldClass)의 톤·모양으로 표현해라.\n` +
      [...controls].sort().join("\n"),
  ).toBeLessThanOrEqual(BASELINE_CONTROL_COMBOS);
});
