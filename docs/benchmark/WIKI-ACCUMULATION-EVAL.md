---
title: "Wiki accumulation evaluation"
doc_type: runbook
status: current
area: library
---

# Wiki accumulation evaluation

The evaluation asks whether a new original helps update a related saved answer
without dropping earlier evidence or a human's note. It exercises the local
Compile route. It does not evaluate ACP, public MCP ontology construction or
semantic retrieval across arbitrary languages.

The first [local-model pilot](FINDINGS-2026-09-10-wiki-retrieval.md) records
successful retrieval alongside failed preservation, with replayable outputs.

```bash
pnpm evaluate:wiki
pnpm evaluate:wiki -- --model=qwen3:8b --out=/tmp/wiki-qwen.json
pnpm evaluate:wiki -- --model=gemma4:12b --case=older-arrives-last --out=/tmp/wiki-gemma.json
pnpm evaluate:wiki -- --regrade=/tmp/wiki-qwen.json --out=/tmp/wiki-qwen-regraded.json
```

Without `--model`, the runner feeds a fixture oracle through the production
executor and approval/apply machinery. This checks that the expected revision
is possible; it is not a model result. With `--model`, the actual Compile brief,
system prompt, tools, adapter and turn limits run against a loopback HTTP model.
`--base-url` defaults to `http://127.0.0.1:11434/v1`; remote addresses and redirects
are refused. There are no real vault writes. Approval is simulated against
in-memory fixture files after checking that proposing changed no file.

The corpus contains three fictional incremental arrivals, each with an existing
saved answer and 36 unrelated wiki pages:

- A dated release approval changes an earlier plan.
- Korean design and operations documents disagree on retention with no approver
  or decision date; the answer must expose the unresolved disagreement.
- An unapproved budget draft arrives after its later approval; arrival order
  must not make the draft current.

Each case also searches for an unrelated astronomy source as a negative control.
The corpus digest is recorded before generation. Gold obligations and oracle
proposals never enter a model request. Reports retain every request, tool result,
proposal, applied answer and per-case failure. An existing report is never
overwritten. A failed obligation or negative control gives a nonzero exit code;
no proposal counts as failure for every revision obligation.
Regrading uses the saved outputs without contacting a model, requires the same
corpus digest, records the rubric digest and writes a new report.

## What the numbers mean

The report keeps seven results separate: relevant-answer hit in the top three,
actual replacement of the existing answer, earlier claim with its citation,
incoming claim with its citation, exact human-note retention with whitespace
normalization, the summary obligation, and disagreement recorded with both
citations under Open questions. The retrieval denominator is the three known
answer targets, not every potentially related page in the world.

Claim checks look for fixture-specific value patterns and the expected citation
on the same line. Summary and disagreement checks use explicit textual patterns.
They can reject an adequate paraphrase or accept a misleading sentence containing
the required words. Citation resolution is checked separately by the production
executor; resolution does not prove that a sentence follows from the citation.
These are diagnostic signals, not a general semantic score. Read the saved
answers before interpreting a model result. A three-case run is a pilot, not
evidence that a model or the wiki is reliable at scale.

The contract tests damage valid revisions deliberately: delete a note, substitute
a wrong source, attach a new claim to the old citation, assert that import order
wins, and omit a revision entirely. They check that these failures cannot produce
a green report. The fixtures live in
`tests/fixtures/wiki-accumulation-cases.mjs`; the runner lives in
`scripts/evaluate-wiki-accumulation.mjs`; the rubric lives in
`scripts/lib/wiki-accumulation-eval.mjs`.

This extends the earlier
[sequential accumulation probe](FINDINGS-2026-09-06-wiki-accumulation-probe.md)
with a repeatable local-model test. It preserves the existing one-page-per-source
policy and human approval boundary. It does not automatically merge topics,
resolve contradictions or promote wiki text into ontology truth.
