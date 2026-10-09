# Prove a rendered UI change

Run only the proof steps `pnpm design:route` returned, at the scope it returned.
Each step has a guide with the same name; read only those.

| Step from the router | Guide | What it proves |
|---|---|---|
| `design-audit` | [design-audit](guides/design-audit.md) | geometry, reachability, ramps and contrast of the affected state |
| `responsive-sweep` | [responsive-sweep](guides/responsive-sweep.md) | the affected width bands |
| `motion-verify` | [motion-verify](guides/motion-verify.md) | motion, from a real screen recording |
| `map-perf` | [map-perf](guides/map-perf.md) | map drag, pan and zoom performance |
| `user-walkthrough` | [user-walkthrough](guides/user-walkthrough.md) | a whole journey with a declared knowledge state |
| `design-system-audit` | [design-system-audit](guides/design-system-audit.md) | gate reach and rendered inventory after a design-contract change |

Measure before judging: `pnpm ui:audit` covers what a script can see (overflow,
occlusion, overlap, targets, off-ramp values, contrast, repeated sets, scroll
end), `node scripts/perf-node-drag.mjs` covers map drag. Judge only what they
cannot, and promote a visual suspicion to a defect only after a measurement
confirms it.

Report each step's verdict first, then the script output as printed, the
Computer Use evidence, and the fixes with their remeasured values. A `reviewer`
follows only when the route says `review=yes`.
