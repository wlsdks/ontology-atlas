# Prove a rendered UI change

Find each class the change touches and run only that row. A change that touches
several classes runs each row once.

| What changed | Look | Measured proof | Reviewer |
|---|---|---|---|
| words only | one `pnpm ui:look` capture | none | no |
| colour, type, spacing, radius, layout, local hierarchy | `ui:look` per slice | `pnpm ui:audit` on the route | no |
| breakpoint, reflow, touch target, scroll reserve | `ui:look` at the affected widths | [responsive-sweep](guides/responsive-sweep.md) | no |
| visible state, keyboard path, modality | `ui:look` per state | `pnpm ui:audit` | no |
| timing, easing, animation, camera travel | none | [motion-verify](guides/motion-verify.md) (recording) | no |
| map mark, relation channel, density | `ui:look` on the map state | `scripts/design/measure-graph-readability.mjs` and `scripts/design/measure-contrast.mjs` | no |
| map drag, pan, zoom, hit test, frame loop | none | [map-perf](guides/map-perf.md) | no |
| journey order, destination, agent handoff | none | [user-walkthrough](guides/user-walkthrough.md) | no |
| window, menu, Tauri bridge, WKWebView | installed app (Computer Use) | installed-app evidence | no |
| token, ramp, primitive interface | `ui:look` over `tests/e2e/audited-routes.ts` | [design-system-audit](guides/design-system-audit.md) | no |
| new or removed primary surface; navigation or grouping | `ui:look`, full surface | full [responsive-sweep](guides/responsive-sweep.md), [user-walkthrough](guides/user-walkthrough.md), [directions](../ui-build/guides/directions.md) | one `reviewer` |

Computer Use is for the installed app and the motion recording only. The
[design-audit](guides/design-audit.md) guide explains what `pnpm ui:audit`
measures and how to read it.

Measure before judging: `pnpm ui:audit` covers what a script can see (overflow,
occlusion, overlap, targets, off-ramp values, contrast, repeated sets, scroll
end), `node scripts/perf/perf-node-drag.mjs` covers map drag. Judge only what they
cannot, and promote a visual suspicion to a defect only after a measurement
confirms it.

Report each row's verdict first, then the script output as printed, the capture
paths, and the fixes with their remeasured values. A `reviewer` follows only on
the last row.
