---
uid: fcf07075-e97f-4246-908b-5ae699b9db04
slug: capabilities/vault-validation
kind: capability
title: Vault validation
display_en: Vault validation
display_ko: 볼트 검증
domain: domains/meaning-layer
elements: [elements/meaning-gap-findings]
path: mcp/src/validate.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/construction-guidance, capabilities/evidence-drift-detection, elements/frontmatter-parser, elements/meaning-gap-findings, elements/vault-kind-schema]
relation_notes: { capabilities/evidence-drift-detection: "You asked for what depends on what: the whole-vault check reports drift alongside its own issue codes.", elements/meaning-gap-findings: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows validate.mjs re-exporting meaning-findings.mjs.", elements/frontmatter-parser: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows validate.mjs importing parser.mjs.", elements/vault-kind-schema: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows validate.mjs importing schema.mjs.", capabilities/construction-guidance: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows validate.mjs importing construction-rules.mjs." }
---

Reports, file by file, whether the vault's Markdown still forms a well-formed graph, naming each problem by a stable code and the repair it needs.

## Includes
- Frontmatter, kind, identity, required-field and dangling-reference checks across every document at once.
- A stable code per issue, so the CLI and the MCP surface report the same finding by the same name.

## Excludes
- Whether a well-formed meaning is a true or useful description of the product.
- Repairing anything on its own; each finding names a repair the person or agent chooses to run.

## Uncertainty
- Read from the issue-code list this tool documents and from `mcp/src/validate.mjs` by name; the mirrored `cli/src/lib/validate.mjs` was seen referenced but not read, so their agreement is asserted by the repository's own contract test rather than verified here.