---
title: "Local wiki retrieval and revision pilot — 2026-09-10"
doc_type: finding
status: historical
area: library
date: 2026-09-10
---

# Local wiki retrieval and revision pilot — 2026-09-10

Related-page retrieval found the saved answer in all three fictional arrivals,
among 36 unrelated pages per case. Both local models opened the suggested
answer. Neither completed all preservation obligations. This identifies a
remaining revision problem; it does not establish a quality improvement over
the previous implementation because there was no paired run without retrieval.

The [protocol](WIKI-ACCUMULATION-EVAL.md) and sealed fixture corpus were in place
before generation. Each model ran once per case through the production local
Compile brief, tool catalogue, executor and turn limits. The runner simulated
approval and saved only to memory. The deterministic oracle passed all three
cases; those results are excluded from the model table.

| Obligation | Qwen3 8B | Gemma4 12B |
|---|---:|---:|
| Related answer in top three | 3/3 | 3/3 |
| Existing answer actually revised | 3/3 | 0/3 |
| Earlier value with its original citation | 3/3 | 0/3 |
| Incoming value with its original citation | 3/3 | 0/3 |
| Human note preserved in a revision | 0/3 | 0/3 |
| Fixture summary wording obligation | 2/3 | 0/3 |
| Explicit disagreement wording and both citations under Open questions | 0/3 | 0/3 |

No-match astronomy controls returned no candidates in all cases. No fixture
file changed before simulated approval. Qwen's turns took 34.7, 25.0 and 23.9
seconds; Gemma's took 32.8, 20.1 and 20.3 seconds on this local machine. These
single runs do not support performance comparisons.

Qwen revised each existing answer and kept both values with citations, but
dropped every human note. Its Korean answer did flag differing information
with both citations under Open questions. It failed the stricter rubric because
that section did not repeat the values, and its summary did not expose the
unresolved conflict. The release answer also claimed that the exact release
date was not confirmed, despite the dated approval; the summary pattern passed
because it contained the expected date. This is a concrete false positive in a
textual check, not evidence that the answer's reasoning was sound.

Gemma read the relevant answer in every case, then wrote only the new source's
page. The older answers and their human notes stayed untouched; the zero for
note preservation means no completed revision, not deletion by Gemma. Qwen
wrote only the revised answer, without a separate new-source page. The seven
checks measure the named revision obligations; they do not certify completion
of the entire Compile brief or every page-to-page link.

The next product priority is to make dropped human material and unfinished
related-page revisions visible before a person accepts a replacement. Prompt
instructions alone did not preserve them in this pilot. A semantic entailment
evaluation and a larger held-out corpus remain necessary before claiming broad
wiki quality.

Compact outputs retain the evaluated pages, tool reads, proposals and failures:
[Qwen replay capsule](results/2026-09-10-wiki-qwen.json) and
[Gemma replay capsule](results/2026-09-10-wiki-gemma.json). They can be regraded
without a model using `pnpm evaluate:wiki -- --regrade=<capsule-path>`.
Repeated model request/response bodies are omitted from these compact copies;
ordinary runner output retains the full trace.
