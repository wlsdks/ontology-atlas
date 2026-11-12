---
id: bc554877-8a19-4c74-be5b-d7288a436dec
date: 2026-11-12
---
## 2026-11-12 — Tests protect a harm, not a shape

**Why**: owner, 2026-11-12 (in Korean): the tests have grown so heavy that they bend design, UI and UX work; trim boldly, deciding as the codebase's owner, and delete what is useless. Measured the same day: 316 contract tests (234 read source text) and 301 browser specs (193 measure geometry); 191 design and copy commits since 2026-09-01 kept editing the same tests (page-frame 7 times, surface-motion-ratchet 5); one merge was refused twice by a 4px font difference on the CI runner and a comment-byte ceiling.
**Prior**: overturns the adoption and geometry ratchets added through 2026-08 to 2026-10 as gates; keeps 2026-08-01 (CI never pins a sentence a person wrote), which these tests had drifted from.
**Decision**: a test stays only if it protects a harm a person or their data would suffer, or a wiring fact that breaks silently: journeys, security, vault format and cross-package tables, routes, CI wiring, accessibility floors, message keys. Deleted: 168 files (59 contract, 109 browser) that pin a pixel, a class string, a sentence or a count a deliberate design change must edit, with their registries and raise records. A design value rule belongs in lint; appearance is judged on the rendered screen.
**Dissent**: the independent review restored three accessibility specs (hover contrast, 200% text) and two token-mirror checks; nothing now ties a new dialog to the accessibility sweep. The classifying review was least sure of: the toolbar reflow check inside a geometry spec, the rendered proof of each motion primitive (8 of 9 specs), and the Library graph legibility audit, which held one reachability check. A regression these would have caught now reaches the owner's eye first.
**Falsifier**: a defect a person notices ships that a deleted test would have caught and no kept journey did; restore that one test as a behaviour check.
**Owner**: Stark
