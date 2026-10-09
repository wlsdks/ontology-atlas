# Measure a finished UI change

For inspectors with long evidence, read the [reading-panel reference](../../ui-build/guides/reading-panels.md)
when choosing clearance, scrolling and the proof surface.

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

## 1. Measure with the script

```bash
pnpm build && node scripts/serve-static-export.mjs --port=<your port> &
pnpm ui:audit -- --url=http://localhost:<your port> --route=<route?guides=off> --wait=<ready selector> [--widths=<affected widths>]
```

It applies the painted-element filter and reports, per route and width:
horizontal overflow, controls `elementFromPoint` cannot reach, overlapping
controls, targets under 44px at 768px and below, type, leading, radius and
shadow values off the ramps it reads from `app/styles`, WCAG 1.4.3 contrast with
alpha composited, repeated sets of unequal height, and scroll containers with no
end gap. Exit 1 means overflow, occlusion, contrast or scroll-end findings to
fix. Do not hand-write probes for these; extend the script when a check is
missing.

## 2. Judge what the script cannot

- An off-ramp 16px may be an undefined Tailwind step falling back to the root
  size: inspect the requested class, not only the value.
- Adjacent marks that differ only by hue need a non-colour separator (WCAG
  1.4.11's 3:1 for non-text).
- Below `lg`, the scroll end must also clear
  `--topology-mobile-bottom-tab-reserve` and the safe-area inset.

### Canvas nodes are not DOM

For node shape, radius, magnitude, or embedded counts, use the canonical Node
Spec, `node-shapes.test.ts`, `map-kind-glyph.test.tsx`, and
`node-kind-shape-parity.contract.test.ts`. Read live coordinates and kinds from
`window.__atlasMap.nodes()` under `?e2e=1`.

## 3. Generated drawings and printed numbers

Applies when the screen draws a diagram, graph or chart from data:

- A generated drawing is deterministic: derive variation from a stable id, never `Math.random`.
- Every mark states itself in readable text, and every legend row names a mark that is on screen.
- A number the screen prints is checked once against its source by a route that shares no code
  with the screen (a shell count, a frontmatter scan), not by re-reading the screenshot.
- Assign a notation symbol (ISO 5807, C4, BPMN) from derived facts, never from a name.

## 4. Final Computer Use checkpoint after measurement

After browser geometry measurement, open the actual browser, WebView, or installed
app through the computer-use capability. Capture its fresh accessibility tree and screenshot;
record app/window identity, route, viewport, DPR, state, screenshot path, and the
element that owns the primary action or selected fact. Browser automation
screenshots do not replace this required human-checkable capture.

Link this final checkpoint to the baseline and material checkpoints produced by
`/ui-build`. A final screenshot cannot retroactively validate a whole screen
that was built without the Computer Use render loop.

Capture the affected viewport for a scoped audit. Use both 1512×900 and 390px
only when the route requests a full surface or responsive matrix. Visual critique
may suggest a question; promote it to a defect only after rect/style evidence
confirms it.

## Report

```md
## Design audit — <screen/change>

**Verdict**: pass | <N> defects — <the one that matters most, in one line>

**Fixed state**: viewport · data · ready signal · DPR

**`pnpm ui:audit` summary**: the per-width lines, pasted as printed

**Evidence**: measured browser state · Computer Use app/window/tree/screenshot path
**Confirmed defects and prescriptions**: …
**Visual suggestions rejected by measurement**: …
```

Motion and breakpoint coverage have their own guides in this skill.
A `reviewer` is not an automatic next step; use one only when the route says
`review=yes`.
