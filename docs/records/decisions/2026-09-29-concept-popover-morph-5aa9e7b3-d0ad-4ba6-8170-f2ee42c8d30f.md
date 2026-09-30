---
id: 5aa9e7b3-d0ad-4ba6-8170-f2ee42c8d30f
date: 2026-09-29
---
## 2026-09-29 — Concept popover morphs into full detail through the app's own View Transitions

**Why**: opening full detail replaced the popover with a full-screen overlay in one fade, so nothing showed that the heading was the same concept the popover named.
**Prior**: follows the motion primitive set (decision 84007fc7) and the route crossfade that captures the pane, not the root.
**Decision**: `runMorph` in `src/shared/motion/shared-element.ts` names the popover title, commits the update with `flushSync` inside `document.startViewTransition`, names the full-detail heading, and clears every name when the transition finishes. `html.morph-transition` drops the root capture. It runs only once the prewarmed full-detail chunk is loaded. The heading takes focus on mount. React `ViewTransition` and `transitionTypes` stay banned because they capture the root and bypass the bounded hold.
**Dissent**: React `<ViewTransition>` would declare the pair in JSX with less code.
**Falsifier**: a WKWebView recording where the named group is covered or hard-cuts, or a morph that delays focus past the frame after settle.
**Owner**: Stark
