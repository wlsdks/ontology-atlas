# Responsive sweep

Run only when `pnpm design:route` includes `responsive-sweep`. Use its scope:
affected bands for a breakpoint-local change, the full matrix for a new surface
or information architecture.

- A **breakpoint** is a width where layout changes (`md` 768px, `lg` 1024px).
- A **rect** is the measured `getBoundingClientRect()` geometry.
- **Chrome** is the frame around content: header, toolbar, tab bar, and panels.

Static class reading misses live defects; only computed geometry proves them.

## Width matrix

| Viewport | Band |
|---|---|
| 600×900 | phone/small portrait tablet; below `md` |
| 768×1024 | `md` boundary; side panels begin, tab bar remains |
| 834×1112 | 11-inch tablet |
| 1024×768 | `lg` boundary; vertical navigation begins, tab bar leaves |
| 1440×900 | 14-inch laptop; labels progressively compact |
| 1920×1080 | FHD |
| 2560×1440 | QHD |

Use the router's returned bands. A local chrome or layout repair does not
independently require the full matrix. If additional breakpoints are affected,
update the change facts and use the resulting scope.

## Measure every affected band

```bash
pnpm ui:audit -- --url=http://localhost:<your port> --route=<route?guides=off> --widths=<the router's bands>
```

Reproduce the exact state in the URL (`?index=expanded`, `?recent=auto`) and
keep `guides=off`; the first-run overlay otherwise captures every
`elementFromPoint`. The script measures overflow, intercepted controls,
overlap and small targets at each width; add `--shots=<scratchpad dir>` for the
screenshots. After it, capture the affected representative state with the
computer-use capability and record app/window identity, accessibility owner and
screenshot path; browser screenshots do not replace that capture.

## Standing rules

- `docs/DESIGN-SYSTEM.md`, “Touch & tablet responsive contract,” is canonical.
  Below `lg`, scroll ends and bottom panels reserve
  `--topology-mobile-bottom-tab-reserve`. Expanded INDEX becomes a full-screen
  sheet below `md`. Coarse-pointer 44px targets are decided only by
  `@media (pointer: coarse)`.
- Tailwind `max-*` output may precede `min-*`, so `max-lg:pb-X` can lose to
  `md:py-Y`. Prefer an unconditional base plus `lg:` override and measure the
  computed `paddingBottom`.
- Top utility chips intentionally compact below `2xl`. After adding one, measure
  its overlap with search at 1440px.

## Report

Open with the verdict in one line (pass, or the defects and their bands), then
the `pnpm ui:audit` summary lines, the Computer Use evidence, the applied fix,
and the remeasured summary.
Do not claim “responsive is fine” from Tailwind reasoning alone.
