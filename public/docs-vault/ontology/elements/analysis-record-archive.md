---
uid: 93354a50-2418-47d0-ac5f-98e10b4fc2db
slug: elements/analysis-record-archive
kind: element
title: Analysis Record Archive
display_en: Analysis Record Archive
display_ko: 분석 기록 보관소
domain: domains/agent-integration
path: src/entities/analysis-record/model/analysis-record.mts
created_by: "agent:unknown"
---

## Definition
The cross-runtime diagnostic record format, bounded readers, and exclusive native persistence that preserve an ACP analysis as one immutable Markdown version. It retains the original final answer, actual full-body Atlas evidence, Architecture measurements and profile snapshots, request identity, outcome, and qualification failures. Map geometry and canonical ontology meaning remain separate.

## Includes
- Shared schema and codec; native create-only publication and idempotent retry.
- Bounded app, MCP and CLI history/read access with evidence integrity checks.
- Source/profile/document currentness checks and separate reasoned review records.

## Excludes
- Ontology kinds, canonical meaning approval, Git commits, authenticated authorship, and automatic resolution of missing findings.

## Evidence
- Primary implementation: `src/entities/analysis-record/model/analysis-record.mts#validateAnalysisRecord`
- Supporting implementation: `src-tauri/src/analysis_archive.rs#append_analysis_record`
- Focused test: `src/entities/analysis-record/model/analysis-record.test.ts`
- Focused test: `mcp/src/analysis-records.test.mjs`
- `docs/ANALYSIS-RECORDS.md`

## Confidence
Implementation and focused cross-runtime tests are present. A record's integrity is not proof that the AI's conclusion is correct; installed-app journey verification is tracked separately.
