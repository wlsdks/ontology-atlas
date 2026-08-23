---
uid: 1560e52a-f6d8-4715-8404-9143efee388c
slug: capabilities/first-run-starter
kind: capability
title: First-Run Starter Vault
domain: domains/onboarding-and-shell
elements: [elements/first-run]
path: src/features/first-run-starter
created_by: "agent:unknown"
---

## Definition
The first-run experience that brings a completely new user from scratch to a starter vault they can use.

The first-run card at the top of the INDEX panel on the left side of the map (`/topology`) is the surface of this capability.
It appears **only before** choosing a vault. Once the folder opens, the card disappears and the INDEX takes its place. Therefore, what this card must say is simply: "What you see now is someone else's sample; choose your own folder to light up the same map with your data."

## Decision

- **Instrumentation is not the point** (2026-08-02, PO Council). We used to draw concept/relation/domain counts in inset instrumentation blocks (19px mono semibold), which were the largest font and highest brightness within the card. Instrumentation belongs when the user's **own** vault unlocks. Having the boldest ink on a screen saying "Sample for now" four times be the sample size itself was self-contradictory. It was demoted to one line of caption below the tab. The source of the numbers remains unchanged (`topologyCanonicalCensus` derived data comes in via props).
  The prohibition on fixed numbers (2026-08-01 Ledger) is still upheld.
- **Status signals are two, not four** (2026-08-02). "This isn't your data yet" was being communicated via language 3 times + color 1 time ("First Run" eyebrow · amber dot · "Sample for now" · lead's "It's a practice read-only sample"). Moved the amber dot next to "Sample for now" to group them into one cluster, and removed the redundant clause in the lead. "First Run" remains as it conveys a different fact.
- **Identity declaration reverted at first touchpoint** (2026-08-02). The strings "Agent", "MCP", and "AI" appeared 0 times on this card, while the app uses them in 179 places. Just the bold lead ("...a map at a glance") isn't enough to distinguish it from other markdown mapping tools. Without introducing new concepts, we appended a sentence after the gray background using vocabulary already used by the tour's agent stage.
- **Sample selection is a select control, not a tab** (2026-08-02). Although `role="tab"`, clicking didn't switch tab panels but collapsed the card, and pressing an already selected tab also collapsed it. The collapsing behavior on transition (2026-07-24 handoff design) is maintained, but semantics were corrected to `aria-pressed`. Re-clicking the same selection results in no action.
- **`⌘O` badge is only true on Mac** (2026-08-02). The folder open shortcut is bound only to the meta key, so there is no corresponding binding for Windows/Linux. To avoid advertising a key absent from the core audience of web gateways, we do not render the badge on non-Apple platforms.
- **CLI bridge wording matches what the command actually does** (2026-08-02). The label was "To start automatically from the codebase" (= my repo), but the command uses a relative path and scans **the folder where it was executed**. The command itself (CLI public contract) is pending separate PO pass, so this time we only removed exaggeration.

## Evidence
- src/features/first-run-starter (implementation evidence)
- src/features/first-run-starter/ui/FirstRunStarterModule.tsx (first run card surface)
- messages/ko.json · messages/en.json `firstRunStarter` bundle (single source for card wording)

## Confidence
high (0.85)
