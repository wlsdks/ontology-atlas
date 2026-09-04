---
uid: 97a10b3b-6099-4120-8ed8-38c856e40896
slug: elements/semantic-evidence-selector
kind: element
title: Semantic Evidence Selector
display_ko: 의미 근거 선별기
domain: domains/project-portfolio
path: mcp/src/analyze/semantic-evidence.mjs
created_by: "agent:unknown"
---

## Definition

The bounded analyzer role that selects claim-relevant Markdown and reStructuredText sections, keeps current claim units separate from review-only policy units, and assigns trust only over the exact model-visible text.

## Includes

- Prefer document-title, purpose, architecture, and ability sections, with a bounded eligible-section fallback when no named semantic category exists.
- Give every selected safe section a deterministic share of the unchanged 1,200-character excerpt before redistributing unused short-section capacity by semantic priority and source order.
- Emit mixed future, negated, or deprecated lines as typed `reviewRequiredEvidence` with heading, exact line span, excerpt, and risk flags.
- Preserve the unique exact repository directory-entry case for root and workspace semantic source addresses before plan hashing.

## Excludes

- Review-required units as claim authority, hostile instruction splitting, packet-cap growth, ambiguous case-fold matches, non-files, repository escapes, automatic business-meaning approval, qualification, or write authority.

## Evidence

- `mcp/src/analyze/semantic-evidence.mjs`: claim-local policy splitting, deterministic bounded section allocation, and exact-case semantic discovery.
- `mcp/src/analyze/scan-guards.mjs`: exact entry selection and ambiguous/non-file refusal.
- `mcp/src/analyze.test.mjs`: selected-section breadth, lowercase root/workspace case, ambiguity, non-file, escape, deterministic budget, and RST peer-section controls.
- `mcp/src/analyze-adversarial.test.mjs`: mixed policy, selected deprecation, hostile, and over-bound fail-closed controls.
- Primary implementation: `mcp/src/analyze/semantic-evidence.mjs#collectSemanticEvidence`
- Supporting implementation: `mcp/src/analyze/semantic-evidence.mjs#semanticEvidenceTrust`
- Focused test: `mcp/src/analyze.test.mjs#README semantic evidence reserves purpose, architecture, and feature prose`
- Focused test: `mcp/src/analyze.test.mjs#decorative-only README evidence does not invent a repository purpose`

## Verification

The breadth control was RED when later selected markers were starved and GREEN after all eight selected safe sections contributed within the unchanged 1,200-character and eight-heading bounds. The exact-case control was RED when lowercase `readme.md` became `README.md`; it now stays exact and the stale accepted packet is non-writable. The fresh replay verified 79/79 claims, 163/163 citations, 11/11 persisted bodies, 8/8 source witnesses at `verified_current/current`, and successful finalization while retaining `needs_evidence`.
