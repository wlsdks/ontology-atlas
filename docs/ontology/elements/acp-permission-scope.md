---
uid: 8ff8a295-6dfb-4dd4-a537-4d0c20690681
slug: elements/acp-permission-scope
kind: element
title: ACP permission scope
display_en: ACP permission scope
display_ko: ACP 권한 범위
domain: domains/agent-access
path: src/features/acp-session/model/permission-scope.ts
created_by: "agent:claude-code"
---

Reads what an always-allow choice actually covers from what the agent adapter itself declared, rather than from what the button used to promise.

## Includes
- The declared scope taken from the adapter's own permission metadata, and the wording built from it.

## Excludes
- Widening or narrowing what the adapter allows.
- Remembering a choice the adapter did not say was durable.

## Uncertainty
- Read from the module header, which records that the card once claimed a whole-folder scope while the adapter was in fact granting a single tool. Whether every adapter reports scope the same way was not tested.