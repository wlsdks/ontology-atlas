import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../first-run-seed";
import { waitForPageSettled } from "../settle";

/**
 * Each ring is composited with its real ground, since the uncomposited colour hides the defect.
 * The denominator is reported so a 0 is not read as nothing looked at.
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
    const destination = route === "/ko/docs/" ? "/ko/library/?tab=ontology" : route;
    await page.goto(`${destination}${destination.includes("?") ? "&" : "?"}guides=off`, {
      waitUntil: "domcontentloaded",
    });
    if (route === "/ko/docs/") {
      await expect(page).toHaveURL(
        (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
      );
      await expect(
        page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
      ).toBeVisible();
    }
    await waitForPageSettled(page);
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
