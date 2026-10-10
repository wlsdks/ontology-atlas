---
uid: 292f0e3a-23a8-4bad-9f87-7a38e1f1a01c
slug: capabilities/mcp-tool-server
kind: capability
title: MCP tool server
display_en: MCP tool server
display_ko: MCP 도구 서버
domain: domains/agent-access
elements: [elements/mcp-initialize-instructions, elements/mcp-rpc-envelope, elements/mcp-server-runtime]
path: mcp/src/server/registry.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/construction-guidance, capabilities/import-dependency-inference, capabilities/meaning-write-safety, capabilities/task-agent-brief, capabilities/vault-validation, elements/graph-engine, elements/qualification-packet-evaluator, elements/vault-file-store, elements/vault-kind-schema]
relation_notes: { capabilities/meaning-write-safety: "You asked for what depends on what: every write an agent makes through the server passes the consent and overwrite guard.", elements/mcp-rpc-envelope: You asked for element nodes named by role under the capability that uses them; shaping a result or a typed error is this role., elements/mcp-server-runtime: You asked for element nodes named by role under the capability that uses them; holding the bound roots and the session cache is this role., elements/mcp-initialize-instructions: You asked for element nodes named by role under the capability that uses them; the guidance sent on connect is this role., capabilities/task-agent-brief: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/tool-definitions/graph.mjs importing agent-brief-compact.mjs.", capabilities/construction-guidance: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/tool-definitions/write-concepts.mjs importing construction-rules.mjs, so the guidance reaches agents through the server.", capabilities/vault-validation: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/tool-definitions/validate-vault.mjs importing validate.mjs.", capabilities/import-dependency-inference: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/tool-definitions/infer-imports.mjs importing infer-imports.mjs.", elements/qualification-packet-evaluator: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/tool-definitions/analyze-repo-structure.mjs importing construction-qualification.mjs, which is how the gate reaches the tool surface.", elements/graph-engine: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/tool-definitions/graph.mjs importing ontology-engine.mjs.", elements/vault-kind-schema: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/tool-definitions/read.mjs importing schema.mjs.", elements/vault-file-store: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/tool-definitions/graph.mjs importing vault.mjs." }
---

Serves canonical read and write tools over JSON-RPC and reports the discovery inventory and roots of each session. The public contracts live in `mcp/README.md`.

## Includes
- The tool registry and schemas, with default full discovery and opt-in `OATLAS_TOOL_PROFILE=construction` discovery for first builds.
- The construction profile advertises 20 existing tools, including source indexing, bounded analysis, small batch writes, validation, binding and finalization. It preserves the advertised schemas and composes with read-only mode to expose 15 reads.
- Discovery filtering is separate from permission: omitted known tools remain callable under the existing read-only and consent guards. Invalid profile values refuse startup.
- Runtime proof of the bound vault/repository and the advertised names, count and hash.
- Write-result warnings naming containment entries that reclassification or merging could not move.

## Excludes
- The graph schema and file format, which the meaning layer owns.
- Authority to bypass the person's consent, or to treat successful validation as accepted meaning.
- Automatic profile selection in the app or expansion of the internal local agent's source tools.

## Uncertainty
- Re-read the profile selection and annotation/list mapping in `mcp/src/server/registry.mjs` on 2026-10-03. Stdio integration checked default/full recovery, selected inventory, invalid startup and read-only direct-call rejection.
- One unfamiliar-source ACP pair reduced advertised input bytes but lost a source-hidden answer and retained semantic/citation defects; general construction speed and quality improvement are unproven.
- Installed-app profile wiring and rendered permission behavior were not measured in this change.
