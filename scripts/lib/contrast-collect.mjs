/**
 * Browser-side collector for adjacent data marks; the judgement is in `contrast.mjs`. Shared by
 * the instrument and the CI gate so the logic cannot drift. Runs inside `page.evaluate`, so it
 * references nothing from the outer scope.
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
       * A gap means not adjacent: `design.md` draws the boundary between series as a 1px gap, the
       * colour-independent separator WCAG 1.4.11 requires. Gapped pairs are counted as `separated`, not
       * dropped.
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
