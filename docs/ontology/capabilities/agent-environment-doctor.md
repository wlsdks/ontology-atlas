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
dependencies: [capabilities/in-app-coding-agent]
relation_notes: { capabilities/in-app-coding-agent: "You asked me to turn imports I actually witnessed into dependencies: the doctor exists to check the agent runtime a session needs, and its bridge names the same native layer that starts one." }
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