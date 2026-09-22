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
relation_notes: { elements/meaning-gap-findings: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows validate.mjs re-exporting meaning-findings.mjs.", elements/frontmatter-parser: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows validate.mjs importing parser.mjs.", elements/vault-kind-schema: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows validate.mjs importing schema.mjs.", capabilities/construction-guidance: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows validate.mjs importing construction-rules.mjs.", capabilities/evidence-drift-detection: "You asked me to name where the witness is: mcp/src/tools/validate-vault.mjs:23 imports validate.mjs and :10 imports detect-drift.mjs into the same run, so the whole-vault check reports drift beside its own issue codes." }
---

Reports, file by file, whether the vault's Markdown still forms a well-formed graph, naming each problem by a stable code and the repair it needs. Two of its checks open the repository the vault describes, so a claim the vault makes about code can be answered instead of assumed.

## Includes
- Frontmatter, kind, identity, required-field and dangling-reference checks across every document at once.
- Two checks that need a repository root and the whole vault: `dependency-unwitnessed`, a declared dependency no file it can open ever names, and `starter-example-node`, a starter example still present after the vault has grown a real map.
- A stable code per issue, so the CLI and the MCP surface report the same finding by the same name.

## Excludes
- Whether a well-formed meaning is a true or useful description of the product.
- Repairing anything on its own; each finding names a repair the person or agent chooses to run.
- Reading an unwitnessed dependency as a false one; that finding asks for the witness to be stated, never for the edge to be deleted.

## Uncertainty
- Read today in the detector (`mcp/src/meaning-findings.mjs`): `dependency-unwitnessed` is pushed at `:734` by `dependencyWitnessFinding` (`:665`), which opens the citing node's own `path:` file and every file the edge's `why` names, then fires only when none of them mentions the target (`:727-731`). `starter-example-node` is pushed at `:811` and deliberately never consults the body (`:774-777`), so a starter somebody rewrote but did not rename still counts. Neither is part of the `meaningFindings` aggregate at `:864-889`, which carries the five body-and-path findings only, so the write door reaches these two by separate calls, and that wiring was not read here.
- Read earlier: the two codes in the list (`mcp/src/validate.mjs:114` and `:123`), the note at `:280-285` giving why they are deliberately absent from the single-document path, and their wiring into the whole-vault run (`mcp/src/tools/validate-vault.mjs:377` and `:403`). The mirrored `cli/src/lib/validate.mjs` was read only at its two re-exports (`:25-26`), so the two surfaces' agreement still rests on the repository's contract test rather than on anything checked here.
