---
uid: 0f3252ed-c0e7-4575-8539-1d27e62a07a2
slug: elements/analysis-review-workbench
kind: element
title: Analysis Review Workbench
display_en: Analysis Review Workbench
display_ko: 분석 검토 워크벤치
domain: domains/agent-integration
path: src/widgets/analysis-workbench
created_by: "agent:unknown"
---

## Definition
The shared context dock in which a reviewer reads concept criteria and relationship rationale, follows AI questions to their evidence, selects an earlier Markdown analysis, and continues the same ACP conversation. It composes Map, Analysis and Architecture without making navigation restart the agent.

## Includes
- Meaning, findings/history and conversation in one context slot.
- Explicit analysis, reanalysis and parent-version follow-up actions.
- Visible unknowns, evidence-at-analysis-time, current document links, and separate keep/dismiss judgments.

## Excludes
- Treating diagnostic questions as approved graph facts or hiding missing rationale.
- Inferring a human's understanding from a successful UI action.

## Evidence
- Primary implementation: `src/widgets/analysis-workbench/ui/AnalysisWorkbench.tsx#AnalysisWorkbench`
- Supporting implementation: `src/features/acp-session/model/analysis-capture.ts#createAnalysisTurnObserver`
- Focused test: `src/widgets/analysis-workbench/ui/AnalysisWorkbench.test.tsx`
- `docs/ANALYSIS-RECORDS.md`

## Confidence
Focused tests establish retained conversation state, history selection and review-record behavior. Rendered accessibility and comprehension are separate qualification outcomes.
