---
uid: 9ac6329c-6deb-4919-b464-5c197dd1a9fa
slug: capabilities/vault-conversation-agent
kind: capability
title: Vault conversation agent
display_en: Vault conversation agent
display_ko: 볼트 대화 에이전트
domain: domains/agent-access
elements: [elements/agent-proposal-applier, elements/agent-system-prompt, elements/agent-tool-catalog, elements/llm-provider-adapter]
path: src/features/vault-agent/model/agent-loop.ts
created_by: "agent:claude-code"
relation_notes: { elements/agent-system-prompt: You asked for element nodes named by role under the capability that uses them; the instruction Atlas gives its own agent is this role., elements/agent-tool-catalog: "You asked me to turn imports I actually witnessed into dependencies: the scan shows agent-loop.ts importing tool-catalog.ts.", elements/agent-proposal-applier: You asked for element nodes named by role under the capability that uses them; being the only path to disk is this role., elements/llm-provider-adapter: "You asked me to turn imports I actually witnessed into dependencies: the scan shows agent-loop.ts importing provider-adapter.ts." }
dependencies: [elements/agent-tool-catalog, elements/llm-provider-adapter]
---

Atlas's own conversation over the open vault, calling a model with the person's key, reading the folder through a fixed tool list, and proposing changes that only land after consent.

## Includes
- The turn loop, the tool catalog it is given, and the citations it is required to produce.
- A separate compile conversation for turning sources into wiki pages.
- Proposals gathered so a single applier is the only path to disk.

## Excludes
- Running someone else's coding agent, which the in-app session capability does over a different protocol.
- Holding credentials in the web context; the native layer owns secrets, transport and auditing.
- Editing code; this agent reads and proposes meaning.

## Uncertainty
- Read from its loop, prompt, catalog, applier and adapter headers, of thirty-two modules in the feature. No turn was run and no provider was contacted, so nothing here is a statement about answer quality.