---
id: e92269f3-5a8e-4e07-88ac-1d582eb9679d
date: 2026-09-14
---
## 2026-09-14 — Keep connected Library tabs with bounded recovery

**Why**: The owner could not distinguish tabs and creation output. Review found enlarged labels outside fixed-height tabs and WKWebView Escape closing the reader when history opened without taking focus.
**Prior**: Standing: [Library workspace](2026-09-14-library-ontology-workspace-c5472b7d-bb5f-475d-b31a-523bd09fdc89.md), [connected tabs](2026-09-14-connected-document-tabs-ef7bf713-f24f-4762-ba7d-220b336039d9.md), and [launch chooser](2026-09-13-launch-chooser-and-rail-folder-identity-6837cdab-43bc-49e9-90ec-766ddc3d2aac.md).
**Decision**: Keep Sources, Wiki and Ontology in Library, bounded adjacent tabs, a centered dimmed creation dialog with exact Markdown preview, and separate current work and receipt history. Make the existing tab height a minimum. History captures Escape even when focus stays on the reader. Preserve chooser semantics with readable full paths and compact secondary actions. Keep motion recipes: finite easing tails and intentional full-screen dimming require interpretation beyond raw changed-pixel share, scoped to these recordings rather than a global exception.
**Dissent**: The motion seat retained literal threshold flags for scrim area and settling tails. The guardian accepts only observed finite transitions and the reduced-motion crossfade; input latency, interrupted velocity and rendering frame rate remain unmeasured.
**Falsifier**: Reopen if selected tabs cannot be revealed or contain enlarged text, coarse tabs fall below 44px, history Escape closes its reader, creation differs from its preview, or the owner still cannot distinguish the installed selected section.
**Owner**: Atlas maintainers; design-guardian applies and verifies the bounded corrections.
