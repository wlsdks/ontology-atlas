---
slug: elements/builder-command-strip
kind: element
title: Builder Command Strip
domain: views
---

`src/views/ontology-edit/ui/OntologyEditPage.tsx` renders a compact state-based command strip in `/ontology/edit` so the builder always exposes the next useful action: start a concept, open drafts, edit the selected concept, or review a pending relation preflight.

Saved selections follow the ontology hierarchy. Projects offer `Add domain`, domains offer `Add capability`, capabilities offer `Add element`, and element or unknown selections fall back to details. Those hierarchy actions create a draft child node and an ephemeral parent-to-child relation together, so the save surface can persist the concept and its graph edge as one visible workflow. Draft selections take priority over saved selection affordances, keeping the strip focused on opening or saving unsaved work. The secondary action either opens save status for draft/relation states or links to focused `/ontology/insights/?node=...` proof for saved selections; the visible label stays compact, while the accessible label and tooltip include the selected concept title so "Proof" / `검증` always says which slug context it will verify.

The same focus contract applies to the collapsed saved-concept rail above the canvas. Its compact button keeps the visible label dense, but the accessible label includes persisted node/relation counts plus the active focus slug, and the tooltip repeats why picking a focus concept keeps canvas focus, details, and proof links aligned. The collapsed state shows the active slug as a calm focus label (`focus ontology/project` / `기준 ontology/project`) instead of an uppercase internal code stamp. The saved-concept picker keeps kind names localized (`Project` / `프로젝트`, `Domain` / `도메인`, and so on) while preserving canonical slugs, and keeps its connection-count badge localized (`connections` / `연결`) so Korean users do not see hardcoded graph-analysis terms inside the workbench.

Header controls that open compact popovers follow the same pattern. `Layout` / `배치 보기` and `Save status` / `저장 상태` keep short visible labels, while their accessible labels combine the command name with the explanatory hint so collapsed controls remain understandable without expanding the popover first.

Draft relation persistence feeds the same saved-relation handoff as explicit vault-to-vault relation saves. `src/views/ontology-edit/lib/saved-relation-handoff.ts` builds the shared proof payload from persisted source/target endpoint info, and the ephemeral-edge save path selects the saved target, opens details, opens save status, and leaves `RelationPostSaveHandoff` visible for topology path, focused insights, proof packet, and post-change sync follow-up.

The post-save query handoff is target-focused because hierarchy creation usually makes the target the newly saved concept. The visible action now says `Verify target concept` / `도착 개념 검증`, and its accessible label includes the target slug. The copied proof packet still records both source and target focused insights URLs, so users can verify the newly created concept immediately without losing the parent context.
