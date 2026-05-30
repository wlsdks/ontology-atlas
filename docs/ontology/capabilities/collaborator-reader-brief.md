---
slug: capabilities/collaborator-reader-brief
kind: capability
title: Collaborator Reader Brief
domain: views
elements: [insights-collaborator-brief, insights-orphan-repair-packet, ontology-review-brief, topology-ontology-drawer-model]
---

`/topology`, `/ontology`, and `/ontology/insights` expose a secondary collaborator reader lane without making non-developers the primary product target.

The lane translates a selected ontology node into a plain-language lens, source-backed relation summary, and review prompt. Planners, marketers, and domain collaborators can inspect concept vocabulary, dependency impact, and ownership questions while developers and AI agents keep using the same vault graph.

Topology drawer briefs are now copyable as compact markdown with kind, node id, review lens, source, relation counts, relation-type counts, review prompt, review questions, and direct relation previews, so collaborator review can leave the graph surface and move into planning notes or handoff discussions without inventing a second vocabulary. The copied brief's change-impact section also carries the transitive blast radius (how many nodes are affected if this one changes, and how many it depends on) so an AI agent reading the handoff judges change risk on the true reachable set, not the under-counted 1-hop degree. `/ontology` node detail now surfaces the direct relation preview and graph-proof chips before the collaborator card, then uses the same relation-type count vocabulary inside the copied brief, includes the same prompt-specific review questions, adds a change-impact summary, includes topology / builder handoff URLs, and exposes the same post-change sync gate copy action used by agent setup and builder writes. Tree browsing therefore starts with source-backed graph inspection before becoming collaborator review or source-of-truth editing. Both `/topology` and `/ontology` now also expose a smaller review-vocabulary packet for planning / marketing notes that only need the term, meaning to keep, reuse context, review questions, and relation anchors.

`/ontology/insights` adds a workspace-level collaborator brief for people who are not inspecting one node yet. It now pairs the current review focus with concrete review questions: align vocabulary around hubs, trace cross-domain impact, or resolve ownership for unconnected concepts. Its top hub rows keep exact node identity and direct Ontology / Topology / Builder handoff links, so a planning or marketing note can return to the same graph node instead of becoming a detached vocabulary list. The same brief and the visible domain coupling matrix now include the strongest domain-to-domain impact handoffs with sample relations, direct Topology Path-mode links, domain-matrix replay commands, and row-level `all_paths` check packets with `query_plan` first for CLI/MCP, so cross-domain impact can be checked from the UI, Claude Code, Codex, or a terminal. That keeps the non-developer lane practical without making it the primary product surface.

The insights brief now also names a decision lane for the current review focus. Instead of asking collaborators to infer next steps from graph metrics, the visible card and copied markdown say who should decide, what decision is expected, and which graph surface to open next: hub handoffs for vocabulary alignment, Topology Path plus domain-matrix checks for impact review, or Builder / Topology health handoffs for ownership cleanup. The lane includes one direct graph handoff link, so a review note can move from decision wording into the exact node, path, or repair surface without searching again.

The same visible card and copied markdown now include a `Decision record`
checkpoint. It restates the expected decision, owner, graph evidence, and
follow-up step in a meeting-note shape, so planning / marketing / domain
review can leave a concrete record instead of only copying prompts and links.
When a workspace handoff is available, the copied decision record also carries
the replayable CLI and MCP proof rows for the selected focus, so the note can
move directly into Claude Code, Codex, or a terminal verification loop.

Insights briefs add the overview lane: planners and domain reviewers can copy a compact markdown snapshot of node / relation / domain counts, cross-domain impact, open ownership questions, top vocabulary hubs, strongest domain impact pairs, and the same actionable review focus shown on screen. When open ownership questions exist, the copied overview now names the first concrete concepts and includes direct ontology, topology health, and builder handoff links instead of leaving collaborators with only an aggregate count. Orphan rows still add a smaller ownership repair packet with direct ontology, topology health, builder, relation-check, and health-verification handoff details.
