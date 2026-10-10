---
uid: f0547056-a947-42ae-9441-753ec169dd25
slug: elements/vault-file-store
kind: element
title: Vault file store
display_en: Vault file store
display_ko: 볼트 파일 저장소
domain: domains/meaning-layer
path: mcp/src/vault/documents.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/construction-guidance, elements/frontmatter-parser, elements/meaning-gap-findings, elements/relation-reference-normalizer, elements/vault-kind-schema]
relation_notes: { elements/frontmatter-parser: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows mcp/src/vault/documents.mjs importing parser.mjs (`parseFrontmatter`).", elements/vault-kind-schema: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows mcp/src/vault/doc-writes.mjs importing schema.mjs (`generateNodeUid`, `nodeUidIssue`).", elements/meaning-gap-findings: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows mcp/src/vault/eligibility-gate.mjs importing meaning-findings.mjs (`meaningFindings`, `dependencyWitnessFinding`).", capabilities/construction-guidance: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows mcp/src/vault/eligibility-gate.mjs importing construction-rules.mjs (its finding message builders).", elements/relation-reference-normalizer: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows mcp/src/vault/doc-writes.mjs importing relation-refs.mjs (`normalizeRelationRefs`)." }
---

Walks the vault folder and performs the actual Markdown reads and writes, including the check that refuses a write whose author was looking at an older version of the file.

## Includes
- Directory walking and loading every document the rest of the system reads.
- Writing a node back to disk, and refusing the write when the file changed underneath the writer.
- Handing prose findings back with the write itself, including a newly declared dependency that no file witnesses and a starter example still present once the vault has a real map.
- Moving a referrer's entry into the list for a node's new kind when the node changes kind, and reporting the entries it could not move.

## Excludes
- Asking a person whether a write should happen; that question belongs to the consent checkpoint.
- Interpreting what a document means.

## Uncertainty
- `path:` names `mcp/src/vault/documents.mjs`, the read half every dependent imports. The writes (`writeDoc`, `patchFrontmatter`, `updateDoc`, `deleteDoc` in `mcp/src/vault/doc-writes.mjs`; `writeFileAtomically`, `applyAllOrNothing` in `mcp/src/vault/atomic-writes.mjs`), the gate (`runNodeEligibilityGate` in `mcp/src/vault/eligibility-gate.mjs`, which calls `dependencyWitnessFinding` and `starterExampleFinding`) and the kind-change rewriter (`redirectBacklinks` in `mcp/src/vault/backlink-rewrite.mjs`) are not drift-checked through this node. The split moved this code without changing it, and these files were not read end to end, so this role sentence may still understate what else they carry.
- Whether this role should become several elements, one per file in `mcp/src/vault/`, was not decided.
