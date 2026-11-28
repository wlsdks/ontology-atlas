/**
 * WCAG 2.5.8 24x24 floor on the effective hit box (own rect plus ::after rect); needs real layout.
 * Pass if the box is large enough, or the target is inline in a sentence, or its 24 circle
 * overlaps no other target. Shared by the website's pages and the app's map.
 */

export interface Audit258Result {
  scanned: number;
  failures: { id: string; w: number; h: number }[];
}

/** The fine-pointer 2.5.8 audit — a predicate that runs inside the browser. */
export const AUDIT_258 = `(() => {
  const MIN = 24;
  /*
   * The selector **must include form controls**: with only \`button, a[href]\`, \`<input>\`,
   * \`<select>\` and \`<textarea>\` do not exist for this audit, and undersized native checkboxes
   * would pass.
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
