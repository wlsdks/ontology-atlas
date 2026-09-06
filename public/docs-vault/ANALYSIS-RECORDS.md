# Analysis records

Atlas keeps each in-app ACP analysis as a separate Markdown file under
`.ontology-atlas/analyses/` in the folder captured when the request starts.
Map, Analysis, and Architecture use the same format. An analysis can be
reopened after a session closes, exported, inspected through MCP or CLI, or
used as the parent of another analysis.

These are diagnostic records. They have no ontology `kind`, do not enter the
graph, and do not approve a meaning or implementation change. The kind and
relation criteria remain in [the Atlas specification](ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind).

## Reading and acting

The map's **Meaning review** action opens the existing right context dock.
Meaning, findings/history, and conversation occupy that same space. The
conversation stays mounted when the section changes. The meaning view shows
the selected concept's definition, its kind criterion, directional relation
sentences, stored rationale, and links to the declaring document. A missing
rationale is visible as missing. Optional canvas captions name up to 24
visible relations where they fit; their arrows follow the actual source and
target. Captions yield to concept labels, node shapes, and viewport chrome.
Overview gives directional relations priority. Symmetric association labels
appear when the person selects or points at their concept or connection.

**Analyze with AI**, **Run a new analysis**, and **Analyze further from this
version** explicitly send the visible task to the connected ACP runtime.
Ordinary drafts and the existing Flow prefill still require Send. These
analysis actions ask for a read-only assessment; ontology/code writes keep
their existing approval boundary. A follow-up records the exact parent run
id and asks the agent to reread its evidence. Opening a version does not
replay a model request or grant an approval.
An app-authored opening request is consumed only after its actual turn starts.
An unsent request stays paused if its folder/profile scope no longer matches.
Ordinary later chat turns do not inherit an earlier version link unless their
request text is the exact explicit follow-up that carried it.

The latest loaded run is selected by default, ordered by UTC creation time
then immutable id. Older versions remain selectable. Completed, cancelled,
and failed turns are distinguished. An unstructured answer remains readable
even when Atlas cannot extract findings. No findings means no extracted
review questions, not a clean bill of health. The UI names how many full
bodies were retained, without treating that count as semantic completeness.

Optional `?` map marks identify AI questions. They require captured evidence,
the same scope, and a matching current basis. Historical, changed, or
unverified findings remain readable without current map marks. A person's
keep/dismiss action appends a separate reasoned review tied to one run and
finding; it neither edits the original report nor approves an ontology edit.
Absence from a later run never resolves an earlier finding automatically.

Architecture retains the actual `inspect_architecture` result, including
violations, measured source, declared scope, and unknown coverage. It also
keeps the profile's exact Markdown snapshot. The workbench can reconstruct a
dated observation from these records when the profile snapshot still matches
the current file and the measurement agrees with its declared roles/rules.
An incompatible newer attempt cannot make an older receipt look current.
History retains both the original answer and the measurement for inspection.
Atlas does not turn these counts into an uncalibrated maintainability score.

Browsers can read records through an opened folder. Automatic archival and
review writes require the installed app and a writable captured folder.
Records remain local; this feature does not push, publish, or change a
repository's ignore rules. Existing legacy `analysis` CLI findings beside the
vault and replaceable Architecture JSON receipts remain separate formats.

## Format and ownership

The shared, framework-free validator and codec are
`mcp/src/analysis-record.mts`; the app reads them through
`src/entities/analysis-record/model/analysis-record.mts`. App code and the
Node 24 MCP/CLI readers consume that same contract. A filename is an exact UTC
timestamp followed by a writer-minted UUIDv4, for example:

```text
2026-09-05T08-00-00-000Z-95f4ba81-41f7-483b-a617-2a4be815be32.md
```

Frontmatter uses JSON flow values, valid YAML, to preserve nested data and
literal newlines. `analysis_schema: "atlas-analysis/v1"` and
`record_type: "run" | "review"` discriminate the record. The Markdown body
is the original final answer, or the review rationale; it is not a rewritten
summary or a second serialized copy.

| Run field | Meaning |
| --- | --- |
| `scope` | Project identity, target slugs, and optional architecture profile |
| `request` | Exact request, user event id, optional parent run id |
| `origin` | Surface, runtime/session/turn identity, start time, stop reason, outcome |
| `basis` | App graph digest, optional connected-source fingerprint, raw profile hash, full-body document digests |
| `evidence` | Successful, untruncated full-body Atlas results with tool-call id, slug, frontmatter, body, and digest |
| `observations` | Actual completed architecture measurements; machine-local `rootPath` keys are removed |
| `profileSnapshot` | Exact profile Markdown and its raw UTF-8 SHA-256 identity, when captured |
| `toolReads`, `sourceAccess` | Observed tool audit; unknown tools leave source access unproven |
| `findings` | Optional typed AI questions with explicit targets and read citations |
| `qualification` | Mechanical evidence qualification and retained failure reasons |

Untyped documents, including architecture profiles, may supply read evidence.
They are not thereby promoted into graph concepts. The canvas's internal
`kind:id` addresses are converted to actual vault slugs before capture and
resolved back through the map index when a person follows a finding.

`grounded` describes the captured evidence contract. It is not a correctness
score, exhaustive review, authenticated authorship, or human approval. The
files remain editable local data, not signed attestations. Readers recompute
embedded evidence/observation hashes and enforce their basis bindings; corrupt
or unsupported records are reported individually. Currentness is recomputed
against current files and graph state, including body-only changes. Missing
source or profile identity remains unknown when that identity is required.

The graph digest sorts canonical-slug node identity/title/kind and typed edge
identity/rationale. It excludes canvas position and does not claim to be the
compiler's `graphHash`. Concept evidence hashes canonical sorted JSON of
frontmatter plus the exact body. Profile hashes use the original UTF-8
Markdown bytes, matching Architecture receipt identity.

## Persistence boundaries

The native append command accepts only a generated filename in this fixed
archive. On macOS it pins no-follow directory descriptors, checks the named
parent identity, writes a private complete temporary inode, and publishes
through exclusive linking. Identical retries are idempotent; an identity
conflict preserves the prior bytes. Native reads are bounded before allocation
and detect changes during reading. Source-checkout readers reject symlinked
archives/files and check file identity around bounded reads.

A completion must match its captured starting folder, runtime, session, user
event, request text, and start time. Switching folders never redirects it to
the new folder. Cancelled/failed turns do not become completed analyses.
Failure to save remains visible, with export of retained raw output; an origin
mismatch cannot use the ordinary retry action to bypass the capture check.

The format budget is 2,000,000 UTF-8 bytes per record, 200 captured concept
bodies, 20 measurements, and 100 findings. Evidence that exceeds the budget
is omitted with explicit qualification reasons while retaining a supported
raw answer. An answer exceeding the archive budget remains available for
export. These are record/operation budgets, not project or ontology limits.

## Agent and CLI access

```json
{"operation":"analysis_history","analysisMode":"architecture","limit":30}
{"operation":"analysis_history","analysisCursor":"<previous nextCursor>","limit":30}
{"operation":"analysis_record","recordId":"<UUID>"}
```

These are read-only `query_ontology` operations and do not compile the graph.
History pages count scanned files, with a limit of 1–100; a filtered empty page
can still have a next cursor. Review records join only to their named run and
finding. `analysis_record` returns one exact run or review. Neither operation
is a `query_plan` target.

```bash
node cli/src/index.mjs analysis --vault=/path/to/vault --history --json
node cli/src/index.mjs analysis --vault=/path/to/vault --history --mode=architecture --limit=30 --json
node cli/src/index.mjs analysis --vault=/path/to/vault --record=<UUID> --json
```

Read failures never authorize rewriting the archive or the ontology. Use the
original file or export to inspect unsupported data, and preserve diagnostic
failures when evaluating the feature.
