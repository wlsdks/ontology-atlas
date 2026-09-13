---
uid: 31024ba6-dd47-440d-b2c2-a5de69846030
slug: elements/bounded-source-evidence-reader
kind: element
title: Bounded Source Evidence Reader
display_ko: 범위 제한 소스 근거 읽기
display_en: Bounded Source Evidence Reader
domain: domains/agent-integration
path: mcp/src/source-evidence.mjs
created_by: "agent:codex-mcp-client"
---

## Definition

The bounded source evidence reader returns explicit implementation line ranges and same-file byte hashes for repository analysis, so an agent can inspect a condition or effect that structural evidence does not show.

## Includes

- Literal authorized-root source selectors, narrow text/manifest scope, complete source lines, byte limits, continuation and explicit refused or omitted outcomes.
- Descriptor and named-path checks that reject unsafe paths, nonregular files, detected replacement, invalid text and mismatched expected hashes before returning a body or citation.
- Server-derived observed range citations and a selected-evidence manifest used with the ordinary repository fingerprint for opt-in proposal currentness.

## Excludes

- Inferring domains, capabilities, runtime impact or complete repository coverage from source text.
- Accepting meaning, executing source, writing a vault, or guaranteeing that ordinary code contains no secrets.
- The vault-only wiki source reader and its document citation formats.

## Evidence

- Primary implementation: `mcp/src/source-evidence.mjs#readSourceEvidence`
- Supporting implementation: `mcp/src/tools/repo-analysis.mjs#analyzeRepoStructureTool`
- Focused tests: `mcp/src/source-evidence.test.mjs` and `mcp/src/integration.test.mjs`
