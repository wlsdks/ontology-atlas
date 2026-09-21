---
uid: 22d66bf9-3d67-4e1e-8d4c-69fca0a2bdfd
slug: elements/acp-runtime-gate
kind: element
title: ACP runtime gate
display_en: ACP runtime gate
display_ko: ACP 런타임 게이트
domain: domains/agent-access
path: src/features/acp-session/model/runtime-gate.ts
created_by: "agent:claude-code"
---

Raises the permission gate by whichever method the particular agent runtime actually honours, because configuration isolation and session mode do not work the same way across agents.

## Includes
- A per-runtime choice between isolating the agent's configuration and setting a session mode.
- The record that the two known runtimes differ, one having no read-only session mode at all.

## Excludes
- Replacing the server-side write checkpoint, which holds regardless of what a runtime honours.

## Uncertainty
- Read from the module header, which records a 2026-08-16 measurement where one runtime reported a read-only mode while still permitting an in-vault file write with no request. Neither runtime was exercised here, and those measurements are now a year old.