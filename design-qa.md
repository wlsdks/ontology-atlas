# Design QA — Pixel Mascot Identity

## Sources and selected direction

- Owner references:
  - the owner-provided Downloads PNG generated at 23:22:15 on 2026-08-28
  - the owner-provided Downloads PNG generated at 23:07:54 on 2026-08-28
  - macOS menu-bar placement crop supplied on 2026-08-29
  - rail-size crops supplied at 01:13 and 01:40 on 2026-08-29
- Selected: one raster-first pixel identity, platform icons, state-free macOS
  template, and finite verified WALK → READ → SUCCESS motion.
- Owner revision after installed proof: remove the rail logo and wordmark entirely;
  navigation starts with Map. Rejected: tiny rail mark and enlarged rail mark.

## Implementation evidence

| Surface | Evidence |
|---|---|
| Source vs final identity | `/tmp/atlas-mascot-proof/source-vs-implementation.png` |
| Size ladder / packaged Finder icon | `/tmp/atlas-mascot-proof/finder-app-icon.png` |
| Final rail-free installed app | `.tmp/ontology-atlas-deployed-relief.png` |
| Final rail-free installed READ state | `/tmp/atlas-mascot-proof/final-installed-read-no-rail.png` |
| Final six-phase WALK strip | `/tmp/atlas-mascot-proof/final-walk-phase-strip.png` |
| Browser SUCCESS receipt | `/tmp/atlas-mascot-proof/final-e2e/success-pose.png` |
| Real macOS normalized recording | `/tmp/atlas-mascot-proof/final-installed-motion-30fps.mp4` |
| Final native tray menu | `/tmp/atlas-mascot-proof/final-tray-menu.png` |

## Measured result

- Brand masters: separately authored RGBA 64 / 32 / 16px; motion rows 384×64;
  tray masks 16 / 32px.
- Rail: brand images 0, `Atlas` caption 0; first destination begins at y=12.
- Mascot: hidden below 1024px; 64×64 above it; right inset 24px; stage top is
  `50% + 48px`; pointer interception 0.
- Dense synthetic map: three live 3,000-node samples; nearest node clearance
  3.16px; opaque-pixel/node overlaps across all 18 frames: 0.
- Motion: 600ms; six poses / five synchronized 120ms ticks; 60px / five exact
  12px travel steps. WALK6 = READ1 and READ6 = SUCCESS1 byte-for-byte. Early
  completion preserves the in-flight path and cannot regress SUCCESS to READ.
- Responsive sweep: 600, 768, 834, 1024, 1440, 1920, 2560; no rail/tab/mascot
  intersection, horizontal overflow, or center-hit interception.
- Native tray: black/clear macOS template; pointer Open restored and focused one
  minimized window; Quit removed the process and item. It is a secondary pointer
  path; no keyboard-accessibility or background-service claim.

## Finding history

1. P1 — 16px helmet plus `Atlas` was too small. Enlarged for direct inspection.
2. Owner decision — enlarged mark still competed with navigation. Removed the
   complete rail brand area instead of iterating another size.
3. P1 — 128×64 transparent runway let opaque mascot pixels cover a dense-map
   node. Collapsed to 64×64 and moved to a measured clear right-edge lane; added
   an all-frame live overlap gate.
4. P1 — travel `steps(6)` and art `steps(5)` produced 11 interleaved pulses.
   Unified to one five-transition clock and authored pixel-continuous state
   boundaries.
5. P2 — tray menu proof predated the final rail removal. Re-recorded the native
   menu from the final bundle with the rail beginning at Map.

## Final result

Passed. Post-application evidence measures the final 64×64 stage before capture,
shows the logo-free installed rail and native menu from the same bundle, and
keeps all palette/motion/responsive/dense-map gates green. Distribution signing
and Windows tray parity are outside this owner-approved local prototype slice.
