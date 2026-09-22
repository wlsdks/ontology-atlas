---
uid: 865df467-1b7b-4455-9e7d-83ffb7936a93
slug: capabilities/agent-environment-doctor
kind: capability
title: Agent environment doctor
display_en: Agent environment doctor
display_ko: 에이전트 환경 진단
domain: domains/agent-access
elements: []
path: src/features/acp-doctor/model/acp-doctor.ts
created_by: "agent:claude-code"
dependencies: [elements/acp-runtime-gate]
relation_notes: { elements/acp-runtime-gate: "The doctor's declared copy of the gated session modes must match the runtime gate: src-tauri/src/acp_doctor.rs:114 mirrors GATED_SESSION_MODE from src/features/acp-session/model/runtime-gate.ts, and a contract test blocks the two from diverging. The dependency is on the gate, not on the session hook that also imports it." }
---

Checks whether a local agent runtime is actually installed and reachable, names each check that failed, and offers to repair it and measure again.

## Includes
- A diagnosis pass that fixes nothing, and a separate repair pass that re-measures afterwards.
- Machine-measured facts returned as identifiers, with the readable sentence built by the screen in the person's language.

## Excludes
- Installing the agent runtime itself beyond the repairs it names.
- Registering Atlas with agent hosts, which connector setup does.

## Uncertainty
- Read from the bridge module header, which names the two native commands as the source of truth. Those native commands were not opened, the check list was not enumerated, and no diagnosis was run.