---
slug: elements/ontology-review-brief
kind: element
title: Ontology Review Brief
domain: views
---

`src/views/ontology-view/lib/review-brief.ts` and the selected-node detail panel create a compact collaborator review brief for `/ontology`.

The brief classifies the selected node as product scope, domain vocabulary, capability, implementation element, or generic concept; summarizes source, direct relation counts, and direct relation-type counts; and formats a copyable review prompt for non-developer collaborators. The visible card and markdown export now include prompt-specific review questions, matching the topology drawer reader lane: define owner for isolated concepts, explain usage for outgoing-only concepts, confirm dependents for incoming-only concepts, and trace impact for bidirectional concepts.

The selected-node panel now shows a small direct relation preview before the collaborator card. Each row names direction, relation type, neighbor title, and neighbor kind, and the surrounding chips show source, in/out counts, and relation-type counts. This makes the first read graph-proof-first: a user sees the concrete frontmatter edges before deciding whether a vocabulary change needs owner review, dependency review, or builder cleanup. The copied markdown keeps the same direct relation evidence with node ids for handoff precision.

Direct relation rows now carry a subtle direction-aware tone and `data-direction` metadata. Outgoing and incoming edges scan visually without changing the compact mobile evidence budget, while Claude Code, Codex, and browser automation can verify the row direction from the DOM.

The same rows now expose `data-node-id` and `data-relation-type` metadata. Browser automation and AI agents can verify the exact graph endpoint and relation key without scraping visible row copy.

Path-like element titles in the direct relation rows now show their basename in the visible row while preserving the full path in the title and accessible open label. Mobile reviewers see the meaningful file name first, and agents still get the exact source path for handoff.

The direct relation count copy is intentionally short on mobile: `나감 {outgoing} · 들어옴 {incoming}`. The preview keeps graph evidence scannable in the narrow detail sheet without hiding the neighbor rows that make the ontology concrete.

Direct relation rows are now navigable when the neighbor node exists in the current graph. Selecting a row opens that related concept in the same selected-node panel, preserving the Browse / Write / Query handoff and proof path for the new node. Missing neighbor records remain static evidence rows, so unresolved graph edges do not pretend to be selectable concepts.

Navigable relation rows show a small chevron at the trailing edge. Static unresolved rows keep the same evidence layout without the chevron, making graph movement available only where Context Atlas can open a real neighboring concept.

The relation preview deck now tells users that pressing a row opens the neighboring concept and its proof path in the same panel. Each navigable row also carries an accessible label and native title with the relation direction and type, so the graph traversal is understandable to screen readers and automation instead of only being implied by the chevron.

The relation preview deck copy is now a single action sentence. Mobile users see the neighbor rows sooner, while the title and counts still establish that this is direct graph evidence.

The relation preview header now separates the count pill from the instruction sentence. Title and counts share the first row, while the action sentence uses the full card width, reducing mobile wrapping without hiding the graph evidence rows.

The mobile selected-node sheet now uses a taller `68dvh` evidence window while still sitting above the global bottom tabs. The first direct relation row lands in the initial viewport, so choosing a concept exposes concrete graph edges without an immediate scroll.

The selected-node sheet header is sticky inside the scroll surface. Long relation previews and agent checks no longer hide the current concept title or close / handoff icons while the user reviews graph evidence.

The selected-node sheet now includes a compact ontology signal rail before the workbench handoffs. It surfaces the active review lens, incoming/outgoing relation balance, and Claude/Codex proof lane without forcing the user to open the deeper review disclosure.

The signal rail now renders as a compact evidence cluster instead of one squeezed line. Lens, relation balance, and Claude/Codex proof each have their own chip and test hook, so mobile users can read the ontology state before acting and agents can verify the same state without parsing truncated copy.

The agent proof path controls now use compact two-line copy buttons. The MCP command detail stays in the accessible label / title while the mobile sheet gives more first-screen room back to direct relation evidence.

The selected-node handoff actions now render as a compact segmented rail instead of tall cards. Topology, write, and query destinations stay accessible, while the first mobile viewport can expose multiple direct relation rows inside the sheet.

The direct-relation preview header now uses a one-line instruction and tighter row rhythm. Mobile review exposes at least three neighboring concepts before the sheet clips, so the graph reads as evidence rather than a single teaser row.

The source and relation-type evidence chips now sit directly under the relation preview title instead of after the full relation list. A reviewer sees the source record, type distribution, and first relation rows in the same mobile viewport.

The source evidence chip now shows the compact tail slug in the visible label while keeping the full source slug in `aria-label`, title, and `data-source-slug`. Mobile reviewers can read the selected concept identity faster, and automation still receives the precise source record.

The source chip also overrides the metadata row's uppercase spacing with normal-case compact tracking. The tail slug fits in the mobile chip instead of being widened by letter spacing meant for short count labels.

The relation-type chip now favors a compact top-type summary (`Contains 8 +2`) while preserving the full distribution in the chip title. Long source slugs no longer squeeze the type evidence into an unreadable tail.

When a selected concept has source evidence, the source chip in the direct-relation preview links to the matching Source Vault record using the original evidence slug, even when the visible review brief displays the shorter ontology slug. The first viewport now connects concept → direct relations → proof path → source markdown without forcing the user to open the deeper related-docs disclosure first.

The Source Vault document meta bar now labels ontology-node return links as `Concept · kind:{kind}` / `개념 보기 · kind:{kind}` instead of only `kind:{kind}`. A user who follows source evidence from `/ontology` can recognize the return path to the selected ontology concept without decoding frontmatter jargon.

The adjacent relation-map link now says `Relation map` / `관계 지도` and describes opening the current concept, not a project. Capability and element source records no longer expose a project-only tooltip for a graph navigation action.

The same Source Vault meta actions now render as compact icon action chips with a touch-sized hit area, hover lift, and active press feedback. The document metrics remain quiet metadata, while Concept and Relation map read as graph navigation controls that return a source record to the ontology workbench.

When relation-row navigation changes the selected concept, the detail panel resets to the top of the new concept. The user lands on the title, Browse / Write / Query handoff, and proof path instead of inheriting the previous node's lower scroll position.

The visible card and copied markdown now add a change-impact summary between the review questions and relation preview. It translates isolated, outgoing-only, incoming-only, and bidirectional relation shapes into the first collaborator action, and names the first incoming and outgoing neighbor when available.

For lighter planning / marketing vocabulary review, the same card can copy a compact review-vocabulary packet. It keeps only the term, node id, kind, source, meaning to preserve, reuse context, review questions, relation anchors, and direct Topology / Builder handoff links, so a collaborator can review naming or messaging without the full agent handoff block while still returning to the exact graph location.

It now includes handoff URLs for the selected node's explicit Topology Focus mode and builder focus. The visible brief card exposes the same actions, so a reader can move from tree browsing into graph inspection or frontmatter-backed editing without re-searching the concept. The visible CTA and copied review brief label this as `Topology focus`, and the URL includes `mode=focus&p=<nodeId>` rather than only the legacy selected-node query, keeping `/ontology` review briefs aligned with the topology drawer and analysis bar handoff contract.

The selected-node panel now repeats the workbench loop before the longer collaborator card as a compact Browse / Write / Query handoff rail. Browse opens Topology focus, Write opens the builder focused on the same node, and Query opens the node proof cockpit. It also exposes a first-viewport selected-node proof packet copy action, so Claude Code / Codex can receive the matching `node_profile`, incoming `blast_radius`, planned incoming/outgoing `match_edges`, planned public `depends_on` relation parity scans, reachability, `query_plan(all_paths)`, bounded `all_paths`, `relation_check`, `health`, `pattern_walk` / `project_map` containment replay, evidence checklist, and post-change sync gate before the user scrolls into the longer review card. The checklist names the runtime graph DB check count before the embedded shared sync packet, requires `relationType` / `via` evidence for public relation scans, and asks agents to report `pattern_walk` path totals plus `project_map` unresolved-edge counts before treating the tree projection as complete ownership evidence. This keeps tree selection from feeling like a terminal detail drawer: every selected concept immediately exposes the next visual inspection, frontmatter edit, and graph DB-style proof path.

The handoff rail is now a three-way compact action strip instead of three stacked cards. Browse, Write, and Query keep their icon, label, and proof hint, but sit side by side with a small lift-on-hover affordance. This keeps the primary workbench actions in the first viewport of the selected-node panel on both mobile and the desktop right rail.

The first handoff action now names its real destination as `Topology` / `관계 지도` and describes it as selected-concept focus. This keeps the selected-node workbench from suggesting another browse view when the control actually opens the relation map focused on the current concept.

The proof packet action now shows a compact four-step proof ladder before the copy button: Profile, Impact, Guard, Sync. It gives the selected concept a visible agent run order without expanding the dense packet body into the default panel. The ladder mirrors the copied bundle's `node_profile`, incoming `blast_radius`, bounded path / relation guard, and post-change sync sequence, so the human UI and Claude Code / Codex handoff describe the same graph DB-style evidence path.

The ladder now carries a compact `Agent proof path` / `Agent 검증 경로` header with a `Claude/Codex MCP order` / `Claude/Codex MCP 순서` badge. This labels the four copy cells as an agent execution sequence rather than generic shortcuts, making the selected concept read as a graph-proof workbench surface from the first viewport.

The agent run-order cue stays in the header badge instead of adding another line. That preserves the first-viewport peek of direct relation evidence while still telling the user these cells are the MCP execution order an agent should follow when it receives the selected concept.

The proof path now names the graph DB primitive behind every step: `node_profile`, `blast_radius`, `all_paths + check`, and `health`. The guard label intentionally includes bounded path evidence, because the copied payload pairs a `query_plan(all_paths)` call with the `relation_check` preflight.

Those primitive names are now the visible cell labels in the first-viewport ladder, not only hidden title text. The guard cell uses the compact visible label `all_paths` while keeping `all_paths + check` in the accessible copy, so the default screen makes the Claude/Codex graph DB execution path explicit without truncating the mobile card.

Each proof cell now keeps a short human cue in the same compact header as the sequence number (`01 Read`, `02 Impact`, `03 Guard`, `04 Sync`) while the lower line names the executable primitive. The full step name stays in the accessible copy. This keeps the ladder readable for both reviewers and Claude/Codex handoff without truncating the narrow mobile cards or adding another row.

Each proof-step cell now shows a small clipboard affordance before it is copied, then swaps that glyph for the success check mark after the copy lands. The visual language stays in one location, so the user sees both the available action and the completed state without reading the global toast.

The proof-step cells and the full proof packet button also use a short active press state: hover lift returns to rest while the border and fill tighten. This keeps the proof path feeling like a real control surface rather than static metadata, while preserving the reduced-motion escape hatch already used by the selected-node sheet.

Each proof ladder step is also a quick-copy action. Profile copies the selected node's MCP `node_profile`, Impact copies the incoming `blast_radius`, Guard copies the bounded `all_paths` query plan plus `relation_check` placeholder, and Sync copies the shared post-change sync gate. The full packet remains available below the ladder, but Claude Code / Codex can now start with a focused read, impact trace, write guard, or closeout gate without copying the entire bundle.

Successful proof-step copies now leave inline feedback on the exact ladder cell: the step changes to `Copied` / `복사됨`, gains a check mark, and briefly switches to the success tone. This keeps the user's attention on the selected concept instead of forcing them to look away to the global toast to confirm which graph proof was copied.

The full selected-node proof packet now follows the same direct-manipulation rule. After a successful copy, the primary packet button changes to `Proof packet copied` / `검증 묶음 복사됨`, swaps the clipboard for a check mark, and uses the success tone in place. The button still emits the existing toast, but the visual confirmation stays anchored to the action the user just took.

Long selected-node summaries are clamped by default with a small show-more action. This keeps Browse / Write / Query and the proof ladder in the first mobile panel view while preserving the full source summary when a reviewer needs to read it before changing vocabulary or frontmatter.

The selected-node panel uses the shared sheet spring motion on mount and close. It enters with a short opacity / vertical-offset / micro-scale transition, so selecting a concept feels like opening a focused work surface rather than a static overlay. The motion runs through the app-level reduced-motion provider, keeping the interaction polished without bypassing accessibility preferences.

For source-backed ontology nodes, the copied brief and review disclosure also include read-first agent checks: an MCP `node_profile` payload and a CLI `oh-my-ontology node ... --limit 8` fallback. It also exposes dedicated incoming impact checks, `query_ontology({ operation: "blast_radius", depth: 2, direction: "incoming" })` and `oh-my-ontology blast-radius ... --depth 2 --direction incoming`, so a planner or domain reviewer can ask Claude Code / Codex who depends on the concept before changing vocabulary, scope, or frontmatter. The visible detail panel keeps the direct relation preview and Browse / Write / Query rail immediately available, while the longer collaborator brief and agent checks sit behind `Review lens · agent checks`; this reduces default visual load without removing the agent handoff. The disclosure also exposes the shared post-change ontology sync gate as its own copy action, using the same 14-check runtime graph DB gate plus `health`, `cycles`, `growth_plan`, `maintenance_plan`, and `validate_vault` packet as agent setup, insights, topology health, and builder relation writes.
