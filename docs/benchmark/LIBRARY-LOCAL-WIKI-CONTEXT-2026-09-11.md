---
title: "Local Compile and existing human context — 2026-09-11"
doc_type: finding
status: historical
area: library
date: 2026-09-11
---

# Local Compile and existing human context — 2026-09-11

Local Compile previously assembled a replacement from raw sources without giving
the model the existing Wiki body. The old body existed only in the proposal data;
the rendered consent card showed paths and counts without either complete version.
The repair makes existing context available through a bounded read before a
replacement can become ready. Reading does not establish semantic preservation.

This is one part of the [Library quality program](../plans/LIBRARY-QUALITY-PROGRAM.md).
Claude Code and Codex ACP remain primary supported paths, with their separate
[ordered-arrival evidence](LIBRARY-ACP-MAINTENANCE-2026-09-11.md). This local-runner
experiment does not qualify ACP or imply that ACP provider traffic stays local.

## Before-state

At commit `1346266ec`, a synthetic probe called the production Compile executor
with a source and an existing page containing a personal announcement constraint.
The executor accepted a replacement without that note. Its tool results never
returned the note, although the proposal's `before` text retained it. The probe granted no
approval and wrote no files. This demonstrates a deterministic information-flow
gap; it does not demonstrate an unapproved overwrite or a frequency of model loss.

Two independent reviewers recommended the bounded repair. They required fresh
text and timestamps from the same File snapshot, separate absence and read
failure, a shared canonical read/write target, complete context within existing
bounds, stale proposal invalidation, and preservation of personal-note provenance.
Both rejected treating a read receipt as understanding or human authorization.
Their references to the existing diff concerned the data structure. A later
render-source inspection found that `LocalCompileCard` never displayed that data.
The repair therefore also exposes the exact previous and proposed Markdown before
Allow once, using one version selector inside the existing scrollable card.

A browser checkpoint exposed another gap: at 390 pixels the index covered the
approval footer while the version selector was visible, and the selector was
covered after scrolling the footer into view. Separate scroll-state checks had
hidden this conflict. Source inspection also showed that retained questions or
an open document could hide the first-run section that owned the approval card.
Local work now occupies the reader pane independently of that section. The narrow
index stands aside while the work is open, and closing it returns to the prior
selection. The browser check requires both controls to be reachable in the same
state after a long preview has been scrolled.

## Read and consent contract

The Compile-only reader returns sequential 4,000-character chunks of untrusted
existing Markdown. Only a complete read returns a receipt that a later replacement
proposal must echo. Each continuation and proposal rechecks the exact text and
timestamp. Source text and Wiki context share the existing 40,000-character turn
budget; the three-page and ten-round limits remain. Incomplete context cannot
become a ready replacement. A failed later attempt invalidates an earlier ready
proposal for the same identifiable page.

Raw-source reads still supply citation support and provenance. A personal note
must remain explicitly attributed prior context, without a fabricated source
citation. The prompt asks the model to resolve only supported portions of old
questions and preserve the remainder. The person still inspects and approves the
exact replacement. The previous version remains directly selectable; a new page
has only its proposed preview. Before saving, local Compile rechecks every selected page's
before text and timestamp; a detected correction stops the selected writes.

These comparisons do not detect an identical delete/recreate with indistinguishable
text and timestamp. Writes remain sequential; an I/O failure after one write does
not have a transactional rollback guarantee.

## Sealed real-model case

The synthetic original establishes an approved September 4 change from 31 to 14
days for routine records, 45 days for incident records, and Morgan as owner. It
does not confirm configuration migration or grant announcement/deployment approval.

Only the existing Wiki contains personal note `HC-CEDAR-483`: wait for dated
written approval from Morgan before an external announcement. It also asks who
owns the policy, when it takes effect, and whether the software configuration has
migrated. The task names only the source and existing page; it does not supply the
hidden note. A successful revision must retain its meaning and attribution,
resolve owner/date, retain migration uncertainty, and distinguish current policy
from the historical 31-day account.

The harness runs the production `compileAdapter`, `runTurn`, executor and consent
builder against loopback Ollama `gemma4:12b`. Each request, response, tool result
and scope is saved with the exact seed. The transport is a direct loopback harness,
not proof of the native bridge or its audit log. No provider turn grants approval
or writes into a user vault.

The baseline used four requests: one raw-source read followed by three empty
assistant bodies, including the adapter's two nudges. It produced no ready
proposal and never received the prior Wiki context. This is a failure to finish,
not a model-generated note-deletion result.

The repaired Gemma run received the complete existing Wiki in its third request,
then returned three empty assistant bodies. It used five requests and produced
no proposal. Information availability passed; maintenance completion did not.

A supplementary, unpaired `qwen3:8b` run tested whether another installed model
could complete this tool protocol. It read both documents and produced a
template-valid proposal in four requests. The proposal nevertheless omitted the
personal note, retained the old 31-day statement as an unqualified fact, and left
the owner/date question unresolved. Its paragraph citation resolved to the real
source, but that did not make the retained claim a faithful current account.
This run failed semantic maintenance. It was not approved or written.

### Full application-request follow-up

The preceding three runs used the production executor, adapter and loop with a
179-character handwritten task. They did not call `buildCompileBrief`, which the
application supplies as its full user message. Those observed failures are valid
for that narrower protocol, not direct qualification of the complete app request.
An independent source audit identified this limit before changing the product.

At `f41fe6c06`, the same sealed source and prior Wiki were projected through
`buildLibraryModel` and the full English `buildCompileBrief`. Both Gemma and Qwen
produced proposals with the current 14-day routine and 45-day incident values.
Gemma also recorded Morgan and left migration unconfirmed. Qwen recorded Morgan
in Facts but retained its old owner/date question. Both omitted the personal
note. No proposal was approved or written. The full request materially improved
some outcomes while correction continuity remained unproven.

Source inspection and a browser regression also found that a local choice could
inherit the detected ACP runtime's writer id. The local system named three tools
and explicit review, while the user brief named ACP readers, sheet anchors,
writer-owned metadata and immediate writes. Its target list could include files
outside the local runner's already bounded readable set. Execution instructions
now follow the selected runner; the shared meaning and preservation rules remain
in one place. A matching schema still does not establish semantic correctness.

The aligned local request was then run once per same model and seed. Gemma kept
14/45 and Morgan but again omitted the personal note, omitted the effective date,
and misleadingly called an unconfirmed migration question resolved. Qwen again
omitted the note and proposed an unqualified 31-day fact. These single stochastic
runs do not isolate a causal prompt effect or establish improvement. They leave
local semantic maintenance unqualified; the deterministic fix is to the selected
writer, readable target set, tool vocabulary and actual review boundary.

Browser coverage captures both detected ACP runtimes with the local preference
selected, a mixed PDF/Markdown folder and a retained answer. It checks the actual
first model request, then separately checks Claude Code and Codex ACP requests,
retained-answer revision and cancellation. Scripted responses prove routing and
consent mechanics, not the models' ability to preserve corrections.

Follow-up artifacts are under
`/tmp/atlas-library-qualification-20260911/production-brief/`, including the
independent `audit.md`, frozen projections, exact full briefs and model replies.

These failures remain evidence. The read gate closes the deterministic missing
context path; it does not qualify either tested local model for dependable
autonomous refresh. The new exact-text preview lets a person inspect the proposed
loss before deciding. Mocked browser proposals test transport, display and consent
mechanics only; their successful note preservation is not model-quality proof.

## Evidence limits

The corpus is short, synthetic and familiar to the builder. It cannot establish
general maintenance accuracy, long-document usability, recurring owner value or
provider superiority. The Mac is locked; hidden WebView state and browser
screenshots cannot qualify the native rendered surface. Owner-corpus work and
the native checkpoint remain open.

Scratch evidence for this run is under
`/tmp/atlas-library-qualification-20260911/local-wiki-context/`, including
`brief.md`, `evidence.md`, `steward.md`, `run-local.cjs`, `baseline-gemma/` and the
focused RED/GREEN logs. The earlier deterministic before-state is
`maintenance/local-context-probe.cjs` and `.json` in the same qualification root.
