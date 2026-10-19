---
id: 7cec2380-dab4-49a7-b0c2-3be7a919f578
date: 2026-10-20
---
## 2026-10-20 — Analysis draws the whole project as a board

**Why**: owner, 2026-10-20 (in Korean): Analysis placement felt cramped and pinned to the top while space went unused; the tab must show "my project" at a glance, with strong motion. The owner chose the project board from three drafts.
**Prior**: extends 488f9b25 (DOM/SVG, declaration-led evidence, explicit send; its falsifier stands) and replaces its pair rail and four-at-a-time declaration diagram. Keeps the DOM precedent dc9455e4.
**Decision**: one row per responsibility, ordered so the most-declared pairs sit adjacent and point forward; each row's capabilities as cards, connected first, twelve then a named remainder; every cross-responsibility `depends_on` declaration as one measured line. The selected declaration draws in indigo beneath the cards, its pair's lines lift, and the rest stay a quiet texture until a card or a row is hovered. The stepper reaches all N declarations. The evidence question keeps the same board with gap counts and source marks; the element list moves into the inspector.
**Dissent**: at 32 declarations the resting texture is busy and long lines pass under intermediate rows; lane-level bundles would read faster but hide which capability declares the dependency. Resting context lines sit below 3:1; the selected, paired and hovered lines meet it, and the stepper names every declaration.
**Falsifier**: at 1040x720 the first declaration's two cards or its document action are below the fold; or, from a still of the sample board with one row hovered, a reader cannot name the responsibilities that row depends on.
**Owner**: Stark
