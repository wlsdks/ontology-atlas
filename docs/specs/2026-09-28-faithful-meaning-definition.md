---
title: Faithful meaning definition fallback
doc_type: spec
status: draft
area: analysis
date: 2026-09-28
decisions: [a39a0708-99e0-49a6-b64f-cc9770ff6eb6]
---

# Faithful meaning definition fallback

## Person and moment

A source-hidden agent walker, representing a developer checking another agent's understanding, read the retry concept's Excludes and Uncertainty sections, then opened Meaning review. The review presented `Persisting a report.` as continuous positive prose. The walker compared the caller and policy and prepared an unsent verification question. This is observed agent use, not human research.

Evidence: `/tmp/atlas-gray-area-audit/walker/report.md`, `04-retry-evidence.png`, and `07-meaning-review.png` with their AX snapshots, captured on installed identity `9558974` on 2026-09-28. The authorized synthetic vault had seven documents/concepts. The owner requested rigorous design/function QA and repairs; `/tmp/atlas-gray-area-audit/po-pass.md` routes this first repair through one independent review.

## Today

- At source base `0b644920b`, local Markdown becomes a generic flattened excerpt at `src/entities/docs-vault/lib/build-local-manifest.ts:351` and `:383`. `src/shared/lib/parse-frontmatter.ts:448` strips headings and joins text, including list and table content.
- `src/entities/docs-vault/lib/derive-ontology-from-vault.ts:170` selects `description ?? excerpt`; an empty description therefore blocks fallback. `src/widgets/analysis-workbench/ui/MeaningContext.tsx:44` presents that result as the definition and `:46` offers `analysisWorkbench.openDefinition`.
- Generated documents have the same generic excerpt path at `scripts/build-docs-vault.mjs:370` and `:894`. MCP's distinct `extractSummaryExcerpt` at `mcp/src/vault.mjs:297` scans beyond headings and falls back to raw block content; it is a preview contract, not a safe definition selector.
- Generic table previews are deliberate (`src/shared/lib/parse-frontmatter.test.ts:113`). The manifest clones retained fields to release source text (`build-local-manifest.ts:404`); its retained-body regression is `build-local-manifest.perf.test.ts:133`.
- Read through MCP: `capabilities/ontology-map` and `capabilities/meaning-write-review`; both describe human inspection and preserve Excludes/Uncertainty, with currentness unconfirmed. They authorize no canonical edits. `docs/PRODUCT-DIRECTION.md:24` requires distinguishing evidence from unknowns. The standing summary decision, `docs/DECISIONS.md:1976`, preserves authored meaning rather than rewriting it; this repair does not change its freshness rule or rely on its historical figures.

## Problem and alternatives

Rank by returned judgment value:

1. **Now: faithful definition fallback.** The observed display can invert a responsibility boundary at the moment of review; a bounded repair restores the person's ability to judge the document.
2. **Later: Gray Area discovery.** The walker did not encounter its entry, but never took every supported route. Root's separate discovery probe must establish a defect before navigation changes.
3. **Later: multiple relation labels.** The screenshot makes two curves hard to distinguish; the relationship list remained usable. Root must confirm selection/geometry behavior before changing map encoding.

The cause is treating a generic preview as a definition. Shortening all previews would remove useful table/list search context. The selected option changes only which authored material can stand for the definition.

| Option | Value and usability | Cost, feasibility, local-first fit | Decision |
|---|---|---|---|
| Leave the summary as it is | No relearning, but the exclusion still reads as a responsibility | No build cost; local processing already exists | Reject: preserves the observed judgment failure |
| Render labeled sections inside Meaning review | Shows more boundaries immediately | Larger parsing, layout, localization, and duplication burden; feasible locally | Later only if opening the full document proves insufficient |
| Use the authored description or a bounded introductory paragraph | Restores a readable definition with an existing path to every boundary | Small local projection change; no service or canonical write | Choose; section-only documents may lose their inline preview but remain readable in full |

## Flow

1. When the person selects a concept and opens Meaning review, Atlas uses its nonblank frontmatter `description`, trimmed at its outer edges. The authored description takes precedence and is not silently shortened or rewritten.
2. When that description is absent, empty, or whitespace-only, Atlas uses only the body's opening prose paragraph. Blank lines and one leading H1 that names this document (canonical title or a recorded display title) may precede it. Any other heading or block stops eligibility; Atlas never searches past a section heading, list, quote, table, or code block for a substitute definition.
3. When the opening paragraph spans lines, Atlas joins its prose while preserving its words, negation, uncertainty, and inline references. It ends at the first blank line, heading, or block boundary. The complete normalized paragraph must fit the existing 320-character preview budget. If it does not, Atlas uses the preview-unavailable state with the adjacent full-document action; it never clips a paragraph whose later words may qualify the earlier ones.
4. When the producing agent supplied only Includes, Excludes, Uncertainty, history, lists, or no qualifying prose, Atlas shows the corrected preview-unavailable wording at `analysisWorkbench.definitionMissing`. It does not promote one of those sections into a positive definition.
5. When the person chooses `analysisWorkbench.openDefinition`, Atlas opens the complete concept document through the existing evidence action, preserving its headings and authored text. The person can inspect the excluded responsibility and uncertainty there; showing a sentence does not confirm its truth or accept a meaning change.

## States

| State | Web | macOS app |
|---|---|---|
| Empty selection | `analysisWorkbench.selectNode`; select a concept on the map | `analysisWorkbench.selectNode`; select a concept on the map |
| Definition available | Authored definition plus `analysisWorkbench.openDefinition`; read the complete document | Authored definition plus `analysisWorkbench.openDefinition`; read the complete document |
| Definition preview unavailable | `analysisWorkbench.definitionMissing` plus `analysisWorkbench.openDefinition`; inspect the document | `analysisWorkbench.definitionMissing` plus `analysisWorkbench.openDefinition`; inspect the document |
| Loading | Out of scope — existing vault/document loading states; no new read lifecycle | Out of scope — existing vault/document loading states; no new read lifecycle |
| Error | Out of scope — existing document-open failure and recovery; do not replace it with a definition | Out of scope — existing document-open failure and recovery; do not replace it with a definition |
| Partial | An overlong introduction uses `analysisWorkbench.definitionMissing`; `analysisWorkbench.openDefinition` opens its complete text | An overlong introduction uses `analysisWorkbench.definitionMissing`; `analysisWorkbench.openDefinition` opens its complete text |
| Largest measured vault | No browser count measured in this walk; use the same bounded projection and opener | Seven concepts observed; each uses the same available/unavailable states and opener |

## Copy

Change only `analysisWorkbench.definitionMissing` in `messages/en/analysisWorkbench.json` and `messages/ko/analysisWorkbench.json`; their exact English/Korean strings are the catalogue authority. The wording covers missing, ineligible, and overlong introductions without claiming the document lacks a definition. Reuse the other entries exactly; document text remains authored data.

| Key | Where it appears | English |
|---|---|---|
| `analysisWorkbench.definitionMissing` | Definition position without a complete eligible preview | A definition preview is not available. |
| `analysisWorkbench.openDefinition` | Action beside any definition state; opens the selected concept document | Read definition and boundaries |
| `analysisWorkbench.selectNode` | Meaning view without a selected concept | Select a concept or connection on the map to inspect its meaning. |

## Edge cases

- Empty vault/first run: retain current folder and selection states; a single concept follows the same rules. Seven concepts is the largest observed UI fixture; larger-vault usability is unmeasured.
- Empty/whitespace description falls through; a populated description wins. Heading-only, section-only, list-only, code-only, table-only, and quote-only bodies have no eligible preview. A leading `# Excludes` is not a document title merely because it is H1.
- Hangul definitions and display titles keep their characters; English section labels are not required to enforce the boundary. A title followed by a section has no introductory definition.
- An opening paragraph over 320 characters has no inline definition preview; the complete paragraph, including late negation or uncertainty, remains available through the full document. A long explicit description retains its existing full authored value.
- Moved, renamed, or unreadable folders retain existing resolution/error recovery; use current node/document identity, never another document's preview. Concurrent edits use the refreshed manifest and existing document refresh behavior.
- Offline reads remain local. Store a bounded independent definition preview where projection is needed; do not retain complete raw bodies or source-backed substrings to obtain it. Preserve the current retained-body memory budget.

## Out of scope

- Canonical Markdown edits, ontology acceptance, MCP response changes, provider calls, new network behavior, and source-behavior verification: this repairs a display projection.
- Generic excerpt/table changes: search and Library previews have distinct existing consumers.
- New review layouts, discovery navigation, relationship label redesign, new routes, and timing/scale claims: evidence does not require these for this repair.
- Automatically detecting whether an authored description is correct: the full document remains the person's evidence, not independent proof of the sentence.

## Acceptance criteria

1. Given the planted retry definition followed by Includes, Excludes, and Uncertainty, when the actual local-manifest → graph derivation runs, then only the introductory definition is eligible for `node.summary`; `Persisting a report.` is absent there and remains under Excludes in the full document. Add a regression to `src/entities/docs-vault/lib/derive-ontology-from-vault.test.ts` that exercises the real local builder.
2. Given populated, absent, empty, and whitespace-only descriptions, when derivation runs, then populated authored text wins intact and all blank variants use the same introductory fallback. Given no qualifying opening prose, including list-only and section-only variants, then the fallback is unavailable. Prove in the same derivation regression with a leading document title and misleading section H1 among the cases.
3. Given a multiline/Hangul introduction, inline negation, and a paragraph longer than 320 characters, when projected, then a complete eligible paragraph of at most 320 characters preserves its words and qualifications, a longer paragraph yields no clipped definition, and no later section enters it. Prove in `src/shared/lib/parse-frontmatter.test.ts` without altering the existing generic table/path-symbol expectations.
4. Given equivalent authored inputs in local and generated manifests, when they become graph nodes, then definition eligibility and over-budget abstention agree; generic excerpts keep their existing contracts and MCP remains unchanged. Prove with focused cases in `scripts/build-docs-vault.test.mjs` and the local derivation test.
5. Given available and unavailable definition previews in the shared Meaning view, when rendered in English and Korean, then the existing messages/action are visible and the action reaches the selected full document. Prove with a focused `MeaningContext` component regression and root's browser replay; do not pin unrelated prose.
6. Given the original seven-concept fixture on a freshly installed build identified from the fixed source, when root repeats walker steps 3 and 6, then screenshots/AX show the clean definition, the labeled Excludes/Uncertainty source, and a working full-document action. Include one list-only and one overlong-introduction variant, preserve canonical fixture bytes, and record the deployed identity; the old `9558974` capture is only the failure baseline.
7. Given the existing 400-document short/long-body retention fixture with its leading H1 changed to match the authored title or display title (or omitted), when the manifest memory test runs, then assert the expected nonempty `definitionPreview` for every document in both body-size variants before measuring retained heap. The extra retained heap remains below the existing threshold of one tenth of added body bytes (`build-local-manifest.perf.test.ts:174`). No complete raw bodies are retained to produce this definition.

Exact implementation verification commands (planned, not yet run):

```sh
pnpm test:run src/shared/lib/parse-frontmatter.test.ts src/entities/docs-vault/lib/derive-ontology-from-vault.test.ts src/widgets/analysis-workbench/ui/MeaningContext.test.tsx
node --test scripts/build-docs-vault.test.mjs
pnpm test:perf src/entities/docs-vault/lib/build-local-manifest.perf.test.ts -t 'does not keep whole file texts alive through the kept fields'
pnpm checks:changed -- --run
```

The named `MeaningContext.test.tsx` is a proposed regression file. Root owns the requested browser/installed-app replay and any checks recommended for the final changed paths.

## Risks

1. Section or list continuation leaks into an introduction. Probe section-first, misleading H1, lists, code, and block-boundary cases through the real manifest/graph path.
2. Conservative eligibility hides an existing inline preview, or long text loses a late qualifier. Keep complete paragraphs within budget, truthful unavailable wording, and the full-document action; inspect both variants in the installed app.
3. Local/generated projections drift or retained text grows with full bodies. Use equivalent input cases and the existing retained-body memory regression; leave generic and MCP excerpts separate.

## Later

1. Gray Area discovery, if root's supported-route probe shows people cannot reach the inspector from the intended context.
2. Multiple relation labels, if root confirms that distinct edges cannot be selected or identified using existing map/list controls.

## Owner question

None — the observed boundary inversion justifies this local repair; the existing full-document action provides recovery without a redesign. Reopen the fallback choice only if the regression or installed replay cannot preserve these boundaries.
