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
- Explicit native local construction from an exactly selected read-only code folder: destination exclusion, bounded source ranges and hashes, loopback-only proxy-free transport, and the same selectable document proposals. Source/vault/model/endpoint changes retire stale drafts; Apply rechecks source witnesses.
- Construction has at most eight model requests, eight ranges/32 KiB of source and 64 KiB per serialized request, with a cancellable 180-second per-request timeout. Ordinary local audit retains its separate three-read-round policy and 60-second timeout.

## Excludes
- Running someone else's coding agent, which the in-app session capability does over a different protocol.
- Holding credentials in the web context; the native layer owns secrets, transport and auditing.
- Editing code; this agent reads and proposes meaning.

## Uncertainty
- Native source and transport boundaries have focused fixtures and an isolated production-function background probe. Local construction trials preserve failed timeouts and bounded source-backed drafts; these measurements do not establish broad semantic quality or meaning acceptance. The chooser gesture is substituted in the probe. Installed-app interaction and general repository coverage remain unmeasured.