---
uid: 4ec4ac53-4773-460a-be08-256301523d4f
slug: elements/evidence-verdict-rule
kind: element
title: Evidence verdict rule
display_en: Evidence verdict rule
display_ko: 근거 판정 규칙
domain: domains/code-evidence
path: mcp/src/drift/evidence-verdict.mjs
created_by: "agent:claude-code"
---

States in one place whether a concept still stands on the code it cites, so the screen and the agent surface answer the question with the same word instead of two implementations that disagree.

## Includes
- The four possible verdicts and the precedence between them when a concept cites several paths.
- A single rule imported by both surfaces rather than copied into each.

## Excludes
- Gathering the dates the verdict is computed from.
- Deciding what to do about a stale verdict.

## Uncertainty
- Read `judgeEvidence` in `mcp/src/drift/evidence-verdict.mjs` end to end on 2026-11-19: a gone path wins over a moved file, which wins over an unwalked path, an undated one and a folder-only change, in that order. The app copy at `src/shared/lib/git/evidence-verdict.mjs` is a three-line re-export of this module, so there is one implementation, and `tests/contract/analysis/evidence-drift-parity.contract.test.ts` passed that day. The verdict was not run against this vault's own Git history.