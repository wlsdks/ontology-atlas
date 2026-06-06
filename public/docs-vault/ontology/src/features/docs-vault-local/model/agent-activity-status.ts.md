---
slug: src/features/docs-vault-local/model/agent-activity-status.ts
kind: element
title: Agent Activity Status Parser
domain: vault-local-first
---

`src/features/docs-vault-local/model/agent-activity-status.ts` defines the local-first heartbeat contract used by the `/ontology` live activity lane.

It owns the reserved source path `.ontology-atlas/agent-activity.json`, validates the agent heartbeat JSON shape, normalizes current focus fields, and marks stale heartbeats after a short timeout. This keeps Atlas from guessing private Claude Code / Codex state while still letting a connected agent report what it is editing, planning, verifying, or blocked on.