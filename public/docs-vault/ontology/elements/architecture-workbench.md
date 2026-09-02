---
uid: 39f620c5-b115-41a7-be34-e544c7587074
slug: elements/architecture-workbench
kind: element
title: Architecture Workbench
display_en: Architecture Workbench
display_ko: 아키텍처 워크벤치
domain: domains/codebase-architecture
path: src/views/architecture
created_by: "agent:unknown"
---

## Definition
The human-readable implementation-architecture workbench at `/architecture`. It is a comparison surface, not the ontology map: a solid canvas keeps each reviewed role beside source observation and names the delta between them. At supported laptop width a downward chain uses one repeated 280px reviewed face, 72px comparison gutter, and 240px observation face. Wider across chains keep reviewed and observed cards on separate tracks; constrained widths combine the two authorities without claiming that missing observation is zero.

The top toolbar exposes four direct paths only: open the 44px evidence disclosure, select a role, open Roles and rules, or hand the actual task to an available agent. The evidence disclosure opens a mutually exclusive 360px dock as one continuous ruled ledger. Role selection opens a mutually exclusive 380px detail dock, persists the role in the URL, keeps the selected pair and bridge visible, and restores keyboard focus on Escape. The workbench interpolates dock width over existing motion tokens; fixed-readable role faces and connector space yield with the available canvas before any role is hidden. The current applied scope is a static fact marked Current; only another profile is actionable. A role with no sampled violation says no recorded violations, because profile-wide unmapped dependencies cannot safely be attributed to that role. There are no visible workflow-stage tabs, replay control, guided chain walk, raw prompt panel, or generic verification prose panel.

The contextual agent action sends a short review, source-inspection, or change-planning request through the existing guarded ACP route when a verified runtime and vault are available. A browser or unavailable runtime degrades to copying the same bounded task. With no profile, the route still offers the existing Draft conversation: inspect source, stop for human architecture and role names, and write nothing before approval.

Motion explains state rather than decorating it. Contract roles reveal together, observation marks follow one fast step later, local hover affects only its role, and selection settles the pair, bridge, relevant dependency strokes, and dock into a persistent state. Only a genuinely active ACP turn may show the bounded observation scan. Reduced motion preserves the same final labels, selected pair, bridge, docks, and focus behavior without travel.

## Evidence
- `src/views/architecture/ui/ArchitectureWorkbench.tsx`: direct toolbar paths, static current scope, mutually exclusive docks, URL/focus state, and guarded agent handoff
- `src/views/architecture/ui/ArchitectureEvidenceRail.tsx` and `ArchitectureEvidencePlane.tsx`: 44px disclosure and continuous contract/observation/delta ledger
- `src/views/architecture/ui/ArchitectureSketch.tsx`: solid comparison canvas, paired and split evidence geometry, adaptive dock fit, role state, ports, edge sentences, and violations
- `src/views/architecture/model/role-ledger.ts`: bounded per-role rollups that do not absorb profile-wide unknown edges
- `src/views/architecture/model/edge-sentences.ts`: script-aware collision handling for visible dependency sentences
- `src/views/architecture/ui/ArchitectureAgentDock.tsx`: responsive same-route guarded ACP sheet/side dock
- `src/views/architecture/model/architecture-agent.ts`: ready/verified/guarded runtime selection and clipboard degradation
- `app/globals.css`: evidence reveal, selection feedback, dock-column transition, active-session scan, and reduced-motion equivalents
- `tests/e2e/architecture-workbench.spec.ts` and `tests/e2e/architecture-role-ledger.spec.ts`: direct-path reachability, keyboard recovery, URL state, 320px/rotation/1512px geometry, sentence separation, and whole-chain checks

## Boundary
The workbench renders an implementation-architecture projection from three authorities that never merge: a profile is reviewed intent, a persisted receipt describes one dated source revision, and live agent activity is volatile. The app does not infer a pattern from folder names, approve a proposal, convert an active chat into a receipt, or write a profile before human naming and approval. A browser cannot spawn a local process or enumerate a bound source tree and says so through its copy fallback. Missing, stale, unsupported, empty-role, and unruled evidence remains visibly unknown rather than animated or styled as current.

## Confidence
high (0.96): focused model/component checks, isolated rendered journeys, and the exact signed macOS app cover the direct controls, static current scope, role and evidence docks, same-role reopen, focus restoration, 320px and 200%-equivalent reflow, 834↔1112 rotation, 1512/1920/2560 comparison geometry, close/relaunch vault restoration, and real 60fps selection recordings with no active-core stall.
