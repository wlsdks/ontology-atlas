---
name: design-audit
description: Audit a finished frontend change by measuring rendered rects and computed styles before using screenshots as human-checkable evidence.
---

# Measure a finished UI change

People and models localize small spacing, alignment, and overlap defects poorly
by sight. An unlocalized feeling cannot become a reliable fix, while imagined
defects damage healthy code. The fixed order is: measure → list violations →
attach screenshots as evidence.

Run only when `pnpm design:route` includes `design-audit`. Audit its returned
scope: one affected state for a local change, affected map state for topology,
or the full surface for a structural change. Copy-only, pure logic, motion-only,
and topology-gesture-only work use their own routed proof.

## 0. Fix the state

Use a fixed viewport and dataset, wait for fonts and one explicit ready element,
move the pointer off interactive targets, and use reduced motion for a static
audit. Do not use `networkidle` as the default readiness signal; hydration can
still be incomplete.

Add `?guides=off`. Closing a first-run guide manually changes focus and adds its
own motion. Use `?guides=reset` only when auditing the guide. Playwright may call
the shared `seedFirstRunSeen(page)` helper.

## 1. Overlap and reachability

### Filter to painted elements

A non-zero rect does not mean the element is painted. Children inside a closed
`<details>` retain visible styles and a healthy rect while absent from the screen.
The first audit without this filter produced three false findings.

```js
const painted = (el) => {
  const c = getComputedStyle(el);
  const b = el.getBoundingClientRect();
  if (b.width < 1 || b.height < 1) return false;
  if (c.visibility === 'hidden' || c.display === 'none' || Number(c.opacity) < 0.05) return false;
  if (el.closest('details:not([open])')) return false;
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const nc = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    if (nc.overflow !== 'visible' && (b.bottom < r.top || b.top > r.bottom)) return false;
    if (nc.contentVisibility === 'hidden' || n.hasAttribute('inert')) return false;
  }
  return b.top < innerHeight && b.bottom > 0 && b.left < innerWidth && b.right > 0;
};
```

Read ramp values from `app/globals.css`; never hardcode a remembered list that
will call a new valid step a defect.

Measure pairwise rect intersections among independent painted elements in the
same stacking context. Report pixels, not “looks overlapped.” Repeat at affected
bands through `/responsive-sweep`.

Reachability is separate: at each important control's centre, require
`document.elementFromPoint(cx, cy)` to return that control or a descendant.

## 2. Repeated-set regularity

- Height standard deviation should be zero unless an authored exception explains it.
- Compare first-line rect tops for column alignment.
- Count unique sibling gaps; three or more gaps inside one repeated set usually
  indicates hand-selected spacing.

## 3. Computed style versus ramps

Static lint cannot see a nonexistent Tailwind utility falling back to the 16px
root size. Inventory painted computed values and compare them with tokens read
from CSS:

- font size and line height;
- colour, background, and border after token resolution;
- radius and shadow.

When 16px is valid through `--text-title`, inspect the requested class too; the
defect is asking for an undefined step and receiving root 16px.

### Contrast is a different question

Token use does not prove readability. A prior adjacent pair passed token rules
at 1.14:1 and differed only along a red/green hue channel.

```bash
node scripts/serve-static-export.mjs --port=4173 &
node scripts/measure-contrast.mjs [baseUrl] [route...]
```

Use WCAG 1.4.3: 4.5:1 body text and 3:1 large text; use 1.4.11's 3:1 for
non-text. Composite alpha, report unparsed colours as unmeasured, and inspect
adjacent marks separately for a non-colour separator.

### Canvas nodes are not DOM

For node shape, radius, magnitude, or embedded counts, use the canonical Node
Spec, `node-shapes.test.ts`, `topology-v2-kind-glyph.test.tsx`, and
`node-kind-shape-parity.contract.test.ts`. Read live coordinates and kinds from
`window.__atlasMap.nodes()` under `?e2e=1`.

## 4. Scroll-end reserve

At maximum scroll, compare the last content bottom with the bottom bar top. Below
`lg`, reserve both `--topology-mobile-bottom-tab-reserve` and safe-area inset.

## 5. Final Computer Use checkpoint after measurement

After browser geometry measurement, open the actual browser, WebView, or installed
app through the computer-use capability. Capture its fresh accessibility tree and screenshot;
record app/window identity, route, viewport, DPR, state, screenshot path, and the
element that owns the primary action or selected fact. Browser automation
screenshots do not replace this required human-checkable capture.

Link this final checkpoint to the baseline and material checkpoints produced by
`/design-build`. A final screenshot cannot retroactively validate a whole screen
that was built without the Computer Use render loop.

Capture the affected viewport for a scoped audit. Use both 1512×900 and 390px
only when the route requests a full surface or responsive matrix. Visual critique
may suggest a question; promote it to a defect only after rect/style evidence
confirms it.

## Report

```md
## Design audit — <screen/change>

**Fixed state**: viewport · data · ready signal · DPR

| Check | Result |
|---|---|
| Rect intersections | N pairs and pixel overlap |
| Reachability | N intercepted controls |
| Repeated dimensions | height sigma · alignment drift · unique gaps |
| Type/leading ramp | off-ramp values and undefined-step fallbacks |
| Colour/radius/shadow | non-token computed values |
| Contrast | combinations · failures · ratios · unmeasured |
| Scroll end | measured clearance and reserve token |

**Evidence**: measured browser state · Computer Use app/window/tree/screenshot path
**Confirmed defects and prescriptions**: …
**Visual suggestions rejected by measurement**: …
```

Motion belongs to `/motion-verify`; breakpoint coverage to `/responsive-sweep`.
`/design-council` is not an automatic next step; use it only when the route
selects a structural council.
