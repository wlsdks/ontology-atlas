# Findings 2026-09-06 · does the Library wiki accumulate, or only summarise?

**Question**: the LLM Wiki pattern (Karpathy, 2026-04-04) claims its value is
accumulation: each new source revises existing pages and flags what it contradicts.
The Library's Compile brief embeds the page template and six rules but never names
existing pages. Does a wiki built one source at a time, the way the Library runs, still
answer questions that need two sources, and does the page a person opens tell the truth?

## Setup

- Vault: seven synthetic documents about a fictional product, written for this probe
  so no model had seen them: a delivery plan (docx), steering minutes (txt), an
  architecture overview (html), an ops runbook (pdf), a release table (csv), customer
  call notes (txt), a hiring memo (docx). Four planted disagreements: the plan's date,
  owner and budget are superseded by the minutes; the architecture's 30-day retention
  and 0.82 threshold disagree with the runbook's 90 days and 0.75; the customer's
  observation supports 30 days; the memo's budget predates the cut.
- Questions: eight, sealed by sha256 before any page was compiled, written by the planner
  and not by the compiler. Four answerable from one document, four needing two or more
  or a noticed conflict.
- Compilers: the current `buildCompileBrief` output, verbatim, run by a Sonnet agent.
  Condition A: all seven sources in one run. Condition B: seven runs, one source each in
  date order, the earlier pages present, the brief naming only the new file — which is
  what `selectCompileTargets` sends after the first run.
- Readers: Sonnet agents, one folder each, no outside knowledge: sources only, wiki A
  only, wiki B only.

## Result

| | Sources only | Wiki A (batch) | Wiki B (one at a time) |
|---|---|---|---|
| Correct answers | 8 / 8 | 6.5 / 8 | 8 / 8 |
| Single-source / cross-source | 4/4 · 4/4 | 3/4 · 3.5/4 | 4/4 · 4/4 |
| Reader tool calls | 5 | 3 | 3 |
| Pages | — | 4 | 7 |
| `wiki-validate` | — | 0 failing | 0 failing |
| Existing page changed by a later run | — | — | 0 of 6 runs |
| Page-to-page links | — | 0 | 0 |
| Cross question whose first page carries the current value or a flag | — | 4 / 4 | 0 / 4 |

The last row is the one that separates the conditions. For each cross question, the
page a person would open first (the plan page for date, owner and budget; the
architecture page for retention and threshold) was read for either the current value
or a sentence saying a later document disagrees. In B every such page still states the
superseded figure with no flag: 2026-09-25, Teodor Vasquez, 180,000, 30 days, 0.82. Run 4
wrote "the runbook does not say what the architecture document's default value is"
while the architecture page beside it says 0.82. Run 6 read no existing page at all.

Wiki A lost Q1: merging seven sources into four topic pages dropped the matcher's
language, so the reader answered "not in the folder". A topic merge is lossy where a
per-source page is not.

## What this does and does not show

- At seven pages a reader answers everything because it reads every page in one call.
  The accumulation failure is invisible to a question-and-answer score at this scale;
  it is fully visible on the page. The Library shows a person one page in its reading
  pane, so the page-level number is the one that matters there, and it is 0 of 4.
- `wiki-validate` is green on B. It checks shape; nothing checks whether two pages that
  cite different sources disagree about the same thing.
- One model, seven documents, one ordering. The batch condition shows the model
  integrates when handed everything at once; the sequential condition shows it does
  not revisit on its own when handed one file. That is the brief's gap, not the model's.
- Next: add to the brief a rule to read `wiki/` first, add the source to the page that
  already covers its topic, and record a disagreement on both pages with both
  citations; rerun B and read the last row again. Then a folder-level check that goes
  red on this B vault.

## Second pass, same day: the brief with rules g and h

Two rules were added to `buildCompileBrief` and the brief now lists the pages that
already exist (title, path, sources), drawn from the same rows the Wiki list shows.
Rule g: read `wiki/` first, add a source to the page that covers its topic, add facts
rather than merging them away. Rule h: a disagreement is written under `## Open
questions` on every page that carries either claim, citing both sources, naming the
later document, and every cited source is listed in that page's `sources:`. Same seven
documents, same order, same sealed questions, one source per run.

| | Wiki B (old brief) | Wiki C (rules g+h) | Wiki D (rule h also names `sources:`) |
|---|---|---|---|
| Correct answers | 8 / 8 | 8 / 8 | 7.5 / 8 |
| Pages | 7 | 6 | 5 |
| Runs that revised an earlier page | 0 of 6 | 5 of 6 | 5 of 6 |
| Cross question whose first page carries the current value or a flag | 0 / 4 | 4 / 4 | 4 / 4 |
| Older figure still on the page beside the newer one | — | 5 / 5 | 5 / 5 |
| `wiki-validate` failing pages | 0 | 5 of 6 | 1 of 5 |
| Page-to-page links | 0 | 0 | 0 |
| Compile wall time, seven runs | about 7 min | about 17 min | about 20 min |

The metric the first pass named moved from 0 to 4 in both reruns, and nothing lost
its older figure. The cost is real: a run that revises five pages takes four to five
minutes and about 105k tokens against one minute and 70k for a run that writes one.

Two defects surfaced in C, both fixed in the same change:

- `wiki-validate` reported 12 `uncited-fact` on bullets whose citation sat on a
  wrapped continuation line. Both validators now read a bullet through its indented
  continuation lines; two fixture cases pin it.
- Pages cited a source in `## Open questions` without listing it in `sources:` (10
  `citation-target-missing`). Rule h did not say to; it now does, on both pages. D's one
  remaining failure is the run-3 page, written before that sentence was added.

Still open after this pass:

- The brief says a page that fails `wiki-validate` "will be rejected". The app
  validates after the write and shows the first problem code in the Wiki list; it does
  not refuse the write. The sentence overstates the gate.
- No page links to another page in any condition. The contract asks for source
  citations and nothing else, so the wiki is a page-to-source graph, not yet a
  page-to-page one.
- A Lint brief run against vault B (report only, Sonnet, three tool calls) named all
  four planted disagreements with both citations and the later document, plus four
  missing cross-references and six names that appear on three or more pages with no
  page of their own. That is the shape of the next step.
- The Q7 half point in D: the hiring memo was folded into the plan page, and the reader
  named the page but not the memo as a stale document. A merged page answers the
  question and hides which document said what.

## Third pass, same day: links, the folder half of the contract, and a Lint door

Rule i joined the brief (a page links the pages it talks about, `[[wiki/<slug>]]`, only
to pages in the list), the brief stopped claiming a failing page "will be rejected",
`validateWikiFolder` joined both validators with three codes decided by a script
(`dangling-wikilink`, `orphan-page`, `shared-source-unlinked`), and a report-only
"Check the wiki" door joined Compile in the Library. Same seven documents, same order,
same sealed questions, one source per run.

| | Wiki B (old brief) | Wiki D (g+h) | Wiki E (g+h+i) |
|---|---|---|---|
| Correct answers | 8 / 8 | 7.5 / 8 | 8 / 8 |
| Pages | 7 | 5 | 4 |
| Page-to-page links | 0 | 0 | 11 |
| First page carries the current value or a flag | 0 / 4 | 4 / 4 | 4 / 4 |
| Older figure kept beside the newer | — | 5 / 5 | 5 / 5 |
| `wiki-validate`, page and folder codes | 7 `orphan-page` | 5 `orphan-page`, 14 `shared-source-unlinked`, 1 `citation-target-missing` | 0 |
| Lint brief, disagreements it names | 2 + 5 superseded | — | 0 (all four planted ones already flagged on both pages) |
| Compile wall time, seven runs | about 7 min | about 20 min | about 20 min |

The folder checks are the gate the first pass asked for: red on B and D, green on E,
with the two implementations returning byte-identical verdicts on every fixture. The
Lint brief on E found what a script cannot: one superseded claim nobody planted (the
plan's "the threshold must stay stable this quarter" against the hotfix that changed it),
two cross-references finer than shared sources, and six names on three or more pages
with no page of their own, which the brief labels ontology node candidates rather than
pages to write.

Rendered evidence: the freshly built app opened on vault E showed the new door beside
Compile, Lint first, and the runbook page carrying its folder finding as the off-template
chip. It also listed `wiki/_template.md` as a page named "<the page name>" and opened it
first; `selectWikiPages` now skips the template, pinned by a unit case and the Lint dock
e2e. The wikilink outlink extractor was also counting `[[src:…]]` citations as links to a
document named after a PDF; it skips them now.

What this pass does not settle:

- E folded the minutes, the memo and the customer call into the plan page; four pages
  for seven documents answers every sealed question, but the page is 100 lines and the
  Lint brief's "name without a page" list is where a person would look for the entities
  the merge hid. Whether to compile a page per source and link, or per topic and merge,
  is a judgement the brief leaves to the writer; a probe with two writers and one reader
  per condition would say which a person prefers.
- The reader's answer under the Lint brief cost about 110k tokens for four pages. On a
  hundred-page wiki that is the phase-one script the survey found in kfchou/wiki-skills:
  the folder codes first, the model only on the pages the codes point at.

## Fourth pass, same day: the gate, the log, and one page per source

Three things were built from the survey and the third pass, and one question was
settled by a probe.

- **The permission card judges the page before Allow.** The Library reads the write the
  agent asked for (a whole file, or an edit applied to the page on disk), judges it
  against the contract, and the card shows the verdict above the buttons. Proven in the
  fresh build on a real Compile turn: the first page write's card read "Fits the wiki
  page contract." Three shell commands asked first (hash, docx text, python), one card
  each.
- **`wiki/_log.md`, written by the app.** After each Compile and Check-the-wiki run the
  app appends one line: the sources handed over and the pages the folder shows new or
  revised, or the lint counts the report ended with. A person who never commits has the
  wiki's own memory; a person who does has a commit body. The pattern's `index.md` is
  not adopted: the index is computed from frontmatter wherever it is needed.
- **Underscore files are furniture.** `_template.md` was listed as a page named
  "<the page name>" and opened first in the installed app; now any `wiki/_*` file is
  skipped by the list, the validators, and the brief.
- **Probe F: one page per source (F1) against one page per topic (F2)**, same seven
  documents, same order, plus four sealed provenance questions (which document first
  said X; how many pages must a person open for the audit export).

| | F1 one page per source | F2 one page per topic |
|---|---|---|
| Correct, 12 sealed questions | 12 / 12 | 12 / 12 |
| First page carries the current value or a flag | 4 / 4 | 4 / 4 |
| Pages · longest | 7 · 60 lines | 5 · 155 lines |
| Page-to-page links | 38 | 11 |
| Pages to open for the audit export, linked? | 5, fully cross-linked | 3, one link missing |
| Folder codes after the primary-source refinement | 2 `citation-target-missing` | 1 orphan, 2 shared-source |
| Compile wall time, seven runs | about 24 min | about 20 min |

Both answer everything. F1 keeps "what one document said" on one short page whose file
name is its provenance; F2 makes a page a reader digs through for which document said
what, which is where the third pass lost its half point. The contract already says it:
raw wins on what a document said, a node on what we mean. Rule g now asks for one page
per source, linked both ways, never merged. `shared-source-unlinked` fired six times on
F1 because every page that carried the disagreement listed the minutes as a source; it
now fires only when the shared source is a page's primary (first-listed) source, which
is what "two write-ups of one document" meant.
