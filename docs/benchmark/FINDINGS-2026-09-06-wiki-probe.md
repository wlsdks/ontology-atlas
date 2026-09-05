# Findings 2026-09-06 · the sealed five-question wiki probe

**Question**: does a compiled wiki page carry understanding, or only provenance? The 2026-09-05 record "A vault holds three kinds of file and only one is the graph" made this its falsifier: a compiled page that passes provenance yet loses a sealed five-question test to a raw-folder control retires Compile to a file list.

## Setup

- Vault: a probe folder outside the repository holding four raw sources under `sources/` — `architecture.docx`, `features.html`, `design-system.pdf`, `release-dates.csv` — exported on 2026-09-05 from this repository's documents.
- Questions: five, sealed on 2026-09-05 before any page was compiled, each with an expected answer written from the sources.
- Pages: `wiki/architecture.md` compiled by the in-app agent on 2026-09-05 through Compile (one permission card per write); the other three compiled on 2026-09-06 by an agent handed only `wiki/_template.md`, spec §11 and the sources. `wiki-validate`: 4/4 fit; every `source_hash` matches the bytes.
- Readers: two fresh agents of the same model, ten minutes each, no other path, no outside knowledge. One saw only `wiki/`, the other only `sources/` (with `textutil`, `pdftotext` and an HTML text pass).

## Result

| | Raw folder | Wiki pages |
|---|---|---|
| Correct answers | 5 / 5 | 5 / 5 |
| Time reported | about 9 minutes | about 4 minutes |
| Tool calls | 21 | 5 |
| Q4 conflict surfaced | yes, after following a later section | yes, carried on the page as a caveat with both anchors |

Both readers answered Q4 "ember", not the sealed "indigo". The sources say ember: `design-system.pdf` carried an 2026-08-18 note that the accent changed to ember, and the same-day revert (decision 79) had never reached the document. The answer key was wrong, the readers were right, and the compiled page kept the conflict visible rather than smoothing it. The document is corrected in the same change as this file.

## What this does and does not show

- The falsifier did not fire: the compiled pages lost nothing to the raw folder on accuracy and cost less than half the time. Compile stays.
- One probe, one model, five questions, sources the model may partly know from elsewhere in its training. It does not show that pages beat sources on questions the compiler did not anticipate, or on a folder of unfamiliar documents. The next probe should use documents the model has never seen and questions written by someone other than the compiler's operator.
- A wiki page inherits its source's errors faithfully. That is the contract (raw wins on what a document said), and it is also why the graph step must stay separate: a node states what we mean, and a wiki page states what the document said.
