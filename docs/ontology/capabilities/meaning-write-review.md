---
uid: 3d0fecbe-8dfb-4e13-9586-669c61b52bb6
slug: capabilities/meaning-write-review
kind: capability
title: Meaning write review
display_en: Meaning write review
display_ko: 의미 변경 검토
domain: domains/human-workbench
elements: [elements/change-summary-headline]
path: src/features/ontology-change-review/index.ts
created_by: "agent:claude-code"
dependencies: [capabilities/meaning-write-safety, elements/change-summary-headline]
relation_notes: { elements/change-summary-headline: "You asked me to turn imports I actually witnessed into dependencies: the review barrel re-exports ontologyChangeHeadline from lib/change-summary.ts as one of the two things outside the feature actually calls.", capabilities/meaning-write-safety: "You asked me to name where the witness is: AcpPermissionCard.tsx:693 renders this review and :241-242, :873 resolve the allow_once or reject_once option, which is the answer the server checkpoint waits for : src-tauri/src/acp.rs:164 names mcp/src/write-consent.mjs as that checkpoint." }
---

Shows a proposed change to recorded meaning as something a person can read and decide on, so the change is accepted, corrected, or rejected before it lands in the files.

## Includes
- The readable difference between what the record says now and what is being proposed.
- The decision itself, taken by a person, in the same conversation where the change was proposed.

## Excludes
- Code review, merge, and deployment, which stay separate decisions.
- The file-level write guard, which the meaning layer owns.

## Uncertainty
- Read from `src/features/ontology-change-review/` by layout and from the repository's statement that agent writes pause for `allow_once` or `reject_once`. The review screen was not rendered, and how it presents a multi-node proposal is unknown here.