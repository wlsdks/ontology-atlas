---
title: Analysis
doc_type: feature
status: current
area: analysis
routes: [/ontology/insights]
---

# Analysis

`/ontology/insights` opens a relationship analysis of the loaded ontology. It
answers a concrete question: which recorded responsibilities depend on one
another, and which declarations support that connection? It requires no agent
run, concept dropdown, camera movement or source setup to read existing claims.
The bundled example is explicitly labeled.

## Relationships and evidence

The project board owns the screen. Each recorded responsibility is one row,
ordered so that the most-declared pairs sit next to each other and point
forward (exact over every order up to eight rows, bounded local moves up to 64,
the recorded order beyond); capabilities with no responsibility or more than
one share a last row named for both cases. Each row lists its
capabilities as cards, connected cards first; twelve show at once, the selected
endpoint always among them, and a named remainder action opens the rest. Every
thin directed line is one declared cross-responsibility `depends_on` edge;
containment and loose associations are excluded, and an endpoint hidden behind
a row's remainder joins that action, one line per hidden pair. Lines follow
measured DOM geometry when labels wrap or text grows.

The selected declaration draws in indigo beneath the cards, its pair's lines
lift, and the rest stay a quiet texture. Hovering or focusing a card, or
hovering a row's name, picks out only that card's or row's lines and their
partner cards. Pressing a line selects its declaration; pressing a card steps
through its declarations, outgoing first. The board is one Tab stop: arrow keys
move between cards in a row and to the nearest card in the row above or below,
and Home or End reach the ends. A "Declaration n of N" stepper beside the
inspector heading reaches every declaration by keyboard. A saved declaration
reopens with focus on its source card, or on the inspector heading when its
source is a whole responsibility. The headline names
the two responsibilities, each card names one concept, and the inspector names
the selected declaration and its declaring document, which are visible together
at the minimum app viewport. A missing structured relationship note does not
prove that the Markdown body has no explanation.

Ownership follows recorded containment to the nearest domain on each parent
path. A dependency whose endpoint has missing or ambiguous responsibility is
counted separately rather than assigned by guesswork. Cycles terminate and
multiple parents remain visible in the underlying facts. Scope counts are
computed before the display limit. Zero recorded cross-domain dependencies is
not a claim of independence: the same workspace offers recorded capability
evidence and gaps instead.

The evidence question keeps the same board and selects capabilities directly.
Each card shows its record-gap count and, in a local folder, a moved or missing
source mark; the legend names both. A project title is used only for exactly
one recorded project; a multi-project graph identifies the entire folder. A
recorded implementation anchor is a source `path` or a normalized containment
relation to a real element document. A reference-only element or reverse
containment does not count. An implementation role without a source path remains
an anchor in the ontology; it is not checked code. Document, anchor, definition,
boundary and uncertainty gaps are distinct facts. A document without an available
`meaningFindings` array is unchecked, not clean. Capability search quiets the
cards that do not match, in an ink that stays readable, without hiding the
project, changing the selected
evidence or the counts; clearing or pressing Escape returns focus to the search
field, and a selection made from a match stays selected. The All or Recorded
gaps scope is an exclusive keyboard-operable control that names each scope's
count and dims the cards outside it. The share of capabilities with an anchor
lives under the count-basis disclosure.

A separate Source state filter selects All sources, Source changed, Path missing
or Not checked. Its counts cover recorded capabilities, not implementation
elements. It combines with name search and the recorded-gap scope; their
intersection is counted beside the board. Cards outside the scope recede while
the selected claim and its document remain open. A state filter prioritizes
matches within each responsibility's initial twelve cards, with the selected
claim retained and explicit continuation for the rest. Missing source
paths take precedence over changed paths, following the existing evidence
verdict. Unavailable, unmeasured, omitted and folder-only evidence stays Not
checked; zero changed paths is not a claim of current or accepted meaning.

The selected claim links to its declaring document. A local, documented claim
also links to the existing Map meaning editor and its typed review boundary.
Analysis does not accept meaning or write proposed corrections itself.

The inspector lists the selected capability's recorded element documents. Each
element opens its own document and returns to the same capability; the list is
recorded composition, not runtime execution order. Six elements appear
initially, with explicit continuation and focus on the first new element.
Missing element links have an empty state; source paths without element
documents remain paths, not invented concepts. The global document-inspection
count lives under the count-basis disclosure.

## Source currentness

Browser/sample sessions state that source currentness was not checked. The
native read resolves one project's recorded binding and receipt identity, then
reads document dates from the granted vault and implementation dates from the
bound source under its separate read grant. The folders may belong to different
Git repositories. Identical relative names remain separate document and source
coordinates, including when the vault is nested in the source repository.
The confined binding reader currently supports Unix platforms, including macOS.
On Windows, this read returns unavailable and the claim dates remain unknown.

An ungranted source offers the native code-folder picker. Its selection grants
source reading only; date comparison separately requires the selected folder to
match the current binding. Cancellation preserves the claim, a mismatch offers
another choice without rebinding, and changed connections or unreadable reads
offer a retry. Multiple project scopes stay unknown and retain the document and
map recovery paths.

The total budget is 512 paths, with documents first, and each repository walk
covers at most 3,000 commits. Omitted paths, uncommitted files, folder-only anchors
and unavailable or invalid dates remain unknown. Missing paths and newer file
commits retain the existing verdict precedence. Each recorded path names its own
state (changed after the document, not found, or date not checked), and the
selected claim shows its own verdict even when coverage is partial. Binding/receipt identity, both
canonical roots and both Git revisions are checked before and after reading;
changed identities discard the comparison. A changed document/path or project
scope retires the old async request. Cross-repository date ordering is advisory
evidence to reread a claim, never semantic validation or proof of causality.

## Supporting records and agent authority

Three visible section tabs select System relationships, Review summary and Wiki.
Each supporting section names the actual
folder or bundled-example scope above its records. Review summary retains its visit anchor,
evidence details and explicit agent request. Wiki uses its existing
read model. Guidance moved to Harness At a glance and Written explanations is no
longer a section; explanations saved earlier stay as files in
`.ontology-atlas/analyses/`, which the agent panel's Findings & history, MCP
`analysis_history` and `analysis_record`, and the CLI still read. One ACP conversation remains mounted across
section changes. Switching sections does not start a turn or replace a draft.
An explicit request prefills the conversation; the person sends it, and an
existing draft still requires the existing replacement action.

The selected-fact action is attached to its evidence. Native inspection prefills
a read-only question in the existing ACP session only when the selected local
folder and available agent match. It first checks `connection_info` against the
exact root, then requests full concept bodies and verifies recorded UIDs. Copy
fallbacks include the actual read-only MCP calls and source-checkout CLI `node`
commands. A browser folder's unknown absolute root must be established before
reading. Sample copies contain only quoted example facts and explicitly prohibit
looking those identifiers up in another connected vault. The complete request
is inspectable before copying or sending.

## Saved links and retired surfaces

The route is unchanged. Missing/unknown `tab` values and `connections`,
`composition`, `boundaries`, `growth`, `overview`, `structure`, `relations`, and
`freshness` open the relationship workspace. `do-next` and `unmatched` open its
evidence question. `brief` and `library` open their supporting records.
`harness` replaces itself with `/architecture/?view=overview` and adds no history
entry; `flow` opens the relationship workspace with a notice that Written
explanations is no longer a section. Orthogonal query flags are preserved. Selected claim and relationship document links carry
`review=analysis:<id>` or `review=relation:<id>` so the return restores that evidence. Saved ontology links no longer
open a separate census board.

The former census tiles, seven ontology question tabs, date-freshness tab,
global repair queue, batch-containment entry and generic bottom agent handoff
are retired from Analysis. Graph validation and maintenance contracts remain in
MCP/CLI; selected-claim correction remains in Map. This redesign does not claim
that the old batch UI is still available here. Source currentness, structural
findings, human acceptance, code checks, merge and deployment remain separate.
