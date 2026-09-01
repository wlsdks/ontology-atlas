---
uid: f0289ebb-4f66-4e62-8ed6-456524e4922a
slug: capabilities/design-build-handoff
kind: capability
title: Design Build Handoff
display_ko: 조립 순서 핸드오프
display_en: Design Build Handoff
domain: domains/design-system
elements: [elements/design-proof-router]
path: .claude/skills/design-build/SKILL.md
created_by: "agent:unknown"
relation_notes: { elements/design-proof-router: Design Build Handoff uses the router to turn observable Atlas UI change facts into the smallest required rendered-proof bundle. }
---

# Design Build Handoff

The entry contract that routes an Atlas UI change from observable change facts to the smallest proof bundle before implementation begins. It keeps design work tied to what changed, what a person must be able to judge again, and which rendered evidence can prove that outcome.

## Human Outcome

- A person can inspect what an agent actually built instead of reconstructing it from code or trusting an agent's description.
- Ordinary local changes stay lightweight, while hard-to-reverse structure receives the specialist review it needs.
- Motion is judged as motion, not inferred from static frames.

## Operating Contract

1. Run `pnpm design:route -- --change-class <class>` with the observable change class or classes.
2. For every rendered class, capture the exact baseline, implement one coherent visual slice, render the real browser, WebView, or app, then inspect a fresh Computer Use screenshot and accessibility tree before continuing.
3. Add DOM, computed-style, and rendered-rect measurements when geometry or occlusion needs localization. The accessibility tree is not a substitute for DOM geometry, and neither replaces actual-window pixels.
4. Correct the observed defect before the next slice and retain the final capture. Building a whole UI from imagination and inspecting only at the end does not satisfy this contract.
5. For motion, use a real macOS screen recording through the motion-verification protocol, including uniform 30fps frames, a visual phase strip, frame-to-frame pixel-diff statistics, and reduced-motion proof.
6. Convene a design council only for hard-to-reverse structural commitments or design-contract changes, and seat only the specialists selected by the router.

## Evidence

- `scripts/lib/design-proof-router.mjs`: observable change classes and deterministic proof routing
- `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md`: owner-facing operating contract
- `.agents/skills/design-build/SKILL.md`: capability-based build sequence
- `tests/contract/design-proof-router.contract.test.ts`: routing and fail-closed contract

## Extraction Boundary

**extractable in protocol, Atlas-specific in routing data.** The capture-measure-correct loop applies across repositories, but the current change classes, specialist seats, topology instruments, and council thresholds encode Atlas surfaces and must be re-censused before reuse elsewhere.

## Copy Contract

`.claude/skills/design-build/SKILL.md` ↔ `.agents/skills/design-build/SKILL.md`
Both copies must remain byte-identical; repository checks enforce the mirror.
