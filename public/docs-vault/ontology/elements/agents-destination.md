---
uid: 981cd7f6-506a-4b2b-b62c-cd56896e81b0
slug: elements/agents-destination
kind: element
title: Agents Destination
domain: domains/agent-integration
path: src/views/agents/ui/AgentsPage.tsx
created_by: "agent:unknown"
display_ko: 에이전트 목적지
display_en: Agents Destination
---

## Definition

A single location (`/agents/`) on this computer where you **receive, install, attach, fix, and initiate conversations with** AI coding tools. It is the eighth destination of the rail.

## Why Destination (2026-08-20, Chapter 90)

Until 2026-08-20, this task occupied two cells in the settings sheet ("Executor"·"MCP Connection"), while a separate connection sheet on the map handled the same function. **Three addresses for one task**.

The rationale is not screen width (measured install app: 46–47% of the sheet remains empty on the normal path). The rationale is **container**:

- Modals block the background and own Esc. You cannot see the map while receiving 52MB.
- **Settings are where values are chosen**, and this is an **operational task with progress**.

This mirrors the separation of skills from documentation (2026-08-09): different questions asked imply different destinations.

## What This Section Contains

1. **Executor List**: Tools confirmed on this device are expanded first; the rest are collapsed.
2. **Connection Check**: Review eight steps and fix what can be fixed right here.
3. **App-Specific Install**: Download Node and CLI only within the app folder. Version pinning · hash
   verification · command source preview (Chapters 88·89). Progress and completion remain on screen, persisting even if the window is closed and reopened.
4. **MCP Connection**: Configuration that exposes this folder to external agents. Also available via web.
   MCP attaches to the **folder**, not the screen (2026-08-01 Chapter).

## Boundaries

- **API Keys and workspaces remain in settings.** The former is governed by the 2026-08-16 "Path Freeze · Non-highlight", while the latter involves a different axis of Vault's response (`local-vault-management`).
- **Draw the MCP configuration panel only after opening Vault** (owner confirmation 2026-08-21). Without Vault, there is no configuration to save; saying "cannot save" at that point refers to a file that does not yet exist.
- **Eight rails are the upper limit** (owner signature). In the minimum window (720px), the eighth rail leaves only 8px remaining and enters; on zoom level 1.1 with width >2400, it requires 761px, exceeding limits, so rail scrolling is enforced alongside the cap.
- Programs cannot be launched on the web. Explain the reason, where to go, and **what can still be done on this screen**.

## Rationale

- src/views/agents/ui/AgentsPage.tsx: Main destination body
- src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx: Executor list · check
- src/widgets/app-settings-menu/ui/AgentSetupSection.tsx: MCP connection section (Vault gate)
- src/features/acp-doctor/ui/AgentDoctor.tsx: Eight checks · repairs · install progress
- src/features/acp-doctor/model/use-install-notice.ts: Install completion rail badge
- src/shared/config/destinations.ts: Destination listing (eight-rail cap contract)
- tests/contract/destination-shortcuts.contract.test.ts: Cap · scroll handling contract
- tests/e2e/web-surface-smoke.spec.ts: Web downgrade 3-point contract
- docs/DECISIONS.md 2026-08-20 (90)

## Confidence

high (0.9): The route, migration, and gate are aligned with the contract and end-to-end; I opened both screens directly in the installed app to verify. The scene where the rail badge actually appears in the installed app was substituted with unit tests and browser navigation persistence measurements. That spot still lacks real-world installation verification.

## Evidence

- Primary implementation: `src/views/agents/ui/AgentsPage.tsx#AgentsPage`
