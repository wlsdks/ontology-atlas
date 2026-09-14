---
uid: c2c394d8-c3ad-46da-b200-9850567cd503
slug: elements/meaning-transition-archive
kind: element
title: Meaning Transition Archive
display_en: Meaning Transition Archive
display_ko: 의미 전환 기록 보관소
domain: domains/agent-integration
path: src-tauri/src/meaning_transition_archive.rs
created_by: "agent:confirmed-transition-archive-sync"
---

## Definition
An internal native archive and typed app store that retain validated meaning-transition candidates and their exact proposal artifacts as immutable history. Successful storage establishes recoverable byte integrity, not authentication or acceptance of the supplied interpretation.

## Includes
- Content-addressed artifacts published and reread before the generated UUID-addressed record is published last.
- Captured Unix vault identity, pinned directory operations, exclusive publication and idempotent same-byte retries.
- Bounded history with malformed records, mismatched file identity and missing or changed artifacts reported explicitly.
- Cancellation and context guards before publication and after asynchronous validation or readback.

## Excludes
- Canonical ontology writes, source or vault Git mutations, automatic merge or deployment.
- Authenticated human decisions or independent verification of supplied writer and code-check receipts.
- Browser and Windows archive fallback; Windows refuses this capability until stable identity protection is implemented.
- Task/history UI, live review-controller receipt binding and task-owned source-diff attribution, which remain separate integration work.

## Evidence
- Primary implementation: `src-tauri/src/meaning_transition_archive.rs#append_meaning_transition_bundle`.
- Supporting implementation: `src/entities/meaning-transition/lib/meaning-transition-store.ts#appendMeaningTransition`.
- Supporting implementation: `src/shared/lib/meaning-transition.ts`.
- Focused test: `src/entities/meaning-transition/lib/meaning-transition-store.test.ts`.
- Focused native tests: `src-tauri/src/meaning_transition_archive.rs`.
- Contract and limits: `docs/MEANING-TRANSITION-EVIDENCE.md`.

## Uncertainty
Native adversarial proof covers macOS only; Windows compilation, installed dispatch and fresh-successor reuse are unmeasured. External writers can later delete or alter archive files; readers detect integrity failures rather than claiming storage is tamper-proof.
