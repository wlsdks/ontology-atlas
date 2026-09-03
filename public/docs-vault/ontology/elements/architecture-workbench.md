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
The human-readable implementation-architecture workbench at `/architecture`. It is a comparison surface, not the ontology map: a solid canvas keeps each reviewed role beside source observation and names the delta between them. Whenever the paired rows fit the canvas height at rest, a downward chain uses one repeated 280px reviewed face, 72px comparison gutter, and 240px observation face, with a 24px row gap that seats each rule sentence beside the arrow it describes; this holds at 1512×945 and at 1920×1080. A canvas too short for the rows, or a profile with parallel lanes, draws the across chain with reviewed and observed cards on separate tracks; constrained widths combine the two authorities without claiming that missing observation is zero. Choosing a role recedes unrelated roles to 0.65 and their strokes to 0.55, so a receded title stays readable rather than vanishing.

The top toolbar exposes four direct paths only: open the 44px evidence disclosure, select a role, open Roles and rules, or hand the actual task to an available agent. The agent control keeps a derived default label (inspect source, review delta, or plan change) and a chooser beside it lists three tasks with one line each: inspect or re-inspect source, plan change, and find improvements. The evidence disclosure opens a mutually exclusive 360px dock as one continuous ruled ledger whose prose is body size. Role selection opens a mutually exclusive 380px detail dock, persists the role in the URL, keeps the selected pair and bridge visible, previews at least four occupants, and restores keyboard focus on Escape. The workbench interpolates dock width over existing motion tokens; fixed-readable role faces and connector space yield with the available canvas before any role is hidden, and a hidden role is counted, never silently cut. The current applied scope is a static fact marked Current; only another profile is actionable. A role with no sampled violation says no recorded violations, because profile-wide unmapped dependencies cannot safely be attributed to that role. There are no visible workflow-stage tabs, replay control, guided chain walk, raw prompt panel, or generic verification prose panel.

The chosen agent task goes through the existing guarded ACP route when a verified runtime and vault are available; a browser or unavailable runtime degrades to copying the same bounded sentence. Find improvements names where the reviewed profile and the observed imports disagree, plus unmapped, unruled and empty roles, with literal paths and counts, and asks the person what the rule should be; it proposes no rule, role name or pattern and writes nothing before the person answers. With no profile, the route still offers the existing Draft conversation: inspect source, stop for human architecture and role names, and write nothing before approval.

Motion explains state rather than decorating it. Contract roles reveal together, observation marks follow one fast step later, local hover affects only its role, and selection settles the pair, bridge, relevant dependency strokes, and dock into a persistent state. The task chooser enters and leaves as chrome and its chevron turns; Escape closes only the menu and returns focus to it. Only a genuinely active ACP turn may show the bounded observation scan. Reduced motion preserves the same final labels, selected pair, bridge, docks, menu, and focus behavior without travel.

## Evidence
- `src/views/architecture/ui/ArchitectureWorkbench.tsx`: direct toolbar paths, derived default task plus chooser, static current scope, mutually exclusive docks, URL/focus state, and guarded agent handoff
- `src/views/architecture/ui/ArchitectureEvidenceRail.tsx` and `ArchitectureEvidencePlane.tsx`: 44px disclosure (its separator collapses with the observation title) and continuous contract/observation/delta ledger
- `src/views/architecture/ui/ArchitectureSketch.tsx`: solid comparison canvas, ladder-by-height axis, paired and split evidence geometry, adaptive dock fit, role state, receded opacities, ports, edge sentences, and violations
- `src/views/architecture/model/role-ledger.ts`: bounded per-role rollups that do not absorb profile-wide unknown edges
- `src/views/architecture/model/edge-sentences.ts`: connector and lead seats for rule sentences and script-aware collision handling
- `src/entities/architecture-profile/model/architecture-profile.ts`: the change, verify and improve task prompts, with the find-improvements refusals
- `src/views/architecture/ui/ArchitectureAgentDock.tsx`: responsive same-route guarded ACP sheet/side dock
- `src/views/architecture/model/architecture-agent.ts`: ready/verified/guarded runtime selection and clipboard degradation
- `app/globals.css`: evidence reveal, selection feedback, dock-column transition, active-session scan, and reduced-motion equivalents
- `tests/e2e/architecture-workbench.spec.ts` and `tests/e2e/architecture-role-ledger.spec.ts`: direct-path reachability, task chooser, keyboard recovery, URL state, 320px/rotation/1512px/1920px ladder geometry, sentence separation, and whole-chain checks

## Boundary
The workbench renders an implementation-architecture projection from three authorities that never merge: a profile is reviewed intent, a persisted receipt describes one dated source revision, and live agent activity is volatile. A find-improvements answer is a fourth thing, proposed questions, and it lives only in the agent conversation until a person writes the rule. The app does not infer a pattern from folder names, approve a proposal, convert an active chat into a receipt, or write a profile before human naming and approval. A browser cannot spawn a local process or enumerate a bound source tree and says so through its copy fallback. Missing, stale, unsupported, empty-role, and unruled evidence remains visibly unknown rather than animated or styled as current.

## Confidence
high (0.9): focused model/component checks and rendered DOM measurement at 1512×945, 1920×1080 and 1280×800 cover the ladder-by-height axis, sentence seats, receded contrast, the chooser, and the improve prompt refusals; the installed-app recording and a source-hidden judge walkthrough of the chooser are the checks still owed for this revision.
