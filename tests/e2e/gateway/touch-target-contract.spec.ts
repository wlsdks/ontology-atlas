import { test, expect } from "@playwright/test";

/**
 * WCAG 2.5.8 24x24 floor on the effective hit box (own rect plus ::after rect); needs real layout.
 * Pass if the box is large enough, or the target is inline in a sentence, or its 24 circle
 * overlaps no other target.
 */

interface Audit258Result {
  scanned: number;
  failures: { id: string; w: number; h: number }[];
}

/** The fine-pointer 2.5.8 audit — a predicate that runs inside the browser. */
const AUDIT_258 = `(() => {
  const MIN = 24;
  /*
   * The selector **must include form controls**. Until 2026-08-05 all four places
   * were \`button, a[href]\`, so \`<input>\`, \`<select>\`, and \`<textarea>\`
   * **did not exist for this audit in principle**. In that blind spot all 5 native
   * checkboxes were under 24px and the gate stayed green throughout.
   */
  const RAW = 'button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
  /*
   * **For a checkbox the target is the label, not its own box.** WCAG defines a
   * target by what receives the click (SC 2.5.5 Understanding), and when a
   * \`<label>\` wraps it, native behaviour makes a click on the label a toggle, so
   * the whole label is one target. When a wrapping label exists, **substitute the
   * label** — otherwise a 16px checkbox and a 24px label are **double-counted as two
   * targets** and an already-fixed place is reported as a violation.
   */
  const seen = new Set();
  const targets = [];
  for (const el of Array.from(document.querySelectorAll(RAW))) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    const merged = (type === 'checkbox' || type === 'radio') ? (el.closest('label') || el) : el;
    if (seen.has(merged)) continue;
    const r = merged.getBoundingClientRect();
    const cs = getComputedStyle(merged);
    if (!(r.width > 0 && r.height > 0)) continue;
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (merged.closest('.sr-only') || merged.closest('[aria-hidden="true"]')) continue;
    seen.add(merged);
    targets.push(merged);
  }
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, '::after');
    if (a.content && a.content !== 'none' && a.position === 'absolute') {
      return { w: Math.max(r.width, parseFloat(a.width) || 0), h: Math.max(r.height, parseFloat(a.height) || 0) };
    }
    return { w: r.width, h: r.height };
  };
  const inlineExempt = (el) => {
    if (getComputedStyle(el).display !== 'inline') return false;
    let p = el.parentElement;
    while (p && getComputedStyle(p).display === 'inline') p = p.parentElement;
    if (!p) return false;
    let targetChars = 0;
    p.querySelectorAll(RAW).forEach((t) => { targetChars += (t.textContent || '').length; });
    return (p.textContent || '').length - targetChars > 0;
  };
  const box24 = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return { l: cx - MIN / 2, r: cx + MIN / 2, t: cy - MIN / 2, b: cy + MIN / 2 };
  };
  const meets = (b) => b.w >= MIN && b.h >= MIN;
  const intersects = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const spacingClear = (el) => {
    const mine = box24(el);
    for (const other of targets) {
      if (other === el || el.contains(other) || other.contains(el)) continue;
      const or = other.getBoundingClientRect();
      const orect = { l: or.left, r: or.right, t: or.top, b: or.bottom };
      if (intersects(mine, meets(hit(other)) ? orect : box24(other))) return false;
    }
    return true;
  };
  const id = (el) => el.getAttribute('data-testid') || (el.textContent || '').trim().slice(0, 24) || el.tagName;
  const failures = [];
  for (const el of targets) {
    const b = hit(el);
    if (meets(b)) continue;
    if (inlineExempt(el)) continue;
    if (spacingClear(el)) continue;
    failures.push({ id: id(el), w: Math.round(b.w), h: Math.round(b.h) });
  }
  return { scanned: targets.length, failures };
})()`;

/**
 * WCAG 2.5.8 (AA) — the 24×24 floor for fine pointers.
 *
 * Reach is **every** \`button\`/\`a[href]\` **and form control**
 * (\`input\`, \`select\`, \`textarea\`) across all the routes below.
 * Checkboxes and radios are substituted by their wrapping \`<label>\` and measured
 * as **one target**. When adding a route, take the violation inventory first — a
 * gate that is red from the day it is switched on is noise — and either fix what
 * remains or record it here with its measurement.
 */
test.describe("minimum target contract (pointer: fine, WCAG 2.5.8 AA)", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 860 } });

  for (const route of [
    "/ko/topology/?guides=off",
    "/ko/download/?guides=off",
    "/ko/docs/?guides=off",
    "/ko/guide/?guides=off",
  ]) {
    test(`a target on ${route} under 24×24 must prove either the inline exemption or the spacing exception`, async ({ page }) => {
      await page.goto(
        route === "/ko/docs/?guides=off"
          ? "/ko/library/?tab=ontology&guides=off"
          : route,
      );
      if (route === "/ko/docs/?guides=off") {
        await expect(page).toHaveURL(
          (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
        );
        await expect(
          page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
        ).toBeVisible();
      }
      await page.waitForLoadState("networkidle");
      const { scanned, failures } = (await page.evaluate(AUDIT_258)) as Audit258Result;
      // Idling guard — catching no targets means the selector is dead, not that the screen is perfect.
      expect(scanned, `too few targets were scanned on ${route} (${scanned})`).toBeGreaterThan(5);
      expect(failures, `2.5.8 shortfall: ${JSON.stringify(failures)}`).toEqual([]);
    });
  }

  test("instrument probe: catches crowded targets under 24 and lets spaced targets pass", async ({ page }) => {
    await page.goto("/ko/download/?guides=off");
    await page.evaluate(() => {
      // Violation probe: two 16px targets 8px apart — their 24 circles overlap.
      // Passing probe: also 16px, but 12px or more clear on every side, so the spacing
      // exception legitimately applies.
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div style="position:fixed;left:0;top:0;z-index:9999;background:#000;width:400px;height:200px">
           <button type="button" data-testid="probe-dense-a" style="position:absolute;left:20px;top:20px;width:60px;height:16px">a</button>
           <button type="button" data-testid="probe-dense-b" style="position:absolute;left:20px;top:40px;width:60px;height:16px">b</button>
           <button type="button" data-testid="probe-spaced" style="position:absolute;left:200px;top:90px;width:60px;height:16px">c</button>
         </div>`,
      );
    });
    const { failures } = (await page.evaluate(AUDIT_258)) as Audit258Result;
    const ids = failures.map((f: { id: string }) => f.id);
    expect(ids, "the crowded probe was not caught, so the detector is dead").toEqual(
      expect.arrayContaining(["probe-dense-a", "probe-dense-b"]),
    );
    expect(ids, "the spaced probe was a false positive, so the spacing exception is dead").not.toContain("probe-spaced");
  });

  /**
   * Form-coverage probes: if the selector reverted to `button, a[href]`, zero violations would mean
   * nothing was looked at. Each probe proves one thing: input caught, bare checkbox sized, label wrap.
   */
  test("form coverage probe: measures inputs and checkboxes for real and counts label-wrapped ones by their label", async ({ page }) => {
    await page.goto("/ko/download/?guides=off");
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        // The coordinates pack the probes densely **so the spacing exception cannot
        // apply**. The first version spaced them generously and all three passed — not
        // because the detector was dead but because the 24px circles did not overlap and
        // 2.5.8's spacing exception **legitimately** held.
        `<div style="position:fixed;left:0;top:300px;z-index:9999;background:#000;width:400px;height:260px">
           <input data-testid="probe-input-small" style="position:absolute;left:20px;top:10px;width:60px;height:16px" />
           <input type="checkbox" data-testid="probe-check-bare" style="position:absolute;left:20px;top:30px;width:16px;height:16px" />
           <label style="position:absolute;left:20px;top:120px;width:200px;height:32px;display:flex;align-items:center">
             <input type="checkbox" data-testid="probe-check-labelled" style="width:16px;height:16px" />
             <span>라벨이 타깃이다</span>
           </label>
           <button type="button" data-testid="probe-label-neighbour" style="position:absolute;left:20px;top:140px;width:60px;height:16px">n</button>
         </div>`,
      );
    });
    const { failures } = (await page.evaluate(AUDIT_258)) as Audit258Result;
    const ids = failures.map((f: { id: string }) => f.id);
    expect(ids, "the 16px input was not caught, so the selector is not looking at forms").toContain("probe-input-small");
    expect(ids, "the 16px checkbox without a label was not caught").toContain("probe-check-bare");
    /*
     * The neighbour button is positioned so its 24px circle overlaps the checkbox
     * inside the label. So **if label substitution dies**, the inner 16px checkbox
     * loses the spacing exception and is caught — which is why this assertion is not
     * idling.
     */
    expect(ids, "the neighbor probe was not flagged, so the crowded geometry here does not hold").toContain(
      "probe-label-neighbour",
    );
    expect(
      ids,
      "a label-wrapped checkbox was a false positive; label substitution is dead, so fixed spots would be called violations",
    ).not.toContain("probe-check-labelled");
  });
});
