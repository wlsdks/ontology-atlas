/**
 * Shared instruments for the two text-zoom specs.
 *
 * `tests/e2e/text-zoom-ramp.spec.ts` measures the **type** with the root set in script;
 * `tests/e2e/text-zoom-layout.spec.ts` measures the **layout** with the browser launched at a
 * 32px default font size. They are separate files because Playwright refuses `launchOptions`
 * inside a `describe` — it forces a new worker — and separate specs are also the honest shape:
 * the two techniques are not interchangeable, and the reason is written in both doc blocks.
 */

/** The four routes both specs sweep. */
export const TEXT_ZOOM_ROUTES = [
  "/ko/docs/?guides=off",
  "/ko/topology/?guides=off",
  "/ko/download/",
  "/ko/library/?guides=off",
] as const;

/** The two widths the slice's brief named. */
export const TEXT_ZOOM_WIDTHS = [1512, 1040] as const;

/** 200% of the 16px default. The one number these two files are about. */
export const ZOOMED_ROOT_PX = 32;
export const DEFAULT_ROOT_PX = 16;

/**
 * **Text that is visibly cut off and offered no way to see the rest.**
 *
 * ⚠️ The obvious measurement here is wrong, and it is wrong in the direction that passes.
 * `html` and `body` both carry `overflow-x: hidden` on every Atlas route (measured), so
 * `documentElement.scrollWidth` can never exceed `clientWidth` and an element whose rect
 * reaches past the viewport always has a clipping ancestor. A gate built on either of those
 * two facts is green before it is written — the same shape as the width-conditional gate that
 * measured a control only at the one width where it did not exist.
 *
 * So the question is asked about the **text**, not the box: is a leaf's content taller or wider
 * than the box it sits in, and does the box that clips it offer a way to the rest? An ellipsis
 * (`text-overflow`), a line clamp (`-webkit-line-clamp`) and a scroller (`auto`/`scroll`) are
 * all such offers, and all three are things an author chose for a narrow box; the type merely
 * reaches them sooner. What is left over — cut with nothing on offer — is text a reader cannot
 * get to at all, and that is the number this holds at zero.
 */
export const CUT_TEXT = `() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    // A 1px box is the visually-hidden idiom (skip links, rail tooltips), not a cut.
    if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) continue;
    let clipper = null;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const ns = getComputedStyle(node);
      const clips = (axis) => ['hidden', 'clip', 'auto', 'scroll'].includes(axis);
      if (clips(ns.overflowX) || clips(ns.overflowY)) { clipper = node; break; }
    }
    if (!clipper) continue;
    const ks = getComputedStyle(clipper);
    const offersRest =
      ks.textOverflow === 'ellipsis' ||
      (ks.webkitLineClamp && ks.webkitLineClamp !== 'none') ||
      ['auto', 'scroll'].includes(ks.overflowX) ||
      ['auto', 'scroll'].includes(ks.overflowY);
    if (offersRest) continue;
    out.push(
      '«' + text.slice(0, 40) + '» ' + el.scrollWidth + 'x' + el.scrollHeight
        + ' in ' + el.clientWidth + 'x' + el.clientHeight
        + ' · clipped by .' + String(clipper.className).slice(0, 60),
    );
  }
  return out;
}`;
