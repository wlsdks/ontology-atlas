import { test, expect } from "@playwright/test";
import { AUDIT_258, type Audit258Result } from "../touch-target-audit";

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

  /**
   * Each route with the fewest targets its screen holds. The app-only page that stands at every app
   * address in a browser has the language switch beside two buttons and two inline links.
   */
  const ROUTES: ReadonlyArray<readonly [route: string, leastTargets: number]> = [
    ["/ko/topology/?guides=off", 3],
    ["/ko/sample/?guides=off", 6],
    ["/ko/download/?guides=off", 6],
    ["/ko/guide/?guides=off", 6],
  ];
  for (const [route, leastTargets] of ROUTES) {
    test(`a target on ${route} under 24×24 must prove either the inline exemption or the spacing exception`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const { scanned, failures } = (await page.evaluate(AUDIT_258)) as Audit258Result;
      // Idling guard — catching no targets means the selector is dead, not that the screen is perfect.
      expect(scanned, `too few targets were scanned on ${route} (${scanned})`).toBeGreaterThanOrEqual(leastTargets);
      expect(failures, `2.5.8 shortfall: ${JSON.stringify(failures)}`).toEqual([]);
    });
  }

  test("instrument probe: catches crowded targets under 24 and lets spaced targets pass", async ({ page }) => {
    await page.goto("/ko/download/?guides=off");
    await page.evaluate(() => {
      // Violation probe: two 16px targets 8px apart — their 24 circles overlap.
      // Passing probe: also 16px, but 12px or more clear on every side, so the spacing
      // exception legitimately applies. The page itself is hidden first, so the probes measure only
      // each other and a real control that happens to sit under them cannot count as a neighbour.
      for (const child of Array.from(document.body.children)) (child as HTMLElement).style.visibility = "hidden";
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
