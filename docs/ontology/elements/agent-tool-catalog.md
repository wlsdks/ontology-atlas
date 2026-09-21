---
uid: 7cbf6b58-75b0-45d2-80f6-7f8d495ec09d
slug: elements/agent-tool-catalog
kind: element
title: Vault agent tool catalog
display_en: Vault agent tool catalog
display_ko: 볼트 에이전트 도구 목록
domain: domains/agent-access
path: src/features/vault-agent/model/tool-catalog.ts
created_by: "agent:claude-code"
---

The tool list handed to Atlas's own agent, with names, arguments and effects taken to be exactly the server's, so the screen and the agent surface cannot describe different abilities.

## Includes
- The catalog itself, and the deliberate omission of tools the in-app agent is not given.
- A contract test that extracts names and arguments from the server entry point and compares, so an invented name fails immediately.

## Excludes
- Executing a tool.
- Being an independent authority; the server's surface is the source and this is held to it.

## Uncertainty
- Read from the module header and its statement about the comparison test. Which tools are deliberately withheld was named as a section but not read, and the test was not run here.