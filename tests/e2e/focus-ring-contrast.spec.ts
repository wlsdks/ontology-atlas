import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **A focus indicator has to be visible** (2026-08-18).
 *
 * ## Why this check exists
 *
 * When this app's focus policy was decided on 2026-08-05, the verdict stopped at
 * **"does it exist"** — all 197 interactive elements had an indicator. The axis not
 * measured then was "is it visible". Measured on 2026-08-18, alpha 0.46 composited
 * against the ground gives **1.75:1**:
 *
 *     /ko/ 13/14 · /ko/topology/ 28/28 · /ko/docs/ 32/34 · /ko/projects/ 14/18
 *
 * The floor for a visual indicator that announces state is 3:1 (WCAG 1.4.11,
 * non-text contrast). That is half of it.
 *
 * ## What this check does
 *
 * A focus ring is **invisible to the resting DOM in principle.** So each element is
 * focused, confirmed to be `:focus-visible`, and its computed outline/box-shadow is
 * read and **composited with its real ground** to produce a contrast ratio. Without
 * compositing the alpha, a 0.46 ring reports its source colour's contrast (4.24:1)
 * and the defect is entirely invisible.
 *
 * The denominator is reported alongside — without "how many of how many", a 0 cannot
 * be told apart from "0 because nothing was looked at".
 */

const ROUTES = ["/ko/", "/ko/topology/", "/ko/docs/", "/ko/projects/", "/ko/agents/"];
const FLOOR = 3;

/*
 * ⚠️ **Measure with transitions off.** A trap already recorded in this repository:
 * reading computed values immediately after focusing returns **the value from before
 * the transition starts**. These controls carry `transition-[…,box-shadow,…]`, so
 * measuring without disabling transitions reads every healthy ring as transparent
 * (measured: 6 false violations).
 */
const KILL_MOTION = `(() => {
  const style = document.createElement("style");
  style.id = "focus-audit-no-motion";
  style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.appendChild(style);
  return true;
})()`;

const AUDIT = `(() => {
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const parse = (s) => {
    const m = String(s).match(/rgba?\\((\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?)(?:,\\s*([\\d.]+))?\\)/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const behind = (el) => {
    let cur = el;
    while (cur) {
      const c = parse(getComputedStyle(cur).backgroundColor);
      if (c && c[3] > 0.9) return [c[0], c[1], c[2]];
      cur = cur.parentElement;
    }
    return [8, 9, 10];
  };
  const nodes = Array.from(document.querySelectorAll(
    'button:not(:disabled), a[href], summary, [role="button"], [tabindex]:not([tabindex="-1"])'
  )).filter((el) => el.getBoundingClientRect().width > 4);
  const out = { measured: 0, below: [], worst: null };
  for (const el of nodes.slice(0, 80)) {
    el.focus();
    if (!el.matches(":focus-visible")) continue;
    const cs = getComputedStyle(el);
    const bg = behind(el);
    /*
     * **Never look at only one layer.** A Tailwind ring is two layers — an offset layer
     * plus the ring layer — and the offset layer is **deliberately the same colour as the
     * ground** (hence contrast 1.00). Taking only the first layer flags every healthy
     * ring as a violation. Announcing focus needs only one visible layer, so the verdict
     * uses **the most visible layer.**
     */
    const candidates = [];
    if (cs.outlineStyle !== "none") {
      const o = parse(cs.outlineColor);
      if (o && parseFloat(cs.outlineWidth) > 0) candidates.push(o);
    }
    for (const layer of cs.boxShadow.split(/,(?![^(]*\\))/)) {
      const c = parse(layer);
      const geom = layer.replace(/rgba?\\([^)]*\\)/, "");
      if (c && c[3] > 0.01 && /[1-9]/.test(geom)) candidates.push(c);
    }
    if (candidates.length === 0) continue;
    let r = 0;
    for (const c of candidates) {
      const a = c[3];
      const comp = [0, 1, 2].map((i) => Math.round(c[i] * a + bg[i] * (1 - a)));
      r = Math.max(r, ratio(comp, bg));
    }
    out.measured += 1;
    if (out.worst === null || r < out.worst) out.worst = r;
    if (r < 3) {
      // So the next person can find an unnamed element too — without a testid, point at it by text or class.
      const label = el.getAttribute("data-testid")
        || (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 20)
        || el.tagName + "." + String(el.className).slice(0, 40);
      out.below.push(label + " " + r.toFixed(2) + " (바탕 " + bg.join(",") + ")");
    }
  }
  return out;
})()`;

for (const route of ROUTES) {
  test(`초점 표시가 보인다 — ${route}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1512, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    await page.evaluate(KILL_MOTION);

    const got = (await page.evaluate(AUDIT)) as {
      measured: number;
      below: string[];
      worst: number | null;
    };

    // The denominator first — going green having measured nothing is this class of check's default failure.
    expect(got.measured, `${route}: 초점 표시를 하나도 못 쟀다 — 검사가 헛돌고 있다`).toBeGreaterThan(3);
    console.log(`[focus] ${route} 잰 것 ${got.measured} · 최저 ${got.worst?.toFixed(2)}:1`);
    expect(
      got.below,
      `${route}: 초점 표시가 ${FLOOR}:1 아래다 (알파를 바탕과 합성한 값) — ${got.below.join(" · ")}`,
    ).toEqual([]);
  });
}
