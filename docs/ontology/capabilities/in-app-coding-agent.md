---
uid: 229d9d5e-a6ee-4672-9a5f-df68e30f0598
slug: capabilities/in-app-coding-agent
kind: capability
title: In-app coding agent session
display_en: In-app coding agent session
display_ko: 앱 내 코딩 에이전트 세션
domain: domains/agent-access
elements: [elements/acp-permission-scope, elements/acp-runtime-gate, elements/acp-tool-policy, elements/acp-vault-mcp-wiring]
path: src/features/acp-session/model/use-acp-session.ts
created_by: "agent:claude-code"
relation_notes: { elements/acp-vault-mcp-wiring: You asked for element nodes named by role under the capability that uses them; attaching the vault without a config file is this role., elements/acp-permission-scope: You asked for element nodes named by role under the capability that uses them; reading what an always-allow really covers is this role., elements/acp-tool-policy: You asked for element nodes named by role under the capability that uses them; classifying a tool name as read or write is this role., elements/acp-runtime-gate: You asked for element nodes named by role under the capability that uses them; raising the gate by whichever method a runtime honours is this role., capabilities/mcp-tool-server: "You asked me to turn imports I actually witnessed into dependencies: the session wires the bundled Atlas server into a new conversation, so the vault is already attached when it opens." }
dependencies: [capabilities/mcp-tool-server]
---

Runs an external coding agent inside the app over a shared agent protocol, with the person's vault already attached and every write pausing at a permission card they answer.

## Includes
- Starting, driving and stopping a session with a locally installed agent runtime.
- The vault handed in automatically as a server, the per-runtime permission gate, and the classification that decides which requests are writes.
- Capturing what the session did so it can be reviewed afterwards.

## Excludes
- Being the agent; the reasoning belongs to the runtime the person installed.
- Supplying model credentials, which that runtime owns.
- Deciding whether a proposed meaning is correct, which stays with the person at the card.

## Uncertainty
- Read from the feature's thirty modules by name and from four of them in detail. Its main hook is roughly 1,500 lines and was not read. Its measurements of runtime behaviour date from August 2026 and were not reproduced; no session was started in this scan. This capability was raised as an open placement question at the start of this map and is recorded here because the code makes it an agent interface, not a workbench screen.