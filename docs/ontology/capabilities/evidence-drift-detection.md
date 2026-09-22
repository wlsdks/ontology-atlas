---
uid: 460cccf1-2edf-4af2-a040-18d4cd385bed
slug: capabilities/evidence-drift-detection
kind: capability
title: Evidence drift detection
display_en: Evidence drift detection
display_ko: 근거 드리프트 감지
domain: domains/code-evidence
elements: [elements/evidence-verdict-rule, elements/git-evidence-dating]
path: mcp/src/detect-drift.mjs
created_by: "agent:claude-code"
dependencies: [elements/git-evidence-dating]
relation_notes: { elements/evidence-verdict-rule: You asked for element nodes named by role under the capability that uses them; stating the verdict once for both surfaces is this role., capabilities/project-source-binding: "You asked for dependencies I actually witnessed: detect-drift.mjs imports nothing and takes its root and file check as parameters, so this is a real relationship but not a dependency. Downgrading it also breaks the cycle the tools flagged.", elements/git-evidence-dating: "You asked me to name where the witness is: mcp/src/tools/validate-vault.mjs:10 imports detect-drift.mjs and :27 imports evidenceConceptsFromDocs and resolveEvidenceStates from evidence-drift.mjs, so one report carries both halves of drift." }
relates: [capabilities/project-source-binding]
---

Notices when the file a node cites has moved, vanished, or changed after the node was last written, so a claim nobody can still open stops looking proven.

## Includes
- Path drift, where a cited file no longer exists in the bound folder.
- Evidence drift, where a cited file changed after the document that cites it, dating both from Git.

## Excludes
- Repairing or rewriting the affected meaning.
- Judging whether the code change actually altered what the node says; a changed file is a reason to read, not a verdict.

## Uncertainty
- Read from `mcp/src/detect-drift.mjs` and `mcp/src/evidence-drift.mjs` by name plus the validator's documented drift output. No drift was observed in this scan because the vault was empty when it began.