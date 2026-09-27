---
title: "Library source fidelity and ACP handoff — 2026-09-11"
doc_type: finding
status: historical
area: library
date: 2026-09-11
---

# Library source fidelity and ACP handoff — 2026-09-11

This is a bounded synthetic experiment for the [Library quality program](../plans/LIBRARY-QUALITY-PROGRAM.md), not a provider ranking or a standalone-usefulness verdict. Both real ACP adapters compiled three source-specific wiki pages. Original bytes remained unchanged. A separate source-reader repair makes multiline table qualifiers recoverable from one record and distinguishes repeated DOCX headings.

## Frozen comparison

The source corpus contains a 620-line, 100,567-byte manual, a table with 214 logical records across 215 physical lines, and a DOCX with two identically named Scope headings. Six questions were fixed before compilation: an early exact identifier, a middle routing rule, a late exact identifier, a table/rule join, two differently scoped retention periods, and an unsupported approval question. The questions and answer key were withheld from compilers; the answer key remained withheld from readers until all six responses were sealed.

The compilers used the production Library compile brief and the MCP implementation frozen at `85c48e02b0104406eec6cafccb4b2d6fc2028c0e`. All answer comparisons use that same baseline parser, so they do not estimate an answer-quality gain from the parser repair.

Each provider had three fresh reader conditions: originals only; originals plus its own compiled wiki; and wiki only with originals absent. The first two received identical questions without a wiki-first instruction. The last explicitly requested a source-hidden handoff and required distinguishing retained claims from original verification. A separate evaluator received anonymized answers and the original sources after response sealing. Actual read traces are audited separately from answer prose.

Runtime metadata: Codex ACP 1.10.0 with `gpt-6-astra[medium]`; Claude ACP 0.75.1 with the session's exact `default` model value, whose configuration described Opus (1M). This is observed session metadata, not a promise about future adapter defaults. Claude model configuration was returned through `configOptions`, not the legacy `models` field.

## Answer results

The source-aware audit found all 36 requested core values correct. Its stricter sentence-level grading retained one partial, shown separately below. These are six related questions on one small corpus, not 36 independent task replications.

| Reader condition | Correct | Partial | Incorrect |
|---|---:|---:|---:|
| Codex, originals | 6 | 0 | 0 |
| Codex, originals and wiki | 6 | 0 | 0 |
| Codex, wiki only | 6 | 0 | 0 |
| Claude, originals | 5 | 1 | 0 |
| Claude, originals and wiki | 6 | 0 | 0 |
| Claude, wiki only | 6 | 0 | 0 |

The partial is the phrase “19 packets inspected”: the table prescribes an inspection count but does not record a completed inspection. Because the question itself asks how many packets are inspected, this is a conservative wording-risk judgment, not conclusive evidence that the model invented an actual inspection event. The number, route and applicability restriction were correct.

All six approval answers correctly preserved “not established in these materials” rather than claiming that approval never existed. All six retention answers kept routine 17 days distinct from red-tag-only 23 days and named pending implementation confirmation. The initial auditor flagged a missing effective date in one answer's Q5 section; parent review found that date in its final cross-question note, so the complete answer did retain it. The initial audit remains unchanged, with this adjudication recorded separately.

There was one unsupported extra assertion in the Claude originals-and-wiki answer: it said all three originals describe themselves as synthetic material for software evaluation. The manual and DOCX do; the CSV labels historical fixture rows but does not explicitly describe the entire source that way. Correct answers did not prevent this additional overstatement.

Citation quality remains separate. Every baseline Q5 answer cites the ambiguous `h:scope`; every Rapid restriction needs both `r212` and `r213`. Their content is recoverable by combining the supplied quotations or adjoining units, but the first locator alone is insufficient. Both wiki-only readers retained the requested values and disclosed that originals could not be verified. Parent checks also matched the Claude reader's quoted wiki line locations to the supplied page bytes. The source-aware grader's “unverified wiki” label meant wiki files were outside that grader's allowed inputs, not that the locators were false.

## Actual read traces

Both compilers completed six `read_source` calls before writing. Their returned
windows covered all 620 manual units, all 215 baseline CSV units and all eight
DOCX units. Coverage is the union of unit positions (`from` through the returned
count), not distinct anchor strings: multiple DOCX paragraphs share a section
anchor. It is extracted-unit coverage, not a percentage of original bytes or
proof of comprehension. Both compilers then passed `validate_wiki` with three
pages and zero shape failures.

| Answer reader | Manual units through MCP | CSV units through MCP | DOCX units through MCP |
|---|---:|---:|---:|
| Codex, originals | 620/620 | 215/215 | 8/8 |
| Codex, originals and wiki | 6/620 | 4/215 | 8/8 |
| Claude, originals | 620/620 | 126/215 | 8/8 |
| Claude, originals and wiki | 24/620 | 6/215 | 8/8 |

These counts must not be read as total retrieval savings. Codex also completed
a shell read of the manual, CSV and all three wiki Markdown pages. Claude read
all three wiki pages and ran additional source searches; one large grep result
was represented only by an adapter-persisted-output marker. The exact body of
that output is unavailable in the trace and is not counted as inspected content.
Both readers actually used the wiki when it was available; availability alone
would not establish use.

The two wiki-only sessions each listed exactly three wiki files and completed
reads of those files. Their observed traces contain zero successful original
reads and zero successful outside-fixture content reads. There were no
`read_source` calls in those sessions; that does not mean the tool was unavailable.
The original directories were empty, and all six reader fixtures and response
seals remained unchanged. This supports the stated source-hidden handoff within
the trace boundary, without an OS isolation claim.

The independent trace report and parent machine-derived coverage agree on these
windows. Parent review corrected two descriptions while preserving the initial
report: the Codex concatenation did not include a binary DOCX, and DOCX coverage
uses unit positions rather than anchor cardinality. The Codex compiler also
successfully searched its parent directory for `AGENTS.md`; the output contained
fixture metadata but no outside source content. Consequently, zero outside-root
traversal is not claimed for the overall experiment.

## Source-reader repair

The baseline returned a quoted CSV condition as separate `r212` and `r213` units. A reader limited to the first address did not receive the complete applicability restriction. Both Scope occurrences in the DOCX shared `h:scope`, so that address alone could not identify which retention policy was intended.

The repair keeps a quoted CSV/TSV record's exact text together, including embedded newlines and spaces. Its `r<n>` still names the physical starting line; pagination counts non-empty records. The following unchanged records remain at `r214` and `r215`. Field-boundary-aware quote handling prevents an inch mark in an unquoted cell from swallowing later records. An unclosed quoted record retains its remainder through EOF with an explicit note, without certifying CSV validity.

For DOCX, every occurrence of a repeated normalized heading gets a distinct address. Natural unique headings are reserved before suffix allocation, preserving existing unique addresses. An explicit note names legacy ambiguous addresses. No original, existing wiki citation or ontology node is migrated. A matching source hash remains a byte-identity observation, not proof of an unambiguous locator, complete extraction or a true claim.

An independent reader received only anonymized extracted-unit streams. With the repaired stream it recovered the full CSV restriction and the uniquely addressed red-tag policy; the baseline stream left the first citation incomplete and the repeated heading ambiguous. It also confirmed the unchanged later row and unique heading addresses. This is returned-unit recovery evidence, not a completed unfamiliar-repository ontology field trial.

The actual compiled MCP executable also returned the complete record, the correct pagination continuation, distinct Scope anchors and the legacy-ambiguity note, with the original hashes unchanged. That proves this behavior in the built source-checkout MCP; it does not prove a protected installed app was updated.

## Controls and limits

The first Claude compile had a harness path-alias error (`/tmp` versus `/private/tmp`) and wrote two SDK auto-memory files in the task-private review profile. It is preserved as setup-contaminated evidence and excluded from the clean reader comparison. A clean rerun used canonical path checks and disabled Claude auto-memory for that child process. One compound metadata command was conservatively refused; the MCP reads and wiki writes completed. These conditions preclude a latency comparison with native UI use.

The Codex baseline's three direct wiki writes were inside the authorized compile scope. The first wrapper misclassified unmediated writes as unexpected; the raw paths take precedence over that counter. Neither a read-only mode label nor a permission callback constitutes an independent filesystem sandbox. Source hiding here is established by the provided fixture and observed read trace, not operating-system isolation.

The clean Claude pages also used a `compiled_at` later than the actual run. The refused metadata command and omitted clock value in the brief limit attribution: this is not a reproduced native-app timestamp failure. The production compile action does omit the existing optional clock input, so passing a measured time is a concrete next repair candidate.

A formal unfamiliar-repository ontology field trial remains open; this Library experiment must not be reported as that trial or as approval of new code ontology meaning.

This small synthetic corpus does not establish general document understanding, human demand, repeated-update fidelity or superiority over direct source reading. Local-model extraction has a separate bounded path and is not qualified by these ACP results. Figure/OCR fidelity, large collections, reverse arrival order and sustained human correction remain open. The retained-answer native visual checkpoint also remains pending while the Mac session is locked; white locked-window captures are invalid evidence.

## Reproduction evidence

Primary artifacts are under `/tmp/atlas-library-qualification-20260911`: `corpus-manifest.json`, `sealed-manifest.json`, `all-reader-response-seal.json`, `grading/`, `harness/runs/`, `trace-audit/`, `recovery/reader.md`, `binary-source-proof.json`, and `required-checks-run.log`. The parser change passed all 19 recommended checks, the escalated MCP dogfood verification and the built-MCP source probe. Ontology structure validation and compilation passed; project meaning remains `review_required` with `source_changed`, not verified current. The frozen answer-key digest is `bb5a9163cfe1484b0026bd2809e5dce38d1a89416f6e9cf3ca404c94c9042c3a`. These are local measurement artifacts, not portable benchmark infrastructure or a reproducibility guarantee after scratch deletion.
