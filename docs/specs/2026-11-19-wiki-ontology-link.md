---
title: Link wiki pages to concepts on the map
doc_type: spec
status: draft
area: library
date: 2026-11-19
decisions: []
---

# Link wiki pages to concepts on the map

## Person and moment

A developer who already uses a coding agent keeps one `atlas/` folder. It holds a code map (`kind:` nodes) and an LLM wiki (`sources/` → `wiki/`). Their agent has written pages for hundreds of their documents, and they open Library › Sources. There, the source-progress band says how many documents have a wiki page (`docs/specs/2026-11-19-source-progress.md`). Next they want to know how many of those documents reached the map, and, starting from a concept, which documents say what it is.

The owner said on 2026-11-19, translated: "The LLM wiki and the ontology are separate for now. To connect them seamlessly later, we may need a plan for what anchor or reference point to give them. Maybe have the MCP define a format, or link this through vectors too."

Nobody has captured this moment on a real folder, so acceptance criterion 1 captures it first.

## Today

- **Only `kind:` files are graph nodes.** A vault holds three kinds of file, and only the `kind:` files are the graph (`docs/DECISIONS.md:878-885`; spec §11, `docs/ONTOLOGY-ATLAS-SPEC.md:770-786`).
- **Linking a page to concepts is gated on review.**
  - A wiki page may list ontology slugs in `describes:`, but this is "allowed only on a `reviewed` page" (`ONTOLOGY-ATLAS-SPEC.md:802`).
  - On a draft page the validators report `describes-needs-approval`, and "a compiler does not" raise the status (`:817-819`, `:874`).
  - Both validators carry this code (`mcp/src/library/wiki-schema.mjs:295-308`; `src/shared/lib/library/wiki-page-schema.ts:311-322`). It is blocking: only `orphan-page` and `shared-source-unlinked` are advisory (`wiki-schema.mjs:32`).
- **The gate has no decision record of its own.** It shipped in #1452 (commit `cf6361a7b`, 2026-09-06) under the 2026-09-05 record.
  - The Propose turn "is not" to set `describes:` (`docs/DECISIONS.md:716-723`).
  - Record `5e2f4838` lets a round write no `describes:`; `FORBIDDEN_KEYS` enforces it (`src/features/library-rounds/model/round-draft-problem.ts:6`).
- **Nothing opens the gate.** No screen raises a page to `reviewed`; the app only displays the status (`src/views/library/lib/wiki/writer-label.ts:30`). The Compile brief never mentions `describes` (`src/features/library/lib/wiki/compile/compile-brief.ts`).
- **The Library graph draws two kinds of line, and neither is `describes:`.** It draws `cites` from `sources:`, and `mentions` from page-body `[[slug]]` links and concept-body `[[wiki/…]]` links (`src/widgets/library-graph/model/build-library-graph.ts:9-19, 181-222`). It never reads `describes:`.
  - `LibraryWikiPage` has no concept field (`src/entities/docs-vault/lib/library/vault-library.ts`).
  - The map's panels name no wiki page.
- **Addressing.**
  - Markdown relations address nodes by slug (`ONTOLOGY-ATLAS-SPEC.md:358-361`).
  - The frontmatter `slug:` is the address a reader trusts (`:362-366`).
  - `uid` is the permanent identity (`:351-357`).
  - `describes` is a graph array key (`mcp/src/schema.mjs:448`), and its reverse is a backlink only (`ONTOLOGY-ATLAS-SPEC.md:414`).
- **Rename and merge already reach wiki pages.**
  - The MCP walks every `.md` file outside `sources/` (`mcp/src/vault/documents/slug-paths.mjs:36`).
  - `redirectBacklinks` rewrites every array key and every `relation_notes` key on every document (`mcp/src/vault/writes/backlink-rewrite.mjs:59-140`).
  - Merge uses that rewrite (`mcp/src/server/tool-definitions/lifecycle.mjs:125`).
  - The app's rename rewrites `describes` (`src/entities/docs-vault/lib/authoring/rename-ref-rewrites.ts:17-28`).
  - `findBacklinks` returns non-node referrers with `isNode: false` (`mcp/src/vault/graph/graph-queries.mjs:179-215`).
  - `delete_concept` previews backlinks before it deletes (`lifecycle.mjs:189-199`).
  - None of this has been exercised on a wiki fixture yet.
- **No MCP tool writes a wiki page.**
  - `add_relation` refuses an endpoint that is not a node (`mcp/src/tools/writes/write-relations.mjs:117-120`).
  - Pages are written as files, and the app judges each write with `judgePageWrite` → `validateWikiPage` (`src/features/library/lib/wiki/judge-page-write.ts:69-81`).
- **Standing rules.**
  - Record `0f78a22b` (2026-11-18): agents write meaning in one run, without waiting for a yes.
  - The server never writes `reviewed_by`, `reviewed_at` or `reviewed_digest` (`docs/DECISIONS.md:1202`).
- **Vectors.**
  - Search by meaning keeps passage vectors in the app's derived index, which only the app opens (`docs/specs/2026-11-19-search-by-meaning.md`).
  - A store that only machines read "loses in automation scale competition" (`docs/PRODUCT-DIRECTION.md:93`).

## Problem and alternatives

The field exists, but three things are missing:
- the gate can only be opened by a person, and no screen lets them open it;
- no writer is told to write the field;
- nothing reads the field to count it or draw it.

So the progress band cannot count source → page → concept, and a concept cannot name its documents.

**Anchor options.**

| Option | Value | Cost | Verdict |
|---|---|---|---|
| A. Status quo: body `[[slug]]` mentions | nothing to build | a passing mention is not "about", and cannot be counted | lost |
| B. `describes:` slugs on the page, with `relation_notes` | already in spec §5/§11; rename and merge already rewrite it; one file changes per link | the gate must be lifted | **chosen** |
| C. `documented_by:` / `sources:`+hashes on the concept | the map reads it directly | rewrites meaning files on every Compile; a hub concept holds thousands of entries; a second copy of provenance that drifts | lost |
| D. Both B and C | — | two truths that drift; spec §5 already makes the reverse a backlink | lost |
| E. UIDs in `describes:` | survives a hand edit of `slug:` | every relation reader gains a second reference type; unreadable to a person | lost; see Later 7 |
| F. Vector similarity as the link | no writes | model-dependent, rebuildable, app-only, not in Git; similar is not "about" | lost |
| G. Pages become `kind: document` nodes | the map draws them | breaks the 2026-09-05 record; 50k nodes on the map | lost |

**Who writes the link.** A page-file write wins over a new MCP tool or an extended `add_relation`.
- Every writer already writes pages as files, and the app's judge already checks each write. A second write path for the same files would split that check.
- The MCP owns the format: `wiki-schema.mjs` is canonical, the TypeScript copy mirrors it, one contract table runs both, and `validate_wiki` reports problems.
- A batch tool for terminal agents is Later 5.

**Role of vectors.** Vectors only rank candidate concepts for the agent, one batch at a time.
- They live in memory and are never written to a file.
- `provenance: suggested` lost: at 50k pages it would put about 250k unconfirmed, model-dependent lines into Git, and would make derived data canonical.
- No person approves a link first (record `0f78a22b`). The agent confirms each link by reading the page and writes a reason. The person sees every link and can remove it, and Git keeps every version.

**Rules overturned, narrowed and kept.**
- Overturned: the "only on a reviewed page" clause and `describes-needs-approval`.
- Kept:
  - the 2026-09-05 record (a page never gets `kind:` and never becomes a node);
  - `status` as the person's mark, which no writer raises;
  - the 2026-09-02 reserved review keys;
  - the Propose record (`DECISIONS.md:716`).
- Narrowed: record `5e2f4838`. A round may carry a page's existing `describes:` and `relation_notes` unchanged, but may not add or change them.

**Falsifier.** Any one of these reverses the decision:
- in the owner's walk, more than 10% of agent-written links are wrong;
- a link to a missing concept survives a rename or merge made through Atlas;
- a person cannot see on the page which concepts it claims.

If the first fires, links become suggestions a person presses (Later 3).

## Flow

1. When the person opens Library › Sources in a folder with at least one `kind:` node and one wiki page, Atlas shows a second band line under the first: `progress.mapLine`, a 4 px bar, and the secondary press `progress.link` under Continue.
2. When the person presses it, Atlas sends one request to the current coding agent, naming the next 20 pages in the link queue.
   - **Queue order:**
     1. pages with a broken link;
     2. pages without `describes:`, ordered by the first source each cites;
     3. pages that cite no source.
     
     Pages under `wiki/answers/` are left out.
   - **Candidates:**
     - When search by meaning is prepared, each page carries at most 5 candidate concepts ranked by meaning (slug, title, definition sentence).
     - Without it, the brief points the agent to Atlas `list_concepts({mentions})`.
   - **While it runs:** the press reads `progress.linking`, and `progress.linkRest` names the rest. Stop in the agent dock works.
3. The agent edits each page's frontmatter in one of two ways:
   - it writes up to 5 slugs the page's Summary is about, each with a one-sentence reason in `relation_notes`;
   - it writes `describes: []` when no concept fits.
   
   A page that fits is saved without a card. A slug that names no concept fails `describes-target-missing`, and the write gets the existing card with that verdict.
4. As pages land, three things update:
   - line 2 counts on from its drawn value;
   - the Library graph draws a plain line from page to concept;
   - the page header shows `wiki.about.label`, with one chip per concept.
5. When the turn ends with some pages unchanged, Atlas shows `progress.linkReturned`, and those pages go last for this session.
6. **The agent was wrong.** When the person sees a chip for a concept the page is not about, they press its remove control.
   - Atlas deletes that slug and its note from the page, keeping its mtime guard.
   - Atlas shows `wiki.about.removed` with `wiki.undo`.
   - Line 2 drops only if no other page keeps that source on the map.
7. **The evidence goes missing.** When a concept is deleted, or its `slug:` is edited by hand:
   - the page reports `describes-target-missing`;
   - its chip reads `wiki.about.missing`;
   - its sources move to "link broken";
   - the next press offers that page first.
   
   When a concept is renamed or merged through Atlas, the page is rewritten in the same apply, so nothing breaks.

## Format and MCP contract

**Spec §11.1 rows.**
- `describes` (not required): the slugs of the `kind:` nodes this page is about, meaning nodes without which its Summary would be wrong. Allowed at any `status`. An empty list records that a writer checked and found none.
- `relation_notes` (not required): `{ <slug in describes>: "one sentence" }`.

The rule "a person raises `status`; no writer raises it" stays.

```md
status: draft
describes:
  - capabilities/session-token-issue
  - elements/jwt-signer
relation_notes:
  capabilities/session-token-issue: "Facts 1-3 state when a token is issued and revoked."
  elements/jwt-signer: "Fact 4 names the signer and its key rotation."
```

**Spec §11.4.** `describes-needs-approval` is removed. `describes-target-missing` is added as a blocking page code: an entry names no `kind:` node in the folder.
- It covers a missing slug, an ambiguous tail, a wiki page and the vault README.
- Entries resolve the way `find_backlinks` resolves them (full slug, unique tail, `slug:` alias), after NFC normalisation.
- A caller that passes no node list skips the check. `validate_wiki`, `wiki-validate` and the app's write judge always pass one.
- Adding an error needs a version step in §8 (v2.1-rc) and a change record.

**Public MCP surface.** Only `validate_wiki` changes: its code list and its `byCode` keys. No tool is added. This is a one-way change, so it needs one decision record and one `reviewer`. The documents that own it are spec §11, `mcp/README.md` and `docs/.generated/mcp-surface.json`.

**Map states.** Line 2 judges each source by one of four states, taking the highest that applies. It judges only sources in state `compiled`, and uses the pages whose whole, hash-matching citation makes them compiled.
1. `onMap`: one of those pages has an entry that resolves.
2. `linkBroken`: a page has entries, and none of them resolves.
3. `notLinked`: a page has no `describes:`.
4. `noConcept`: every page has `describes: []`.

Line 2's total is line 1's total, so line 2 can never exceed line 1.

## States

| State | Web | macOS app |
|---|---|---|
| Folder has no `kind:` node | no line 2 | same |
| No source on the map | `progress.mapFirst`; press disabled with `wiki.linkWebLimit` + Get the app | `progress.mapFirst` + `progress.link` |
| Partial | line, bar, map-state filters; press disabled | all of it + `progress.link` |
| No coding agent | not applicable | press disabled with `progress.linkNeedsAgent` and the agent door |
| Batch running | not applicable | `progress.linking` + `progress.linkRest`; Stop in the dock |
| Batch returned short | not applicable | `progress.linkReturned` |
| Link broken | `sources.mapState.linkBroken`; page problem `wiki.problem.describes-target-missing`; chip `wiki.about.missing` | same |
| Checked, none fits | `sources.mapState.noConcept`; header `wiki.about.none` | same |
| Remove a link | chip remove → `wiki.about.removed` + `wiki.undo` | same |
| Remove collides with an edit | `wiki.about.conflict`; page unchanged | same |
| Queue empty | `progress.mapAllDone` | same |
| Search by meaning not prepared | Out of scope: there is no index on the web | brief carries no candidates; nothing new on screen |
| 50k sources, 50k pages, 5k concepts | criterion 5 | criterion 5 |

## Copy

Keys go in `messages/<locale>/library.json`. `wiki.undo` is reused. `wiki.problem.describes-needs-approval.*` and `report.rule.describes-needs-approval` are removed.

| Key | Where it appears | English |
|---|---|---|
| `progress.mapLine` | band line 2 | {count, number} of {total, number} sources reach a concept on the map |
| `progress.mapFirst` | band line 2 | No source reaches a concept on the map yet |
| `progress.mapAria` | line 2 bar | Sources whose wiki page is linked to a concept on the map |
| `progress.link` | band press | {count, plural, =1 {Link the last page to the map} other {Link the next # pages to the map}} |
| `progress.linking` | band press, running | Linking {count, plural, one {# page} other {# pages}} to the map |
| `progress.linkRest` | under the press | {count, plural, one {# more page waits after these.} other {# more pages wait after these.}} |
| `progress.linkReturned` | under the press | {count, plural, one {# page from the last request is still not linked and moved to the end of the list.} other {# pages from the last request are still not linked and moved to the end of the list.}} |
| `progress.linkNeedsAgent` | disabled press | Linking pages to the map needs a coding agent on this computer. Set one up in Agents. |
| `progress.mapAllDone` | band line 2 | Every wiki page is linked to the map or checked |
| `sources.mapState.onMap.label` | filter, row | on the map |
| `sources.mapState.notLinked.label` | filter, row | not linked |
| `sources.mapState.notLinked.hint` | row tooltip | Its wiki page names no concept on the map yet. Link the next pages to the map to have an agent read it. |
| `sources.mapState.linkBroken.label` | filter, row | link broken |
| `sources.mapState.linkBroken.hint` | row tooltip | Its wiki page names a concept that is no longer in this folder. Linking again replaces the name, or you can remove it from the page. |
| `sources.mapState.noConcept.label` | filter, row | no matching concept |
| `sources.mapState.noConcept.hint` | row tooltip | An agent read its wiki page and found no concept on the map that it describes. |
| `wiki.about.label` | page header | About on the map |
| `wiki.about.open` | chip | Open {name} on the map |
| `wiki.about.remove` | chip control | Remove the link to {name} |
| `wiki.about.removed` | toast | {page} no longer links to {name}. |
| `wiki.about.conflict` | toast | {page} changed on disk while the link to {name} was being removed, so nothing was removed. Try again. |
| `wiki.about.missing` | chip | {slug}: no concept with this name in this folder |
| `wiki.about.none` | page header | An agent checked this page and found no concept on the map that it describes. |
| `wiki.linkWebLimit` | disabled press, web | Linking pages to the map needs a coding agent running on this computer, which only the app can start. The counts and links here are read from your files. |
| `wiki.problem.describes-target-missing.what` | problem card | This page says it is about {target}, and this folder has no concept by that name. |
| `wiki.problem.describes-target-missing.do` | problem card | Remove that name from the page, or link the page again from Sources. |
| `report.rule.describes-target-missing` | check report | A linked concept is not here |
| `graph.counts` (changed) | graph caption | {sources, plural, one {# source} other {# sources}} · {pages, plural, one {# page} other {# pages}} · {concepts, plural, one {# concept} other {# concepts}} · {cites, number} cites · {about, number} about · {mentions, number} mentions |
| `graph.describe.page` (changed) | graph label | {name}: a wiki page. Thick lines lead to the sources it cites, plain lines to the concepts it is about, dashed lines to concepts it names. Press for a card beside it. |
| `graph.describe.concept` (changed) | graph label | {name}: a concept on the map. Plain lines lead to the wiki pages about it, dashed lines to pages that name it or that it was drawn from. Press for a card beside it. |

`graph.describeOpen.*` keeps these sentences and swaps the last one for "Its card is open beside it: Escape, or press again, closes it."

## Edge cases

- **Zero and one.** With no node there is no line 2, and with no page there is no band. One page and one concept counts 1 of N.
- **Largest measured.** Nothing has been measured yet. Criterion 5 builds 50k sources, 50k pages and 5k concepts, with 2 links per page on average.
- **Many links on one page.** A page linking 30 concepts wraps its chips. The validator does not cap the list; the brief caps it at 5.
- **One source, several pages.** A source cited by 4 pages is counted once.
- **Many pages, one concept.** A concept described by 1,000 pages is rewritten on rename in one all-or-nothing apply.
- **Hangul.** Slugs and entries are compared after NFC. Chips show Hangul titles, and reasons may be in Hangul.
- **Moved folder or file.** Slugs are relative to the vault, so moving the folder changes nothing. A concept file moved in Finder keeps its `slug:`, so nothing changes.
- **Unreadable page.** It parses to nothing, and its sources are judged without it.
- **Two edits at once.**
  - A chip removal racing an agent edit hits the mtime guard and shows `wiki.about.conflict`.
  - A concept renamed during a link turn may land with the old slug. That page then shows as link broken and is offered again first.
- **Offline.** Ranking is local. Only the agent turn leaves the computer, to the agent's own provider, and `wiki.transfer` discloses that.

## Out of scope

- The map's concept panel listing its pages (Later 1).
- Creating a concept for a page that no concept fits (Later 2).
- Links from the local-model route, because its tool catalogue cannot look concepts up (`compile-tool-catalog.ts:13`).
- Links written by rounds, because record `5e2f4838` keeps rounds from writing them.
- An MCP batch link tool (Later 5), and UIDs in `describes:` (Later 7).
- Retained answers under `wiki/answers/`.

## Acceptance criteria

1. **Capture.**
   - Given a fresh build installed outside `/Applications`, and a real folder with at least 200 sources that have pages and at least 30 concepts.
   - When the person presses the link press twice, removes one chip and presses Undo.
   - Then the recording shows line 2, the graph lines and the chips moving after each batch, with no reload. The removal drops line 2 by exactly the sources whose only on-map page it was, and Undo restores them.
   - The owner judges the 40 links written, and at most 4 are wrong.
2. **Format.**
   - Given the contract table with these rows:
     - a draft page with links;
     - `describes: []`;
     - a full slug, a unique tail and an alias;
     - an NFD Hangul slug;
     - a missing slug, an ambiguous tail, a wiki-page target and a vault-README target.
   - Then both validators return the same codes for every row, and only the last four fail, with `describes-target-missing`.
   - `describes-needs-approval` exists in neither module and in no catalogue.
   - A round that revises a page with its links unchanged is kept; a round that adds a link is undone.
3. **Rename, merge and delete.**
   - Given 3 pages describing `capabilities/login`, with notes.
   - `rename_concept` and the app's rename each leave 0 `describes-target-missing`, and rewrite the note keys.
   - `merge_concepts` points the pages at the survivor, with no duplicates.
   - The `delete_concept` dry run lists all 3 pages.
   - A forced delete makes all 3 report the code and show as link broken.
4. **Count honesty.**
   - Given a fixture where every state occurs, including a linked stale source and a linked partial source.
   - Line 2 equals the `onMap` count exactly, and the stale and partial sources do not count.
   - The four map states take precedence in the order listed.
   - The filters show exactly those rows, including with Hangul search text.
   - The web shows the same numbers, with the press disabled.
5. **Scale.**
   - Given 50k sources, 50k pages and 5k concepts.
   - Line 2 derives in at most 20 ms (median of 5), and retained heap grows by at most 3 MB.
   - `validate_wiki` with node resolution takes at most 1.15 times today's time.
   - Renaming a concept described by 1,000 pages takes at most 15 s and leaves 0 broken links.
   - The link brief is at most 48 KB.
   - The app's steady and peak footprint are reported.
6. **Bounded batch.**
   - Given 57 pages in the queue, 4 of them with broken links.
   - The brief names exactly 20 pages, broken ones first, and "37 more pages wait after these" shows.
   - When 3 pages come back unchanged, they go last, and the next press names 20 others.
7. **Vectors only suggest.**
   - Given search by meaning prepared.
   - Each page in the brief carries at most 5 ranked candidates.
   - Ranking 20 pages against 5k concepts takes at most 50 ms.
   - Every vault file is byte-identical after ranking.
   - Without vectors, the brief carries no candidates and names `list_concepts({mentions})`.
8. **Linking is not acceptance.**
   - Given a 20-page link turn.
   - The `list_concepts` census totals are unchanged, and no page's `status` changes.
   - No file other than those 20 pages changes.

## Risks

1. **Agents link loosely**, naming every concept a page mentions.
   - Probe: the 40-link judgement, plus `/ontology-field-trial` on 30 pages.
   - Design: "about" is defined by the Summary, a page gets at most 5 links, and every link needs a reason.
2. **Document folders have few matching concepts**, so "no matching concept" grows and reads as failure.
   - Probe: if more than 30% of pages end up with `describes: []`, Later 2 goes next.
3. **Rename at scale is slow, or the app's rename path misses wiki pages.**
   - Probe: criteria 3 and 5.
   - Design: broken links are counted, shown and offered first.

## Later

1. The map's concept panel lists "wiki pages about this", from backlinks. This goes next once a real folder is linked.
2. Propose a concept for pages that no concept fits, and link it in the same turn. This goes next if more than 30% of pages have no match.
3. Suggestions a person presses in the page header, with no agent. This goes next after vectors ship, or if the falsifier fires.
4. Links from the local-model route. This goes next when its tool catalogue gains a concept lookup.
5. An MCP batch link tool for terminal agents. This goes next when a terminal run is seen editing more than 100 page frontmatters.
6. Rounds may add links. This goes next once criterion 1's error rate holds.
7. A `uid` beside each slug. This goes next only if broken links from hand edits of `slug:` are observed.

## Owner question

None. Three things are decided:
- slug links live on the page, and the agent writes them without approval;
- vectors only rank candidates;
- line 2 counts sources, so it compares directly with line 1.

To reverse: Later 3 restores a person's press, and Later 7 adds UIDs.

## Build slices

All slices are Opus. Their files are disjoint.

| # | Slice | Owns | Waits for | Review |
|---|---|---|---|---|
| L0 | Decision record and change record (spec §11 v2.1-rc); narrows `5e2f4838` | `docs/records/decisions/<new>.md`, `docs/records/changes/<new>.md` | — | one `reviewer` |
| L1 | Format and validation | `mcp/src/library/wiki-schema.mjs`, `src/shared/lib/library/wiki-page-schema.ts`, the contract table, `validate_wiki` and its definition, the CLI `wiki-validate`, `judge-page-write.ts`, `pass-pages.ts`, spec §11, `mcp/README.md`, `docs/.generated/mcp-surface.json`, catalogue keys | L0 | `reviewer` |
| L2 | Library graph `describes` lines and islands | `build-library-graph.ts`, `library-islands-layout.ts`, `draw-library-graph.ts`, `library-graph-ink.ts` | L1 | `/ui-build`; `reviewer` |
| L3 | Reach model | new `src/entities/docs-vault/lib/library/map-reach.ts`, `vault-library.ts` (`describes` per page), `scripts/perf/gen-scale-vault.mjs` | progress slice A | `reviewer` |
| L4 | Link batch and Compile rule j | new `link-brief.ts`, new `use-link-batch.ts`, `compile-brief.ts` | progress slice B, L1 | `reviewer`; `/ontology-field-trial` |
| L5 | Band line 2, filters, page chips | new `MapReachLine.tsx`, the band mount, `LibrarySection.tsx`, `WikiPageHeader.tsx`, the e2e spec, `docs/features/library/workspace.md`, `docs/FEATURES.md` | progress slice C, L3, L4 | `/ui-build`, `/ui-proof` |
| L6 | Vector candidates | new `src-tauri/crates/vault-index/src/candidates.rs` and its tests, `src-tauri/src/vault/link_candidates.rs`, `tauri-link-candidates.ts`, the candidate block in `link-brief.ts` | search-by-meaning S4/S5, L4 | `reviewer` |
| L7 | Acceptance: criteria 1 and 5, Windows CI | no product files | all | — |

## Revisions

- 2026-11-19: first draft. The anchor is `describes:` slugs on the wiki page, written by the agent without approval and checked by the MCP's wiki schema. Vectors only rank candidates. The "only on a reviewed page" gate is overturned.
- 2026-11-22: cites of `mcp/src/vault/` modules now name the subfolders the vault code was grouped into (`documents/`, `writes/`, `graph/`); no plan changed.
- 2026-11-22: source line cites follow the code into the files and lines that hold it after the structure cleanup; a cite whose code changed keeps its file and drops the line; no plan changed.
- 2026-11-28: the Atlas search tool `find_evidence` is now `list_concepts({mentions})`, which keeps its scope (plain Markdown pages answer as `isNode:false`, decision 2026-08-17 (66)); the two mentions above name the new call.
