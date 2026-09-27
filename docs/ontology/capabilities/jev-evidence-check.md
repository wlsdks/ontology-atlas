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

Lets a person request an advisory comparison of one claim and its evidence through Jev, inspect the typed result, and decide what meaning to accept. The installed app accepts pasted inputs in Agents and can prepare a selected current Wiki claim with its anchored original passage in the Library question desk.

## Includes
- The experimental Agents Models entry with local key status and an exact request preview.
- Library preparation from one explicit claim/citation choice: reread the selected source, require a usable current passage and matching recorded source version, and invalidate the prepared check if the page or source changes.
- A blocking review of the exact JSON, fixed TypeSafe destination, and authentication-key transfer before explicit Send. Missing keys or unavailable native support leave local search and source reading usable.
- One supported, contradicted, or insufficient judgment with confidence, treated as advice about that pair.

## Excludes
- A background vault sweep, automatic transfer, search ranking, semantic acceptance, or a Wiki/ontology write from Jev's answer.
- Browser-hosted Jev requests or browser storage of the key.

## Evidence
- `src/features/jev-judgment/ui/JevCheck.tsx` owns the pasted-input entry; `src/views/library/ui/parts/LibraryQuestionDesk.tsx` prepares current cited pairs and explicit consent.
- `src/shared/lib/tauri-jev.ts` and `src-tauri/src/jev.rs` carry the fixed native boundary. `tests/e2e/library-question-desk.spec.ts` checks preview and usable no-key behavior; the question-desk unit suite checks stale and unavailable pairs.

## Uncertainty
- One owner-authorized synthetic native TypeSafe call during PR #2059 returned contradicted for an intentionally false claim. This closes the earlier absence of a native live-call observation; no project content was used and no wider accuracy claim follows.
- Existing stub/fake-sender tests cover key operations, preview-equals-sent payload, and metadata receipts. Real-candidate calibration, cross-platform live behavior, and TypeSafe's written confirmation for independently keyed open-source distribution remain unresolved.
