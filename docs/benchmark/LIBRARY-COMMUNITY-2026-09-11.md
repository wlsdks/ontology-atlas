---
title: "Library community evidence — 2026-09-11"
doc_type: finding
status: historical
area: library
date: 2026-09-11
---

# Library community evidence — 2026-09-11

This research informs the [Library quality program](../plans/LIBRARY-QUALITY-PROGRAM.md).
It does not establish product demand, willingness to switch, or the technical
cause of a reported failure. The set includes twelve directly opened discussions:
five Reddit threads, three Hacker News threads and four Obsidian Forum threads.
It is self-selected and weighted toward technically curious users. No community
was contacted and no participant's private corpus was collected.

Labels distinguish **F** firsthand reports, **D** desired outcomes, **P** product
promotion and **O** opinion. Even firsthand reports remain unreplicated here.
Dates identify the discussion or relevant report, not a current product guarantee.

## Primary hypothesis

[Karpathy's LLM Wiki idea file](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
proposes raw sources, an agent-maintained Markdown wiki and instructions governing
ingestion, questions and maintenance. New material contributes to existing topic
pages, useful answers become durable pages, and contradictions and stale claims
remain maintenance work. The idea's appeal is accumulated synthesis. Its unproven
assumption is that repeated synthesis preserves meaning while reducing the human
effort needed to maintain and inspect knowledge.

## Discussion ledger

| Discussion | Evidence type | Reported job or failure | Atlas hypothesis to test |
|---|---|---|---|
| [RAG that actually works?](https://www.reddit.com/r/LocalLLaMA/comments/1ps6txq/rag_that_actually_works/) · 2025-12-21 | F | A non-developer's setup reports a topic absent although the author knows it occurs in a long PDF. Extraction and retrieval causes are unproven. | Distinguish absent evidence from uninspected material; include buried facts in qualification. |
| [Long documents on consumer laptops](https://www.reddit.com/r/LocalLLaMA/comments/1hq36dn/practical_online_offline_rag_setups_for_long/) · 2024-12-31 | F | An author reports a repeatable four-needle experiment across long texts and formats, with inconsistent recall. This is an old, self-published comparison. | Use exact-answer questions at several source positions; measure coverage rather than infer it from context size. |
| [Large document recall](https://www.reddit.com/r/LocalLLaMA/comments/1myudwp/largeish_document_recall/) · 2025-08-24 | D/F | Network-engineering work combines a large guide, release notes, transfer documents and configurations that evolve over time. No completed solution is demonstrated. | Test version origin, superseding instructions and cross-document impact after successive arrivals. |
| [Daily notes and Wikipedia](https://www.reddit.com/r/ObsidianMD/comments/1kmjc2z/daily_note_wikipedia_its_literally_free/) · 2025-05-15 | F | Selective reading and personally written source notes preserve why material matters; the author did not find AI summaries helpful for their retention. | Preserve human emphasis and corrections; generated page count is not accumulated understanding. |
| [Personal health repository](https://www.reddit.com/r/ObsidianMD/comments/1slqg1y/obsidian_as_a_better_personal_health_repository/) · 2026-04-15 | F/D | A Karpathy-inspired prototype encounters PDF extraction, counting, false-negative and source-link problems and has not replaced its prior workflow. | Test scans, tables, source inspection and correction using synthetic or appropriately deidentified material; this report supplies no medical-safety evidence. |
| [LLM Wiki discussion](https://news.ycombinator.com/item?id=47640875) · 2026-04-04 | F/O/P | Reports of useful linked representations coexist with concerns about second-order summaries, accumulated errors and loss of human intent. Deployment and scaling claims are unverified. | Compare raw-source answers with maintained synthesis across repeated updates, including human corrections. |
| [Custom LLM on one's documents](https://news.ycombinator.com/item?id=38759877) · 2023-12-25 | F | A commenter reports useful search over a case-document collection but confusion on complex cross-document questions; precise references are a separate need. | Increase question difficulty from lookup to joins, conflict and temporal reasoning. This old discussion is not a current model benchmark. |
| [NotebookLM discussion](https://news.ycombinator.com/item?id=48936451) · 2026-07-16 | F/O | Replies describe source-inspection and ingestion friction across PDFs, email and large source collections. Product claims are time-sensitive and not independently tested here. | Measure the effort to open and understand the exact support for a generated claim. |
| [Safe agent file operations](https://forum.obsidian.md/t/safe-programmatic-file-folder-operations-for-agents-automation-non-blocking-transactional-link-safe/114952) · 2026-06-03 | F/D | A large-vault author reports freezes during internal moves and broken links/index state after external moves. | Verify exact mutation scope, recoverability and index convergence; do not assume a filesystem write completes the workflow. |
| [Filter the graph by a query](https://forum.obsidian.md/t/obsidian-graph-filtered-by-search-query-instead-of-displaying-entire-vault/112060) · 2026-03-08 | F/P/O | Dense graphs overwhelm topic study; replies describe stalls and promote targeted tools without controlled results. | Test a question's relevant sources and paths against ordinary search before expanding graph UI. |
| [Hybrid Search](https://forum.obsidian.md/t/hybrid-search-hybrid-search-mcp-server-cli-for-ai-assistants-bm25-semantic-obsidian-native/112491) · 2026-03-20 | P/O | A tool author argues for exact-term and conceptual retrieval together; independent task results are absent. | Separate exact identifiers, aliases, semantic questions and relationship queries in evaluation. No ranking method is selected by this post. |
| [Vault Inspector](https://forum.obsidian.md/t/vault-inspector-find-broken-links-and-orphan-attachments/114637) · relevant report 2026-07-24 | F/P | A user reports indexing failure after large generated maintenance reports; removing those reports restores startup in that environment. | Bound diagnostic artifacts and verify startup/recovery under a growing corpus. The reported cause is not generalized to Atlas. |

## Decisions and falsifiers

The retained-answer slice responds to the revision and correction job: keep the
previous interpretation, expose changed or missing originals, compare a proposed
answer and explicitly retain a new draft. Citation navigation must connect to an
original and preserve its locator. Internal tests qualify these mechanisms only;
they do not show that synthesis is accurate or that users will return.

The next experiment uses the same source corpus and questions across raw-source
reading and Library synthesis, separately through Claude Code and Codex ACP.
Include buried facts, a table qualifier, contradictory sources, an older document
arriving last, a missing original and a human correction. Keep answer correctness,
source coverage, unsupported claims, preserved intent and revision recovery as
separate outcomes. Tokens, elapsed time and provider usage are diagnostics.

Three results would weaken the product direction: people do not return to retained
answers; inspecting or correcting synthesis takes more effort than direct source
work; or repeated updates erase qualifications and human intent. A useful prototype
must survive those tests before the program can claim standalone usefulness.
