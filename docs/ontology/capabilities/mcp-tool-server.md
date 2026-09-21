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
relation_notes: { capabilities/meaning-write-safety: "You asked for what depends on what: every write an agent makes through the server passes the consent and overwrite guard.", elements/mcp-rpc-envelope: You asked for element nodes named by role under the capability that uses them; shaping a result or a typed error is this role., elements/mcp-server-runtime: You asked for element nodes named by role under the capability that uses them; holding the bound roots and the session cache is this role., elements/mcp-initialize-instructions: You asked for element nodes named by role under the capability that uses them; the guidance sent on connect is this role., capabilities/task-agent-brief: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/registry.mjs importing agent-brief-compact.mjs.", capabilities/construction-guidance: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/registry.mjs importing construction-rules.mjs, so the guidance reaches agents through the server.", capabilities/vault-validation: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/registry.mjs importing validate.mjs.", capabilities/import-dependency-inference: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/registry.mjs importing infer-imports.mjs.", elements/qualification-packet-evaluator: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/registry.mjs importing construction-qualification.mjs, which is how the gate reaches the tool surface.", elements/graph-engine: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/registry.mjs importing ontology-engine.mjs.", elements/vault-kind-schema: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/registry.mjs importing schema.mjs.", elements/vault-file-store: "You asked me to turn imports I actually witnessed into dependencies: the scan shows server/registry.mjs importing vault.mjs." }
---

Serves the read and write tools an AI agent calls over JSON-RPC, advertising one inventory derived from a single registry so what an agent is told it can do matches what it can actually do. The public inventory of tools and their contracts lives in `mcp/README.md`.

## Includes
- The tool registry, the schemas it advertises, and the read-only mode that hides every write tool.
- The runtime proof of which vault and repository roots the process is actually bound to.

## Excludes
- The graph schema and file format, which the meaning layer owns.
- Any authority to write without the person's consent.

## Uncertainty
- Read from `mcp/src/server/` and `mcp/src/tools/` by layout; no tool count is recorded here because the repository states the live `tools/list` owns that number. This session reached the server as a client, so the registry file itself was not opened.