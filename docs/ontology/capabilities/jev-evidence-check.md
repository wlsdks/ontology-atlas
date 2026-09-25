---
uid: cc6515eb-7a90-4b34-afa6-d5c2cac05005
slug: capabilities/jev-evidence-check
kind: capability
title: Jev evidence check
display_en: Jev evidence check
display_ko: Jev 근거 대조
domain: domains/human-workbench
elements: [elements/jev-transfer-bridge]
path: src/features/jev-judgment/ui/JevCheck.tsx
created_by: "agent:codex-mcp-client"
relation_notes: { elements/jev-transfer-bridge: "The visible Jev request uses the native bridge for local key storage, fixed-endpoint transfer, and the receipt." }
---

Lets a person compare one claim they paste with a code or document passage they paste through Jev, then inspect a typed advisory answer before deciding what meaning to accept. It is an experimental row of the Agents destination's models tab.

## Includes
- An experimental "external check" row on the installed app's Agents → Models tab, with a local key status and the exact request on screen before the send.
- One user-triggered supported, contradicted, or insufficient judgment and visible confidence.

## Excludes
- Automatic reading of vault files, accepting meaning, or writing to the vault from Jev's answer.
- Browser-hosted Jev calls; the web models tab shows only its desktop-only card.

## Uncertainty
- Key save, replace and removal, the preview-equals-sent request, and the audit count were exercised through the desktop bridge stub in a browser (`tests/e2e/agents-models-tab.spec.ts`), and the Rust transfer path through a fake sender in unit tests. A real-candidate calibration and a native live HTTP call have not been completed; TypeSafe's written confirmation for open-source, independently keyed distribution is pending.
