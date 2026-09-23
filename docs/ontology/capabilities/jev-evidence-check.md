---
uid: cc6515eb-7a90-4b34-afa6-d5c2cac05005
slug: capabilities/jev-evidence-check
kind: capability
title: Jev evidence check
display_en: Jev evidence check
display_ko: Jev 근거 대조
domain: domains/human-workbench
elements: [elements/jev-transfer-bridge]
path: src/features/jev-judgment/ui/JevPanel.tsx
created_by: "agent:codex-mcp-client"
relation_notes: { elements/jev-transfer-bridge: "The visible Jev request uses the native bridge for local key storage, fixed-endpoint transfer, and the receipt." }
---

Lets a person compare one selected ontology claim with a cited code or document passage through Jev, then inspect a typed advisory answer before deciding what meaning to accept.

## Includes
- A dedicated Jev tab in the installed Agents screen with a local key status and exact transfer preview.
- One user-triggered supported, contradicted, or insufficient judgment and visible confidence.

## Excludes
- Automatic reading of vault files, accepting meaning, or writing to the vault from Jev's answer.
- Browser-hosted Jev calls; the web Agents screen is an example only.

## Uncertainty
- The native tab was rendered and key persistence and deletion were verified with a temporary key. A real-candidate calibration and native live HTTP call have not been completed; synthetic source-probe answers alone do not prove judgment quality.