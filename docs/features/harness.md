---
title: Harness
doc_type: feature
status: current
area: harness
routes: [/architecture]
---

# Harness

### `/architecture` — Harness: structure, coverage, guides, architecture

**The tab is Harness (`harness.title`) and it answers "how are agents set up to work in this repository"**
(2026-09-13, `docs/records/decisions/2026-09-13-architecture-tab-becomes-harness-3a63ada4-031c-41af-8b9d-6d6f7f2a5138.md`). The route is unchanged, the label moved: the destination
already held one half of the answer (the reviewed structure) and nothing at all of the other
(what the agents were told, and what catches them). Under the title one line says what the tab
is for, and a tab set picks one of **four** views on `?view=`.

**The layer ladder became its own tab on 2026-09-19** (owner). It had been living under the name
Structure inside a destination called Harness, and it is the product's **architecture** — which,
in the vocabulary this tab borrows, is one of the three things a harness *regulates*
(maintainability · architecture fitness · behaviour) rather than a part of the harness itself. So
`?view=architecture` holds the ladder under its own name and `?view=structure` holds the harness's
own anatomy. Nothing redirects between them: an old `?view=structure` link opens a real view of the
same repository, one press from the ladder, where mapping it across would leave the tab a person
presses and the tab a link opens disagreeing forever.

**The arrival depends on the surface, because one of the views cannot answer on the web.** Almost
the whole harness lives in dot directories and a browser's folder permission cannot see a dot entry
at all, so the installed app arrives on the harness structure and a browser arrives on the
blueprint, which is built from the bundled profile and answers there. Both surfaces keep all four
tabs, and an address that names a view always wins. Three addresses keep their meaning: `?view=sensors`
— the view that named exactly this question and said it was not built — opens the matrix that
answers it, and `?role=` or `?stage=` with no `?view=` opens the ladder, the only view with either.
The shell-wide `?focus=main` skip anchor every left-rail link carries is deliberately not a deep
link: keying the carve-out on it made one rail click open the ladder and left the default
unreachable from the rail (measured in the installed app, 2026-09-13).

**One sentence at the top, computed from files only**: how many guide documents this repository
speaks to agents through, and how many checks it has in place. Both numbers print their working
— the check number shows its three parts (hook scripts wired · files under `.githooks/` ·
`package.json` lint/typecheck/test scripts) and a caption states the counting rule — because a
bare count invites a reader to hear "N things are protecting you" where what was measured is "N
things are declared". The unguarded-domain question is **not** in that sentence: a deferral
sitting inside a sentence whose other slots are numbers asserts that unguarded domains exist and
are merely uncounted, which no static read of a repository can claim. It stands on its own line
and points at the sensors view.

**Guides (`harness.views.guides`)** — one row per guide file or directory found, with: which tools read it, each
claim carrying the document it came from and the date a person last opened it (a claim we cannot
cite says so (`harness.toolsUncited`) rather than rendering like the sourced rows); size against a
documented cap, where the Codex bar measures the **merged** root + worst-nested `AGENTS.md`,
because that is what Codex truncates and a per-file bar reads green while the merge is already
being cut; reference byte comparisons between same-named tool guides, with a difference
door (`harness.driftOpen`) that opens both complete files side by side under the row; and the file's modification time
on this disk, labelled as that rather than as a commit date. Comparison counts do not claim that the pairs match, and tool-specific differences are informational rather than a synchronization requirement. Below the table the hook configs are
listed by script: wired (`harness.hookWired`) means the script the config names exists on disk, never that it runs
— a script the config names and the disk does not have is called out, because that failure
produces no error at all, and the Codex group carries its approval requirement (`harness.hookApprovalGate`) as a standing
fact instead of a green, since `/hooks` trust lives in no file. Measured on this repository:
98 guide documents in 9 groups, 85 checks (20 + 6 + 59), `AGENTS.md` 12,142 B merging to
13,090 of 32,768, both declared pairs matching, 20 of 20 hook scripts wired.

**Structure (`harness.views.structure`)** — the harness's own anatomy, read from this repository's
files (2026-09-19). Its three bands are the coverage matrix's three columns — **Told**, **Gated**,
**Watched** — deliberately, so one destination teaches one vocabulary: the matrix asks those
questions of each **area** of the product, this asks them of each **part** of the harness. Told
holds what is read every turn, what attaches by path, the skills and the sub-agent briefs, and the
servers wired over the agent connection; Gated holds the hooks that can refuse a tool call, the
`permissions.deny`/`ask` rules — the only gate that cannot be talked around, and one this product
had never shown anywhere — and the files under `.githooks/`; Watched holds the hooks that only
record, the check scripts a command names, the test files a runner discovers by itself, and the
workflows that run after a push.

Structure starts as a connected diagram of this measured repository composition, with a Text
alternative over the same model. Selecting a part reveals its evidence immediately below that
part. The page header and presentation switch stay fixed. The compact overview fits a desktop
viewport; expanded evidence, larger text and smaller windows scroll only within the work area.
Connections are composition, not proof of runtime execution; missing parts and tool-owned
state keep their distinct meanings. Unbound and browser-only states show a labelled illustrative
scene with a source-connection or app-download action, respectively.

**What the repository keeps out of sight is a gate too** (2026-09-20). Gated carries the exclusion
files, and the row prints the name each product actually uses rather than one word for all of them:
`.cursorignore` and `.cursorindexingignore` (Cursor), `.codeiumignore` (Windsurf, not
`.windsurfignore`), `.aiexclude` (Gemini **Code Assist**), `.geminiignore` (Gemini **CLI** — a
different file for a different product), `.aiignore` (JetBrains AI, which also honours the first
three at a repository root). Two names are deliberately absent: `.claudeignore` does not exist —
Claude Code uses `.gitignore` for discovery and `permissions.deny` for the rest, which this view
already prints — and `.agentignore` is a proposal rather than a standard. The row also carries the
limit the hook rows carry: a repository can write the file, and whether the tool honours it is the
tool's business. An exclusion file is **not** counted among the documents the census sentence says
the repository speaks through, because a file saying what an agent may not see is the opposite of a
thing the repository says.

A fourth band under those three holds **the agent loop and the model**, which every public account
of a harness puts at its centre and no checkout can answer: what is read first, when to stop, what
to drop when the context fills, which model runs. It carries words rather than a zero, because a
count there would be a lie with a number on it. The part names come from four public sources —
Fowler and Böckeler's guides and sensors, arXiv 2609.00006 (CC BY 4.0) on harness anatomy, OpenAI's
instruction chain, Anthropic on long-running harnesses — and the screen prints that provenance
behind a hint rather than asserting the taxonomy as its own.

**What a turn costs, beside the count that cannot say it.** The always-read row prints the sum of
its files' bytes: three 2 KB documents and three 40 KB documents are both "3", and that difference
is the subject — those files are read before the agent has seen a line of code, on every turn, in
every session, whatever the tool. Conditional guides are excluded on purpose; they are paid by the
turns that touch their folder. Measured on this repository: 25.6 KB read every turn across 5
documents, 14 more attached by path, 18 skills, 15 briefs, 2 servers, 5 hooks that can refuse
(the mirrored Claude and Codex copies of one guard counted **once**, as the coverage view already
counts them), 10 denied permissions, 6 files under `.githooks/`, 6 hooks that watch, 60 check
scripts, 1,471 discovered test files and 7 workflows.

**An empty part says where one would live.** A row with nothing in it carries the conventional
address for that part — `.mcp.json`, `hooks.PostToolUse`, `.github/workflows/checks.yml` — copyable,
taken from each tool's own documentation. It is an address and never advice: plenty of repositories
rightly have no sub-agents and no MCP servers, and a screen that turns every blank into a to-do is
the maturity score this destination refuses, wearing a different hat. Atlas writes nothing into a
source repository; the person pasting the path into their editor is the step where they decide. Two
rows get no address at all — the agent loop, which is not the repository's to hold, and where a test
file should live, which has no one answer worth a screen asserting.

**Coverage (`harness.views.coverage`)** — the tab's spine and its default view
(2026-09-13, `docs/records/decisions/2026-09-13-harness-spine-is-a-coverage-matrix-b9dba267-d755-4ad5-b854-6f930c7e5922.md`).
Rows are the domains the ontology records for this repository; columns are **Told**, **Gated** and
**Watched**. A file appears in a domain when a path **it declares** reaches a path the ontology
records for that domain — a nested `AGENTS.md`'s own folder, a `.claude` rule's frontmatter `paths:`,
a hook script's anchored lane filter, a check command's file arguments, a workflow's trigger
`paths:` — and never because of where the agent file itself lives: all 122 of this repository's sit
at the root and say nothing about which code they govern. A scope is kept only if it resolves on
disk, and every entry carries the declaration it came from, so an attribution can be checked rather
than trusted.

**Every mark says one thing** (2026-09-13). The square in a cell is a container: **filled** when
something names that domain for that question, **drawn and empty** when nothing does — two states,
separated by fill as well as by hue, and nothing else. The number beside it carries how many, as a
number. Above each column stands a card with **one large number: how many domains that column has
no answer for**, over a denominator printed beside it — and that number is literally the count of
empty squares below it, so a reader can settle the claim by counting rather than by trusting. The
card uses the same census grammar as `/ontology/insights` (`shared/ui/census-tile`), reused rather
than re-invented. No length encoding survives: with counts of 0–12 across eight rows, a bar drawn
against an invisible per-column maximum made a Gated `2` and a Watched `12` the same mark.

Anything declaring no path reaches every domain and is **counted on the card of the column it
qualifies**, opening beneath it rather than repeated down eight rows: `forbidden`, `git` and
`local-first`, twenty hook and Git-hook scripts, and `lint`, `test`, `test:run` and the six CI
workflows with no trigger filter. That count is what makes the empty cells readable — "no check
**names** this domain" is what the files support, while "nothing runs over it" is not. A guard
mirrored across `.claude/hooks/` and `.codex/hooks/` — nine of this repository's are — appears
**once**, with the tools that read it, because the repetition destroyed exactly the distinction the
two files carry.

**An empty cell is the product.** It is a mark that reads down the column at a glance, and opening it shows the ontology's
own record of what the domain is for beside the paths nothing reaches — the sentence a file-only
scanner cannot write, because it does not know what a part of a repository is *for*. **No score, no
grade, no maturity level and no percentage is rendered anywhere**: that is what every comparable
tool ships, and a number asserts a judgement files cannot support. A repository with agent files and
no ontology gets a stated empty state rather than a blank grid, and still gets the half of the
screen that needs no ontology.

**What an agent can reach** — beneath the matrix, in the same census grammar with **no card**: the
three counts keep the display step because they are this block's answer, and they give up the
surface, because two identical strips cannot both be the screen's subject and the numeral cannot
say which is (2026-09-13). Every authored Markdown file falls into exactly one
of three states: a **guide** (read without being asked), a document **a guide names** by path
(reached when needed), or a document **nothing names** (present, and the agent will not open it).
Measured by citation and never by glob: a rule's `paths:` says when to load that rule, not which
documents to read, and reading it the other way makes `documentation.md`'s `docs/**` mark every
document reached. Excluded and named on screen are the ontology folder and the folders the
repository's own `.gitignore` marks as generated; nothing else is filtered, because a sample vault,
an archive and a brief addressed by name rather than by path all belong in the third row for
different and mostly fine reasons, and which of those should be unreferenced is the reader's
judgement. A document naming a design file is a reference, never proof the agent saw the design.

**The wait screen is held back, never the read.** The scan reports each pass it runs and fills a
bar only where the denominator was known before the pass started — but it appears only once a read
has taken longer than a second, so a read that finishes in 0.6s shows no wait screen at all and one
over five thousand documents still gets its stages. The read was never slowed to display it. What
happens on every visit regardless of speed is the **arrival**: the result rises into place and the
six numerals count up from zero.

The whole reading goes through the installed app's bridge (`entities/agent-files`, the same
classifier the docs sidebar and `ontology-atlas agent-files` use — one store, not a second). A
browser's folder permission cannot see a dot entry at all, so on the web these views name what they
cannot reach instead of drawing a shorter list and calling it the inventory — and the destination
opens on the blueprint there rather than on a card about what this browser cannot read.

- Architecture is separate from the Ontology Map and from the public five-kind
  ontology schema. A non-kind `architecture-profile/v1` Markdown document keeps
  reviewed pattern axes, scopes, roles, paths, evidence, and allowed dependency
  direction plus governed import usages in the same Git-backed folder without
  becoming a map node.
- The stable role blueprint is one reviewed contract. Pattern names are declared
  summaries; Atlas does not infer Clean, Hexagonal, MVP, or Feature-Sliced Design
  from folder names. The visible Understand → Plan → Verify stages were removed
  on 2026-09-03; the canvas compares reviewed intent with observation directly.
- **The ladder's contract face grows into the card's spare width, and the drawing is
  centred** (2026-09-13, inspection 122 S8). The three faces used to hold 280/72/240 whatever
  the card's width: measured at 1512×949 in the installed-app window the drawn band was **592px
  inside a 1448px card (41 %), sitting 124px left of its centre, with all seven role sentences
  ending in an ellipsis** while 856px of the card stood empty; the tight ladder buys its height
  by dropping the sentence's second line, and one 280px line cannot hold a Korean sentence. The
  contract face now takes the ground neither lane wants, up to 560px (derived: the longest
  dogfood sentence estimates at 472px and `captionLineRoom` spends 24 on padding), and whatever
  the lanes still do not need is split evenly. Re-measured at the same size: band **872px of
  1448 (60 %)**, centred to the pixel, **0 of 7 sentences cut**, height unchanged. The
  observation column also states "not inspected yet" once under its heading instead of once per
  role, the way the across-axis lane headings already did.
- **The comparison ladder is chosen by height** (2026-09-03). Whenever the seven
  reviewed / 72px delta / 240px observation rows fit the canvas at rest, the
  chain runs down as that ladder — at 1512×945 and at 1920×1080 alike — and each
  rule sentence sits beside the arrow it describes, in the 24px gap between the
  two faces it joins. A canvas too short for the rows, or a profile with parallel
  lanes, still draws the across chain. The ladder needs only its faces plus 48px of
  side lane each side, so a tablet canvas from 744px draws it too. A canvas too
  short for those rows but tall enough for tighter ones draws the same comparison
  on 58px faces with one summary line and a 22px gap, so a 1280×800 laptop shows
  all seven roles instead of counting the seventh as hidden. Choosing a role
  recedes the unrelated roles and strokes to 0.7, so every receded word stays at or
  above 3:1. Every role is one rounded face (the stadium ends were retired on
  2026-09-03), and captions wrap by the width their script needs, so a Korean
  sentence stays inside its face. Both lanes seat an adjacent sentence beside its
  own arrow; a skip arc leaves and arrives at the face's side with a side port,
  so no arc crosses a row gap; the count sentence reads "{from} → {to} import
  {n}"; and the side lanes go where the arcs are, a 48px contract lane unless the
  profile declares a skip and up to 360px for the observation lane. The ladder sits
  in the middle of the height it has, and the observation face is exactly its row,
  so both lanes share one arrow length and one sentence baseline. Below the
  paired width a phone draws the narrow ladder: one lane, the face as wide as the
  canvas allows up to 280px, two caption lines, and each rule sentence beside its
  arrow reading to the canvas edge. A short-canvas across chain grows its faces
  with the canvas up to the roomy 220px, names each row once above its first face
  instead of on every face, and gives its captions three lines.
- **A role's sentence can be written in the reader's language** (2026-09-03). Beside
  `summary_<role>`, a profile may carry `summary_<role>_<locale>`, such as
  `summary_views_ko`. The screen shows the locale line to a reader in that locale
  and the canonical `summary_<role>` to everyone else, so a profile translated one
  role at a time never leaves a blank where a sentence was. `summary_<role>` stays
  the reviewed fact: it is the only sentence the agent handoff, `inspect_architecture`
  and CLI `architecture` print, and a locale line without it is refused, as is a
  locale line for a role the profile does not declare. A document whose profile this
  screen cannot read is now named in a notice above the canvas instead of replacing
  every profile in the folder with an error.
- **The agent task is the person's to choose** (2026-09-03). The button keeps its
  derived default — inspect source, review delta, or plan change — and a chooser
  beside it lists three tasks with one line each: inspect or re-inspect source,
  plan change, and find improvements. The chosen task stays on the button and the
  copy confirmation names it. Find improvements names where the reviewed
  profile and the observed imports disagree, plus unmapped, unruled and empty
  roles, with literal paths, and asks the person what the rule should be; it
  proposes no rule, role name or pattern and writes nothing. A verified agent takes
  the chosen task as its opening turn; a browser copies the same sentence.
- `inspect_architecture` and CLI `architecture` scan supported source imports and
  return `architectureBrief:v1` with `conforms`, `violated`, or `unknown`.
  Observed role edges retain value/type-only/unknown usage counts and exact
  receipts. Unsupported languages, unknown import usage, unmapped edges,
  unruled edges, and empty roles fail closed; absence of evidence is never a
  green result.
- **At workbench width the screen is a canvas with docks, and it does not scroll**
  (2026-08-30). The canvas holds the full height; the role's own answer, the rule
  sentences, the mark legend, the applied scopes and the dependency-direction prose
  open in a 380px panel beside it — by clicking a role, by the "Roles and rules"
  button, or by a link naming a role — and Escape closes it. The continuous
  contract/observation/delta ledger opens in its own 360px panel. Role, rules, and
  evidence panels are mutually exclusive, because two at once leave a laptop canvas
  too narrow for the drawing. The 44px evidence summary stays above the canvas at
  every width. Below workbench width the panels return to the document flow.
- **A violated crossing is drawn as one** (2026-08-30): always visible even when it
  skips a role, in the same tone as the `Violated` pill, dashed so it reads without
  colour, with its own legend row and the same mark on its sentence.
- **Each role box carries its own ledger** when a persisted receipt exists
  (2026-08-30). One line under a ruled separator states what that role's own
  outgoing edges did and how many imports leave it — `✓ none recorded · 411
  imports`, `⊘ 2/5 edges violated · 38 imports`, `at least N violated` when the
  receipt's violation sample was truncated, `○ no source matched` for a role the
  receipt lists as empty. It is never a per-role verdict: `conforms` /
  `violated` / `unknown` stays profile-wide in the evidence summary, and no box ever
  says "unmeasured", because unmapped and unruled edges carry no role. Without a
  receipt there is no ledger at all rather than a row of zeros — in a browser,
  which cannot read a source folder, that is the ordinary case. Status is a
  glyph, never a colour.
- The short agent action sends a state-bound inspection or change request. In the installed
  app, an exact CLI fallback is included only when the project source binding,
  vault path, and Atlas CLI entry are all verified absolute paths; otherwise the
  packet says the fallback is unavailable instead of inventing a command.
- At narrow widths the role model remains first in document order. Open evidence
  and role panels scroll into view without covering the persistent bottom tabs,
  whose reserve stays part of the workbench.

**Import direction is drawn as depth** (2026-09-08). The reviewed ladder stands on stacked translucent planes, one per layer, stepping 14 px per rank so the stack shears along one line and reads as a solid: an allowed import runs down onto a lower plane in indigo, a violation is the stroke that climbs to a higher plane in the danger tone with a halo that rises when either end is selected. Plane fill is capped under a role's own face so depth never inverts; the lit top edge carries the reading. Measured at 1512 and 1280: overlap count 0, every label at or above 4.5:1 on its plane, height up 1.6 to 2.8 percent, width unchanged.
