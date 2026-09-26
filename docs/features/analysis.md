---
title: Analysis
doc_type: feature
status: current
area: analysis
routes: [/ontology/insights]
---

# Analysis

### `/ontology/insights` — Analysis (a brief, then one subject at a time)

The destination first paints its title and an accessible “Preparing analysis”
state, then loads and mounts the analysis workbench. Navigation remains available
while the analysis code loads. This is a visible loading boundary, not a worker
that moves graph derivation off the main thread.

**Two levels, two kinds of control** (2026-09-19). The first row names the subject the screen
is about — Brief (all of them) · Concepts · Wiki · Guidance — and wears a `SegmentedControl`,
because a subject is a mode. The ontology's own questions sit under it in a `TabBar`, because
they are sections of one subject, and that second row exists only for Concepts: Wiki, Guidance
and the Brief are single views. Two identical tab rows stacked on one screen is a named
anti-pattern (Nielsen Norman, "Tabs, Used Right") and it was the first thing a reader tripped
on. The subjects are also named so they never repeat the rail's destinations (Map, Library,
Harness): no product researched disambiguates the same label by depth alone.

The ontology's numbers derive from the data source the page already used
(`useOntologyInsight`, `entities/knowledge-graph/lib/ontology-tree`) — no separate persona or
store layer. **One tab answers one question**: the old `Structure` tab stacked three different
questions and grew to 2.2× the 14-inch viewport, so it was split into Inventory / Relations /
Domain boundaries. Scroll contract: every tab stays ≤ 1.3× viewport.

#### Tab 0 — Brief (default, 2026-09-19)
- **What in your understanding has to change**, across the three cores and agent activity, measured from the reader's last visit to this vault (browser storage, never the folder; the last seven days on a first visit; "Seen up to here" moves the anchor and the sentence changes in the same frame). One band of counts and one list of lines (2026-09-23, owner-selected direction C): the band gives each core its name, magnitude and three counts in its own words, or a two-word state where this session cannot count it; the list under it carries every line from every core ordered stale, unknown, happened, each with its state mark, core name, one sentence and one door. A core that cannot count adds one unmarked row saying why and where to go, and the app-only reason is one row with the one "Get the app". "Seen up to here" folds the lines it cleared on the shared row disclosure and lets band numbers count to their new value; reduced motion changes in one frame. Measured on the hosted sample at 1512x900: blank first-viewport rows 55% to 46%, dashes 8 to 0, "Get the app" 3 to 1.
- Below the list, one bounded list names what changed since the anchor — concept documents, wiki log entries, guide files, agent calls — newest first, with the rest counted.
- The heading states two sums of named lines — things to learn (stale) and things not checked (unknown) — never one score. Lines the builders rank: code moved under a concept, cited code gone, agent-written and unreviewed, names not held; pages whose source changed, disagreements the last check found, sources not written up, orphan pages, dangling links, pages written or rewritten since; areas no guide reaches / no rule gates / no check watches, mirror drift, guide files changed since; calls, writes, agents since. `lib/brief/*` are pure builders with tests; `use-insights-brief.ts` feeds them from the readers the Library, Harness and Agents screens already use.
- **Honest about where it stands.** A browser cannot read the code beside a vault or its dot folders, so ontology evidence and harness coverage read "measured in the app" **there only**; inside the app the same cards say they are reading the folder, or that they could not read it, rather than offering the app to someone already in it. One bounded Git walk (`git_paths_last_change`, mirrored for agents by `collectPathLastChanges`) dates every cited `path:` and every concept document. `mcp/src/evidence-verdict.mjs` owns the single verdict and its priority — a cited path that is gone outranks a file that moved, a moved file outranks anything undated, and a moved folder is never stale because a folder changes on almost any commit — and `tests/contract/evidence-drift-parity.contract.test.ts` runs one fixture through the screen's resolver and the server's. That walk also supplies each concept document's own date: a checkout stamps every file with the moment it landed, so the file date alone reported all 106 concepts as changed this week in a fresh worktree. Measured on this repository's vault in the installed app: 106 concepts, 36 current, 21 stale, 49 unknown (all folder-only).
- **A line hands its work on.** The drift line offers one request naming the same concepts, files and dates it shows, capped at five with the remainder stated; it asks for a judgement and a proposed sentence and never for a vault write, seats itself in the tab's own ACP conversation without sending, and is copyable where no agent can be launched. The agent card leads with what a person decided rather than what ran: writes allowed and unfinished, writes that failed, then calls, writes and refusals. A core with nothing to count says what would fill it and opens that screen. Decisions: `docs/records/decisions/2026-09-19-analysis-brief-across-three-cores-*.md` and `2026-09-19-drift-line-names-its-evidence-*.md`.
- The census strip below does not draw on this tab: its numbers are the cards' magnitudes. The
  ontology card counts what that strip counts — every node but the vault readme, through the
  shared `isCanonicalConcept` — because both are labelled with the same word and sat one click
  apart reading 124 and 125 (2026-09-20).
- **A destination on this same board answers in place.** Half of these lines open another question
  here, and the board keeps its tab in component state, so a plain link changed the address and
  left the reader on the brief: the landing's only "go fix it" action did nothing. They stay real
  links, for the address, a modified click and assistive technology, and the plain click is
  answered by the same call the controls use (`DestinationLink`, `parseInsightsTabHref`). Starting
  a review keeps `?tab=` too, so leaving for a source document and coming back returns to the
  question rather than to the brief.
- "Seen up to here" says so: the confirmation sits beside the button in a live region, because
  moving the anchor changes one 12px line on a screen where every other number may legitimately
  stay the same. The button stays enabled, since pressing it again re-anchors to now.

#### Census strip (the Concepts subject only, 2026-09-06)
- Four equal-height tiles above the tab bar (`InsightsCensusStrip`): concepts (kind chips and the share held by a domain), relations (top types, the hidden remainder named, density), health (the verdict in words, blocking and advisory counts, orphans · islands · cycles), and the last 12 weeks (hairline bars from `weeklyTotals`, a quiet week drawn as a baseline tick). It replaced the corner census line, the audience banner, the Composition hero and the Freshness aggregate trend, which all counted the same folder. Decision: `docs/DECISIONS.md` 2026-09-06.
#### Header
- Title + subtitle
- `SegmentedControl` — Brief (default) · Concepts · Wiki · Guidance. `TabBar` under it, for Concepts only — To fix / Missing concepts / Inventory / Relations / Domain boundaries / Accumulation / Product flow. Tab state stays in `?tab=`; the default omits it, so `/ontology/insights/` is the brief, the to-do list is `?tab=do-next` and the two single-view subjects are `?tab=library` and `?tab=harness`. Choosing Concepts lands on its first question rather than an empty shelf. The first four question badges count what their tabs are about (verdict total / nodes / edges / cross-domain relations); Accumulation and Product flow leave the slot empty because neither has an honest single count. Legacy `?tab=structure|overview` → Inventory, `?tab=relations` → Relations, `?tab=freshness` → Accumulation, so bookmarks and agent return-chip links stay alive. The census strip and the ontology handoff row draw on the Concepts subject only: four ontology numbers above a screen about the wiki is the confusion the first row exists to end.

#### Wiki (single view)
- Without sources or pages, a labelled example shows the source → wiki page →
  checks sequence. Selecting a stage reveals setup guidance and a Library link;
  it does not start a job or create example data. Source changes request review,
  rather than asserting that the page's meaning is wrong.
- The same model the Library screen renders from (`useLibraryModel`, the rounds ledger), read for the questions a person arrives at Analysis with: pages whose cited source changed underneath, sources nobody has written up, what the format check flagged (blocking kinds first, advisory after, each naming its pages), and what the unattended passes did. Every row opens `/library` to act; nothing is written here and no list is a second copy of a store.

#### Guidance (single view)
- Measured Guidance starts with an unboxed domain diagram. Instructions, Hooks,
  and Checks & workflows keep fixed positions and exact scoped declaration
  counts; only nonzero attributions have connections. Diagram and Text read the
  same complete population, including domains beyond eight, inside one bounded
  scrolling work area. Neither view is a score or an execution graph.
- Selecting a role opens one anchored evidence popup on desktop or one dialog
  on narrow screens. It shows the domain purpose, complete source identities,
  extracted scope and canonically matched capability entrypoints. An empty
  extraction is explicit, not an invented wildcard. Changing reading mode
  dismisses the old popup; an anchor that leaves view closes it without sending
  focus offscreen or resetting the reader's scroll position.
- Compact actions expose separately counted declarations by role, scoped
  declarations outside the recorded domain mapping, capability entrypoints not
  reached by path-scoped instructions, and all guidance/configuration findings.
  These are distinct populations, not one combined total. Separate declarations
  have no extracted scope or reach every recorded domain; this is not proof of
  applicability to every repository path. Discovered test files remain separate
  from check declarations and executed results.
- Findings retain their complete paths and messages on request. Independent
  Codex/Claude instruction differences may be informational and do not require
  identical harnesses. The full Harness destination remains available; inspecting
  these lists neither edits the vault nor accepts meaning.
- Unavailable measurements retain their actual state: browser-only access,
  reading, failed reading, or inability to identify one bound code repository
  (including absent or ambiguous bindings). A labelled example connects a code
  area to instructions, gates and checks; selecting a role explains its setup
  and opens the existing Harness destination. Examples contain no measured
  counts or execution verdicts. The native app never offers its own download.

#### Tab 1 — Do next
- **One row per finding group** (2026-09-06, `lib/do-next-groups.ts`): name · count · disclosure, five rows per opened group with its own "N more"; the first group starts open so the most urgent files are named without a click. Group counts are the verdict's own signal counts re-keyed and `tests/contract/do-next-group-sum.contract.test.ts` pins their sum to the title count. The badge is the single verdict model (`insights-verdict`) shared with the body. The picks band and the readiness gauge are gone.
- **Fix these together** (containment only): a blocking sheet lists one row per proposed write naming the domain document and the key, all ticked and untickable; the plan (members, mtime) freezes when the sheet opens, each row's justification is re-checked at Apply, and a file changed since or a concept whose domain moved is skipped and named rather than written. Writes go through `updateFrontmatter` with `expectedMtime`, one document at a time.
- **「First My Share」 two work groups** — the queue is split by the *nature of the work*, not by who you are. **Meaning work / You can fix these right now** (meaning: missing definition · missing area · similar names · promotion candidates — answered by product knowledge) and **Code work / Hand these to a developer or an AI** (neglected hubs · unlinked concepts · dependency cycles — answered by reading the implementation or a dependency direction). With your own folder open the meaning group is **first on screen**, so "83 items, none of them mine" becomes "N mine + M to hand off". Same data, only the order is in human language. Group headings render only when that group has visible rows.
- **Session-ability translation, not role gating** — there are no accounts (local-first, permanent). Three facts the app already knows drive the row actions: ① can this session write to the vault ② has an agent been observed in this folder (heartbeat) ③ does this concept own a document (`hasOwnDocument`). Read-only sample → 「Edit in Workshop」 becomes 「View in Workshop」 plus a copyable command, and the group order flips (hand-off work first, since hand-off is the only completion this session has). No agent observed → 「Verify as Agent」 becomes 「Copy Handoff Command」. **No greyed-out disabled buttons** — a disabled control that does not say why is the same dead end.
- **One-sentence inline write / inline one-field write** (`MeaningGapSection`) — rows for **Meaning not specified** (no `description` *and* no body prose) and **Area not specified** (capability/element with no `domain:`) expand in place: a one-line input, or area chips built from the domains that actually exist in the vault. No new route, no modal, no trip to the workshop. Safety contract: the confirm line names the exact file and key before you press ("File to fix `capabilities/pay.md` · This sentence is in the description"), **cancel changes 0 files** (and a second press is required when you have typed something), the save locks in the pressed frame so double-clicks write once, and `expected_mtime` means a concurrent human/agent edit is never silently overwritten — the row says so and reloads, and the retry merges (their keys survive, only this one line is added). The write target is `resolveNodeDocument(node).ownSlug` — the same single source of truth the workshop uses, so a concept without its own document never gets someone else's file written to.
- **The queue hears what the agent hears** (2026-09-22) — each manifest records the five portable meaning findings per node (`VaultDoc.meaningFindings`, from `src/shared/lib/meaning-findings.ts` on both the local and the build-time path), so «Meaning not specified» is now `validate_vault`'s own `definition-missing` rather than «no excerpt», and four advisory sections join it: no boundary written, no unknown recorded, an exclusion that is really a limit of the reading, and a document outside its kind folder — one row per node, each opening that node.
- **Similar names — are they the same?** (duplicate suspects) — concept pairs whose names/slug/kind/domain/neighbours overlap heavily, top 3 with the shared words as evidence, the overlap percent, a map deeplink to the node worth keeping, and a per-pair `merge_concepts` dry-run handoff. The score is a mirror of the MCP engine's `similar_nodes`, locked by `tests/contract/duplicate-pairs.contract.test.ts`, so screen and agent never name a different pair. Only nodes that own a vault document are considered (a node born from another doc's `elements:` ref has no file to merge). **0 suspects renders no section** — an empty "no duplicates" card is ink without a decision.
- Queue sections show 3 rows each plus their total; the rest is the agent handoff's job (scroll contract).

#### Tab 2 — Inventory
- **Kind census** card — kind → glyph + bar + count, tallest bar highlighted
- **Domain capacity** card — domain → bar (capability/element sub-counts), hidden when there are no domains

#### Tab 3 — Relations
- **Relation breakdown** — every edge type as a bar row with a `OntologyMapTraceMark` (solid=containment, dashed=depends/relates) + count + percent of total; empty vault gets a "connect them on the map" hint
- **Hubs** — top nodes by degree: kind glyph + title + relative bar + degree, map deeplink per row, "top N / M total" folded into the single footnote line

#### Tab 4 — Domain boundaries
- **Domain coupling** — a domain×domain **heat grid** (rows send, columns receive; the diagonal is inside-one-domain connections in neutral). Cell shade is a 4-step indigo alpha ladder and every non-zero cell keeps its number, so the card never speaks in colour alone. Picking a cell opens that pair's relation-type counts and real example edges (map deeplinks) in a slot that is reserved whether or not anything is selected. Top 6 domains by cross activity; beyond that the footnote says "top N of M domains" and how many cross links fall outside the grid. Same `computeDomainCouplingMatrix` output as MCP `domain_matrix` — no new calculation.
- **Boundary pressure** — per-domain inside vs cross ratio; a high cross share signals a leaking boundary
- Cold start (fewer than 2 domains or no cross edges) shows one explicit empty state **with a next step** (map editor link) instead of a misleading table

#### Tab 5 — Accumulation (formerly Growth, and Freshness before that; `?tab=growth|freshness` still land here)
- **What the folder holds, and how it got there** (2026-09-09, `VaultHistorySection`) — the tab opens with the folder's present: four layers (concepts, architecture, wiki pages, raw sources) each drawn as a bounded pile of blocks that assembles itself row by row over a fixed 600ms, whatever the folder's size. **The pile is a fixed size and the block carries a stated quantity** — the largest layer fills 36 blocks and every other layer is drawn against the same block, so a folder of forty and a folder of forty thousand produce the same picture and only the sentence under it ("one block = N files") changes. Magnitude is the numeral under each pile; the pile carries accumulation and proportion. A layer at a true zero keeps a dashed rule, so "none" and "not counted" never look alike. The present needs neither Git nor timestamps, so it draws everywhere.
- **Week by week, where Git can say so** — on the installed app the same four layers also draw as weekly tracks, replayed backwards from the folder's own Git history (`git log --name-status`, 1500-commit window) and held only while the screen is open; nothing is stored, and a rules version is stamped so an old picture is never redrawn by new counting rules. Never a stacked area and never a blended total: on this repository concepts fell 107 → 71 while documents rose, the comparison a moving baseline destroys. Under the chart, in words, the two facts a forty-pixel column cannot state: the week a layer began and the week it grew most. Four states — a browser has no Git bridge, a folder may have no commits, a read can fail, and each says which rather than drawing zeroes. Reduced motion draws both figures finished on the first frame with no schedule. Decisions: `docs/DECISIONS.md` 2026-09-09.
- **Domain freshness heatstrip** — one row per domain, a week-by-week heat strip (neutral ramp, current week in indigo) built from real vault `updatedAt` values (`FRESHNESS_WINDOW_WEEKS`); domains with no dated docs are excluded from the stale count rather than counted as stale ("unknown" ≠ "old"); stale domains get a dashed "stale" tag
- **Recent updates** — most recently touched nodes with kind glyph, domain, and ISO date; footer shows total stale-domain count

#### Tab 6 — Product flow
- Answers “what is this product and how does it move?” with an agent-written narrative rather than an invented graph score.
- **The writing is the body, and it is kept.** Every completed analysis turn is already recorded beside the vault (`.ontology-atlas/analyses/`), so the tab reads those back as versions: the latest explanation in full, when it was written and by which runtime, whether the folder has moved since (`compareAnalysisBasis`), and — against the previous writing — which scenes were added, removed or rewritten, compared by heading rather than by word so a rewrite is never read as a change of meaning. The request that produces it folds away behind a summary instead of being the page, and a folder with no writing yet says what would fill it. `lib/flow-history.ts` owns both selections and is tested.
- Analysis owns one ACP dock outside the keyed tab panel. Every tab can explicitly seat its own read-only question in that one conversation; merely switching tabs never sends, replaces a draft, changes the request origin, or starts another session. Replacing a non-empty draft requires a second explicit action.
- Shows the exact Flow request before handoff. In the installed app, **Explain the flow with ACP** opens that Analysis-owned dock and prefills the composer without sending; the person still owns Send and stays on Analysis.
- In the browser or built-in sample, where no local agent process can be launched, the same request remains visible and copyable instead of presenting a dead control.
- The request asks the agent for exactly six `###` scenes over one representative meaning-to-implementation chain. It permits only Atlas MCP reads, caps full-body reads at 12 concepts, requires at least one exact fully-read slug per scene, and preserves `partial`, `visible-gap`, `unknown`, `stale`, and `unverified` limits.
- A completed answer offers **Present this answer** only for the exact app-authored Flow request sent in the current turn. Each scene needs at least one `body: full` anchor from that turn; only fully read anchors become evidence badges. Mentioned neighbours are not promoted to read evidence. The tool audit accepts matching Claude and Codex Atlas envelopes, and written typed relations must match the loaded graph, including kind-checked containment aliases. Missing anchors, foreign tools, invented relations, and out-of-range scene counts fail closed.
- Presentation is an ephemeral projection inside the Analysis ACP dock, not another result record or route. Back/Next changes only the current scene; citations remain visible evidence, and **Follow on the map** is a separate explicit action. Limited scenes use an explicit label and dashed amber boundary; **Ask about this scene** only prefills a follow-up. Nothing auto-sends, writes, or persists, and restored chat history does not recreate a presentation.

#### Bottom handoff row (`InsightsHandoffRow`)
- One copyable `query_ontology(...)` chain per active tab — the tab's question translated into the agent's execution order (connections → `centrality` then `blast_radius`; boundaries → `domain_matrix` then `match_edges`). It stays available in the browser and whenever the installed-app ACP dock is closed; the open dock replaces rather than duplicates it.

Empty state (0 nodes): link to `/docs` (open vault).
