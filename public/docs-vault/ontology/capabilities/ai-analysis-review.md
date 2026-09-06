---
uid: d20b10dd-60c6-4baf-b6f7-313373091278
slug: capabilities/ai-analysis-review
kind: capability
title: AI Analysis Review and History
display_en: AI Analysis Review and History
display_ko: AI 분석 검토와 이력
domain: domains/agent-integration
elements: [elements/analysis-record-archive, elements/analysis-review-workbench]
path: src/widgets/analysis-workbench/ui/AnalysisWorkbench.tsx
created_by: "agent:unknown"
relates: [capabilities/acp-runtime]
relation_notes: { capabilities/acp-runtime: New in-app analyses execute through the guarded ACP runtime; stored results remain readable without starting another agent., elements/analysis-record-archive: "Returning to an original answer or continuing from a selected earlier version is only possible because this element keeps each analysis as one immutable Markdown record holding the full-body evidence, Architecture measurements, and outcome as they stood at analysis time.", elements/analysis-review-workbench: "This is the surface where a person actually reads the concept criteria and relationship rationale, follows an AI question down to its evidence, and picks an earlier version without navigation restarting the agent." }
---

## Definition
The ability for a person or successor agent to request a business-meaning or Architecture analysis, inspect what evidence supports each AI question, retain a reasoned judgment, and return to the original result or continue from a selected prior version. The user explicitly requested this review and Markdown-versioning loop so people can understand, question and direct AI-assisted development.

## Includes
- Explicit ACP analysis from Map, Analysis and Architecture.
- Concept criteria, directional relationship meaning, recorded and missing rationale.
- Original answers, full-body evidence, measured Architecture results, profile snapshots and outcome-specific history.
- Optional current, grounded question markers; separate keep/dismiss records and version-linked follow-ups.

## Excludes
- Automatic canonical ontology edits or approval, uncalibrated maintainability percentages, exhaustive business completeness claims, and treating missing later findings as resolved.
- Agent-proxy evidence being counted as real human comprehension.

## Evidence
- `src/widgets/analysis-workbench/ui/AnalysisWorkbench.tsx`
- `src/features/acp-session/model/analysis-capture.ts`
- `src/views/architecture/model/analysis-architecture-record.ts`
- `mcp/src/analysis-records.mjs`
- `docs/ANALYSIS-RECORDS.md`

## Confidence
The behavior is implemented and has focused lifecycle, integrity, version-recovery and native persistence tests. Whole-business completeness and human comprehension require separate actual-use evidence.
