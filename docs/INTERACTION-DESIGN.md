# INTERACTION DESIGN — Applying Fluid Interface Principles (2026-07-17)

> A record of decisions applying open principles from the Apple *Designing Fluid Interfaces* (WWDC18) lineage to this project's design charter
> (`DESIGN-SYSTEM.md` · `.claude/rules/design.md`).
> **If in conflict with the charter, the charter wins** — see "Conflict Resolution" below. This is a design gate input document for topology-map-v2 (Slice 2), and design-guardian verification is performed via screenshot evidence at implementation time.

## 0. Boundary Between Two Worlds (Core Decision)

Divide the app into two areas and apply different motion disciplines:

| Area | Discipline | Rationale |
|---|---|---|
| **Chrome (panels·buttons·popovers·lists)** | Maintain existing charter: focus on `transition-colors`/`opacity`, <200ms, minimal transform | Linear calmness — if chrome jumps, data dies |
| **Canvas (topology map·camera·drag)** | **Fully apply fluid principles**: spring·1:1 tracking·interruptible·velocity transfer | This is where "Obsidian-like tactility" lives — core to owner preference |

This boundary prevents the situation where "they overlap weirdly and stutter": chrome stays quiet, canvas stays alive. Do not mix the two disciplines on one surface.

## 1. Canvas Fluid Discipline (topology-map-v2)

- **Respond on pointer-down**: immediate visual feedback on node press (selection ring). No feedback waiting for click(up). Click=commit contract — down is only feedback, commit (focus switch) happens on up, cancellable via drag escape (~10px hysteresis).
- **1:1 tracking**: during drag, nodes/camera stick to the pointer. Respect offset of grab point (no center snap). Use `setPointerCapture`, calculate release velocity from position/visual history of last few frames.
- **Interruptibility (First Principle)**: never lock input during camera movement·focus switch·expand animation. New target starts **from current displayed value** (never restart from target value — causes jump). No CSS `@keyframes` for gesture-based motion.
- **Spring defaults**: damping 1.0 (no overshoot) / response 0.3~0.4. **Bounce (damping ~0.8) only when user throws momentum** (flick release). No bounce on menu/popover appearance.
- **Velocity transfer**: pass release velocity to spring initial velocity at drag→animation seam. After pan release, camera determines stop point via inertial projection (`(v/1000)·d/(1−d)`, d≈0.998) then decelerates.
- **Boundaries are rubber bands**: no hard stops at canvas pan limits — gradual resistance then return.
- **Spatial consistency**: popovers grow from trigger node (transform-origin = node anchor) and shrink via same path. Expand subgraph folds back to where it came from (inheriting existing TopologyMapCanvas FLIP assets).

## 2. Conflict Resolution (Apple Principles vs Our Charter)

| Apple Principle | Resolution | Reason |
|---|---|---|
| Translucent materials·backdrop-blur (§materials) | **Rejected — Charter wins** | glassmorphism is a prohibited pattern. Depth expressed via elevation tokens (surface step + border + shadow) |
| Springs for all UI | **Adopted for canvas only** | Chrome maintains Linear calmness (§0 boundary) |
| Scale press feedback (`:active scale`) | **Reject relaxation → Alternative** | Same family as `hover:scale-*` prohibited pattern. Press feedback via color/border token changes |
| Dim scrim (modal focus) | **Conditional adoption** | DOM scrim alpha allowed (WebGL low-alpha defect is canvas-internal issue). But **WebGL internal dim still only hidden/transparent tokens** |
| Sound·haptics | **Deferred** | Overkill for web/desktop tools — not adopted per utility principle |
| System font priority | **Adopted (already compliant)** | |

## 3. Chrome Discipline Reinforcement (Existing Charter + Minor Additions)

- **Wayfinding**: every screen must answer "where am I / where can I go / how do I leave". Always maintain path out of topology focus state (Esc·outside click) — don't trap users.
- **Labels specific**: name content instead of umbrella labels like "Home" (same lineage as plain text principle "places using this node N").
- **Four feedback types**: status (freshness badge)·complete (sync complete)·warning (drift warning)·error (validation failure) — inline, no post-submit batch.
- **Typography**: large title tracking `-0.02em`·tight leading, body 0·1.5 — prohibit global fixed letter-spacing. Spacing in rem (respect user font size).
- **Confirm dialogs only for destructive actions** (delete_concept type). Others use undo convention — excessive confirmation creates click-through learning.

## 4. Accessibility·Reduced Motion (Charter Extension)

- `prefers-reduced-motion`: canvas spring·FLIP → replaced with short crossfade (already handled in base layer + individually respected in canvas code). Rubber band/inertia retention via visual amplitude reduction.
- `prefers-contrast: more`: replace elevation with border reinforcement.
- During large surface repositioning, fade-out during movement → fade-in after settling (prevent motion sickness for large moving objects).

## 5. Items Added to Slice 2 Design Gate Checklist

1. Does node press→up→focus switch follow §1 discipline (down feedback·hysteresis·cancellation)?
2. If user intervenes during camera transition, does it continue from current value? (Interrupt test: drag during transition).
3. Is velocity transfer present on pan release? (Seam visual inspection + slow-mo frame review — Apple process principle).
4. Does popover grow from node and shrink via same path?
5. Did spring/bounce leak into chrome? (Boundary violation check).
6. No low-alpha in WebGL internals (existing unit test) + didn't confuse with DOM scrim.
7. Does reduced-motion have alternative paths for all above items?

## 6. Implementation Notes

- Spring: Motion (formerly Framer Motion) series `type: 'spring', bounce: 0, duration: 0.4` ≈ damping 1.0. Whether to introduce new dependencies will be decided in Slice 2 — if the existing TopologyMapCanvas's pure function camera + CSS `translate` FLIP is sufficient, we'll implement velocity inheritance ourselves without libraries (principle of minimal dependencies).
- Integration with Sigma canvas follows the reducer·camera API patterns in `docs/archive/SIGMA-PLAYBOOK.md` (investigated but v2 does not adopt Sigma — archived) — DOM overlays are limited to a single popover.
