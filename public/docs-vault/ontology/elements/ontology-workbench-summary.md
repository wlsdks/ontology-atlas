---
slug: elements/ontology-workbench-summary
kind: element
title: Ontology Workbench Summary
domain: views
relates: [elements/insights-query-cockpit, elements/ontology-tree-projection-summary]
---

# Ontology Workbench Summary

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the Concept map / Edit relations / Verify graph workflow for `/ontology`.

The command bar is the first concept-map handoff: it opens local concept search, global search, graph verification, relation editing, and secondary actions from the same ontology context. It starts with a plain task sentence instead of only a product label and counts: selecting a concept opens meaning, relations, and implementation proof. The work overview button is a secondary action, not the primary visual accent, so the top of `/ontology` reads as a concept-map task before it reads as navigation chrome.

The command bar no longer sits inside a large rounded container. It behaves like a compact page header: the task sentence and graph counts stay on the left, Search is the first visible command, and the main row keeps only Search, Verify graph, and a small Actions menu. Global search and Edit relations remain available in Actions, but they no longer compete as equal first-screen commands before the user has selected a concept. Work overview and baseline marking also live in Actions, while MCP connection proof belongs in the app settings MCP/Agents tab. The tree status strip uses a quiet divider row instead of a second boxed panel. This removes stacked boxes and secondary commands from the first viewport while keeping Concept map / Edit relations / Verify graph handoffs available.

The work overview dialog explains the three route roles in action language: Concept map scans the hierarchy and selected-node proof, Edit relations opens the canvas for frontmatter writes, and Verify graph opens the graph DB proof cockpit. The mobile command bar mirrors that model directly in the visible action labels.

The Browse surface now opens with a compact concept-map summary after the tree status strip: Business language -> Product capability -> Implementation proof. It avoids visible internal labels such as "Meaning Gate", "Reader lanes", and "Wedge" because those terms made the first screen feel like a generated strategy card instead of a workbench. The visible task is simpler: select one concept, then see its meaning, relations, and implementation proof through the same slug in Edit relations and Verify graph.

That first-screen summary is now a flat reading-order strip rather than a nested set of cards. The outer surface is a quiet divider row, and the three steps use text hierarchy plus small ordered labels instead of decorative boxed cards. This keeps the first viewport closer to a workbench index than an AI-SaaS strategy panel while preserving the business-to-code explanation for non-developer readers.

The concept-map first viewport must read as an operating surface, not a generic AI dashboard. The latest iteration makes the ladder more compact again: the body copy moves into accessible descriptions, the visible path is domain -> capability -> element, and the tree expansion controls are visible immediately after the ladder. This keeps the strongest meaning cue without pushing search, expand all, and collapse all below a strategy-card block.

Domain/capability/element counts come from source frontmatter kind docs (`sourceKindCounts`), not relation-derived projection stubs, so a business reader sees the curated ontology size instead of an inflated file-index count. This keeps `/ontology` from reading like a source-file index while still preserving the developer + AI-agent loop as the maintenance engine that keeps the graph fresh.

The summary still includes a copyable business-to-code brief. It turns the counts into a markdown handoff for planning, marketing, leadership, developer, and AI-agent review: audience, business language count, product capability count, implementation proof count, core domain lanes, reader lanes, reader handoffs, and next graph actions. Those reader lanes remain useful in the copied handoff, but they no longer occupy first-screen chrome before the user has chosen a concept.

The summary surfaces the strongest domain lanes by capability count as a small "start with a domain" row. This keeps the product core visible before a user opens the tree: stakeholders can see which business / ownership vocabulary areas carry the most behavior, while developers and agents can still trace each lane down to capability and implementation evidence. Each lane is a direct `/ontology?node=<domain>` handoff, so the first screen moves from overview into the exact domain node without a separate search step.

The `/ontology` summary strip separates source concepts from browse rows. Source concepts count vault documents with `kind:` frontmatter before relation-derived projection stubs are added, while browse rows come from the tree projection and can be higher when a concept is reachable through multiple hierarchy paths. This prevents users and agents from mistaking projection rows for the canonical ontology source count.

Dogfood note: this slice used Atlas MCP to inspect this element and confirm it is the right ontology node for the change, then used CodeGraph to verify that the removed agent-status surface had no production callers left. That changed the product decision: the meaning map should help users pick a concept and read business-to-code evidence, while MCP connection setup and first-call proof stay in app settings. The focused layout and E2E tests now verify that the visible `/ontology` command bar does not show the duplicated Connection settings action, while the MCP/Agents settings panel still exposes direct MCP proof, CLI fallback proof, and `index_project` guidance.

The latest dogfood pass used CodeGraph first to locate `OntologyViewPage` and its layout/E2E tests, then Atlas MCP to find the existing `views` ontology nodes. That confirmed this change belongs to the workbench summary element rather than creating a new node. It also sharpened the product rule: the top of `/ontology` should help a user choose a concept and understand the projection, not explain every reader lane before the tree is usable.

The meaning map no longer renders the old local-vault summary card below the tree. That panel repeated source counts already visible in the page chrome and made the Browse route feel like a generic dashboard instead of a concept-selection workbench. CodeGraph impact analysis showed the panel had no production callers after removal from `OntologyViewPage`, so the component and its copy were deleted rather than hidden.

Tree projection notes now say that some relations are not drawn in the hierarchy instead of calling them "outside tree graph relations," "hidden tree lines," or raw projection warnings. The work overview uses the same rule: non-containment edges are `relates`, `depends_on`, or `describes` evidence that stay in the graph but are not drawn as extra hierarchy lines. The tree draws one readable project -> domain -> capability -> element path per concept, while multiple parents, cycles, aliases, and cross-links remain queryable in the graph. This wording keeps the graph DB mental model intact without making non-developer readers decode projection jargon or mistake the note for an error.

The wording now uses "folded hierarchy relations" / "계층에 접은 관계" for the relation count. It means the edge still exists in the ontology graph but is not drawn as an extra hierarchy line because the tree keeps one readable project -> domain -> capability -> element path. This is not an error count, a hidden feature count, or a connected-agent count; it is the set of edges the user should inspect in Verify graph or Edit relations when they need the full graph. The detail dialog also formats examples as `kind` plus handle instead of a single raw slug line, so long element ids still remain exact evidence without looking like unexplained machine output.

The top status chip now opens the same projection-detail dialog directly instead of finding a lower-page trigger by DOM id. That makes the first-screen count act like an explanation control: users can ask what the number means without scrolling to the later projection notes section, while the detailed section remains available below the tree for review and links to Verify graph / Edit relations.

The tree exposes direct "expand all" and "collapse all" controls as a named hierarchy expansion block before search. The same actions still live in view options for constrained layouts, but the common recovery action is visible where users scan the tree. The control names intentionally mention domains, capabilities, and elements in their tooltip so a user can understand what will open without learning projection internals.

Reference document copy is intentionally small and neutral: document nodes are background evidence kept in the vault, not a second "document summary" dashboard. The status strip now says reference documents / 참고 문서 and explicitly says this is not the whole source-vault summary. The `/ontology` tree stays focused on concepts instead of acting like a document dashboard.

The global Live badge is a clickable summary. Its number is labeled as changed ontology nodes since the current baseline, not connected agents or elapsed time; opening the badge explains that distinction, shows the explicit agent heartbeat when present, and points users to the concept-map change panel for exact nodes. This is the current boundary for live Claude Code / Codex integration: Atlas can show explicit heartbeat packets and vault changes, but it should not imply that it can read private agent chat state without a reported heartbeat.

The first-screen agent gate is phrased as `AI 에이전트 그래프 검증 순서`, not an English `Agent graph DB gate`. The visible order stays executable (`agent_brief` -> `workspace_brief` -> `health`), but the Korean copy explains the value in user terms: read the same ontology graph, confirm workspace context and graph health, then propose a change. This keeps the copyable MCP checks useful for Claude Code and Codex while making the first viewport understandable to planners, marketers, leaders, and developers who are deciding whether the ontology is trustworthy.

Each first-screen agent gate copy button now emits a small markdown packet with the direct MCP `query_ontology(...)` call, the matching CLI fallback (`agent-brief`, `workspace-brief`, or `health` against `docs/ontology`), and the reason to run it. That keeps the same control useful in MCP-connected Claude Code / Codex sessions and connector-less terminal sessions, so the workbench does not depend on CI or a particular agent integration being ready before a human can verify the graph.

Each first-screen business decision question now has its own copy control. The
copied packet keeps the human question first, then gives the matching graph
evidence query and CLI fallback: outcome starts from graph facets, boundary
starts from domain node scans, capability claim starts from the coupling matrix,
and implementation evidence starts from edge scans. This makes the questions
operational instead of decorative, while preserving the guardrail that paths,
APIs, routes, and commands remain implementation evidence until a business
outcome is clear.
