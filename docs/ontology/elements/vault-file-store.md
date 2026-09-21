---
uid: f0547056-a947-42ae-9441-753ec169dd25
slug: elements/vault-file-store
kind: element
title: Vault file store
display_en: Vault file store
display_ko: 볼트 파일 저장소
domain: domains/meaning-layer
path: mcp/src/vault.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/construction-guidance, elements/frontmatter-parser, elements/meaning-gap-findings, elements/vault-kind-schema]
relation_notes: { elements/frontmatter-parser: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows vault.mjs importing parser.mjs.", elements/vault-kind-schema: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows vault.mjs importing schema.mjs.", elements/meaning-gap-findings: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows vault.mjs importing meaning-findings.mjs.", capabilities/construction-guidance: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows vault.mjs importing construction-rules.mjs." }
---

Walks the vault folder and performs the actual Markdown reads and writes, including the check that refuses a write whose author was looking at an older version of the file.

## Includes
- Directory walking and loading every document the rest of the system reads.
- Writing a node back to disk, and refusing the write when the file changed underneath the writer.
- Normalizing the relation references a document declares, so the compiler sees one shape.

## Excludes
- Asking a person whether a write should happen; that question belongs to the consent checkpoint.
- Interpreting what a document means.

## Uncertainty
- The largest module in this domain at roughly 2,600 lines; its header, import receipts and the repository's prose about the modification-time guard were read, but the body was not read end to end, so this role sentence may understate what else it carries.