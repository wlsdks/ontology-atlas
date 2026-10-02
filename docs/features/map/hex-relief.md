---
title: Hex board relief
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Hex board relief

The Hex board can tilt into a relief, a pose of the same board rather than a
separate view. The **▲ Relief** chip in the board's footer, or `Shift` and a
vertical drag (0.003 rad per pixel), tilts it. On release the pitch rests at the
nearer pose: flat (0) or 0.75 rad. Yaw never changes, so every tile keeps its
column and the back-to-front order is the board's row order.

- **Height.** A capability rises by the distinct concepts outside its own
  containment that declare `depends_on` or `dependencies` on it or on one of its
  elements. Only direct declarations count, never transitive ones. The height is
  `R × min(1.1, 0.12 + 0.98·log2(1+d)/log2(1+dMax))`, so every tile keeps a
  floor and the most depended-on one stands 1.1 cells tall. Below a cell size of
  14 px in the regions band, each region rises as one slab by the count for its
  domain, which its nameplate prints after ▲.
- **The number travels with the height.** It is printed on the face (it fades in
  with the tilt), added to the hover tooltip, and read out by each tile's row in
  the accessible list. The legend says what the height means, or that no concept
  declares a dependency when none does.
- **Motion.** A tilt takes the camera tween (200–420 ms by distance). The first
  relief per folder per session rises tile by tile on the assembly clock, and when
  the board opens in a remembered relief that rise is its arrival. Reduced motion
  lands on the first frame.
- **Picking.** In relief a click picks the prism drawn under the pointer: its top
  face, its walls or its base, the frontmost first. Flat, the board keeps its
  hexagon hit test.
- **Memory.** The pose is the `atlas.appearance.hex-relief` preference (`on` or
  `off`, off by default). It is not part of the address.
- **Morph.** A pick into the Hex board while relief is on glides each concept to
  its raised top.

Decision record: `docs/records/decisions/2026-10-03-hex-board-relief-69cb6579-d4ba-4a1a-83e2-152b50458bc7.md`.
