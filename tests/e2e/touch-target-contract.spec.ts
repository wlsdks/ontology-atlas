import { test, expect } from "@playwright/test";

/**
 * Touch-target contract — does `--touch-target-min` (44px) **actually reach the
 * render?**
 *
 * **Why this layer.** The contract was already written down in
 * `.claude/rules/design.md` and the token existed (`--touch-target-min: 44px`), yet
 * a 2026-07-28 measurement found 19 controls under 44px on coarse pointers. The
 * cause was reach, not value:
 *
 * - The `@media (pointer: coarse)` block raised
 *   `--topology-chrome-control-height` to 44px, but the two shared primitives
 *   drawing the top chrome (`ChromeTile`, `ChromeChip`) did not read that token —
 *   they read `--chrome-tile-size` (36px, 17 consumers in src). **The promotion was
 *   landing in an empty room.**
 * - The same block also promoted `--topology-chrome-control-height-compact`, a dead
 *   token with zero references.
 * - Four text-style buttons in the first-run panel had no height token at all and
 *   measured 16–18px.
 *
 * Neither lint nor vitest can see this. Lint sees one file's AST, so it cannot
 * decide "is this token promoted in that media block", and jsdom has no layout, so
 * heights are always 0. Only **a real browser with pointer type as the independent
 * variable** can measure it.
 *
 * **A hit area is not the box.** Growing the box of an inline text control changes
 * the whole line's layout, so `.touch-hit-expand` widens only the hit area via a
 * pseudo-element — this check measures the **effective hit box** (own rect ∪
 * ::after rect), not the visible rect.
 *
 * **There are two layers**: coarse 44 is this repository's touch contract; fine 24
 * is WCAG 2.5.8 (AA). The 2026-08-04 link-floor reset (ledger "link floor 24") added
 * the fine layer. While the value layer loaded 44 across all fine pointers a fine
 * check was meaningless, but with the floor at 24, **anything under 24 is a real
 * defect**. The predicate:
 *
 *   PASS(a) := hitBox ≥ 24×24
 *           || INLINE_EXEMPT(a)   — display:inline && non-target sibling text exists
 *           || SPACING_CLEAR(a)   — the 24 circle (square approximation) does not
 *                                   overlap another target
 *
 * The inline exemption went into the instrument **first** because without it prose
 * links (prose-link, whose line box the parent owns) go falsely red, and once a gate
 * is wrong, switching it off becomes the default. "Is it inside a sentence" cannot
 * be decided statically (sibling text source, used display, and reflow are all
 * outside the opening tag), so this runtime instrument is the authority — the
 * successor to the deleted `inline` axis.
 */

const MIN = 44;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 768, height: 1024 } });

test.describe("터치 타깃 계약 (pointer: coarse)", () => {
  test("첫 실행 패널의 모든 컨트롤이 44px 히트 영역을 갖는다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();

    // If the card is collapsed, the reopen row expands it again.
    const reopen = page.getByTestId("first-run-starter-reopen");
    if (await reopen.isVisible().catch(() => false)) await reopen.click();
    await expect(page.getByTestId("first-run-starter")).toBeVisible();

    const short = await page.evaluate((min) => {
      const hit = (el: Element) => {
        const r = el.getBoundingClientRect();
        const a = getComputedStyle(el, "::after");
        if (a.content && a.content !== "none" && a.position === "absolute") {
          return {
            w: Math.max(r.width, parseFloat(a.width) || 0),
            h: Math.max(r.height, parseFloat(a.height) || 0),
          };
        }
        return { w: r.width, h: r.height };
      };
      const panel = document.querySelector('[data-testid="first-run-starter"]');
      if (!panel) return [{ id: "panel-missing", w: 0, h: 0 }];
      return Array.from(panel.querySelectorAll("button:not([disabled]), a[href]"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== "hidden";
        })
        .map((el) => ({
          id:
            el.getAttribute("data-testid") ||
            (el.textContent || "").trim().slice(0, 24) ||
            el.tagName,
          ...hit(el),
        }))
        .filter((b) => b.w < min || b.h < min);
    }, MIN);

    expect(short, `44px 미만 히트 영역: ${JSON.stringify(short)}`).toEqual([]);
  });

  test("공유 크롬 프리미티브가 coarse 에서 44px 로 승격된다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await expect(page.getByTestId("topology-command-chrome")).toBeVisible();

    // The token itself — did the promotion arrive?
    const tile = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--chrome-tile-size").trim(),
    );
    expect(tile).not.toBe("36px");

    // The rendered height — did the token actually reach the control? Checking the
    // token alone passes the "promoted but nobody reads it" state, which is the
    // original form of this defect.
    for (const id of ["topology-auto-arrange", "topology-concept-search"]) {
      const h = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `${id} 높이`).toBeGreaterThanOrEqual(MIN);
    }
  });

  /**
   * The gateway surface carries the same contract (2026-07-28).
   *
   * The `/download` GNB was **born during this audit** and was born without a touch
   * contract (measured: EN/KO 32×32 · logo 116×24 · links 20/28/16px). That is a
   * signal that coarse promotion is missing from the new-surface checklist, so the
   * registry is widened to here.
   */
  test("관문(/download)의 모든 컨트롤이 44px 히트 영역을 갖는다", async ({ page }) => {
    await page.goto("/ko/download/?guides=off");
    await expect(page.getByTestId("download-gnb")).toBeVisible();

    const short = await page.evaluate((min) => {
      const hit = (el: Element) => {
        const r = el.getBoundingClientRect();
        const a = getComputedStyle(el, "::after");
        if (a.content && a.content !== "none" && a.position === "absolute") {
          return {
            w: Math.max(r.width, parseFloat(a.width) || 0),
            h: Math.max(r.height, parseFloat(a.height) || 0),
          };
        }
        return { w: r.width, h: r.height };
      };
      return Array.from(document.querySelectorAll("button:not([disabled]), a[href]"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return (
            r.width > 0 &&
            r.height > 0 &&
            cs.visibility !== "hidden" &&
            !el.closest(".sr-only")
          );
        })
        .map((el) => ({
          id:
            el.getAttribute("data-testid") ||
            (el.textContent || "").trim().slice(0, 24) ||
            el.tagName,
          ...hit(el),
        }))
        .filter((b) => b.w < min || b.h < min);
    }, MIN);

    expect(short, `44px 미만 히트 영역: ${JSON.stringify(short)}`).toEqual([]);
  });
});

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
test.describe("최소 타깃 계약 (pointer: fine — WCAG 2.5.8 AA)", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 860 } });

  for (const route of ["/ko/topology/?guides=off", "/ko/download/?guides=off", "/ko/docs/?guides=off", "/ko/guide/?guides=off"]) {
    test(`${route} 의 타깃이 24×24 미달이면 인라인 면제·간격 예외 중 하나를 증명해야 한다`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const { scanned, failures } = (await page.evaluate(AUDIT_258)) as Audit258Result;
      // Idling guard — catching no targets means the selector is dead, not that the screen is perfect.
      expect(scanned, `${route} 에서 스캔된 타깃이 너무 적다(${scanned})`).toBeGreaterThan(5);
      expect(failures, `2.5.8 미달: ${JSON.stringify(failures)}`).toEqual([]);
    });
  }

  test("계기 프로브 — 24 미만 밀집 타깃을 실제로 잡고, 간격 확보 타깃은 지나보낸다", async ({ page }) => {
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
    expect(ids, "밀집 프로브를 못 잡았다 — 탐지기가 죽어 있다").toEqual(
      expect.arrayContaining(["probe-dense-a", "probe-dense-b"]),
    );
    expect(ids, "간격 확보 프로브를 오탐했다 — spacing 예외가 죽어 있다").not.toContain("probe-spaced");
  });

  /**
   * **Form-coverage probes** — pin the blind spot in which this audit could not see
   * forms until 2026-08-05.
   *
   * If the selector reverts to `button, a[href]`, all three below pass, and then
   * "zero violations" is 0 because nothing was **looked at**, not because the screen
   * is clean — the defect this repository has repeated.
   *
   * Each probe proves something different:
   * - `probe-input-small` — is a form control **caught by the selector**
   * - `probe-check-bare` — is a bare checkbox **judged at its own size**
   * - `probe-check-labelled` — when a label wraps it, is it **substituted by the label
   *   and passed** (without this, an already-fixed place is double-counted and falsely
   *   reported)
   */
  test("폼 커버리지 프로브 — 인풋·체크박스를 실제로 재고, 라벨로 감싼 것은 라벨로 친다", async ({ page }) => {
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
    expect(ids, "16px 인풋을 못 잡았다 — 셀렉터가 폼을 안 보고 있다").toContain("probe-input-small");
    expect(ids, "라벨 없는 16px 체크박스를 못 잡았다").toContain("probe-check-bare");
    /*
     * The neighbour button is positioned so its 24px circle overlaps the checkbox
     * inside the label. So **if label substitution dies**, the inner 16px checkbox
     * loses the spacing exception and is caught — which is why this assertion is not
     * idling.
     */
    expect(ids, "이웃 프로브가 안 걸렸다 — 이 자리의 밀집 기하가 성립하지 않는다").toContain(
      "probe-label-neighbour",
    );
    expect(
      ids,
      "라벨로 감싼 체크박스를 오탐했다 — 라벨 치환이 죽었다(고쳐 놓은 자리를 위반으로 부르게 된다)",
    ).not.toContain("probe-check-labelled");
  });
});
