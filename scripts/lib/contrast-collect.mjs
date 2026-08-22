/**
 * **Browser-side collector** for adjacent data marks — the judgement is made by
 * `contrast.mjs`.
 *
 * ## Why it is a separate file (2026-08-06)
 *
 * This collector lived inside `measure-contrast.mjs` (the instrument a person runs),
 * so **the CI gate never once measured adjacent marks** — `contrast-ratchet` called
 * only `judgeText`. A check that exists only in an instrument runs only when someone
 * remembers it, which is exactly how this repository missed a 1.14:1.
 *
 * Moving the collector here makes **the instrument and the gate use the same
 * function.** Copying the same judgement logic into two places starts them drifting
 * immediately (Carbon).
 *
 * ⚠️ This function **runs inside the browser** (`page.evaluate`), so it references
 * nothing from the outer scope — anything it referenced would die on
 * serialisation.
 */
export function collectAdjacentMarks() {
  const out = [];
  for (const parent of document.querySelectorAll("body *")) {
    const kids = [...parent.children].filter((k) => {
      const r = k.getBoundingClientRect();
      const c = getComputedStyle(k);
      if (r.width < 2 || r.height < 2 || r.height > 40) return false;
      if (c.visibility === "hidden" || c.display === "none" || Number(c.opacity) < 0.05) return false;
      if (c.backgroundColor === "rgba(0, 0, 0, 0)") return false;
      return !(k.textContent || "").trim();
    });
    if (kids.length < 2) continue;
    const track = getComputedStyle(parent).backgroundColor;
    const segs = kids
      .map((k) => ({ el: k, r: k.getBoundingClientRect(), bg: getComputedStyle(k).backgroundColor }))
      .sort((x, y) => x.r.left - y.r.left);
    for (let i = 1; i < segs.length; i++) {
      if (segs[i - 1].bg === segs[i].bg) continue;
      /**
       * ⚠️ **A gap means they are not adjacent.**
       *
       * `design.md`: *"the boundary between two series is drawn not by colour but by a
       * **1px gap** (the interval where the track colour shows through)"* — that gap is
       * precisely the colour-independent separator WCAG 1.4.11 requires. The first version
       * of this collector treated "a gap of 2px or less" as adjacent, swallowed the domain
       * capacity bars' `gap-px` (exactly 1px), and **reported all 16 conforming pairs as
       * failures** (measured 2026-08-04). An instrument that contradicts the prescription
       * makes people fix healthy screens.
       *
       * So only touching marks count as adjacent. Pairs with a gap are not discarded but
       * counted as `separated` — dropping them silently would make "measured" and "not
       * measured" the same green again.
       */
      const gap = segs[i].r.left - segs[i - 1].r.right;
      if (gap >= 0.5) {
        out.push({ separated: true, gapPx: +gap.toFixed(2) });
        continue;
      }
      out.push({
        a: segs[i - 1].bg,
        b: segs[i].bg,
        over: track === "rgba(0, 0, 0, 0)" ? "rgb(15,16,17)" : track,
        selector:
          parent.tagName.toLowerCase() +
          (typeof parent.className === "string"
            ? `.${parent.className.trim().split(/\s+/).slice(0, 3).join(".")}`
            : ""),
      });
    }
  }
  return out;
}
