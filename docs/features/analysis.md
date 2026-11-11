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

## Review summary

The review summary's agent-unreviewed line expands into the exact concepts it
counts. It includes agent- and model-authored map concepts without a recorded
`reviewed_by`, even when source evidence cannot be checked. Five names appear
first; Show more reveals the next five without leaving the summary. Each name
opens that concept on the map. Names use the interface language when recorded; hovering a name exposes its
document path, without suggesting that a source file is missing. Opening or expanding the list never writes a review mark.

## Relationships and evidence

The connection explorer owns the screen. A list names every pair of recorded
responsibilities joined by at least one declared cross-responsibility
`depends_on` edge, with the pair's declaration count and a bar scaled to the
most-declared pair; containment and loose associations are excluded. The list is
grouped by responsibility, the most-declared responsibility and pair first, and
a two-way control regroups the same pairs by the responsibility that needs the
other or by the one that is needed, which answers who is affected when a
responsibility changes. The list is one Tab stop that follows the selected pair;
ArrowUp, ArrowDown, Home and End walk its rows, and it scrolls on its own while
the selected pair stays in view.

Selecting a pair draws it: the capabilities of the needing responsibility on
the left, those of the providing one on the right, and one directed line per
declaration. An implementation element's dependency is drawn from the
capability that records it as a role, a dependency declared by a responsibility
itself gets a card named for the whole responsibility, and any other declaring
concept gets a card under its own name and kind. Declarations are shown until a
side holds eight cards, or five in a window shorter than 840px: the selected
declaration first, then searched ones. Every shown card has a line, the count
then reads "n of N shown", and a named remainder action opens the rest. Lines
leave a card from separate points and reach a card on one arrowhead. They
follow measured DOM geometry when labels wrap or text grows.

The selected declaration draws in indigo from its source to its target.
Hovering or focusing a card picks out that card's lines and partner cards.
Pressing a line selects its declaration; pressing a card steps through its
declarations. Under the diagram the selected declaration names its two
concepts, its declaring document, its relationship note, the recorded
implementation and the source state. A "Declaration n of N" stepper beside that
heading reaches every declaration of the selected pair by keyboard. A saved
declaration reopens on its pair with focus on its source card. The cards are
one Tab stop, walked with the list's keys. The pair list, the diagram and the
declaring document are visible together at the minimum app viewport, also for
a pair at the display limit. In a narrower container the list stacks above the
diagram; choosing a pair brings the diagram into view whenever it is stacked or
has scrolled under the page header. A missing structured relationship note does
not prove that the Markdown body has no explanation.

Ownership follows recorded containment to the nearest domain on each parent
path. A dependency whose endpoint has missing or ambiguous responsibility is
counted separately rather than assigned by guesswork. Cycles terminate and
multiple parents remain visible in the underlying facts. Scope counts are
computed before the display limit. Zero recorded cross-domain dependencies is
not a claim of independence: the same workspace offers recorded capability
evidence and gaps instead.

The evidence question lists capabilities under their responsibility; a
capability with no responsibility or more than one sits in a last group named
for both cases. Each row names the capability, each of its recorded gaps in
words or, with none recorded, how many implementation elements and source paths
it records, and, in a local folder, a moved or missing source mark. A project title
is used only for exactly one recorded project; a multi-project graph identifies
the entire folder. A recorded implementation anchor is a source `path` or a
normalized containment relation to a real element document. A reference-only
element or reverse containment does not count. An implementation role without a
source path remains an anchor in the ontology; it is not checked code. Document,
anchor, definition, boundary and uncertainty gaps are distinct facts. A document
without an available `meaningFindings` array is unchecked, not clean. Capability
search narrows the list to matching rows. In the relationship question it lists
only the pairs with a declaration that touches a match, a listed pair opens on
its first such declaration, and cards and lines off those declarations are
quieted; the selected evidence does not change until a pair is chosen. Clearing
or pressing Escape returns focus to the search field, and a selection made from
a match stays selected. The All or Recorded gaps scope is an exclusive
keyboard-operable control that names each scope's count and narrows the list.
Recorded gaps opens first when a gap is recorded, otherwise All; choosing it
with none recorded says so in place and offers the full list. Below the
stacking width, choosing a capability brings its evidence into view. The list is one Tab stop that follows the selected capability, walked
with ArrowUp, ArrowDown, Home and End. The share of capabilities with an anchor
lives under the count-basis disclosure.

A separate Source state filter selects All sources, Source changed, Source path
missing or Not checked. Its counts cover recorded capabilities, not
implementation elements. It combines with name search and the recorded-gap
scope; their intersection is counted above the list. Rows outside the scope
leave the list while the selected claim stays listed and its document remains
open. Missing source paths take precedence over changed paths, following the
existing evidence verdict. Unavailable, unmeasured, omitted and folder-only
evidence stays Not checked; zero changed paths is not a claim of current or
accepted meaning.

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
