# DECISIONS — the council decision ledger

> This file keeps **the decisions and the arguments that lost when they were
> made**. `docs/CHANGELOG.md` answers *what changed and when*; this file
> answers ***why it was decided that way, and what was staked on it***.
>
> Newest first. Records are **appended, never edited**. When a judgment
> changes, write a new record whose `Prior` names the old one. A wrong record
> is still an asset.

## The ledger's contract (unread, it has no reason to exist)

1. **Read before convening.** Before opening a council (and before writing a
   solo PO pass), look for a **prior decision on the same surface and the same
   question**: `pnpm decisions:find <terms>`. If one exists, the new pass
   either cites it as still standing or overturns it explicitly. Deciding
   again in silence is the thing this ledger exists to prevent.
2. **Falsifiers are live.** Each record's `Falsifier` is "what would be
   observed if the losing side had been right". **When that observation
   appears, the losing side has won**, and a revisit opens. Dissent that is
   written down and never read is a checklist, not a council.
3. **A revisit trigger is a condition, not a deadline.** A date is allowed, but
   an **observable condition** is better ("after the first ten installs",
   "once npm downloads pass 100").
4. **Overturning is recorded.** When the owner overturns a council
   recommendation, that is a record too; it is never absorbed quietly. A
   recommendation that was overturned and later proved right is the most
   valuable data in this ledger.

## Record format

Six fields, in this order, within one screen. The exact template and the
reasons live in `docs/PRODUCT-OWNER-OPERATING-SYSTEM.md`, and
`pnpm decisions:check` refuses any record that differs.

```md
## YYYY-MM-DD — <the decision in one line>

**Why**: <the observation that forced a decision>
**Prior**: <YYYY-MM-DD (n) cited as standing or overturned, or none>
**Decision**: <what is decided, the smallest slice>
**Dissent**: <the strongest losing argument and whose it was, or none>
**Falsifier**: <the one observable condition that reopens this>
**Owner**: <the accountable person>
```

Format history: a ten-field Korean template from 2026-07 (convened, trigger,
rubric, decision, applied rule, signature, recorded dissent, falsifier,
revisit, status), a fifteen-field format from 2026-09-01, and this six-field
format from 2026-09-02. On that day every earlier record was condensed into
it and translated to English by the owner's instruction; the record of that
decision is dated the same day. Dates and numbers are unchanged, so every
citation still resolves, and `pnpm decisions:find` lists who cites a record,
so status is derived rather than edited. The full original text of every
record stays in Git history before commit `e4fb49a89`.

## 2026-09-04 — A CLI exit code says whether the input could be answered, not whether the answer is empty

**Why**: a second CLI audit found `backlinks <typo>` exiting 0 with an empty list, the one answer that licenses a delete, while `install-shim --json` printed a shell body before its JSON and `agent-activity --show` exited 1 on the ordinary first run with no heartbeat yet, the exact step Atlas's own guidance tells an agent to script.
**Prior**: none on this surface; the 2026-08-30 CLI/MCP module unification stands and is untouched.
**Decision**: one rule for the CLI: non-zero means the input could not be answered, zero means it was answered even when the answer is empty or absent. `backlinks` fails closed on a slug that names no node (exit 2, closest slug named, `resolved:false` in JSON), CLI-side only since MCP `find_backlinks` keeps its shape; a real node with no referrers still exits 0. `install-shim --json` emits one JSON document on every terminal path and moves the pre-write preview to stderr while carrying the shim body in the JSON. `agent-activity --show` before the first heartbeat exits 0 with `exists:false`. An unknown command prints its suggestion and one `--help` pointer instead of the full help.
**Dissent**: po-steward — a cleanup loop over stale slugs now aborts on the first typo where it used to get an orderly zero; kept because no such caller exists in the repository and the JSON body still carries `resolved:false` for one that appears. po-evidence — the help-dump removal has no observed harm and could have been left out; kept as a two-line change in a file the slice already touched.
**Falsifier**: a real caller that treats `backlinks` exit 0 with `total:0` as "safe to delete" and breaks on the refusal, or MCP `find_backlinks` still answering an unresolvable slug with `total:0` a month on, which would make the CLI guard a divergence rather than a repair.
**Owner**: jinan

## 2026-09-04 — A stale receipt may emit coordinates the live source verifies, and a capability's name is part of its claim

**Why**: the 2026-09-04 audit ran three task sentences against the dogfood vault and got the wrong capability three times: a 25k-character document with no `## Definition` was scored on its whole body and beat the capability whose title named the task. Navigation stayed `source_not_current` while all 119 witness paths still resolved, because the receipt was one commit behind, so "Primary: unknown" was the permanent answer on an active repository.
**Prior**: 2026-09-02 "Compact task handoff follows persisted capability boundaries" stands. 2026-08-30 "Exact task navigation is reviewed evidence" stands except its clause that a stale receipt never emits an exact target, overturned narrowly here.
**Decision**: title, slug, and path join the positive claim before the Excludes subtraction; a document without Definition/Includes/Excludes is scored on its first paragraph, and `Inclusions / Exclusions` bullets count as Includes/Excludes; declared element names add a bounded score only after the parent claim qualified. When the receipt is stale but the same probe finds every witness path, coordinates are verified against the live files and returned as `live_verified` with `receipt: stale`; the receipt is never restamped and the `source_changed` warning stays. `mcp-verify` fails only on vault errors; `init` installs skills by the config containment rule; `bootstrap` reports an undeliverable import graph as omitted, not zero.
**Dissent**: po-steward — witness existence proves files exist, not that recorded meaning is still true; accepted, only the navigation gate changed. po-evidence — identity weight can turn one right winner into a tie on internals-phrased tasks; measured, those wait on the MCP server document stating a Definition.
**Falsifier**: a `live_verified` coordinate that does not resolve in the live file, or a second prospectively built vault where the named capability's Excludes cover the task.
**Owner**: jinan

## 2026-09-03 — Codex chat pins the last adapter whose read-only mode holds the installed permission matrix

**Why**: the installed current `@agentclientprotocol/codex-acp@1.8.0` advertised `read-only` but sent `workspaceWrite` and created a direct file with no permission request; 1.7.0 carried the same mapping, while 1.6.2 sent an actual `readOnly` sandbox. The rebuilt installed app on exact 1.6.2 then held direct-file reject, allow-once, and ask-again, plus typed Atlas MCP reject, allow-once, and ask-again with byte-level checks.
**Prior**: 2026-09-03 "Isolated Codex uses the supported interactive approval policy" stands for `on-request` startup but its assumption that the current adapter preserves the sandbox is narrowed; the three 2026-09-03 Atlas MCP checkpoint and exact-correlation records stand.
**Decision**: launch Codex with exact `@agentclientprotocol/codex-acp@1.6.2`, force `INITIAL_AGENT_MODE=read-only` at process start and `session/set_mode(read-only)` before readiness, expose no writable mode, and make the registry check fail when the separately recorded reviewed upstream identity moves. Codex remains chat-eligible only while this exact installed permission matrix passes; a newer package earns adoption through the matrix, not recency.
**Dissent**: pinning an older adapter can defer upstream fixes and protocol improvements; it loses because the current package violated the product's write boundary, while the registry drift gate keeps the exception visible and forces a deliberate remeasurement on every upstream move.
**Falsifier**: if any direct or Atlas write changes bytes before approval, rejection changes mtime or hash, `allow_once` carries into another request, the mode can become writable, the registry gate misses an upstream move, or 1.6.2 becomes unavailable, remove Codex from `CHAT_ELIGIBLE` until a version passes the full installed matrix.
**Owner**: stark

## 2026-09-03 — Atlas marks its write elicitation for adapter-owned exact correlation

**Why**: the first installed replay after exact client correlation still showed the standalone outside-folder card: Atlas's message-only elicitation carried no approval metadata, so pinned `codex-acp` 1.8.0 did not connect it to the MCP call it had already announced. Its source and the MCP request schema show a narrower bridge: `codex_approval_kind: mcp_tool_call` makes the adapter require exactly one pending call for the thread and server, then forward that call's real identifier.
**Prior**: 2026-09-03 "Codex MCP approvals require exact structured call correlation" stands and its no-temporal-inference boundary is retained; 2026-09-03 "The Atlas write checkpoint uses a message-only permission request" stands.
**Decision**: add only the namespaced `_meta.codex_approval_kind = "mcp_tool_call"` compatibility hint to Atlas's message-only write elicitation. The hint grants nothing: the pinned adapter owns pending-call uniqueness, the ACP client still requires exact session and tool-call identity plus structured server/tool/arguments, and the person still chooses once. Other clients may ignore the metadata. Do not add a most-recent or session/server temporal fallback in Atlas.
**Dissent**: a vendor-private hint couples the generic MCP server to one adapter version and could drift on upgrade; it loses because the adapter is pinned, unknown `_meta` is permitted by MCP, and duplicating its lifecycle with temporal inference would be weaker authorization evidence.
**Falsifier**: if the installed pinned adapter still emits a standalone id, if ambiguity yields an approvable card, if any supported non-Codex client changes behavior, or if an adapter upgrade removes the marker contract, disable the affected Codex write path rather than infer the latest call.
**Owner**: stark

## 2026-09-03 — Codex MCP approvals require exact structured call correlation

**Why**: after the message-only checkpoint made Codex `patch_concept` ask successfully, the installed card still called the operation an unknown write outside the folder because `codex-acp` sends `{server, tool, arguments}` on a preceding `session/update` and sends the permission itself with only the same session and tool-call identifiers.
**Prior**: 2026-09-03 "The Atlas write checkpoint uses a message-only permission request" stands; 2026-08-16 permission-boundary decisions stand on structured policy input and fail-closed unknowns.
**Decision**: correlate an MCP approval only by its exact `sessionId` and `toolCallId`, accept only the update's structured `{server, tool, arguments}`, normalize it to `mcp__<server>__<tool>`, and consume it once. A matched Atlas write receives typed ontology review; a matched non-Atlas MCP tool receives the ordinary explicit card; an MCP approval with missing, mismatched, stale, or malformed context returns `cancelled` without a card. Clear context on completion, session replacement or cancellation, and client disposal; never infer identity from a dotted title or the most recent call.
**Dissent**: a generic card for unidentified approvals would preserve broader adapter compatibility; it loses because the person cannot judge an unnamed operation and showing authority without inspectable arguments violates the correction boundary.
**Falsifier**: if an installed Atlas card names the wrong server, tool, target, or arguments; if rejection changes bytes; if approval changes any file beyond the reviewed concept; or if a legitimate non-Atlas MCP flow cannot provide structured correlation, reopen the fallback and adapter contract.
**Owner**: stark

## 2026-09-03 — The Atlas write checkpoint uses a message-only permission request

**Why**: an installed Codex ACP `patch_concept` reached the server checkpoint but showed no review card and returned `cancel`; `codex-acp` 1.8.0 forwards a non-empty MCP form only to clients that advertise generic form elicitation, while Atlas intentionally implements the narrower ACP permission request.
**Prior**: 2026-08-24 "Codex returns to in-app chat" and its server-owned checkpoint stand; 2026-09-03 "Isolated Codex uses the supported interactive approval policy" stands on startup, but its live reject/allow falsifier opened this transport correction.
**Decision**: keep the checkpoint in `mcp/src/write-consent.mjs` and make its elicitation schema an object with no properties. The human-readable message plus MCP `accept`, `decline`, or `cancel` is the complete binary decision; do not add generic ACP form rendering or move consent into runtime policy.
**Dissent**: a full form renderer would preserve an optional checkbox for form-capable clients and cover future questions; it loses because this checkpoint collects no form data, `action` already owns consent, and claiming a broader capability adds an unneeded input and validation surface.
**Falsifier**: if an installed reject changes bytes or mtime, allow does not apply exactly once, a second write does not ask again, or a form-capable client cannot answer the message-only request, remove Codex from chat eligibility until the checkpoint is repaired.
**Owner**: stark

## 2026-09-03 — Health carries relation census units after the ACP falsifier

**Why**: the source-hidden installed-app replay required `query_ontology(operation=health)`, received 222, and still described it only as compiled edges while calling the map's 141 filtered/displayed connections; the prompt-only safeguard therefore hit its recorded falsifier.
**Prior**: 2026-09-03 "ACP distinguishes relation declarations from map lines" stands on preserving both counts, but its prompt-only remedy is overturned.
**Decision**: add an additive typed `relationCensus` to health. It identifies `summary.edges` and `compiledSummary.edges` as unique compiled frontmatter declarations by declaring document, relation key, and target reference; says reciprocal declarations may describe one logical relation; and names the app comparison unit as deduplicated normalized typed edges while explicitly withholding an MCP-side app count. Keep compiler, map, schema, and write behavior unchanged.
**Dissent**: encoding an app comparison unit in MCP couples two implementations and can drift; it loses because the observed failure is an agent interpreting the MCP count against that app census, the map's existing reciprocal-dedup test and the new MCP fixture pin both sides, and MCP is forbidden from inventing the app number.
**Falsifier**: if a source-hidden installed ACP replay still conflates the units, or map normalization changes without a failing contract, move census metadata into a shared count envelope instead of adding more prompt prose.
**Owner**: stark

## 2026-09-03 — Isolated Codex uses the supported interactive approval policy

**Why**: after the installed app downloaded the current adapter, Codex 0.153.0 exited before login or session startup because its isolated config still set the retired `approval_policy = "untrusted"`; the same config overridden to `on-request` passed the login probe.
**Prior**: 2026-08-16 (8) stands on Codex session isolation; 2026-08-24 "Codex returns to in-app chat" stands on the read-only sandbox plus the server-owned reject/allow checkpoint, not the retired policy spelling.
**Decision**: replace only the isolated Codex approval value with `on-request`. Keep `sandbox_mode = "read-only"`, `OATLAS_WRITE_CONSENT = "on"`, chat eligibility, schemas, and write semantics unchanged, and pin all three config invariants in one regression test.
**Dissent**: the official reference still lists `untrusted`, so this may be a version-specific regression and a version-aware adapter could be more durable; it loses because the supported interactive value works in the exact shipped runtime and no second version branch is yet evidenced.
**Falsifier**: if the managed CLI rejects `on-request`, a direct write escapes the read-only sandbox, or an Atlas write bypasses or cannot pass the server card, remove Codex from in-app chat and add version-aware capability detection before restoring it.
**Owner**: stark

## 2026-09-03 — ACP distinguishes relation declarations from map lines

**Why**: the installed 1.0.4 app showed 141 relations while a map-only ACP answer called the compiler's 222 declarations relations; a source tally found 81 mirrored declarations collapsing to the same typed line.
**Prior**: 2026-08-25 (115) stands: MCP instructions route ontology questions through Atlas tools; this record narrows how an ACP answer names two valid censuses.
**Decision**: keep both counts and their provenance. Add one ACP session instruction requiring `graph.edges` and `internalEdges` to be called frontmatter relation declarations and the map census deduplicated logical lines, with a regression test. Do not change schema, compiler, or map counts.
**Dissent**: a machine-readable MCP count scope would protect every consumer, not only ACP; it loses because no repeated failure outside ACP justifies broadening the contract yet.
**Falsifier**: if a source-hidden ACP replay still conflates the counts or another consumer repeats the failure, replace the prompt remedy with explicit machine-readable count fields.
**Owner**: stark

## 2026-09-03 — The PO routing pilot closes at its 20th decision as adjust

**Why**: the register reached its 20-decision target on 2026-09-03 with the map label reservation change. The evaluator reports review delta 93%, reversible decisions avoiding council 100%, zero boundary misses, but recovery proofs resolved at 75% against the 80% floor and owner-facing clarity at 65% against 100%, so `keep` is not a valid outcome.
**Prior**: 2026-09-01 (the pilot's own record) stands; this closes the window it opened.
**Decision**: the outcome is `adjust`. The router, the two-reviewer default, and the typed register stay. What changes is the follow-through: a run's recovery proof and later result are recorded when its pull request merges, not left pending, and every owner-facing summary is judged for clarity before the run is logged.
**Dissent**: `revert` to the full council, because 75% proof resolution means a quarter of decisions shipped without a recorded proof. It lost because the unresolved rows are bookkeeping debt on merged work, not evidence that routing sent the wrong reviewers.
**Falsifier**: a shipped recovery-proof failure, or proof resolution still under 80% after the next ten logged decisions.
**Owner**: stark

## 2026-09-03 — The map's ink ladder rises so a dimmed background node still reads

**Why**: the owner showed the expanded map as a dark cloud in which nodes could not be found. The leaf ring sat at 3.2:1 on its own and the expanded-state background dim of 0.42 took it to about 1.5:1; only the ego and the expanded disc kept any light.
**Prior**: none for the ladder values; the ink-depth ladder (leaf < mid < top < project) and its parity with the edge tokens stand and are kept.
**Decision**: the three ink-depth steps rise to 4.7:1, 5.1:1 and 5.8:1 on the canvas, the project stroke to 6.9:1 so the ladder keeps its order, and the expanded-state background dim rises from 0.42 to 0.8, so every background ring stays at or above 3.3:1 while the expanded disc, its aura and the ego stand a clear step above.
**Dissent**: a deeper dim isolates the expanded disc faster; it lost because a node a person cannot find is not context, it is missing.
**Falsifier**: an expanded map where the disc and the ego cannot be told from the background at a glance, or a leaf ring measured under 3:1 in any map state.
**Owner**: stark

## 2026-09-03 — A phone gets the ladder's face, and an across chain grows into its canvas

**Why**: at 390px the single-lane chain drew 148px faces beside a 180px sentence lane, so every caption and rule sentence was cut while half the canvas stayed empty; at 1920×700 the across chain held seven 151px faces with every caption cut while 200px per face was free.
**Prior**: 2026-09-03 (the ladder is chosen by height, sentences sit on arrows) stands and is extended below the paired width; 2026-08-30 (the chain does not turn under a click) stands.
**Decision**: below the paired width a single-lane chain draws the narrow ladder, one lane with the face taking the canvas width up to 280px, two caption lines, and each rule sentence beside its arrow reading right to the canvas edge with a count reading left; an across chain's face grows with its canvas up to the roomy 220px instead of stopping at the compact 148px.
**Dissent**: the compact 148px face was one fixed size everywhere and easy to reason about; it lost because a fixed size that cuts every sentence on the screens people hold in one hand is not a size anyone reads.
**Falsifier**: at 390px a caption or rule sentence crosses a face or the canvas edge, or the seventh role sits below a page that does not scroll to it; or at 1920×700 a caption is still cut with free canvas beside its face.
**Owner**: stark

## 2026-09-03 — Closing a role's answer lets go of the role

**Why**: a source-hidden walker pressed Escape on the role panel and found the face still pressed, the bridge still drawn and the other roles still dimmed, with nothing left to show for it; the screen read as stuck mid-selection.
**Prior**: 2026-08-30 (closing the panel closes the address) stands for the address and is overturned for the selection, which used to stay in memory so the panel could be reopened from it.
**Decision**: closing the role panel, by Escape or its close control, clears the selected role as well as the address, and the chain returns whole; choosing the face again opens its answer; the rules panel closes without touching a selection.
**Dissent**: a kept selection let a reader reopen the same answer without finding the face again; it lost because the face is one click away either way and a selection with no answer is a state nobody asked for.
**Falsifier**: a reader closes the panel and then looks for "the role I had" and cannot find it, or reopens the same role three times in a session.
**Owner**: stark

## 2026-09-03 — A ladder skip leaves the face's side, the count sentence sits on its arrow, and the lanes go where the arcs are

**Why**: the rebuilt macOS app with a real receipt showed the measured count sentences 40px right of the observation column and cut to "import…", a chosen role's three nested skip arcs launching from the face's foot straight through the adjacent count sentence, and every skip sentence cut while 188px of contract-side lane stayed empty.
**Prior**: 2026-09-03 (the ladder is chosen by height, sentences sit on arrows) stands and is extended to the observation lane; 2026-08-30 (a violation is drawn, the canvas with docks) stands.
**Decision**: on the ladder both lanes seat an adjacent sentence beside its own arrow; a skip leaves and arrives at the face's side edge, mid-height, with a side port, so no arc enters a row gap; the count sentence reads "{from} → {to} import {n}" in both the canvas and the dock; the contract lane keeps its 48px minimum unless the profile declares a skip, and the observation lane takes the remaining canvas up to 360px. The observation face never stands taller than its row.
**Dissent**: symmetric lanes keep the ladder centred and predictable; they lost because an empty lane on one side and cut sentences on the other is not symmetry a reader can use.
**Falsifier**: a drawn arc crosses any sentence or face at 1512 with the role dock open, a count sentence is cut on a canvas 1024px or wider, or a reader cannot tell which face a side-launched arc leaves.
**Owner**: stark

## 2026-09-03 — Every role is one rounded face, and a caption wraps by the width its script needs

**Why**: the owner pointed at the first Korean role sentences running past both outlines of a 280px face, and at the two face shapes (a stadium at each end of the chain, a rectangle between) asking what the difference meant. The caption budget counted characters at a 4.8px Latin glyph while a Hangul syllable measures about 8px; the shapes were ISO 5807 terminators and processes, explained only in the rules dock legend.
**Prior**: 2026-08-28 (a role may say what it is for) stands; 2026-08-30 (a role box states what its own edges did) stands; the derived terminator/process shape assignment from graph-layout is retired for drawing, kept in the model.
**Decision**: role captions wrap by estimated glyph width (Hangul and Han 8px, Latin 4.8px) against the straight room of the face, and only the last line is ellipsized; every role face is the same rounded rectangle, the two legend rows for shapes are removed, and position alone says where a chain begins and ends.
**Dissent**: the flowchart standard's terminator tells a reader where a process starts without a legend; it lost because two owners read the shapes as an unexplained difference and the chain's order already carries that fact.
**Falsifier**: a caption crosses a face outline in either locale at 1512 or 1920, or a reader asks which role the chain starts from once the stadiums are gone.
**Owner**: stark

## 2026-09-03 — A role's sentence may be written in the reader's language, and one bad profile stops taking the route down

**Why**: the seven sentences on /architecture are the only place the screen says what a layer is for, and a Korean reader got the role names in Korean and the answer in English; separately, `deriveArchitectureProfiles` throws for the whole vault from a render-phase memo, so one unknown key in one file replaced every profile in the folder with an error boundary that named neither the file nor the key.
**Prior**: 2026-08-28 (a role may say what it is for) stands and is extended; 2026-08-26 (architecture is a separate reviewed contract) stands and keeps the reviewed sentence the fact.
**Decision**: `architecture-profile/v1` gains optional `summary_<role>_<locale>`, matched by locale shape rather than the app's locale list. `summary_<role>` stays canonical: it is what `roles[].summary`, every agent prompt, `inspect_architecture` and the CLI print, and a locale line is refused without it, for a role that does not exist, or empty. Only the web workbench reads the locale map, falling back to the canonical sentence per role. `deriveArchitectureProfilesReport` skips an unreadable document and returns it as a named problem the screen prints; MCP and CLI still throw, so an agent never mistakes a half-scanned vault for a whole one.
**Dissent**: the evidence seat argued parse isolation is separate scope riding a localization decision; it lost because this change is the first to make a rejected key likely in this exact file, and shipping the key without the isolation ships the blank screen with it. The steward held that the version floor is overweighted, since a 1.0.4 reader can simply delete the line; it lost because the failure is the whole screen, not the line.
**Falsifier**: a Korean reader with all seven Korean sentences still cannot say what a layer is for, or no second profile carries any summary within two sessions.
**Owner**: stark

## 2026-09-03 — The comparison ladder tightens its rows before it hides a role

**Why**: at 1280×800, the widest laptop this product ships to, the canvas column measured 638px while the roomy ladder asks for 684, so the seventh role fell past the fold and the screen answered "1 more below" while the drawing itself had room to give.
**Prior**: 2026-09-03 (the ladder is chosen by height, sentences sit on arrows) stands; this adds a second density under its rule and leaves the roomy 24px rows and the width gate untouched.
**Decision**: where the measured canvas cannot hold the roomy rows but can hold tighter ones, the ladder draws the same 280/72/240 faces on 58px rows with one summary line each, a 22px row gap and 4px of pad. 22 is the narrowest gap a 12px sentence rectangle clears with the 4px collision pad on both sides, so every rule still says its sentence beside its arrow; at 20 the sentence is dropped as a collision. Below xl nothing is measured and nothing changes, and the hidden-count row stays the fallback when even the tight rows do not fit.
**Dissent**: narrowing the faces would have kept both summary lines; it lost because the fixed faces carry the side-by-side comparison this screen exists for, and a sentence's second line is worth less than a whole role.
**Falsifier**: a 1280×800 laptop still counts a role as hidden, a rule sentence is held or collides on the tight rows, or a reader cannot say what a role is for from its single summary line.
**Owner**: stark

## 2026-09-03 — Receded ink stays at or above 3:1, the ladder takes a tablet canvas, and the chosen task stays on the button

**Why**: the re-audit of the same day measured receded sentences at 2.6:1 and receded indices at 2.8:1 with the 0.65/0.55 opacities; a 1112px tablet gave the canvas 984px, the ladder asked for 1008 and fell back to 148px combined boxes with every summary and sentence cut; and two source-hidden walkers (a developer, a product manager) could not tell afterwards which agent task they had copied, one saw the confirmation vanish before reading it, and both named dependency, import and type-only as words the screen never explained.
**Prior**: 2026-09-03 (ladder by height, sentences on arrows, person picks the task) stands; this record moves its two opacities and its width gate.
**Decision**: receded roles and strokes hold 0.7 so every receded word measures at least 3:1; the ladder needs only its faces plus 48px of side lane on each side (744px), since side lanes hold only selection-revealed skips whose sentences are stated as held; the task chosen from the menu stays on the button as "Copy the … task" and the confirmation names it for four seconds; column headings read "reviewed by a person" and "observed in code", the empty face says "not inspected yet", and the rules and hints say "pull in code" where they said import or dependency, with the arrow legend defining dependency once.
**Dissent**: a stronger recede separates the selected pair faster than an indigo face can; it lost because a word a reader cannot read is not de-emphasised, it is gone. Keeping "import" is more precise for developers; it lost because the developer walker did not need the word and the non-developer could not use it.
**Falsifier**: a reader at 1512 cannot tell the selected pair from the rest within a glance; a 834px canvas hides a role's name or cuts a rule sentence on the ladder; or five walkers still ask what dependency means after the legend.
**Owner**: stark

## 2026-09-03 — The ladder is chosen by height, sentences sit on arrows, and the person picks the agent task

**Why**: at 1920×1080 "across while it fits across" drew 151px cards, 205px of ink in a 918px canvas, every role sentence cut and lane labels repeated fourteen times; at 1512 each rule sentence ended 160px from its arrow; a chosen role receded the rest to 3.0:1 titles and 1.2:1 sentences; and the one agent button decided its own task, so nobody could ask for a re-check or for where the reviewed structure needs a decision.
**Prior**: 2026-09-03 (comparison workbench) stands and is enforced — its 280/72/240 rows were unreachable where the room was largest; 2026-08-30 (the chain does not turn under a click) stands; 2026-08-26 (draft proposed by an agent, named by a person) stands and binds the improvement task.
**Decision**: the paired ladder is drawn whenever its rows fit the canvas height at rest, with a 24px row gap seating each rule sentence beside its arrow; across remains for a short canvas or parallel lanes. Receded roles keep 0.65 opacity, strokes 0.55. The agent button keeps its derived default and gains a chooser of three tasks — inspect or re-inspect source, plan change, find improvements — one line each; a browser copies the chosen sentence. Find improvements names disagreements and unmapped, unruled, empty roles with literal paths and asks for the rule; it proposes no rule, role name or pattern and writes nothing.
**Dissent**: the evidence seat called the chooser a one-state gap and two labels for one `verify` kind duplication; it lost because the label names what the re-check compares against. The steward held a question without a candidate may not be actionable; it lost to the 2026-08-26 refusal.
**Falsifier**: at 1512×945 or 1920×1080 a role sits below the fold, a sentence touches a face, or a reader cannot say which arrow a sentence belongs to; five find-improvements runs end in a proposal accepted unchanged, or five are abandoned as not actionable; or a `conforms` receipt still blocks a fresh inspection.
**Owner**: stark

## 2026-09-03 — The download hero rises inside half a second, hands off by view angle, and shows a phone three tiers

**Why**: Measured at 1512, the filled CTA stood at `opacity: 0` yet hit-testable for 920ms behind a 700/800/950ms stagger the typing already made redundant (same-input stage spread 267ms against the 120ms rule). The scroll camera lifted the plane above the fold while the demo stage rose below it, so the two never met. At 390 the plinth drew 96 nodes into 165px: a texture, not a map.
**Prior**: 2026-08-18 (70) partly overturned — its entrance order stands (headline first), its 700/800/950 delays do not. 2026-09-03 (the council record above) standing; the plane, the split, and the ghost removal are unchanged.
**Decision**: The eyebrow and lead rise at 240ms, the CTA at 320ms, the strip at 400ms (`gateway-t240/t320/t400`); typing carries the rest of the arrival. The camera lays the plane down toward top-down (1.35 rad), drifts it toward the centre, and dissolves it over cam 0.55–0.95 while it stays in its own band above the facts strip — a handoff of view and axis, not of travel, because following the viewport carried it behind the strip's links and into a clipped canvas (measured). On phones (≤40rem) the plane keeps project, domains, and capabilities and drops elements, drawn larger.
**Dissent**: The motion seat asked for 0/80/160ms; 240/320/400 keeps a readable order at the cost of 240ms. A literal fly-in to the demo stage was the more theatrical handoff; it was measured, not imagined, to break legibility.
**Falsifier**: If the CTA's visible-at time exceeds 500ms after first paint, or an observer reads the rise as three events, the delays return to one shared value. If a phone visitor asks where the small dots went, the element tier returns at a legible radius instead.
**Owner**: builder, under the owner's standing bar for this page and "do all three".

## 2026-09-03 — CLI bootstrap compact plans preserve the import review totals they summarize

**Why**: a sanitized 1,520-file Atlas self-run returned a valid `automatic_compact` import receipt with 889 module-edge candidates and 16 unresolved imports, while public `bootstrap --json` reported `importRelations:0` and `unresolvedImports:0` because it counted only full arrays omitted by compact delivery.
**Prior**: extends 2026-08-14 (10) "Consume large import responses without losing compact review"; its no-loss compact-review requirement remains valid, and the CLI approval-plan summary was observed violating it while the underlying receipt stayed correct.
**Decision**: when full import arrays are absent, CLI bootstrap plan totals fall back by nullish precedence to validated `scanSummary` and then `reviewQueue`; preserve an explicitly materialized empty array as authoritative. Keep MCP output, analyzer, qualification, human approval, exit 3, `writeEligible:false`, and writes 0 unchanged, with one compact-delivery integration gate.
**Dissent**: the raw compact receipt already carries the correct totals, so a sophisticated consumer can ignore the faulty duplicate plan summary.
**Falsifier**: reopen if `scanSummary.moduleEdges` and `reviewQueue.total` diverge while validation passes, if plan counts are explicitly redefined as materialized-array counts, or if the fallback changes the raw receipt or any approval/write boundary.
**Owner**: jinan.

## 2026-09-03 — The download headline types only its own sentence, and the changelog is offered once per viewport

**Why**: The hero's decoder ghost drew a sentence character into the caret's slot at headline size, so the page's one claim read as a misspelling for a frame ("Agents write tlt", "the codelt"). `/download` also offered `/changelog` twice in one first screen: the chrome chip and the strip's "What changed in v1.0.4".
**Prior**: 2026-08-18 (73) standing: four hero destinations keep four ranks; its falsifier (an observed hesitation at row two) was not met, so collapsing rows 2–3 is rejected. 2026-08-23 ("real typewriter", not a per-character fade) standing: `gatewayTypeLand` keeps its weight leg. `GatewayNav`'s rule that the same link in chrome and page makes one a dead promise is applied, not restated. The 2026-09-02 round stands with the seats' measured conditions applied.
**Decision**: Remove the ghost (state, `data-ghost`, `::after`); keep the caret and the landing, and pin the landing's h1 width drift at ≤4px. On the gateway face (`/`, `/download`) the chrome drops the Changelog chip; the strip's versioned link is the one route. Guide, the chip on `/changelog`, the footer row, and all hero destinations are unchanged.
**Dissent**: design-motion and design-interaction would keep a lighter or caret-suppressed ghost. design-lead holds that four outlined controls still read as a catalog. On the chip: chrome duplication is ordinary, and removing it costs mid-scroll reach.
**Falsifier**: A walkthrough showing hesitation at row two fires (73)'s falsifier. h1 drift above 4px makes the landing opacity-only. A mid-page visitor with no changelog route returns the chip and drops the strip link. A headline that reads flat to the owner's eye calls for more graph in the ground, not a wrong letter in the type.
**Owner**: design-guardian decided; the builder applied; the owner's "make people's eyes go wide" was the bar, and the 2026-08-18 and 2026-08-23 owner calls were treated as binding.

## 2026-09-02 — Compact task handoff follows persisted capability boundaries, not noun overlap

**Why**: on current HEAD, three pre-expiry policy tasks all selected `capabilities/expiry-diagnostics`, including a task that explicitly said not to add diagnostics; the correct `capabilities/policy-appraisal` Definition and Includes stated the requested rejection, and its Excludes stated the non-goal. Structural health and the existing compact tests stayed green.
**Prior**: narrowly overturns only lexical capability selection in 2026-08-30 "A coding handoff earns compact-by-default only after it improves the first decision"; its opt-in/full-default, currentness, size, task-privacy, navigation, and selection-not-proof boundaries remain valid. That record's warning that lexical search could hide weak cross-boundary evidence was observed.
**Decision**: compact `agent_brief` treats persisted Definition and Includes as positive task scope and Excludes as the explicit boundary. Desired work present only in Excludes, an explicit non-goal present in positive scope, unsupported claims, and tied top claims return no capability. Child path matches cannot override a conflicting parent claim. No tool, schema, writer, approval, analyzer, qualification, or vault-truth contract changes.
**Dissent**: the existing response already says selection is not proof and requires full-body follow-up; an English clause heuristic may overfit the fixture and create more confidence without improving ontology construction.
**Falsifier**: revert or narrow to stricter refusal if a boundary-conflicting candidate wins, an ambiguous claim is selected, the diagnostic positive control regresses, document order changes the result, raw task text persists, any writer or approval boundary expands, or a source-hidden replay fails to improve the frozen handoff without unsupported claims.
**Owner**: jinan.

## 2026-09-02 — The 3D ownership arrangement becomes a cone tree, arrangement switches morph, and a dome visit no longer keeps 2D awake

**Why**: a measured pass over the map (dogfood 125 nodes; synthetic 1,000) found the dome failing on distribution: 70% of the nodes sat on one bottom ring that flattens into a band at the default pitch, ownership was carried only by sector, a dome→cloud switch was a hard cut holding one frame for 22 ms and 260 ms, and after any 3D visit the 2D map never slept again (120 frames/s, 32 s after the last input, idle-gate cause `domeMotion`).
**Prior**: 2026-08-18 (76) opt-in 3D and (84) two arrangements stand; (78)'s convex shell and latitude rings are overturned for the ownership arrangement, whose crowd-overlap falsifier was observed; (85)'s slicing now also covers switches.
**Decision**: The ownership arrangement is a cone tree (Robertson, Mackinlay & Card 1991): height stays the containment tier, each parent is the apex of its own cone with its children on a base circle directly under it, sectors proportional to subtree size, a single child hanging straight down; the rings drawn are those bases; containment edges are straight and only `depends` relations bow; the picker names the shape Cone. A world or arrangement change while 3D is on rebuilds in frame-budget slices and morphs coordinates over the pose-move cap, refitting only when the new shape overflows the viewport. Entry and return fits ride the assembly and teardown clocks. A dome fully off screen rests every in-flight motion so the idle gate can fold. Default pitch rises from 0.34 to 0.5.
**Dissent**: nested cones re-admit the spokes (78) removed, and a very wide domain is capped at 64 dome units so its base may crowd; the owner's earlier reference was the hero dome, and a tree is a different silhouette.
**Falsifier**: a sibling-cone overlap or a base too small to read on a real vault of 300+ nodes reopens the radius rule; a report that the tree reads worse than the dome for "which domain owns this" reopens the arrangement.
**Owner**: Jinan.

## 2026-09-02 — Installed MCP evidence is trusted only after whole-app identity and semantic proof

**Why**: the current source MCP and freshly built sidecar returned the expected lowercase `readme.md` address, while the binary at `/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp` returned 22 uppercase `README.md` addresses, zero lowercase, omitted project evidence, and had bytes and size differing from the built sidecar.
**Prior**: the app-carries-the-server distribution contract and the same-day exact-case semantic-source decision remain valid; a source checkout, compiled sidecar, signed bundle, and installed app are distinct delivery stages.
**Decision**: measure every directory, file, and symlink in deterministic order, binding type, mode, size, SHA-256 bytes, and symlink target, never timestamps. Require the installed inventory to equal that manifest after copy and after launch, and exercise exact lowercase semantic-source behavior at every build stage including the installed sidecar path.
**Dissent**: hashing the whole bundle adds local deployment cost, and exact-case analysis is narrower than every MCP behavior.
**Falsifier**: reopen the runtime or signing diagnosis if an installed app with matching pre/post-launch manifests still differs semantically from its built sidecar; widen the semantic probe if another bundled-only behavior escapes while the exact-case control stays green.
**Owner**: jinan.

## 2026-09-02 — A documented convention is a courtesy, not a boundary: human review moves to the call path, and drift is detected rather than trusted

**Why**: `docs/benchmark/FINDINGS-2026-09-02-review-marks.md` measured three questions against fixed pass bars across two conditions and three model tiers; all three bars failed (2/3, 1/2, and 1 forgery instead of 0), and the weakest arm deleted a live `review_state: human_decides`, wrote `review_state: confirmed`, and signed `reviewed_by` with a name it had never been given.
**Prior**: builds on the immutability `created_by` has carried since 2026-07-31; cites the invariant in record 93 §5 that absence stays unknown; cites the "2/4" problem-insight limit recorded by the 2026-09-01 council.
**Decision**: `reviewed_by`, `reviewed_at`, and `reviewed_digest` cannot be written, and `review_state: confirmed` cannot be set, through this server, across every write tool. A reservation (forward-looking) and an approval (backward-looking) are two facts, not one enum. `reviewDigest` binds an approval to its meaning; the vault `AGENTS.md` sentence stays a courtesy, never a defense.
**Dissent**: the compounding value rests on one owner's observation, not a second independent user; this is wrong if reservations are raised but never retrieved by a following agent, or if a drifted approval is treated as acceptable context rather than a false claim.
**Falsifier**: ten dogfood agent sessions in the installed app, or the first observed instance of an agent overwriting a reserved node, whichever comes first.
**Owner**: jinan.

## 2026-09-02 — Semantic source addresses preserve repository entry case

**Why**: the pinned target contains `readme.md`, but the analyzer retained seed spelling `README.md` after macOS resolved it case-insensitively; the accepted 11-concept/16-relation write validated and full-read 11/11 bodies byte-exactly, but source-connect dry-run reported 7/8 witnesses and `declared_source_path_missing` for `README.md`.
**Prior**: none.
**Decision**: resolve each selected semantic document one path segment at a time from directory entries, preserving exact bytes when present and using one unique case-fold match only for semantic documents, never package contracts. Invalidate the accepted plan and rebuild from a fresh digest; never patch released rows or add connector-side case folding.
**Dissent**: connector-only case-insensitive lookup is smaller and would keep the expensive approval.
**Falsifier**: stop or revisit if canonicalization changes content, selection, ordering, trust, review units, caps, meaning, permissions, or any non-case path byte; accepts ambiguity, escape, or non-file; leaves either digest unchanged; lets stale acceptance write; or fails fresh 11/11 body, 8/8 source, or current-finalization proof.
**Owner**: jinan.

## 2026-09-02 — Selected safe sections share the existing semantic excerpt budget

**Why**: the first claim-local replay retained the exact line-45 native-ESM/CommonJS review unit, but its candidate excerpt ended during early API prose; a six-concept draft modeled only one of ten predeclared ability families, and a later fail-closed retreat sealed only the project with zero capabilities.
**Prior**: none.
**Decision**: give every selected safe semantic section a deterministic nonzero share of the existing 1,200-character budget, redistributed by priority then source order; no public cap grows. One `candidate-evidence` unit plus one implementation witness may support a capability only as a proposal below 0.8 confidence, and cannot establish domain, ownership, or write.
**Dissent**: equal fragments can destroy coherent context, while one semantic source plus code can invite implementation-shaped capability labels.
**Falsifier**: stop or redesign if any selected safe section stays starved, purpose becomes unusable, a cap grows, risk/admitted text diverge, a review unit supports a claim, implementation supplies semantic/domain authority, confidence reaches 0.8, a competency becomes answered, unsupported claims exceed zero, or the fresh audit remains below 5/10.
**Owner**: jinan.

## 2026-09-02 — Mixed semantic evidence is split into candidate and review units

**Why**: on one pinned permissively licensed Node target, the source-aware auditor verified 44/44 candidate claims and 143/143 citations, but the proposal modeled only 1 of 10 bounded ability families because one native-ESM/no-CommonJS sentence downgraded the entire README row to `claim-review-required`.
**Prior**: extends the standing 2026-09-01 selected-claim decision ("Semantic evidence trust follows the selected claim, not an unrelated README section") only far enough to keep a current README purpose/ability unit usable when a separate compatibility statement needs review.
**Decision**: keep each semantic source row's `headings`, `excerpt`, `trust`, and `riskFlags` as the candidate-eligible unit. A mixed selection emits its policy line as `reviewRequiredEvidence` with heading, line span, excerpt, and risk flags. Review units cannot support a Definition, capability, or write. Caps: four units, 400 characters each, 800 total.
**Dissent**: native ESM without CommonJS constrains who can realize every ability, so a separately emitted warning can yield a richer but misleading handoff if an agent overlooks it.
**Falsifier**: stop or redesign with explicit fragment-level claim references if any admitted claim lacks identical risk-scanned text, the limitation disappears or becomes trusted, unsupported claims rise, any safety gate weakens, or the fresh audit stays below 5/10.
**Owner**: jinan.

## 2026-09-02 — Reviewed concept bodies use the canonical full-read representation

**Why**: a held-out write released twelve concept bodies exactly, but `get_concepts(body: "full")` returned `"\n" + approvedBody` for all twelve; post-write byte equality was 0/12 even though `reviewPlan === writePlan`.
**Prior**: the 2026-08-09 Construction Qualification contract and the 2026-09-02 project-owned FDE decision remain valid; this record closes a later transport mismatch without weakening any semantic, evidence, audience-authority, source-hidden, or approval gate.
**Decision**: canonicalize only analyzer-generated review/write plan bodies to the parser's existing full-body representation; do not change parser/public reads and do not weaken byte equality; after writes, full-read every released concept before source connection or finalization.
**Dissent**: a parser API whose body starts at `##` would be more intuitive than exposing a structural newline; revisit that only as a versioned parser migration.
**Falsifier**: fails if any supported writer/read surface yields zero or two leading newlines, changes disk content or trailing bytes, reuses the old acceptance, or misses 12/12 exact persisted equality.
**Owner**: jinan.

## 2026-09-02 — FDE is project-owned or unavailable

**Why**: `constructionQualification:v1` used the same four-value enum as both compatibility vocabulary and required audience census, so a fresh held-out Python trial assigned two implementation/evidence questions to FDE even though a bounded source search found no FDE role or ownership evidence.
**Prior**: the 2026-08-09 Construction Qualification decision remains valid for independent builder/evaluator identity, human-approved CQs, exact claims and citations, source-hidden execution, seven independent axes, and fail-closed acceptance; this record narrowly overturns its assumption that FDE is one of four universal project audiences.
**Decision**: retain `fde` in the supported enum for compatibility but remove it from the required audience set; preserve the four-scenario floor. An FDE CQ is usable only when purpose authority contains the exact `audience:fde` decision, its owner is a named project meaning owner, and a current `audience-authority:fde` witness supports a claim and citation.
**Dissent**: universal FDE was a useful proxy for implementation depth, and keeping four rows without a fourth required audience may create filler.
**Falsifier**: reopen if FDE-free trials lose q4/q5-style implementation and evidence coverage, if duplicate agent rows add no distinct decision, or if an unowned FDE packet qualifies after any authority link is removed.
**Owner**: jinan.

## 2026-09-01 — Semantic evidence trust follows the selected claim, not an unrelated README section

**Why**: in the pinned scratch run, the `About` section named current parsing, encoding, decoding, generation, monitoring, and plotting abilities, while the peer `Contributing` section said changes should not break legacy behavior; the analyzer combined both sections and downgraded the whole row to `claim-review-required` with `negated-claim` and `deprecated-state`.
**Prior**: the 2026-08-02 bounded Python construction-ingress decision remains valid (`README.rst` may supply bounded mission evidence, ordinary sections do not become domains or capabilities, writes wait for qualification and acceptance); its proof boundary was reopened by this unfamiliar repository.
**Decision**: mark only the first document-title section as the unnamed purpose fallback, and return headings only for the title and selected semantic sections; do not create section-level public rows or relax the existing risk vocabulary; the source-hidden candidate gate remains mandatory before this becomes a full field-trial result.
**Dissent**: document-wide taint can catch a limitation elsewhere that constrains the selected claim.
**Falsifier**: revert or redesign as section-level evidence if selected risky prose becomes trusted, an unselected section still changes any semantic output, citation or unsupported-claim accuracy regresses, or the fresh source-hidden abilities answer does not improve.
**Owner**: jinan.

## 2026-09-01 — Pull-request CI follows impact; default-branch truth stays exhaustive

**Why**: on the optimized #1365 baseline, `Types · Lint · Docs` took 191s, `Unit · Contract` 542s, `MCP` 367s, post-merge browser max 11m2s; full root Vitest took 489s and full MCP integration 305s, filesystem contracts 37.9s. A replay over the latest 30 changes classified 19 into affected plans and retained 11 exhaustive plans.
**Prior**: supersedes only the scheduling premise in 2026-08-22 (97) that an eight-minute PR was already sufficiently fast; that record's conclusion that test quantity is not, by itself, waste remains standing.
**Decision**: make `scripts/classify-change.mjs` the versioned planner reusing the existing `checks:changed` mapping, and `scripts/run-ci-lane.mjs` the executor. On PRs, run root source through Vitest's affected graph, keep filesystem contracts separate, skip MCP when untouched, run exact Playwright specs once when mapped. Unknown paths and every push to `main` fail closed to exhaustive lanes.
**Dissent**: affected tests are an optimization heuristic, not a proof of independence; Vitest cannot discover contracts that scan files, and a browser spec often does not import the route it verifies.
**Falsifier**: revert the affected schedule immediately if a serious regression is caught by the following `main` sweep after its PR plan skipped the relevant evidence; refine mappings if ordinary changes promote to full or unmapped smoke in more than 20% of the next 20 pull requests, or if the median focused lane still exceeds four minutes.
**Owner**: jinan.

## 2026-09-01 — Atlas PO routing derives risk and must prove recovered understanding

**Why**: the v2 CLI accepted three incompatible verdicts for the same unencoded real change (`--mechanical` returned skip, `--door=two-way --risk=none` returned solo, `--door=one-way --risk=meaning` returned review); `docs/PO-PILOT.md` had one free-form baseline row and no parser, report, expiry enforcement, proof coverage, or owner-clarity, boundary-miss, or specialist-contribution measures.
**Prior**: closes three observed v2 gaps: self-classified routes, no explicit human-understanding outcome, and a pilot whose effectiveness could not be calculated; keeps the two-reviewer ceiling.
**Decision**: activate v3 inside the finite pilot; replace builder-declared door/risk with evidence, one Atlas outcome, change signals, and mandatory unchanged/affected/unknown assessments for truth, transfer, agent-write authority, and human correction. Derive risk with fixed priority meaning, positioning, then scope. Keep solo reversible work and exactly two reviewers for one-way work.
**Dissent**: a typed signal can still be falsely marked unchanged; semantic judgment cannot be compiled away.
**Falsifier**: adjust or revert if any serious boundary is missed, owner clarity is below 100%, proof coverage is below 80% or a failed proof ships, reversible council avoidance is below 80%, review delta is below 20%, or a specialist has five calls without a unique contribution.
**Owner**: jinan.

## 2026-09-01 — Atlas product review becomes a reversible risk-routed pilot

**Why**: the active operating system was 696 lines / 39,874 bytes, its daily skill 3,894 bytes, its council skill 5,539 bytes, and this ledger was 1,910,142 bytes before this record, touched by 395 of the repository's 1,165 commits since 2026-07-27; historical reviews rarely captured the intended decision beforehand, so the causal delta could not be measured.
**Prior**: improves the existing PO pass rather than abolish it; the exact replacement (keep and tune the scorecard, permanently replace with a lighter router, or remove product review) was unresolved before this decision.
**Decision**: make the risk router the active daily path for a finite pilot. Mechanical work skips product review; reversible work gets one solo pass; a hard-to-reverse decision gets `po-evidence` plus one specialist for meaning, positioning, or scope, with rebuttal only on material conflict. Numeric scoring and mandatory full-roster review leave the active path.
**Dissent**: the router can become a new layer of meta-work, and the missing historical before-states mean this change is not evidence that the old council failed.
**Falsifier**: revert or adjust the pilot if any serious local-first, schema, reputation, or human-authority boundary is missed; if fewer than 20% of escalations materially change the recorded decision; if fewer than 80% of eligible reversible changes avoid council; or if the owner still needs another summary to understand the verdict.
**Owner**: jinan.

## 2026-09-01 — The 2026-09 bug sweep tightens MCP write-tool contracts, changing observable behavior

**Why**: owner-directed sweep ("find every bug on main and fix them in order, one commit each"); the decision gate names any `mcp/src/index.js` edit a public contract change.
**Prior**: the standing `find_backlinks` ambiguous-tail default (test-pinned 2026-08) is explicitly kept, not overturned.
**Decision**: four MCP contract changes land together. (1) Destructive tools resolve the caller's slug to on-disk spelling, refusing a case-colliding rename target. (2) `delete_concept` counts ambiguous-tail referrers as blocking, requiring `force`. (3) `replace_relation` refuses `depends_on` without a `why`. (4) A merge may report a removal. `find_backlinks` gains `includeAmbiguousTailRefs`.
**Dissent**: none sought, each change restores a contract the code already claimed.
**Falsifier**: an agent workflow that legitimately needs case-variant slugs on one filesystem, or a bulk edge-type migration blocked by the `why` gate, observed in a real vault; reopen if the mcp-verify suite or a field vault shows a write the old contract accepted and a person actually wanted.
**Owner**: not recorded.

## 2026-09-01 — Inside-the-vault auto-allow narrows to read-only tool kinds

**Why**: the v1.0.0 full-codebase review confirmed that an ACP agent's own built-in edit tool, aimed at a vault Markdown file, was auto-allowed by path containment alone (no permission card, no typed change review), while the Atlas write path for the same file asked.
**Prior**: 2026-08-16 (2) §3 said "structured path, not title strings: inside the vault auto-allow, outside ask", written against reads being rejected and never distinguishing reading from writing; decisions (111) and (113) later established that an unasked write is worse than one question too many; refines 2026-08-16 (2) §3, does not overturn its path-containment or allow_always clauses.
**Decision**: a non-Atlas tool is auto-allowed only when its path verdict is inside-the-vault AND its declared ACP `toolCall.kind` is read-only (`read` or `search`); every other kind (`edit`, `delete`, `move`, `execute`, absent, or unknown) falls through to the permission card even inside the vault; Atlas-server tools keep their own read/write policy (`atlas-tool-policy.ts`) unchanged.
**Dissent**: the original rationale stands, asking every time breaks the conversation, and an agent that edits vault files as its normal working mode will now generate a card per edit.
**Falsifier**: users observed abandoning in-app chat sessions because of repeated permission cards for ordinary in-vault edits they always approve; the remedy then is a scoped allow_always the user picks explicitly, never a return to silent path-based allow.
**Owner**: not recorded.

## 2026-09-01 — The Do-next tab is one list, and the a58 indigo step retires with its meter

**Why**: the owner's 2026-08-31 direction that the tab "shows things I cannot see a reason for", choosing option "one list" with the ask that analysis items hand off to the in-app agent; a removed surface element retired the only consumer of a design ramp step.
**Prior**: none.
**Decision**: the Do-next tab renders one flat list titled by one count. The readiness meter, repair-queue band, activity digest, and agent footer are removed; items gain, where possible, a hand-it-to-the-AI action via the ask deep link. `--color-indigo-a58` is deleted from `app/globals.css`; MCP `maintenance_plan` still serves the full queue.
**Dissent**: the meter gave a one-glance health impression the list does not; a large vault's long list may read as noise where the band read as a number.
**Falsifier**: an owner or field-trial reader asks "how healthy is this vault overall" and the page cannot answer without counting rows; revisit at first field trial after 1.0.0.
**Owner**: not recorded.

## 2026-08-31 — MCP and script messages a person or agent reads are English

**Why**: the decision gate names any `mcp/src/index.js` edit a public contract change; this rewrites one `find_path` reason string and the operator-facing throw/log strings of 27 scripts and 8 MCP modules from Korean to English; no tool, argument, gap id, or schema changes.
**Prior**: `.claude/rules/forbidden.md` already forbids contributor-facing operational prose in Korean and names typed locale data and the `vault-ko` template as the only exceptions; cited, not overturned; the source-language gate had enforced that rule for comments only.
**Decision**: every string literal an operator or agent can read from `scripts/**`, `mcp/src/**`, and `cli/src/**` is English; the gate scans string and template literals, ignores regex literals, and admits Korean data only via an allowlist row matching a real line; every scope starts at zero. Localized MCP output selected by `locale` and Korean text in the user's own documents stay.
**Dissent**: an agent that reads the Korean vault benefits from Korean tool hints.
**Falsifier**: a Korean-locale field trial in which the agent's answers regress after this change with no other cause; revisit at the next source-hidden field trial.
**Owner**: not recorded.

## 2026-08-31 — Artifact size is not a constraint; the size gate catches only accidents

**Why**: the desktop performance gate's comment instructed that a second red must be answered by unbundling the ledgers, never by raising the number; the owner overruled that instruction in plain words ("size can keep growing; if there is a ceiling, raise it a lot").
**Prior**: the 2026-08-31 ceiling raise from 8 MiB to 10 MiB, recorded only in `scripts/check-desktop-performance.mjs`, is overturned in its prescription, not its measurement; the measurement stands (the bundle carries a second copy of DECISIONS and CHANGELOG that `out/docs-vault/` already ships).
**Decision**: `nextStaticBytes` becomes 64 MiB and `maxStaticAssetBytes` becomes 8 MiB; the gate exists to catch an order-of-magnitude accident, not documented growth; the release binary keeps its debug line tables in a packed dSYM because legibility of a crash outranks bytes.
**Dissent**: the gate's own comment (2026-08-31 morning) argued a ceiling at 97% of the measured size catches bloat while a ceiling at 6x the measured size catches nothing until the damage is large.
**Falsifier**: a release whose `_next/static` grows by more than 4 MiB in one version without a named cause; revisit when that is observed, land the on-demand ledger read, and bring the number down with a measurement, not a guess.
**Owner**: not recorded.

## 2026-08-31 — An authored vault is told to finalize, not to author

**Why**: the decision gate names any `mcp/src/index.js` edit a public contract change; this edits one health hint string; the dogfood vault had all five competency answers written in `docs/ontology/ontology-atlas.md`, no receipt existed in the gitignored sidecar, and `health` answered with a hint that starts from filling in the section.
**Prior**: 2026-08-17 (28) stands and is cited, not overturned; it named the missing finalize receipt `competency_not_authored` and ruled the wording must never assert the section is missing.
**Decision**: when `## Competency answers` parses, `health` and `workspace_brief` say the finalize receipt is missing and ask only for `finalize_project_meaning`; the write-the-answers hint remains for an absent or unparsed section. Gap id stays `competency_not_authored`, nextAction id stays `author_competency_answers`. A new test fails if the old instruction returns.
**Dissent**: one gap id for two different situations means an agent that branches on `competency_not_authored` alone still cannot tell "never written" from "written but not finalized" without reading prose.
**Falsifier**: an agent or person is observed misrouting on the id alone, treating an authored-but-unfinalized project as unwritten while ignoring the message; then add the distinct id through a convened decision and version it.
**Owner**: jinan (to confirm on PR review).

## 2026-08-31 — PO Council: the relay does not ship into `init`, and `init` stops naming what it did not install

**Why**: the owner asked for item 9 (shipping the evaluation relay into `init`), needing it easy and powerful; for the twelve nodes PR #1343 produced, the relay needs 2 mandatory round-trips against 3 for the incremental path; the relay's own run released 5 concepts/5 relations past its 40-minute target against 12 nodes/19 relations ungated.
**Prior**: item 9 was the remedy clause of the standing 2026-08-31 record "A refusal names the path that stays open, or it is a dead end", which fires only if a solo user completes recovery and produces a junk vault; the only observation (PR #1343) validated clean and reported `needs_evidence` honestly, so that record stands unfired.
**Decision**: item 9 is not built; nothing about the relay ships into `init`. Instead `init` describes only what it installed: `cli/src/index.mjs` no longer sends new users to an `ontology-bootstrap` flow it never installed, and `cli/templates/vault/README.md` no longer names the retired Studio surface; a test reads the shipped template.
**Dissent**: Wedge argued unreviewed agent memory is a liability wearing an asset's name (auto-extracted graph memory scored 83% against 92% for reading files) and declining to ship the discipline spends the wedge early; the council answered the instrument is wrong: a gate that accepted a forged human on 2026-08-29 and pins every boundary to `const: false` cannot record an honest confession.
**Falsifier**: a competitor ships a review or provenance gate ahead of writes and wins adoption, or an inbound report asks how to prove a vault's trustworthiness to a stranger; or a walkthrough shows solo users completing recovery but producing junk vaults, in which case ship the relay helper into `init` under `/po-council`.
**Owner**: jinan (to confirm on PR review).

## 2026-08-31 — The install-count review triggers have not fired; here is the number and how to re-read it

**Why**: several standing records gate review on an install count, never measured. A read-only `gh api` snapshot over 14 days ending 2026-08-31 found 815 total / 418 unique views, 374 unique landing visits, 3 unique `/releases` visits, 68 of 78 stars in four days, and roughly twenty installers (rc.19: aarch64 3, x64 2, Windows 4; rc.18: aarch64 6, x64 4, Windows 4).
**Prior**: none named; this is an observation record against several unnamed standing records gated on install count.
**Decision**: the install-count triggers are not met, and dependent records stay closed; roughly twenty installers were downloaded across the spike, an unknown share the owner's own machines, under every named threshold. `.sha256` download counts are retired as an invalid proxy: they are build-time/CI fetches, not page visits.
**Dissent**: fourteen days during an unrepeatable referral spike is a poor baseline, and a single owner-run `gh api` snapshot is not a measurement programme.
**Falsifier**: if a later reading shows installers accumulating while stars stay flat, the funnel described here was an artifact of the spike and star-to-download was never the constraint; re-read the same four signals at the next release, and whenever a pass proposes to reopen a record gated on install count.
**Owner**: Stark.

## 2026-08-31 — A refusal names the path that stays open, or it is a dead end

**Why**: repository traffic showed 68 of 78 stars in four days and roughly twenty downloads, while the 2026-08-31 walkthrough found the north-star path does not complete for a person with one coding agent; three surfaces described only what was missing on refusal, with `agent-prompts.ts` step 6 forbidding `add_concept` outright, stricter than the server's own rule.
**Prior**: the 2026-08-25 field trial had already recorded that the builder stopped at `canWrite:false` with zero semantic writes on three unfamiliar repositories, adopted then as safe no-write evidence; what went unnamed is that a legitimate ordinary-write path was installed on the same disk.
**Decision**: all three surfaces state the open path at the moment they decline a write; the bulk plan stays gated exactly as before, and each surface repeats that an evaluator must not be fabricated; nothing about maker independence, the digest binding, or human acceptance moves.
**Dissent**: naming a second path at the moment the first is refused teaches that gates are negotiable, and a person routed to incremental writing may build a shallow vault while believing they completed construction.
**Falsifier**: if a freshly-inited walkthrough shows solo users completing through the recovery routing but producing junk vaults (validation red, wrong kinds, evidence-free nodes), then the qualification funnel was load-bearing for quality and this routing sent people around it; the remedy is then to ship the relay helper into `init` under `/po-council`, never to restore a bare refusal.
**Owner**: Stark.

## 2026-08-31 — The Rust replay earns coverage, not inferred impact

**Why**: this is the frozen replay required by "Rust imports are bounded source receipts, never inferred impact." The owner accepted plan digest 14a0cc391368ab9c476b30aa17336ad2d08e480edc2e24977962a8de4aa26191, revision 1, and all eleven visible gaps.
**Prior**: 2026-08-31 "Rust imports are bounded source receipts, never inferred impact".
**Decision**: land the deterministic read-only Rust receipt and its fail-closed limits; do not claim that Rust syntax proves importance, runtime behavior, or semantic impact. Keep both failed audit passes (21/22, then 23/25) in the field-trial baseline rather than reporting only the corrected 27/27 score.
**Dissent**: none.
**Falsifier**: not recorded as reopening this record; revisit only after a new frozen repository produces the q4/q5 gain at 100% on its first persisted-reader audit, or when measured Rust demand justifies a broader parser.
**Owner**: Stark

## 2026-08-31 — Rust imports are bounded source receipts, never inferred impact

**Why**: the frozen Rust field trial returned zero dependency files; its independent persisted-vault reader left the important-dependency question (q4) partial and the direct-source-impact question (q5) unmeasured. Adding Rust to `infer_imports` changes a public MCP response enum.
**Prior**: none.
**Decision**: add deterministic Rust `use`, file-backed `mod`, and exact literal path/include evidence to `infer_imports`. Name external crates only as observed candidates. Ambiguous paths, conditional resolution, and macro expansion stay unresolved or out of coverage. Import evidence never proves runtime, reverse, transitive, capability, business, or semantic impact, and never writes `depends_on`.
**Dissent**: finalizer repair reaches every bootstrap and already has a measured 65.2% regression, while Rust-repository demand is unmeasured and a one-sprint parser is not a moat.
**Falsifier**: stop and treat this as coverage only if the first frozen replay leaves persisted q4/q5 unchanged, any receipt is false, claim/path accuracy drops below 100%, a static import is promoted beyond direct source evidence, or the slice requires a new top-level schema object, compiler/runtime execution, or more than one developer day.
**Owner**: Stark

## 2026-08-31 — The agent's procedures go where the agent runs; the sentence in your own file stays yours

**Why**: the owner asked how a developer uses Atlas while coding and noted a coding agent started in a plain terminal may not know Atlas is there; `init` was found to install `AGENTS.md`, `CLAUDE.md`, and the three skills inside the vault folder rather than the repository root where the agent starts.
**Prior**: cites `surfaces.md` "Installing an agent tool for the user" (2026-08-20), the 2026-08-17 `.mcp.json` precedent, 2026-08-13 (3), and 2026-08-25 "init may only wire the project it was actually run inside".
**Decision**: `init` installs the three skills at the repository root's `.claude/skills/` instead of a nested vault folder, and prints the one sentence the MCP server cannot say (that this repository has a reviewed ontology, where it is, and the first call) for the person to paste into their own instruction file, rather than writing it there itself.
**Dissent**: printing is a drop-off; the developer who does not yet think in agent-instruction files is exactly the one who will not paste it, and every competing tool that wins this slot wins it by writing.
**Falsifier**: if a walkthrough or field trial of a freshly-inited repository shows agents repeatedly starting work without consulting the vault while the printed text observably goes unpasted, print-only was wrong; the remedy is an explicit opt-in flag like `agent-setup --install-pre-commit-hook`.
**Owner**: Stark

## 2026-08-31 — An analysis is a dated record beside the vault, not a concept inside it

**Why**: the owner asked why the analysis surface reports how much is there rather than what is weak, and asked for results kept in a tab, re-runnable, and diffable against last time.
**Prior**: `FlowTab` ("there is no result pane here") and decision (21) "no persistence" for the endcap slice; contested here but not overturned.
**Decision**: `ontology-atlas analysis` writes a dated findings record and compares it with the previous one. It derives nothing itself, running only this CLI's own `health`, `validate`, and `architecture`; each finding's id is built from the check and its target; the record carries no `kind:` and sits beside the vault, not inside it. Public CLI command count moves 57 to 58.
**Dissent**: a record the app cannot open is a file nobody will read; the value the owner asked for was a tab, and this delivers a command; a developer who has to run a CLI to learn what is weak will not run it twice.
**Falsifier**: the command is run once and never again; if a second run does not happen within the next round of work, the dissent was right and the surface, not the record, was the thing worth building.
**Owner**: Stark

## 2026-08-31 — The static budget is raised once; the next time, move the ledgers out

**Why**: the desktop static-asset gate measured 7.81 MiB against an 8 MiB ceiling (97.6%) during a routine rebuild and install of the current app.
**Prior**: none.
**Decision**: raise `nextStaticBytes` to 10 MiB, with the measurement and the structural fix written into the constant's own comment. If the gate goes red again, stop bundling `DECISIONS`/`CHANGELOG` and read them from the static copy on demand instead of raising the number again.
**Dissent**: the ledgers should have been unbundled now rather than recorded as a follow-up, because a gate raised once is usually raised twice.
**Falsifier**: the gate goes red again and the response is another increase; if that happens the dissent was right and the ceiling should revert to 8 MiB until the ledgers are unbundled.
**Owner**: Stark

## 2026-08-31 — A score only one side can earn is reported, never quoted as a gap

**Why**: `README.md` quoted the paired lifecycle pilot's coverage gap as evidence for what Atlas is trying to earn, but the runner's score was a literal word match and 14 of 19 required items were Atlas concept names that only exist inside the prepared vault, unscorable by the side without one.
**Prior**: none.
**Decision**: required items are sorted into an Atlas concept name, a source path, or an ordinary phrase; summaries report the comparable score and the Atlas-name score in separate columns and print the word behind every miss. The old combined number is kept only for reproducibility and labeled not for quoting. The runner refuses to start unless every concept name is verified against the vault and every path exists; `--dry-run` now runs those checks and exits non-zero.
**Dissent**: the split understates Atlas; a concept name is the unit that makes a handoff addressable across sessions and tools, so scoring it is scoring the product's actual contribution.
**Falsifier**: if blind human grading of the same 24 answers finds the Atlas side materially better on correctness, boundary fidelity, citation accuracy, or usefulness of the handoff, the combined score pointed the right way and the dissent won on substance while losing on method.
**Owner**: Stark

## 2026-08-31 — Current exact handoff passes one read-only coding lane; cross-repository speed remains unearned

**Why**: independent review invalidated the preceding performance evidence after the implementation added a second source-currentness probe and removed duplicated MCP transport, and found wrong-span/false-test cases across comments, strings, regexes, templates, and several languages' parsers.
**Prior**: the standing decision, 2026-08-30 "Exact handoff earns the read-only coding lane, not the full MCP lane", requiring current code, actual wire bytes, and an unseen prospective trial.
**Decision**: keep compact v2 and recommend the existing 20-tool `OATLAS_READ_ONLY=1` path only for a known coding task that does not need Atlas writes. The agent calls `connection_info`, then compact `agent_brief`, reads the named batch, and stops on match. `content.text` is the ready prompt; `structuredContent` is the typed contract, in one versioned non-duplicated form.
**Dissent**: this proves a valuable repeat task, not a general coding speedup; compact has limited headroom, exact symbols add construction maintenance, the unseen build was slower than the 40-minute target, and the unseen coding lane never obtained a valid toolchain-isolated measurement.
**Falsifier**: withdraw even the known-task claim if the two-call wire gate reaches 20,000 characters, compact reaches 12,000 bytes, any stale/wrong coordinate escapes, source reads fail to fall, wall exceeds +20%, or uncached input exceeds +25%, a hard failure appears, or blind quality regresses. No cross-repository claim until a fresh unseen subject completes the coding A/B with its toolchain present.
**Owner**: jinan

## 2026-08-30 — Exact handoff earns the read-only coding lane, not the full MCP lane

**Why**: compact v2 passed its frozen static shadow gate, then ran three matched product A/B iterations (full 36-tool MCP, a 20-tool read-only pass without a complete batch, and a final read-only pass with complete spans/manifest/stop-on-match) against the same pristine Rust repair.
**Prior**: none cited.
**Decision**: recommend the existing `OATLAS_READ_ONLY=1` registration as the measured performance profile for a known coding task whose Atlas work is read-only. Shortest path is `connection_info` then one compact `agent_brief`. When `taskNavigation.status` is `ready`, the agent reads the complete source batch and stops broad discovery. Keep the full read/write registration for sessions needing writes, with no performance improvement claim for that lane.
**Dissent**: a +12.8% uncached-input increase is a passed guardrail, not a token reduction; one familiar Rust task can still reward a tailored packet; a 686-character context margin is too small to absorb casual response growth.
**Falsifier**: withdraw the general improvement claim if a prospective unseen repository trial emits any wrong coordinate, has a hard or blind-patch regression, fails to reduce pre-edit discovery materially, or crosses the +20% wall or +25% uncached-input ceiling. Any future read-only schema growth taking the two-call path to 20,000 characters is an immediate regression.
**Owner**: jinan

## 2026-08-30 — Compact v2 spends 12 KiB on exact evidence, below the 20 KiB task gate

**Why**: the first integrated current-source fixture produced 8,096 bytes with three coordinates, and the real dogfood element produced 11,464 bytes with one primary, one supporting, and three tests, both correctly rejected by the standing 8,000-byte `agentBriefCompact:v1` gate.
**Prior**: the selected-project compact decision remains valid for `agentBriefCompact:v1`; byte reduction alone cannot authorize a default flip; the evidence-precision council allowed an additive versioned reshape if exact evidence could not fit without dropping safeguards.
**Decision**: `agentBriefCompact:v2` has a 12,000-byte UTF-8 pretty-JSON ceiling, reserved for reviewed source-current task-navigation coordinates and a non-exhaustive IN/OUT boundary. Currentness, validation, `meaningRepair:v2`, approval/no-auto-write policy, qualifiers, unknowns, and the full-detail escape hatch remain mandatory. Full stays default; compact stays opt-in and below the 20,000-character pre-source gate.
**Dissent**: expanding a response after a compression failure can restart the same context-growth cycle, hide duplication, and make "compact" a name without a budget.
**Falsifier**: task-navigation presentation duplicates the same coordinate more than once structurally, pre-source delivery exceeds 20,000 characters, or the larger response fails the wall/uncached performance gates. On any falsifier, remove duplication or withdraw v2; never raise the cap again to rescue the trial.
**Owner**: jinan

## 2026-08-30 — Exact task navigation is reviewed evidence, never task inference

**Why**: the standing selected-project compact decision's performance falsifier was observed: delivery got smaller, but source exploration and test selection kept the Atlas lane slower.
**Prior**: the 2026-08-30 selected-project task handoff decision remains standing (compact opt-in, task text request-local, full default, source/meaning currentness, human approval, qualifiers, explicit unknowns, no-auto-write/finalize rules mandatory).
**Decision**: retain the existing `query_ontology` `agent_brief` compact workflow and add one versioned, bounded task-navigation projection only after a static kill gate passes. It may read only human-reviewable source coordinates authored in the selected capability/element Markdown, checked against current bound source: at most one primary, one supporting, and three focused test coordinates, each with path, symbol, current-source status, and a read-time line locator. Additive `agentBriefCompact:v2`; the 8,000-byte ceiling stays a gate.
**Dissent**: a successful historical packet can be tautological, encoding an answer learned from earlier runs; symbol/test coordinates also drift faster than meaning and can create more maintenance and false confidence than the source discovery they replace.
**Falsifier**: stop and keep the current compact contract if any emitted path/symbol/test is wrong or stale, a stale receipt emits an exact target, the gate scans zero coordinates, the identical coding A/B has a hard failure or blind-patch regression, pre-edit discovery does not materially fall, or wall/uncached-input overhead exceeds 20%/25%. A second unseen prospectively-constructed vault must also preserve 100% emitted-coordinate accuracy.
**Owner**: jinan

## 2026-08-30 — Unused type exports leaving shared primitives is not a specification change

**Why**: `pnpm decisions:check` flagged three "spec value changed" triggers because a dead-export cleanup removed `SurfaceMotion`, `SegmentedOption`, and `RovingRadioItemProps` from the export lists of `src/shared/ui/surface.tsx`, `src/shared/ui/segmented-control.tsx`, and `src/shared/lib/use-roving-radio-group.ts`.
**Prior**: none on this surface; the exports gate exists to catch a primitive's public contract changing, which this is not.
**Decision**: the trigger is a false positive and no council convenes. None of the three names was referenced by any file in the repository, so nothing rendered, measured, or documented changes; the types still exist and are used inside their modules, only the `export` keyword left.
**Dissent**: an unused export can be an intended extension point a future consumer expected to import; countered because the dead-code ratchet now reports such an export the moment it is added.
**Falsifier**: a consumer outside the module needs one of the three types and has to re-export it; that would show the name was a contract after all.
**Owner**: not recorded

## 2026-08-30 — The CLI executes the MCP modules instead of copying them

**Why**: five hand-maintained CLI files under `cli/src/lib/` duplicated MCP modules; the CLI's parser copy was missing `pushGraphArrayDiagnostic` so `atlas validate` reported zero issues on a file `validate_vault` flagged as an error, and `mcp/src/validate.mjs` still emitted seven Korean messages the CLI copy had already translated.
**Prior**: the 2026-08-13 hygiene sweep held the two schema files byte-identical on the premise there was no shared package; that premise was already false and is overturned here.
**Decision**: `cli/src/lib/mcp-module.mjs` states the resolution rule once (source checkout first, installed `ontology-atlas-mcp` second); the five duplicated files and three others that carried their own resolver become re-exports through it. MCP is canonical, so the CLI inherits the graph-array diagnostic; the seven Korean messages in `mcp/src/validate.mjs` were translated to the CLI's English wording. `cli/src/lib/relation-types.mjs` was left alone.
**Dissent**: two entry points sharing one module share its failures; a bad `mcp/src/parser.mjs` now breaks `atlas list` as well as `list_concepts`, where a copy would have kept one of them working, and CLI startup gains a dynamic import it did not have.
**Falsifier**: a released defect reaching both surfaces at once that a copy would have contained; or a measured CLI cold-start regression attributable to `loadMcpModule`; or the installed two-package path failing to resolve a module the source checkout resolves.
**Owner**: not recorded

## 2026-08-30 — The chain does not turn under a click

**Why**: a design pass captured the architecture screen at 1512, 1920, 1440, 1280, and 390; at 1920, choosing Entities narrowed the canvas and the "across while it fits, down once it does not" axis rule turned the whole drawing into a column, moving every box, sentence, and arc under the click.
**Prior**: the 2026-08-28 walkthrough already named the class: a page that moves under a click is a worse defect than a canvas with space in it.
**Decision**: the axis is measured against the canvas width at rest, not after a selection narrowed it. A selection may cut the chain at the edge (handled by fade, count, and pan), and the chosen box is scrolled into view. Gate: `architecture-role-ledger.spec.ts`.
**Dissent**: a cut chain hides its far end while a turned chain shows every box; a reader who chose Shared foundation at 1920 sees the canvas scroll to it rather than the whole chain re-laid.
**Falsifier**: a reader observed dragging the canvas back and forth after a selection to see the ends, where the turned column showed them at once.
**Owner**: not recorded

## 2026-08-30 — Bundled samples are web-only; the installed app commits one local vault

**Why**: the owner caught installed-app frames rendering a bundled sample vault (Storefront repair, "Online Store" project, its four-role and then the seven-role Atlas architecture) instead of the selected local vault, and docs showed `domains/order` missing after the sample slug leaked into local source.
**Prior**: none cited.
**Decision**: the installed app admits only `pending -> local`, never rendering, offering, or falling back to bundled samples; its no-vault first run contains only real local create/open actions, and Docs removes the desktop sample row/command. The vault-less web gateway keeps its sample experience. A selected local source is committed atomically; picker, recent reopen, and cold restore apply the standing project-root rule (a Markdown-bearing `<project>/atlas` child is persisted and built).
**Dissent**: removing the installed-app sandbox asks a vault-less installer to choose or create local files before exploring the workbench and could reduce first-run understanding.
**Falsifier**: real installers cannot discover or understand the web demo, abandon before choosing a folder, or explicitly ask for an in-app sandbox; any 30fps installed-app cold restore or LNB hop shows a sample/other-vault pixel, stale sample slug, or project-root decoy; or MCP/CLI resolves a different root from the app.
**Owner**: owner

## 2026-08-30 — The X cut shows the whole workbench; the page cut keeps the agent proof

**Why**: the owner rejected the finished 30-second X asset because all 30 one-second samples held the same Map/detail/Codex composition, failing the fast social-feed breadth the posting moment needed.
**Prior**: reopens only the X portion of the same-day "Two real-use cuts replace the nine-second neighbourhood loop" decision; the 44-second localized page takes and their read-only Atlas MCP proof remain standing.
**Decision**: replace only `docs/launch/ontology-atlas-x-demo.ko.mp4` with one Korean, installed-app, natural-speed LNB take moving Map -> Architecture -> Docs -> Insights -> Projects -> Agents -> Git History in 20 to 25 seconds, ending on History. Settings stays out. The prior decision is overturned only for the X clip's single MCP-round-trip scenario.
**Dissent**: a fast tab tour is easy to copy, dense on a phone, and may leave a viewer remembering only "an app with many tabs"; the old clip at least proved a real agent workflow.
**Falsifier**: a source-hidden person cannot identify the codebase-ontology category by three seconds or recall four work surfaces after the new cut; the screens do not read as one public project; the page clip loses its agent proof; or any delivered frame exposes a picker, path, account, notification, desktop content, or personal information.
**Owner**: owner

## 2026-08-30 — Looked, and decided: the glob stays in the dock, and the echo stays proportional

**Why**: two items were left open from the same day's decisions (whether a mono glob belongs beside a role box, and whether the typing echo's dot mapping reads as typing), each needing settlement by looking at captures rather than by asking again.
**Prior**: the strokes decision (glob deferral) and the echo decision's recorded dissent, both from the same day.
**Decision**: the glob does not go on the canvas; it stays in the role's detail dock under the sentence. The proportional echo mapping stands (three dots per Korean keystroke, about one and a half per English one); one dot per character was not tried.
**Dissent**: a glob is the one string a person can paste into a file search, and the sentence is not.
**Falsifier**: if a reader is observed opening the dock only to copy a glob, try the receipt line instead of the ground; for the echo, an observer reading the assembly as clumps that do not track the caret.
**Owner**: not recorded

## 2026-08-30 — A coding handoff earns compact-by-default only after it improves the first decision

**Why**: the historical coding A/B observed a public MCP handoff failure, reproducing the 2026-08-03 dissent's falsifier: a selected-project handoff is again approximately 75 KiB and its first action is buried, including leaked global starter nodes and a readiness mismatch between the outer response and the copyable prompt.
**Prior**: the 2026-08-03 action-first meaning-repair decision, the 2026-08-16 fixed-budget `meaningRepair:v2` plus paged-detail split, and the 2026-08-28 first-contact history optimization remain standing.
**Decision**: keep the existing `query_ontology`/`agent_brief` operation; fix the leaking-node and status-mismatch defects for an explicitly selected project; add a bounded task statement and an explicit compact detail mode as a request-local, non-persisted projection, with full remaining the default. Compact-by-default is a separate decision requiring a live repeated trial to prove a better first decision or a material coding-outcome axis with no regression; byte reduction alone cannot authorize it.
**Dissent**: response size may be correlated with, rather than causal to, the tied result; a task matcher can become ordinary lexical search or a confidence amplifier that hides weak cross-boundary evidence.
**Falsifier**: if the live compact projection exceeds 8,000 UTF-8 JSON bytes, pre-edit task-scoped MCP responses exceed 20,000 bytes or five calls, omits or widens currentness/meaning/approval/qualifier/unknown facts, includes a node outside the selected project, or fails to improve the first source decision or one frozen objective outcome without regression, compact does not become the default.
**Owner**: jinan

## 2026-08-30 — The hero object is the headline's echo, and the page moves in three places

**Why**: measured at 1512, the hero object faded in on its own timer unrelated to the headline's typing, twelve elements below the fold rose independently on a scroll timeline, and the object said nothing about a pointed-at dot, against the owner's bar that UI finish ranks with function and must read as August 2026.
**Prior**: decision (99) typewriter cadence and budget; decision (100) demo axis; the 2026-08-22 scroll-timeline entrance decision, whose section-head part is overturned here.
**Decision**: `HeroObject` now echoes the headline's typed character count dot by dot (`hero-echo.ts`), replacing the independent fade timers; a pointed-at dot draws its parent line and prints one real edge fact in a reserved caption line; only three stage entrances rise below the fold instead of twelve.
**Dissent**: a proportional echo is not literally one dot per character (Korean lights three dots per keystroke), so the strictest "keystroke is the dot" reading does not ship.
**Falsifier**: if an observer reads the assembly as a burst rather than as typing, dots arriving in clumps that do not track the caret, the mapping is wrong and one dot per character with the remainder held for the last beat should be tried.
**Owner**: not recorded

## 2026-08-30 — Two real-use cuts replace the nine-second neighbourhood loop

**Why**: the owner reported the hosted Korean download-page clip is too short while preparing an X post; the active 9-second clip cannot show the gateway's fuller claim and is stale relative to the current dogfood vault.
**Prior**: overturns part of the 2026-08-23 (104) recording decision, only its nine-second duration and single-neighbourhood scenario.
**Decision**: make two outputs from one rehearsed installed-app journey: an X cut of 20 to 30 seconds, and a download-page take of 35 to 45 seconds filmed separately in Korean and English. Both start on an already-open, settled example project and show concept selection, typed relation and implementation evidence, and a real Atlas-only Codex lookup with its result kept visible. The X file stays outside the page registry.
**Dissent**: there is no visitor-confusion or retention evidence; this may overfit one owner's reversible preference; the stronger product asset is the accumulated typed meaning, evidence, and human-reviewed history, not footage.
**Falsifier**: a source-hidden viewer still cannot name the concept, relation/evidence, and agent handoff after watching the new page take; the live agent path is staged or does not use Atlas lookup evidence; a mid-loop entry is incomprehensible; or any sampled frame exposes a picker, path, notification, desktop content, or personal information.
**Owner**: owner

## 2026-08-30 — Every stroke says its sentence, and the canvas is drawn exactly

**Why**: measured against reference tools (Understand-Anything, LikeC4), the architecture canvas put a sentence on nothing and a count only on focus, its sentences lived in a dock closed by default, and its strokes and boxes wobbled instead of using precise geometry, against the owner's bar that UI finish ranks with function and must read as August 2026.
**Prior**: the 2026-08-28 walkthrough's hand-drawn stroke notation.
**Decision**: every stroke at rest states the dock's own sentence for that relation, and the separate dock sentence list is removed; room comes from the sentences, with a sentence that has no room held rather than cropped. Geometry becomes precise (1px rectangles, 6px radius, one cubic curve per stroke, `sketch-stroke.ts` deleted), with motion by opacity fade/recede replacing the hand-drawn wobble.
**Dissent**: under `lower-only`, six of the sentences say "may depend on", which the column order already states, and text-only fill rising from about 15% to 30% may still read as a labelled column rather than a card field.
**Falsifier**: a walker with the sentences on screen still opens the dock to learn what a stroke means, or reads a "may depend on" sentence as a measured count.
**Owner**: stark

## 2026-08-30 — The map slice is withdrawn: the owner meant the architecture tab

**Why**: The owner said the Map tab had nothing to touch and that the reference screenshot (cards with a summary, edges with a sentence) was about the architecture tab all along, not the Map's domain view as the caller had assumed.
**Prior**: the council's slice decision ("PO Council Verdict, the map says what an area is and why two areas are joined").
**Decision**: The canvas half of that council's slice (its PR 3, "the map says what an area is") is withdrawn before any code, and direction B for it is void. The plumbing half (relation_notes in the meta-model, find_path and get_concept returning rationale, the validator's key-side swallow guard, and the repaired dogfood note) stands on its own merits, independent of any screen. Going forward, the target screen goes in the first line of every brief. Addendum (the map says what an area is and why two areas are joined): Ship one slice in three PRs, smallest first, each shippable alone. PR1: name relation_notes in schema.mjs's optional lists, mcp/README.md's table, and SPEC 3/5, and have find_path().edges[] and get_concept().outgoingEdges[] carry rationale. PR2: add a why field to the web relation writer, author relation_notes for the 12 domain to domain depends edges, and ship craft's word/geometry fixes. PR3: lift the summary helper into a shared package, set the canvas font to Pretendard, add a two-line caption drawn only when the sentence exists (rest for noted domain edges, hover/selected at any altitude), and suppress folded-child contains strokes at spine altitude; PR3 needs /design-directions and /design-council before code.
**Dissent**: none
**Falsifier**: not recorded
**Owner**: stark

## 2026-08-30 — ACP next actions hold current facts through refresh and advance after source binding

**Why**: The standing 2026-08-29 completed-turn decision required recommendations to describe the current vault and recorded a falsifier (an approved repair leaves the same first suggestion unchanged without explanation); the audit found exactly that failure class in two joined paths: load() retained the previous manifest while useVaultHealth treated any loading state as an empty vault, and an unchanged Markdown fingerprint refreshed the ACP source-binding sidecar without the readiness hook's revision including the new receipt.
**Prior**: the 2026-08-29 decision "A completed ACP answer leads to grounded next actions, never an automatic run."
**Decision**: Preserve current health and the vault handle only while isReloadingSameVault proves the folder identity is unchanged. Add the latest completed connect_project_source or disconnect_project_source receipt to the project-source readiness revision. Pending, failed, unrelated, and cross-folder states do not authorize a new readiness fact.
**Dissent**: Keeping the previous recommendation during reload can display a fact that became stale milliseconds earlier; the accepted boundary is narrow: only the same verified folder, only until the replacement manifest arrives, and source-binding completion explicitly invalidates the sidecar read.
**Falsifier**: A folder switch shows the prior vault's action, a completed source bind still leaves connectSource, or a same-vault refresh changes the endcap to an action unsupported by either the old or new manifest.
**Owner**: jinan

## 2026-08-30 — A role box gives its sentence two lines; the rows close up to pay for it

**Why**: The "role box states what the role is" record's own falsifier fired the same day at 7 of 7: every drawn box cut the profile's sentence before the clause carried meaning. The owner, having said UI finish now ranks with function, asked for directions rather than a patch; /design-directions put up four shapes and the owner chose C.
**Prior**: overturns two numbers in the role-ledger record of the same morning (74px tall, 18px gap) and the first-line-only reading of "A role box states what the role is; its counts wait in the panel."
**Decision**: The sentence takes two caption lines at the same 34-character budget, wrapping on words and ellipsizing only the last line and only when something was left out (src/views/architecture/model/summary-lines.ts). The box grows to 82px tall and the row gap drops to 12px so seven rows still clear a 1512x945 viewport with the inspector open. The no-receipt box grows from 62px to 72px to match.
**Dissent**: None of the four directions fills the canvas the way the reference does (about 70% versus about 15% of a 1345px-wide field at 1512); if "designed" turns out to mean fill rather than a finished sentence, this record chose the wrong axis.
**Falsifier**: A fresh-eyes walker reads a role box and still cannot say what the role is without opening the dock, in more than half the boxes; or the canvas is described as empty before the boxes are described at all.
**Owner**: stark

## 2026-08-30 — The spine is drawn under lower-only too, so seven boxes are a chain

**Why**: The owner asked whether the design lead's recorded dissent from earlier the same day ("a canvas whose rest state shows one stroke reads as a spaced list rather than a graph") was actually right. Measured on the Atlas Web Workbench profile (lower-only, 7 roles), the canvas drew only 3 strokes at rest with 3 boxes touching nothing, while five boxes stated outgoing import counts (45, 16, 26,000, 314, 143) that the canvas drew no matching line for.
**Prior**: the design lead's recorded dissent in "The architecture screen is a canvas with docks, and a violation is drawn."
**Decision**: Under lower-only, draw the adjacent pairs and nothing else: six strokes for seven roles, not twenty-one. The skip-hiding rule still holds for the 15 skips, since column order already carries "everything to my right," but not for the 6 adjacent pairs, because only the stroke shows a chain rather than a stack.
**Dissent**: A permitted stroke under lower-only still cannot answer "why am I here," because the whole set is derivable from the column order; this record's answer is that deriving is not reading, and a drawing whose boxes touch nothing is not asking to be derived from.
**Falsifier**: A reader looks at a measured profile and reads a spine stroke as a measured count, expecting the drawing to answer how many imports cross a boundary; if observed, mixing a rule stroke and a count stroke in one rest state failed.
**Owner**: stark

## 2026-08-30 — A role box states what the role is; its counts wait in the panel

**Why**: The owner pointed at the Understand-Anything (MIT) open-source project and said that was the feel they wanted; every node there states what it is in a sentence before anything is clicked. On a browser-opened Atlas vault, every role box instead read "0 modules, 0 concepts."
**Prior**: none
**Decision**: A role box prints the profile's own reviewed summary_<role> sentence in the line the counts had; a role that declares no summary keeps its counts. Module and concept counts move into the role panel, which already lists both. Every traffic stroke touching the focused role now states its measured count, and width is a comparison, never a figure.
**Dissent**: The count line let a reader see where the weight is without choosing anything; that is now a click away.
**Falsifier**: Measuring both sample profiles finds more than half the drawn boxes either declare no summary (rendering empty) or truncate before the clause carries meaning; the sentence would have added height without meaning and the counts should come back.
**Owner**: stark

## 2026-08-30 — Persisted handoff is 41/41; gross performance remains open

**Why**: A field trial completed the qualification transport, source-aware meaning repair, exact write, source binding, finalizer, and source-hidden persisted handoff on an unfamiliar repository, but the authoritative first-MCP-to-finalizer clock was 26,389.068 seconds against the 2,400-second gross write target.
**Prior**: supersedes only the "merge remains gated on a fresh clean run" clauses in the same-day transport records; their RED evidence, contracts, dissents, and falsifiers remain standing.
**Decision**: Land the bounded correctness and AI-efficiency fixes (canonical coverage preflight, recorded analyzer transport, seal-derived witness digests, file-backed qualification schema plus exact audit schemas, schema/runtime parity probes, rooted-reader request examples, literal repository-root witness parity, atomic measurement-qualifier handoff policy). Preserve every intermediate RED as non-retroactive. The product reason is proven again at 100% persisted accuracy, but performance completion remains open; the next baseline must begin with all fixes present before its first tool call and pass the gross 40-minute target. Do not append BASELINE.md.
**Dissent**: Repeated repair cycles can make perfect final accuracy a poor product experience; a system that needs this much orchestration still has an unclear speed advantage over careful documents and source search.
**Falsifier**: A fresh clean run still needs a transport/shape retry, qualifier repair, root-path repair, or exceeds 2,400 seconds gross.
**Owner**: jinan

## 2026-08-30 — Repository root is a current competency witness

**Why**: The accepted clean field-trial plan's first finalize_project_meaning call failed because a valid competency Paths row containing repository root "." was treated as unsafe, discarding the whole Evidence/Paths set and losing the answered abilities row's README.md witness.
**Prior**: "First persisted handoff is 50/50; clean-run performance remains open" remains authoritative; it already established that safe explicit repository-root directory paths participate in source receipts, and this run found the unclosed literal-root case in the competency extractor and witness mirrors.
**Decision**: Treat the exact "." as the repository-root source witness in persisted competency Evidence/Paths, MCP/app witness derivation, receipt minting, and meaning inventory. A bounded source probe supports only its own root, never completeness of any child file, external module, or dependency. Continue to reject absolute, parent-escaping, empty, backslash, and non-root "." segments, and pin browser/MCP byte parity without repairing accepted project Markdown.
**Dissent**: Treating "." as evidence can turn "the repository exists" into a low-information witness that appears stronger than a canonical file.
**Falsifier**: "." satisfies a child-file claim, makes external or runtime impact complete, admits another unsafe dot segment, or causes valid sibling evidence to disappear again.
**Owner**: jinan

## 2026-08-30 — Qualification schema discovery is file-backed

**Why**: The first approved source-hidden lane read the schema once from stdout, but its 11,934-token display was truncated, so the evaluator missed required fields and its single hidden call failed exit 65 with no recovery. The overlapping source-aware lane found commands.audit exposed no JSON Schemas and guessed fields, also failing exit 65.
**Prior**: "Qualification transport is machine-readable before hidden work" remains authoritative; its transport falsifier was observed here.
**Decision**: Every qualification actor runs schema --output <dir> once and reads the emitted schema.json rather than relying on truncated stdout. Publish that rule inside the schema and in both bootstrap and field trial skills. Gate the file on non-idle size plus derived purpose-owner, CQ scenario, and revision-version fields, and expose exact audit access, claim-result, source-fragment catalog, and quantifier JSON Schemas, keeping runtime fail-closed against them.
**Dissent**: File-backed discovery adds scratch I/O and leaves the oversized schema intact; a smaller command-specific schema could be cleaner.
**Falsifier**: The file output omits a runtime-required field or audit shape, schema and runtime disagree on access or nested rows, an actor still needs stdout or implementation inspection, atomic output can be overwritten, or a fresh lane fails for another shape absent from schema.json.
**Owner**: jinan

## 2026-08-30 — Payload witness digests are derived during sealing

**Why**: A fresh blind builder reached its first reviewable candidate and ran coverage successfully, but its single production seal failed because newline-terminated external canonical JSON produced the wrong witness payload digest, stopping with no output.
**Prior**: "Recorded analyzer calls feed coverage directly" remains authoritative; its undisclosed-transport falsifier was observed one stage later, since the emitted witness JSON Schema proved digest syntax but not the private canonical byte representation.
**Decision**: When a witness carries payload, seal derives provenance.digest from the existing canonical payload algorithm into a cloned sealed witness, leaving caller input unchanged. A caller-supplied digest is allowed only when it matches exactly, and a payloadless witness must still provide its own digest. Publish this conditional contract in the witness and seal schemas.
**Dissent**: Automatic derivation could hide missing provenance or silently bless a changed evidence payload.
**Falsifier**: A payloadless witness seals without a digest, a supplied wrong digest seals, the helper mutates caller input, a sealed payload differs from the authored value, or a fresh builder still needs a digest-related retry.
**Owner**: jinan

## 2026-08-30 — Rooted reads publish their contract before T0

**Why**: The restarted cold-start report recorded two exit-64 rooted-runner usage probes before evidence collection, because the runner had neither schema nor a working --help, and bootstrap prose named fields without an executable invocation or exact request contract.
**Prior**: "Qualification transport is machine-readable before hidden work" remains authoritative; its broader falsifier was observed at the first rooted read.
**Decision**: Add JSON schema discovery and a byte-identical --help alias to the rooted read runner, invoking no MCP process and writing no file. Derive the documented required fields and read-only name enum from the same runtime constants, and include one non-empty packet plus exact list_kinds, index_project, infer_imports, and analyze_repo_structure request examples, keeping connection_info automatic. Resolve the runner relative to the loaded skill directory and read its schema once via the single positional schema argument; keep T0 at the first actual rooted connection_info attempt.
**Dissent**: Moving discovery before T0 can cosmetically improve the measured runtime while adding setup work.
**Falsifier**: Schema preparation is omitted from the report, its substituted example fails runtime validation, --help drifts, a write tool appears, a failed run writes a transcript, or a fresh builder still probes CLI forms or reads the implementation.
**Owner**: jinan

## 2026-08-30 — Recorded analyzer calls feed coverage directly

**Why**: The restarted cold-start builder reached a reviewable candidate and sealed it, but first spent five failed coverage calls discovering how to reshape its ordinary recorded { name, args, response } call into a helper-specific analysis artifact, every failure returning exit 65 with no output.
**Prior**: "Coverage refs are generated before claim sealing" remains authoritative, but its artifact-discovery falsifier was observed; the losing dissent, that adding the preflight moved one undisclosed shape earlier, was right.
**Decision**: Accept a recorded calls[] analyzer row whose response is the direct structured result, retaining exact request-proposal, lifecycle digest, canWrite:false, and no-writePlan validation. Emit that shape in schema and tell builders to pass the complete recorder transcript directly rather than probe or synthesize a wrapper. Resolve the helper script relative to the loaded bootstrap skill directory, never a repository-root scripts/ path. Preserve this run's sealed candidate as a performance RED, not eligible for approval or qualification.
**Dissent**: Accepting another envelope can make a permissive parser choose a stale or unrelated response and hide recorder inconsistency.
**Falsifier**: A request/proposal mismatch or lifecycle digest drift produces coverage output; the accepted result differs from the canonical wrapper; or a fresh builder needs any helper-path or coverage artifact-shape retry.
**Owner**: jinan

## 2026-08-30 — Coverage refs are generated before claim sealing

**Why**: The first clean end-to-end run after the qualification fast path reached a reviewable candidate in 375.972 seconds, then spent until 2,139.995 seconds trying to discover the seal manifest's exact relation/impact ref grammar and first-occurrence order, stopping at seal with zero qualification calls, approvals, releases, or writes.
**Prior**: "Qualification transport is machine-readable before hidden work" remains authoritative; its falsifier fired again one stage earlier, since the builder needed private transport knowledge after a semantically valid candidate.
**Decision**: Add one internal read-only coverage preflight to the qualification helper that emits only the canonical ordered proposalCoverageRefs, current digests/revision, counts, and a no-write guard. Run coverage before manifest authoring; builders still author every claim and mapping. Expose exact manifest, witness, and quantifier JSON Schemas beside the seal contract, keeping missing/foreign/order-drift blocking, and preserve the failed run as the performance RED while restarting the full clean trial on a fresh subject.
**Dissent**: A seventh helper command expands an internal private API and may simply move the next undisclosed shape one step later; a more compact skill example might have been enough.
**Falsifier**: A fresh builder following only the skill and emitted schema needs any coverage/seal discovery retry, the preflight changes a semantic claim, an order/missing/foreign mutation seals, or the restarted clean run fails for the same transport cause.
**Owner**: jinan

## 2026-08-30 — Qualification transport is machine-readable before hidden work

**Why**: The clean unfamiliar-repository run spent 1,302 seconds in its formal hidden lane even though the helper itself ran in about 70 milliseconds; late work was strict packet assembly and repeated shape discovery, not MCP execution or semantic source analysis.
**Prior**: "Deterministic scratch receipts replace per-run qualification code" remains authoritative; its isolation, immutable-claim, human- acceptance, and no-write boundaries stand, and this observation fires its performance falsifier without justifying another envelope, public tool, or helper-authored judgment.
**Decision**: Extend only the existing mirrored scratch helper: hidden may hydrate exact evaluator-authored qualificationCore and answers from plain sibling JSON files while access stays inline. Derive the helper's qualification-core schema from the existing public construction schema, refining only helper-owned exclusions, six-axis cardinality, one-owner provenance, and canonical approval time. The helper still authors no purpose, question, answer, target, axis, diagnostic, citation, identity, acceptance, or write, invokes no MCP tool, and sibling reads stay a local scratch transport, not a sandbox, limited to descriptor-read regular files with one link and no symlink or special-file redirection.
**Dissent**: Removing a 22 KiB wrapper copy does not remove the irreducible work of reading 29 claims and answering six questions; the 419-second result may be evaluator variance rather than transport leverage.
**Falsifier**: A fresh schema-only evaluator needs implementation source or a transport retry, any safe path form changes one output byte, a redirected input is read, an existing mutation becomes accepted, or the next comparable clean construction still exceeds the staged budget.
**Owner**: jinan

## 2026-08-30 — The architecture screen is a canvas with docks, and a violation is drawn

**Why**: The owner opened the installed app on the new role ledger and found the lower half of the screen unreachable: row 1 took 967px of a two-row grid, row 2 got 64px per panel each with its own inner scroller, at the end of an already-exhausted 187px page scroller.
**Prior**: none
**Decision**: At xl and above the workbench is one non-scrolling row: the canvas holds the height, and everything else opens as a dock beside it, by clicking a role, the canvas's own button, or a link naming a role; below xl the stacked scrolling document is unchanged. The canvas keeps the receipt's status pill/stamp and pattern name; rule sentences, mark legend, the role's own answer, applied scopes, and dependency-direction prose move into the dock. Only one dock opens at a time (inspector 380px or stage 340px), and a violated crossing is now always drawn in the danger tone, dashed, with its own legend row.
**Dissent**: A canvas whose rest state shows one stroke reads as a spaced list rather than a graph, unlike the reference which reads as a graph because every node is connected; drawing only violations at rest does not answer that, though drawing all measured traffic would, at the cost of the clutter the skip-hiding rule exists to prevent.
**Falsifier**: A reader looks at the rest state of a measured profile and cannot say which roles import which, while the dock's sentence list, one click away, answers it immediately; if observed, hiding skips at rest was the wrong default for measured edges.
**Owner**: stark

## 2026-08-30 — A role box states what its own outgoing edges did, never a verdict

**Why**: The owner pointed at a GitHub Actions workflow graph and said the architecture screen should read like that. /design-directions put four shapes up and the owner chose B, every role box carrying a small ledger of its own measured traffic.
**Prior**: none
**Decision**: A role box states what its own outgoing edges did, never a per-role verdict, since Atlas only owns a per-profile conforms/violated/ unknown verdict. A truncated violation list is stated as "at least N," never a total; unmappedEdges and unruledEdges stay on the stage chip, never on a box; unknown.emptyRoles ("no source matched") is the one absence a box may state. Without a receipt there is no ledger at all, never a row of zeros, and status is shown as a shape, never a colour.
**Dissent**: A per-role verdict would be easier to read at a glance, and the fraction of reviewed meaning is the number that would make the box worth a second look.
**Falsifier**: A reader looks at a role box, states a conclusion about that role's conformance the profile-wide record does not support, and is not corrected by the stage chip beside it.
**Owner**: stark

## 2026-08-29 — Nothing is painted before it can be named and clicked

**Why**: Measured on the installed app, storefront sample, camera fully out: a click on one painted circle selected it, a click on another did nothing, and a third selected an edge instead of the circle under the pointer. The cause was that nodeTierAlpha ramps opacity via smoothstep while the draw pass paints anything above 0.02, but the hit test and label ramp floored at 0.5, leaving exactly the first half of every reveal band drawn but unclickable and unnameable.
**Prior**: none
**Decision**: The reveal bands begin where the hit-floor was (capability {1.75, 2.0}, element {2.575, 2.85}), and the draw pass's own paint skip becomes the floor, exported as HITTABLE_MIN_TIER_ALPHA, so nothing is painted before it can be named and clicked; hittability timing itself does not move. tests/contract/draw-hit-lockstep.contract.test.ts's pinned exception case is overturned, and the contract now asserts the plain form: if it is drawn, it is hittable.
**Dissent**: Recorded dissent (2026-08-08, still standing): if the owner or a visitor says "not many nodes, huh," the gap is bigger than judged; this change removes the faint half of each reveal band and walks toward that falsifier, accepted because a circle nobody can click or name is noise, not density.
**Falsifier**: Someone zooms past the band hunting for children "that weren't there," or /motion-verify measures the steeper fade (half the ratio width) reading as a pop at normal wheel velocity.
**Owner**: not recorded

## 2026-08-29 — The spine names itself at every altitude; the domain watermark is retired

**Why**: The owner asked why the map says nothing. Measured on the storefront sample vault at 1512x982, camera fully out: about ninety nodes painted and exactly one passively named (the project); hovering a domain produced garbled overlapping text ("I N M E N T O R Y" over "Inventory").
**Prior**: overturns the remedy clause of (86), 2026-08-19; that record's diagnosis of the crossfade stands, but its handoff is replaced. (86)'s own falsifier fired: if someone says no names are visible at the constellation altitude, lower the handoff point.
**Decision**: The domain's far-field fade is removed and the watermark layer is retired; a domain reads at every altitude, in one form. This restores nine domain names plus the project at the resting camera; it does not name capabilities or elements.
**Dissent**: Recorded dissent (systems): the constellation altitude loses its abstraction, since nine labels of ink land in the calmest frame the product has and the far-field sky-chart flourish is gone for good; accepted because a calm frame that cannot say what you are looking at is not calm, it is mute.
**Falsifier**: At the fully-out camera on any vault, two domain labels overlap each other or a spoke (the wall-of-names failure); if it fires, the label budget governs domains too rather than the fade coming back.
**Owner**: not recorded

## 2026-08-29 — First persisted handoff is 50/50; clean-run performance remains open

**Why**: The next unfamiliar-repository construction completed its first persisted source-hidden handoff without changing the accepted body, but the run exposed two qualification-provenance defects and one source-receipt path defect before it could finalize; first MCP call to successful finalizer took 5,028.832 seconds (83 minutes 48.832 seconds) against a 40-minute target.
**Prior**: none
**Decision**: The next-fresh-construction requirement for 100% first persisted claim verification is satisfied; preserve earlier REDs as non-retroactive. The run does not prove performance completion, so the 15-minute candidate and 40-minute independently qualified write triggers remain. Land only the bounded correctness fixes (human-owned CQ timing/actor binding, failed-CQ hard block, direct source-dependency audit calibration, safe single-segment source-witness parity); needs_evidence after finalization is correct and must not be promoted to verified_current, and BASELINE.md does not move.
**Dissent**: Repeated qualification retries and an 83-minute wall make the product reason harder to feel even with perfect final accuracy.
**Falsifier**: The next clean small-repository run exceeds 40 minutes, changes a sealed claim or persisted body, fails any first persisted claim, or needs a post-write recommendation.
**Owner**: jinan

## 2026-08-29 — A completed ACP answer leads to grounded next actions, never an automatic run

**Why**: The owner asked to make the ACP conversation help a person who does not know what to do after creating the first ontology. The existing recommendation block rendered only while the transcript had no events, so a ready ACP session ended at an empty composer after the first turn.
**Prior**: 2026-08-17 (21), which allows a recommendation only when its fact is observed in the current vault, and (29), which gives those actions the existing quiet RowButton grammar, remain valid and are extended, not replaced.
**Decision**: After a non-empty answer completes for the latest real user turn, show at most three applicable current-vault actions immediately after that answer; hide them while the agent works, a permission or error needs attention, or a draft has started. Choosing a row only fills and focuses the composer, never sends or writes. The implementation-evidence action uses the same rule as MCP maintenance (a canonical path: or a resolved elements: relation); no helper persona, generic prompt library, ranking, persistence, route, schema, or public MCP/CLI contract is added.
**Dissent**: On a large vault, the first available maintenance suggestion may remain unchanged and become a treadmill, and one installed success does not prove people choose it or that it is the best action.
**Falsifier**: In five unfamiliar-repository sessions, three or more people ignore or delete the action and still type a generic "what next?", or an approved repair leaves the same first suggestion unchanged without explanation.
**Owner**: jinan

## 2026-08-29 — A failed competency question cannot become a human gap

**Why**: The calibrated source-hidden lane covered 53/53 claims and answered the ability question, but copied a fixture-only witness kind; the qualification evaluator marked that CQ failed, yet join still produced an acceptance request by treating the resulting functional-axis failure like an ordinary measured gap.
**Prior**: none
**Decision**: The qualification helper blocks before join when any evaluated CQ status is failed, and human acceptance cannot release it. CQ requiredWitnessKinds must use the actual kind values of sealed witnesses cited by the answer, not test-fixture vocabulary. Honest missing knowledge remains partial or unknown with an exact gap; this changes only the mirrored read-only helper and skills, with no public MCP, CLI, vault schema, writer, or approval bypass changed.
**Dissent**: Functional failures were already visible in the exact gap set, so a person could knowingly accept them.
**Falsifier**: A real partial CQ is blocked despite valid sealed witness kinds, or a failed CQ still reaches an acceptance request.
**Owner**: jinan

## 2026-08-29 — Exact element imports remain source dependencies, not runtime impact

**Why**: A fresh source-aware lane verified 70/70 citations and 134/134 path occurrences but marked six of 53 claims as mismatches because two element `depends_on` relations relied on static-import evidence, raising a public validation question.
**Prior**: none
**Decision**: No change to the public MCP validator, relation enum, schema, or tests. An exact production/value import may verify a direct element `depends_on` only when endpoints have distinct roles and resolving paths, bounded to source dependency; it never proves runtime or business impact. The original 47/53 stays RED; a fresh evaluator must apply this boundary independently.
**Dissent**: A pass-shaped candidate with import-backed relations can still be misread as causal runtime impact, and an early validator would remove that ambiguity sooner.
**Falsifier**: The fresh audit still cannot verify the two relations, a handoff promotes either to runtime/transitive/business impact, or the endpoint/path/direction conditions are absent while the audit passes.
**Owner**: jinan

## 2026-08-29 — Qualification questions are human-owned before source-hidden work

**Why**: A fresh trial produced a source-hidden packet whose scope gap correctly said no shared meaning owner was known, while the same evaluator minted an unidentified id, marked it human, and recorded every CQ revision as approved at the instant evaluation began.
**Prior**: none
**Decision**: The helper requires exactly one named human owner across `purposeAuthority.owners`, every CQ `owner`, and every `revision.approvedBy`, distinct from builder, hidden evaluator, and auditor; the exact question set must be approved before the source-hidden window begins. No public field, tool, CLI, or schema is added. The packet stays RED.
**Dissent**: One owner is narrower than the public qualification model and adds a human round trip before parallel work.
**Falsifier**: A real bootstrap requires independently approved CQs from several human owners, or the next three clean trials add this step without preventing a provenance or meaning failure.
**Owner**: jinan

## 2026-08-29 — Navigation begins with the map; mascot motion yields to graph ink

**Why**: Design Council convened after the complete pixel-identity build and direct owner inspection, with seats Lead, System, Motion, Information Visualization, Workbench, Responsive, and Interaction reviewing the rail mascot and macOS tray prototype.
**Prior**: none
**Decision**: Keep the rail brand-free: remove the unused 64px runway and use one 64x64 right-edge stage. Six poses share five 120ms travel/frame ticks; WALK's terminal frame is byte-identical to READ's first, and READ's to SUCCESS's first. Reduced motion keeps a static pose; chartreuse stays illegal in app CSS/TypeScript; the macOS status item stays static and pointer-secondary.
**Dissent**: Any fixed overlay may drift into graph ink as layouts change, and a permanent status item may remain unused because Dock/Cmd-Tab already return to the app.
**Falsifier**: Opaque-pixel/node overlap in the dense-map gate; a person notices the mascot before the affected concept; a state boundary teleports; Open creates a second window; Quit leaves a process; or the owner ignores the status item across three dogfood sessions.
**Owner**: design-guardian

## 2026-08-29 — The mascot may enter the macOS menu bar only as a captured, removable prototype

**Why**: The owner explicitly requested the selected mascot in the Mac menu bar, supplied a 133x27 placement crop, asked whether Windows should get an equivalent notification-area icon, and required direct captures after implementation.
**Prior**: The 2026-08-24 removal of the unused webview `core:tray` permission remains standing; this prototype is owned entirely by Rust and does not reopen JavaScript tray, image, menu, or window permissions.
**Decision**: The owner's direct request overrides the low rubric score for one disposable macOS-only prototype, built after brand assets, motion, map performance, and installed workbench capture are green. Generate a dedicated black-and-clear 16px template from the micro mascot; a primary click opens a native menu (Open, separator, Quit); the icon is static and state-free.
**Dissent**: Dock and Cmd-Tab already return to the app; the menu-bar item has no observed workflow damage, no ontology or agent value, and may imply Atlas works invisibly in the background.
**Falsifier**: The mascot is not identifiable in menu-bar captures; the template fills the face into a block; Open fails to restore/focus the window; Quit leaves a zombie icon/process; the icon changes close behavior; or the owner does not prefer it across three dogfood sessions.
**Owner**: owner

## 2026-08-28 — Pixel mascot replaces the compatibility mark as one raster-first identity

**Why**: The owner selected the two 2026-08-28 pixel mascot boards, required the nested-hex mark removed from every brand surface, and asked for the character to move inside the product: a hard-to-reverse first-impression decision.
**Prior**: Overturns the 2026-07-29 nested-hex record for brand identity; its revisit condition was met because `docs/BRAND.md` records the owner rejected it and has now selected its replacement. Project hexagons remain unaffected topology kind marks.
**Decision**: First author one canonical full master and one mini master, proved at 1024/128/64/32/16px before fan-out; after proof, replace every brand-only consumer in one pass. The black/ivory/chartreuse palette is fixed inside mascot raster assets only. Motion is one finite work sequence owned by Agent Work Visibility; no fresh state means no claimed work.
**Dissent**: Owner preference and internal consistency do not prove strangers recognize the mascot or its poses better than the old mark; a moving mascot may outrank the ontology work and look like a generic AI wrapper.
**Falsifier**: The full/mini forms fail to stay identifiable at 32/16px; the installed Dock, browser tab, or rail reads as blurred; people notice the moving mascot before the affected concept; or READ/SUCCESS cannot be decoded without a caption.
**Owner**: owner

## 2026-08-29 — First-pass performance is staged, and body assertions are the audit unit

**Why**: The final fresh trial completed safely but falsified the 1,200-second target, and its first persisted handoff verified only 45/48 source claims.
**Prior**: none
**Decision**: Retire 1,200 seconds as the completion gate; keep two budgets as regression triggers, not guarantees: reviewable candidate by 15 minutes, qualified final write by 40 minutes. Definition, Includes, Excludes, and Uncertainty each get immutable claims; multiple may share one ref. The 45/48 stays recorded RED; the 75/75 repair proves the fix, not a rewrite. `BASELINE.md` does not move.
**Dissent**: A 40-minute trigger can normalize a slow workflow, and a forward repair is weaker than a new clean subject.
**Falsifier**: Any of the next three helper runs exceeds 40 minutes on a comparable small repository, needs more than one candidate release, changes a sealed claim, fails a first persisted claim, or emits plan-caused maintenance.
**Owner**: jinan

## 2026-08-29 — Mandatory warnings fail the candidate before qualification

**Why**: The helper's independent forward use reached a `proposalValidation.status: pass` review plan carrying fourteen risky warnings that are deliberately not human-gap eligible, exposed only after both qualification lanes had finished.
**Prior**: none
**Decision**: With no qualification packet, lifecycle inspects mandatory non-gap proposal warnings; any such warning returns `writeEligibility: blocked`, an exact `proposal-warning-not-gap-eligible:*` diagnostic, and no write plan. A gap-eligible warning remains `reviewable`. Candidate-release metrics count only a `reviewable` plan; the helper recomputes this gate from current source code.
**Dissent**: Moving mandatory warnings earlier can add proposal repair rounds and make analyzer `status: pass` appear internally inconsistent.
**Falsifier**: A gap-eligible warning becomes blocked, a mandatory warning still reaches the lanes, or a final fresh trial loses exact claim/citation accuracy.
**Owner**: jinan

## 2026-08-29 — Deterministic scratch receipts replace per-run qualification code

**Why**: The sealed parallel-lane decision received its required second fresh test; its isolation and claim-integrity hypothesis passed, but its 1,151.581-second performance projection failed.
**Prior**: "Qualification claims are sealed before parallel review" remains authoritative for actor/access/claim isolation; its 1,200-second falsifier fired, so the per-run mechanical assembly is replaced.
**Decision**: Ship one mirrored `qualification-handoff.mjs` scratch helper with `seal`, `hidden`, `audit`, `join`, `accept`, `release` stages, adding no public contract. The agent still authors the proposal and audit; the helper derives only repeated refs, digests, and writer-call files. `join` requires distinct actors and verified pairs; `accept` requires the person's exact id and `authority: human`.
**Dissent**: A 1,100-line internal helper can become a parallel private contract and still leave too little margin because semantic source-hidden work is irreducible.
**Falsifier**: The helper authors a semantic judgment or human identity, invokes a writer, accepts mutated evidence, or the final fresh run exceeds 1,200 seconds, loses claim/citation accuracy, or emits a repair recommendation.
**Owner**: jinan

## 2026-08-29 — Qualification claims are sealed before parallel review

**Why**: The fresh run required by the first-pass completion decision crossed its 1,200-second falsifier and exposed claim text changing after the source-hidden measurement.
**Prior**: "One reviewed construction ends without hidden repair" remains authority for warning/gap parity and element recommendation semantics; its time and unchanged-claim falsifiers fired.
**Decision**: After the first candidate round-trip passes, seal one ordered scratch claim manifest with final `id`, `statement`, and exact `proposalRefs` plus digest. Start a source-hidden evaluator and a differently identified citation auditor concurrently from it; neither exchanges results while running. Join only when actor, access, digest, order, and coverage match, and `claims` equals the manifest byte-for-byte.
**Dissent**: Scratch isolation and self-declared actors are not OS authentication, and the projected 1,151.581-second path has only 48.419 seconds of margin.
**Falsifier**: The second run exceeds 1,200 seconds, releases more than one candidate, lacks overlapping lane timestamps, mutates any manifest row, records acceptance before the join, or falls below 100% claim/citation accuracy.
**Owner**: jinan

## 2026-08-29 — One reviewed construction ends without hidden repair

**Why**: The owner accepted the next construction-quality slice after the 2026-08-28 field trial; one unfamiliar-repository trial took 4,938.794 seconds and three candidate versions before its first write, changing public `analyze_repo_structure` lifecycle semantics.
**Prior**: The 2026-08-28 bounded-evidence rule stands. The 2026-08-12 construction decision also stands: accepted gaps outside an exact plan do not retroactively make the approved write false. The domain membership rule is decisive: `element.domain` is stored child to parent.
**Decision**: `unqualified-project-exclusion` joins the bounded proposal warnings needing independent evaluation and human gap acceptance. `recommend_relations` does not propose a domain-to-element inverse when `element.domain` plus an existing `elements`/`contains` parent already express membership. A source-hidden reader marks unverifiable detail partial; the audit decides support.
**Dissent**: Making a partial-scope exclusion approvable can repeat a claim a source-hidden reader cannot verify, and suppressing the inverse recommendation can hide a useful domain index.
**Falsifier**: An accepted partial exclusion produces any failed claim; an element becomes unreachable from its path; the fresh run needs more than one candidate, exceeds 1,200 seconds, or loses 100% citation/claim accuracy.
**Owner**: jinan

## 2026-08-28 — Bounded capability evidence never becomes exhaustive scope

**Why**: The owner asked to make README's reason to use Atlas explicit and repair a field trial's 14/15 claim accuracy: a persisted capability named four operations and placed all unnamed operations under `Excludes`, and a fresh reader upgraded that to a closed "covers only" claim.
**Prior**: The 2026-08-25 codebase-ontology positioning stands (Atlas explains what code builds and what a change affects; it does not replace source search). The 2026-08-16 `epistemic-exclusion-boundary` decision also stands, but its detector missed unnamed-operation phrasing.
**Decision**: Keep the hero unchanged; add two sentences saying capability lists are not exhaustive and unsupported scope stays uncertain. `Excludes` phrases like "not named in this bounded excerpt" now fail as `epistemic-exclusion-boundary` before any `writePlan`. Guidance must not create `only`/`all`/`every`/`exactly` from examples; unlisted behavior moves to `Uncertainty`.
**Dissent**: An English phrase regex can overfit one failure, reject a legitimate closed-set boundary, and create false confidence while equivalent wording survives.
**Falsifier**: A sourced neighboring responsibility is rejected; the exact old phrase reaches `writePlan`; a reader still introduces an unsupported exhaustive quantifier; or a fresh trial has any failed claim.
**Owner**: jinan

## 2026-08-28 — First-contact diagnosis preserves and reuses summary history

**Why**: A changed-path gate flagged an edit to `mcp/src/index.js`; review found `summaryFreshness` already nested in the validation receipt of `health`, `workspace_brief`, and `agent_brief`, and cold/repeated `workspace_brief` calls both took about 1.1s on the 88-node dogfood vault.
**Prior**: 2026-08-25 (114) remains standing: summary freshness compares a summary body's last meaningful change with its containment history and never rewrites prose.
**Decision**: Preserve every response field and verdict. Read the union history through one bounded `git log`, read revision bodies through one `git cat-file --batch` process, and reuse cloned revision records only when Git root, vault path, HEAD, slug order, and revision bound all match; a new HEAD invalidates the cache, and out-of-bound nodes fall back to their own bounded log.
**Dissent**: An in-process history cache can outlive an unusual Git history mutation that leaves HEAD unchanged, and a union-path log must not change per-file history semantics.
**Falsifier**: Any nested validation field or stale verdict changes; same-HEAD history expansion returns a stale cache; the union fallback omits an older quiet node; or a bound-source vault stays above 500ms on repeated `workspace_brief`.
**Owner**: not recorded

## 2026-08-28 — Architecture profiles declare which import usages dependency rules govern

**Why**: The owner asked to continue with the next quality problem; this changes `architecture-profile/v1`, `inspect_architecture`, and the CLI/web contract, and corrects a measured premise: the reported 18 `shared -> entities` rows were all `import type` edges that `eslint.config.mjs` explicitly permits.
**Prior**: The 2026-08-26 separation of Architecture from the Ontology Map stands; declared policy stays separate from observed source and unknown is never compliant. This record corrects a premise in the later 2026-08-26 draft decision.
**Decision**: Add one optional profile-wide `dependency_usages` array accepting a subset of `value` and `type_only`; a missing field preserves v1 behavior, and `unknown` always fails closed. The Atlas web profile declares `[value]`, so its 18 type-only rows stay observed but leave the violation list, while its 77 unmapped edges keep the result `unknown`.
**Dissent**: A profile-wide switch may be too coarse for a repository that governs type knowledge differently per role, and additive fields can burden strict consumers.
**Falsifier**: A field trial requires a per-role exception; a legacy profile changes verdict; an upward value edge stops turning red; unknown usage turns green; or self-dogfood changes anything beyond moving the 18 rows out of violations.
**Owner**: owner

## 2026-08-28 (3) — The diagram leaves the document: a horizontal graph, and only edges that carry something the columns cannot

**Why**: The owner asked for the architecture surface to be a building X-ray, then asked whether anyone could read the first attempt; traffic arcs drawn onto full-width bands were unreadable because every arc left and arrived at the same x, collapsing into near-parallel wires (reverted in `4553e13c8`).
**Prior**: (2026-08-26) stands, including its rejection of a free-layout diagram generator. (2026-08-27) selected the occupied-band stage from four directions; this record replaces that shape.
**Decision**: The diagram and document separate: the centre becomes a horizontal layered graph of role boxes, one column per rank, reusing ranks `buildArchitectureLayout` already computes; band contents move to a detail panel. Permitted edges draw only under `explicit`; measured traffic draws under either policy; under `lower-only` the permitted set draws as nothing. No layout library is used.
**Dissent**: The band stage is dense and scannable, and someone reading 88 source modules may be better served by a list than a graph; the detail panel is where that list survives.
**Falsifier**: A fresh-eyes walkthrough asked which boundary carries the most/least traffic cannot answer, or answers "a rule." Part 2 (no drawn edges under `lower-only`) was partly overturned by 2026-08-30 ("The spine is drawn under lower-only too"); parts 1 and 3 stand.
**Owner**: owner

## 2026-08-28 (2) — A rule the screen does not print is a rule the reader does not have

**Why**: A `/user-walkthrough` tested the prior record's own falsifier with a fresh agent forbidden from reading any repository file; given `lower-only` the walker placed a file correctly but could not say what that role may depend on, because the needed sentence existed only inside an assistive element measured at 1px by 24px.
**Prior**: Overturns the reasoning that the stage subtitle plus ordering already state the whole `lower-only` rule and a caption would only repeat it; a component test asserting the sentence's absence is now reversed.
**Decision**: Both policies now print the reach in role names, in both band shapes, even though the top row of a seven-role profile now lists six names. The drawn-policy graph stays unbuilt: the failure was a suppressed sentence, not a missing picture.
**Dissent**: none
**Falsifier**: If a later walkthrough finds the six-name list on the top row is itself unreadable (skipped, or misread as a path), the list is the wrong form and the rule needs a shape rather than a sentence.
**Owner**: owner

## 2026-08-28 — A role may say what it is for, and the pattern axis is the stage's subject

**Why**: The owner asked how someone who does not know Feature-Sliced Design would tell what these roles are, and whether this is really architecture; the profile's declared axis is literally `source-organization`, and measured against C4's checklist the blueprint failed all six readability items.
**Prior**: (2026-08-26) stands: a pattern label is never inferred from folder names; this record extends that refusal one level down, since a role id is a folder name too. (2026-08-27) records stand untouched.
**Decision**: `architecture-profile/v1` gains an optional `summary_<role id>`: one reviewed sentence per role, absent rather than empty where nobody wrote one. The declared pattern axis becomes the stage's subject: the pattern name becomes the heading with one sentence naming what it governs; an untranslated axis prints its raw string with no invented explanation.
**Dissent**: A graph drawing one arrow per permitted pair was rejected when the blueprint was built, because ordering by longest-path reach depth already makes every dependency point down; that rejected shape was the directions pass's recommendation but is not taken here.
**Falsifier**: If a reader who does not know the pattern still cannot say which roles a change may cross, the naming was never the problem and the drawn-policy graph was right; if role summaries stay unwritten across profiles, the field is a place nobody fills.
**Owner**: owner

## 2026-08-27 — The blueprint's rest state is the full diagram, and its only edges are reviewed relations

**Why**: Owner direction ("still lacking"): with the click-open detail shipped, the resting screen was still seven thin rows and nothing connected the cards.
**Prior**: none
**Decision**: Concept sections now open by default, showing preview cards with connected concepts ordered first; click now collapses or re-focuses. Between cards the blueprint draws reviewed vault relations only: `dependencies` solid with an arrowhead, `relates` dashed, both indigo, drawn exactly when both endpoints are on screen. Three true relations were added to the dogfood vault.
**Dissent**: none
**Falsifier**: If edge counts grow past legibility (about 30 visible) without a focus filter, add edge dimming outside the focused layer's reach; if readers mistake concept strokes for import facts, move the legend onto the strokes.
**Owner**: owner

## 2026-08-27 — A layer opens in place: the click's answer is the labeled meaning layer

**Why**: Owner direction: pressing a layer produced no detail, because the same-day source-modules record had removed the ontology-concept join and a browser cannot list source, so bands had nothing to open.
**Prior**: The same day's "Architecture bands hold source modules, not ontology concepts" decision, whose own falsifier fired here.
**Decision**: Clicking a layer now pins its focus and opens an in-place detail section titled "Reviewed concepts in this layer", listing reviewed concepts whose `path` frontmatter sits inside the role's globs, derived via `deriveRoleConcepts`. Source modules remain the band's primary content; concepts appear only in the click-open section under their own label.
**Dissent**: Mixing meaning and source in one band was the confusion the source-modules record removed; if readers conflate the layers again, the concepts section moves out of the band rather than gaining more markers.
**Falsifier**: Reopen if the concepts section is measured as what people read instead of the map for concept detail, or if click-open detail keeps under 2 opens per session in real use.
**Owner**: owner

## 2026-08-27 — Conformance records are dated machine receipts; the measurement must be true before it is durable

**Why**: Persisting `architectureBrief:v1` as a vault-local record changes a public MCP/CLI contract and adds a stored artifact; Evidence measured that all 18 reported `shared -> entities` violations were `import type` edges explicitly permitted by `eslint.config.mjs`.
**Prior**: 2026-08-26 "Architecture is a separate reviewed contract" items 3-6 stand (side effect 0, unknown fails closed, no fabricated green). Both 2026-08-27 records stand; `matchedFiles` is a 20-item sample against 193 real files, so the record does not subsume the directory walk.
**Decision**: Measure truly first: import inference carries type-only vs value through to edge kind, landing type-only edges in a named `unknown` class; no record is written before a human confirms the verdict. The brief gains an additive stamp (measured-at time, source revision, dirty flag). A new `architectureRecord:v1` is written only via opt-in `atlas architecture --record`, never committed.
**Dissent**: Evidence argued the whole build should wait for a verified measurement and one real usage cycle, since zero architecture-surface usage had been observed.
**Falsifier**: Any surface renders `conforms` from a record it could not revision-verify; a profile file gains a field sourced from a record; records' revisions never match HEAD in normal use; or records are regenerated every session and never read back in three sessions.
**Owner**: stark (owner)

## 2026-08-27 — Architecture bands hold source modules, not ontology concepts

**Why**: Owner correction: "the ontology is the meaning-based map; architecture is literally about the project source, it has no relation to the ontology nodes." Bands had been filled by joining role globs to ontology concept `path` frontmatter, making concepts read as source.
**Prior**: none
**Decision**: Bands now list source modules: a read-only directory walk of the bound project source, one directory level per glob segment, `exclude_paths` filtered with the MCP's own glob dialect; no file is opened and no import is read. The ontology-concept join (`deriveRoleOccupants`) was removed the same day it shipped; `matchesArchitecturePath` survives as the shared glob dialect.
**Dissent**: The concept join was the only occupant source a browser could compute, but it answered "which meaning mentions this layer" instead of "what does this layer contain," under-reporting the source by construction.
**Falsifier**: If real use shows people needing "which concepts live in this layer," bring the meaning layer back as an explicit secondary mark, as a decision, not a quiet revert; revisit at the conformance-record council.
**Owner**: owner

## 2026-08-27 — Role bands carry their occupants: the blueprint joins role globs to vault paths

**Why**: The owner asked for the architecture visualization to become substantially better and supplied a reference mockup; reviewed roles appeared as glob strings with zero occupants, three modes rendered an identical center, and content filled about 35% of a 1512x944 viewport.
**Prior**: Partially overturns 2026-08-26 (the on-screen dot matrix), whose reach-visualization argument survives as recorded losing dissent.
**Decision**: Direction B (Occupied bands) is chosen from four options: each ladder rung becomes a boxed layer container with a label column (icon, index, name, globs, occupant count) and equal-height occupant cards from the profile-glob x vault-path join, bounded by CARD_PREVIEW with a "+N more" expansion, plus one connector per gap forming the spine.
**Dissent**: Chief noted variable band heights loosen the prior constant-pitch ladder silhouette; the owner accepted this cost, which applies only where a band has occupants.
**Falsifier**: Reopen if the occupant join grows an import reader, if a three-band vault reads worse than the pre-band ladder, or if "+N more" becomes the primary way people read a band; unbounded occupants already pushed the seventh row 181px below the fold, a falsifier the owner knowingly traded for a more refined scale.
**Owner**: Owner (direction selection); this session's builder for the applied slice.

## 2026-08-26 — The first architecture draft is proposed by an agent and named by a person

**Why**: On installed rc.15 with the owner's own folder connected, /architecture showed its empty state, its button navigated to the map and produced nothing, and its copy falsely stated in present tense that an agent already reads folders and imports and drafts this.
**Prior**: Upholds the 2026-08-26 "Architecture is a separate reviewed contract" record (folder-inference ban, side-effect-0, Understand-Plan-Verify) and the 2026-08-24 decision that the app hands the agent a sentence rather than calling MCP; overturns nothing else.
**Decision**: The empty-state button carries the drafting task via queueAgentChatIntent instead of the app calling MCP; no new MCP tool is added; the draft writes no allow_* or dependency_policy so every edge stays unruled and unknown; only a person can name the pattern and roles; the draft is stamped created_by: agent:<tool> with evidence citing only human authorities, never the observed edges.
**Dissent**: The evidence seat argued to investigate first, since someone with a coding agent could simply ask it and nobody has measured whether that works; accepted as dissent, but the sentence handoff ships anyway since a false screen should not wait for a trial.
**Falsifier**: Reopens if five real first sessions reach a reviewed profile within ten minutes without this button, if a person rewrites or discards the draft in three of five repositories, or if drafted profiles come back mostly unknown.
**Owner**: not recorded.

## 2026-08-26 — SegmentedControl hover contract: unselected lift and strong, selected silent

**Why**: tests/e2e/hover-contrast.spec.ts failed on a route added the previous day; the new architecture route measured 0 of 4 visible controls answering a real pointer, with "compared = 2" below the instrument's floor of three.
**Prior**: none.
**Decision**: SegmentedControl opts every segment into the value layer's registered hover pair, hoverSurface: 'lift' (--color-overlay-2) and hoverInk: 'strong' (--color-text-primary); the active: false guard means only unselected segments get the hover, the selected one gets none. After the change compared reaches 4 and all 19 audited routes pass, with zero new tokens added.
**Dissent**: Also giving the selected segment a hover was rejected: hover on a selection weakened its border contrast (2.09 to 1.48), and the selected fill's tint family fails AA under a one-step hover raise (a24 measured 4.13).
**Falsifier**: If a future route's only hover-capable controls are a selected segment plus fewer than three others, the floor becomes unreachable by design; reopen this decision rather than lowering the instrument's floor.
**Owner**: not recorded.

## 2026-08-26 — Architecture is additive; Git remains a primary destination

**Why**: The owner inspected the delivered navigation and corrected the substitution explicitly: "Architecture is added; do not remove another destination"; /git still existed but the primary rail, active-route marker, G G shortcut, tour, and uncommitted-change badge no longer exposed it.
**Prior**: The same-day Architecture record stands for its profile, conformance, MCP/CLI, and Living Blueprint contracts, but this record overturns its rail-replacement clause; the recorded falsifier (a developer seeking Git from the rail) was observed immediately in the owner's first review.
**Decision**: The desktop primary rail has seven destinations: Map, Architecture, Docs, Insights, Projects, Agents, Git. Git retains /git, the History icon, active-route state, uncommitted-change badge, G G, and its destination guide; the mobile bottom bar stays the measured five-item set. Future destination work may not fund an addition by silently removing an existing one.
**Dissent**: Seven destination rows plus the fixed utility tier may become unreachable at the minimum window height or under UI zoom.
**Falsifier**: If rendered measurement shows Git, another destination, or the utility tier clipped, occluded, or unreachable, revisit rail sizing and scroll ownership rather than removing a destination.
**Owner**: owner.

## 2026-08-26 — Architecture is a separate reviewed contract and primary workbench destination

**Why**: The owner fixed Atlas as a developer-facing codebase ontology, clarified that an ontology map does not answer the architecture question, and asked for MVP, Hexagonal, Clean Architecture, and similar structure to be visible as a distinct, visually strong surface that helps agentic development.
**Prior**: Upholds the 2026-08-25 codebase-ontology decision, decision (92) (the Map is the ontology surface, Studio stays a redirect), and decisions (90)/(91) (a primary rail has a hard ceiling, a new destination must name what leaves); Architecture takes Git's primary slot while /git stays a contextual route.
**Decision**: A profile is non-kind Markdown that never joins the ontology graph; MCP inspect_architecture and CLI architecture return architectureBrief:v1 (side effect 0); conformance is conforms/violated/unknown, never inferred from folders; /architecture is the Living Blueprint among six destinations (Map, Architecture, Docs, Insights, Projects, Agents); /git stays a contextual route.
**Dissent**: A dedicated destination may still duplicate ArchUnit, dependency-cruiser, CodeGraph, or a maintained ARCHITECTURE.md while consuming Git's former slot, and teams may not maintain role mappings or may lend authority to a stale pattern label.
**Falsifier**: Reopen if a three-repository comparison does not beat Docs plus source tools on role/boundary/violation/agent-plan accuracy, if real profiles are mostly unknown or wrong, if an unsupported scan ever renders green, if developers seek Git from the rail but do not revisit Architecture, or if a profile becomes a second source of observed imports.
**Owner**: owner (surface/rail approval); design-guardian (bounded applied fixes).

## 2026-08-25 — Atlas narrows to a codebase ontology, without becoming a code index

**Why**: The owner rejected two successive master framings while reviewing the brand ("a shared meaning layer" was too abstract, "AI agent memory" sounded like a session memory store), then selected the plain account: understand what a codebase builds, why it is structured that way, and what a change will affect.
**Prior**: Narrows Product Direction v4 (repo-native agent memory), v8 (broadened audience), and v10 (shared meaning layer canonical) without silently rewriting them; their operating truths survive.
**Decision**: Ontology Atlas is a local-first codebase ontology workbench: understand what it builds, why, and what a change affects. Business meaning stays first-class only when it explains the product, a boundary, or impact; source tools keep structural authority, Atlas records curated meaning. Name and nested-hex mark remain only as compatibility assets; no replacement approved.
**Dissent**: Narrowing the entry point to a codebase may make planners, marketers, and leaders read Atlas as developer-only, and may understate valid product meaning not reducible to a file path.
**Falsifier**: Reopens if users shown the new wording still classify Atlas mainly as a code index, or if teams repeatedly need the workbench for ontologies with no codebase or code-change decision; a new name reopens only when it materially beats "Ontology Atlas" on comprehension, recall, and search ownership.
**Owner**: owner.

## 2026-08-25 (115) — MCP `instructions` names which question each tool answers, before it lists the tools

**Why**: Measured against a live server, the MCP `initialize` instructions carried 32,787 characters naming over forty operations with no guidance on when to use one; asked for the ACP runtime's boundary, an agent called get_concept four times, gave up, and ran rg forty-seven times, though the answer was in the vault's "## Boundaries" the whole time.
**Prior**: none on this surface; (113), 2026-08-24, moved the write checkpoint into the server and is undisturbed by this read-side change.
**Decision**: Prepend a 1,098-character routing block to the instructions, removing nothing existing; its first sentence states that the vault answers why and the source answers what, since a reason, boundary, exclusion, or decision is not in the code and grep cannot find it.
**Dissent**: The instructions already cost about 9,400 tokens per session; the intended payment was to collapse two enumerations that integration.test.mjs pins as required substrings, but that shrink was attempted and reverted, leaving the payload larger than it found it.
**Falsifier**: If agents still prefer source search over the vault on boundary questions, the block bought nothing; first re-measurement moved MCP calls from 2 to a median of 5, but that is n=1 against n=3 and not claimed as significant.
**Owner**: not recorded.

## 2026-08-25 (114) — A summary node reports when its description falls behind its membership, and never rewrites it

**Why**: domains/agent-integration.md was last written 2026-08-23 10:48 while four of the seven nodes it declares moved after it, up to 2026-08-24 05:54, and none of validate.mjs's seventeen codes asked whether the graph still told the truth.
**Prior**: Extends (7), 2026-08-14, which established that a compact response must not hide a stale edge and must demand a full follow-up, from edges to a node's own prose.
**Decision**: Compare the body (judgement) against the containment arrays (membership) and report only when membership moved last, as validate_vault.summaryFreshness plus a rejudge_summary_membership action; no model call, new file, or frontmatter key. Two earlier rules (child edited/created after parent) were discarded for measuring churn, not staleness, or never firing.
**Dissent**: A popover-only signal has no discoverability, since someone browsing the map never learns a domain is stale unless they click it; accepted as unanswered since the app is not the discovery path.
**Falsifier**: If flagged summaries turn out, on inspection, to still describe their membership correctly, the containment array is the wrong proxy for meaning and this rule is withdrawn rather than tuned.
**Owner**: owner.

## 2026-08-24 (113) — The write checkpoint moves into the server that performs the write

**Why**: Codex's approval policy documents its own scope as gating command execution only; MCP tool calls were never inside it, so the write gate the screen promised did not exist on the wire and no third-party configuration could have supplied it.
**Prior**: (111) removed codex-acp from in-app chat because a Codex read-only session let an Atlas MCP write reach disk unasked, and named the way back as an app-owned MCP proxy or server capability token; this record builds that checkpoint but does not restore Codex chat.
**Decision**: Write tools ask before they write when OATLAS_WRITE_CONSENT is on, a per-session switch; a runtime with app-owned config isolation (Claude) keeps its gate off, every other runtime gets the server gate, which fails closed without a declared elicitation capability. Measured on disposable vaults: gate on with real Codex was refused, matching every combination tested.
**Dissent**: A gate that asks per tool call will be clicked through; batching would have produced one question per plan instead of one per write.
**Falsifier**: A session where a person approves a long run of writes without reading them, or asks for the prompts to stop, would mean the unit of consent is the plan, not the call, moving this up to the plan layer.
**Owner**: not recorded.

## 2026-08-24 (112) — Rules reach non-Claude agents through nested AGENTS.md pointers, never copies

**Why**: .claude/rules/ holds about 70 KB of guidance that only Claude Code loads; Codex, Cursor, and Gemini CLI do not read .claude/**, so an agent on GPT-5.6 Sol, Terra, or Luna editing src/ received no architecture, design, surface, or testing rules at all.
**Prior**: Cites, without overturning, the standing 2026-07-31 decision that a one-line pointer, not a copy, prevents rule duplication into AGENTS.md's 32 KiB cap.
**Decision**: Every directory a .claude/rules/ glob reaches carries a nested AGENTS.md naming those rules and the globs that reach it, since Codex merges AGENTS.md root-down along the working path; docs/ is excluded because build-docs-vault.mjs sweeps docs/**/*.md into the shipped documentation vault.
**Dissent**: A pointer is weaker than the rule itself, since a non-Claude agent must choose to open it; countered that no available mechanism can force it, and copying is worse since it silently truncates the instruction set.
**Falsifier**: A Codex or Cursor session that reads a nested AGENTS.md, does not open the rule it names, and then violates that rule; if observed, move the constraint into a lint rule or hook rather than growing the pointer into a copy.
**Owner**: Jinan.

## 2026-08-24 (111) — Codex leaves in-app chat until Atlas MCP writes have an app-owned gate

**Why**: Installed 1.0.0-rc.10 acceptance opened a real Codex session in read-only mode against a disposable storefront vault; the model called Atlas add_relation, no session/request_permission or review card appeared, and the file immediately gained the requested relation and relation_notes.
**Prior**: 2026-08-16 (8) treated Codex read-only session mode as a permission gate, and 2026-08-17 (23) made successful gate setup a session-start condition; this record overturns only the claim that Codex session mode also guards Atlas MCP writes.
**Decision**: Remove codex-acp from the guarded-runtime table; Codex keeps its external MCP connection/config path, but the installed app no longer offers Codex in-app chat, and only Claude Agent remains eligible. Do not call a session mode a write gate unless a probe shows both reject-without-write and allow-once-with-write for self-registered and injected mutations.
**Dissent**: Hiding Codex chat removes a useful read-only conversation surface even though only its write path is unsafe.
**Falsifier**: Restore Codex chat once an app-owned MCP proxy or server capability token reliably pauses every Codex Atlas write and proves reject/allow on a disposable vault; do not restore it from a direct file sandbox result.
**Owner**: Jinan (implemented by Codex).

## 2026-08-24 (110) — Retire the consumer-free Skills form-column specification

**Why**: PAGE_COLUMN_FORM had zero consumers after /skills was deleted, and its comment justified a padding-free 960px column only through the retired Skills empty state.
**Prior**: 2026-08-21 (91) completely retired the standalone Skills surface and moved its remaining shared page-frame verification to Agents; this record is a mechanical completion of that removal, not a new layout choice.
**Decision**: Delete the unused PAGE_COLUMN_FORM export and its retired-surface rationale; do not redirect the old Skills layout role into Agents or mint a replacement token without two real consumers. The still-used PAGE_FRAME_FORM retains the 960px form frame, and current surfaces keep their own approved frame interfaces.
**Dissent**: Preserving a padding-free 960px alias could avoid another hand-picked width when a future compact column appears.
**Falsifier**: If two live surfaces independently need the same padding-free 960px interface, define a semantic shared interface from those measured consumers rather than reviving the Skills-named rationale.
**Owner**: Jinan (implemented by Codex).

## 2026-08-23 (109) — One deep dead-code analyzer, isolated scope/lane adapters, and a shrink-only ratchet

**Why**: Deletion cleanup exposed that the former root-only signal could not describe the independently delivered CLI, MCP, and repository scripts, and a broad ignore list or auto-fixer would hide the ownership questions that made the cleanup necessary.
**Prior**: none.
**Decision**: Keep one deep analyzer (Knip) with separate scope/lane adapters for root frontend, scripts, CLI, MCP; Rust/Tauri stays compiler/Cargo-verified, not Knip coverage. Setup errors fail closed, findings are blockers, exports/types use a shrink-only baseline; an exception needs the exact finding and witnessed use. `pnpm knip` runs pre-push and in Checks; no broad ignores or auto-fix.
**Dissent**: Running every adapter before every push may be slower than path-local checks, and Knip's static model can misclassify dynamic consumers.
**Falsifier**: A demonstrated legitimate dynamic consumer that cannot be expressed as one exact witnessed exception, or the lane repeatedly blocking pushes without finding a real defect, would reopen the adapter boundary rather than adding a global ignore.
**Owner**: Jinan (implemented by Codex).

## 2026-08-23 (108) — Retain ledgers and operating context; delete superseded, consumer-free artifacts recoverable from Git

**Why**: The owner asked for a smaller, higher-signal Markdown and agent context surface; decision (102)'s broad historical-retention wording had also kept obsolete plans, cloud-era drafts, and a retired loop guide after their consumers were gone.
**Prior**: Narrows decision (102)'s historical-retention wording, only for superseded, consumer-free artifacts.
**Decision**: Preserve DECISIONS.md, CHANGELOG.md, skills and mirrors, the ontology, samples, launch drafts, PUBLISH-NPM.md, and active documents; delete only tracked artifacts that are superseded, have no live consumer after backlink repair, and remain recoverable from Git. Do not delete ignored local or user-owned state; docs-vault output must be rebuilt from source, never hand-edited.
**Dissent**: Historical drafts can retain context that a future agent would otherwise miss.
**Falsifier**: If a current task cannot be completed because the removed artifact contains the only non-Git explanation of a live contract, restore the smallest needed context from Git rather than reinstating blanket retention.
**Owner**: Jinan (implemented by Codex).

## 2026-08-23 (107) — Selecting a node in the dome lights its meridian to the apex

**Why**: The owner sent a still of the 3D dome asking for it to be more striking and more in motion, after an inventory found nearly every plausible device already present, several tuned down at the owner's own request, so any addition had to be genuinely new and responsive.
**Prior**: none.
**Decision**: On selection in the dome, the containment chain from the selected node up to the apex (its meridian) lights, using the existing ego grammar: ancestor nodes join the neighbour set and the chain's contains edges take the same ego override slot the path lens uses, with no new ink, alpha, or token. The flat map is untouched, guarded by the dome flag, since 2D ego stays 1-hop.
**Dissent**: none.
**Falsifier**: If the lit chain is misread as "a path I walked," the chain should dim while the trail lens is open; it already does via the lens's blanket dim.
**Owner**: not recorded.

## 2026-08-23 (106) — Gateway motion is the product working: a linked demo, a typed tool call, counted numbers

**Why**: The owner asked what else the gateway page could carry and sent a survey of motion-heavy references (Warp, Superlist, Resend, Family, Linear); the shared property of the ones that work is that their motion is the product doing its job, never decoration.
**Prior**: none reversed; the motion charter's "informational motion only" rule filtered out the survey's other devices before they were offered.
**Decision**: Three devices ship: a linked demo where three beats walk the specimen's meaning (title, domain, dependency) via the map's own focus states, cancelled by any pointer act on the map; a typed tool call where add_relation arrives as typing under a 1.1s budget; and counted numbers that ease from 0 on first sight while the DOM always carries the final value.
**Dissent**: none recorded.
**Falsifier**: If the demo is reported as stealing attention from reading the file panel, drop beats before dropping the device; one beat (node only) still teaches the claim.
**Owner**: not recorded.

## 2026-08-23 (105) — The label budget asks where the camera is, not which dots exist

**Why**: The owner asked for the gateway evidence map to be tidied, since labels read as walls of stacked names; the gateway's tier-reveal override made entry zoom read as leaf-reading altitude, and 33 of 82 labels landed wherever they fit.
**Prior**: none reversed; the gateway's caption-honesty contract (2026-08-18) and the workbench's overview label budget (top-LABEL_TOP_K by degree) both stand; what changed is a conflation between them.
**Decision**: The label budget band classifies against the canonical zoom grammar (DEFAULT_TIER_REVEAL), regardless of the caller's reveal override, so the override answers which dots exist while the camera alone answers whether the reader is close enough to read leaves. After the change, 12 labels draw on the gateway with every leaf still present as a dot; the workbench is byte-identical.
**Dissent**: none recorded.
**Falsifier**: If visitors are observed hovering leaf dots one by one to learn names, raise LABEL_TOP_K for the gateway scope rather than re-lifting the budget.
**Owner**: not recorded.

## 2026-08-23 (104) — The demo clip loops with no controls, and the page stops explaining itself in protocol terms

**Why**: The owner read the shipped page and made three calls: the video's timecode should not be there, the clip should keep playing, and the evidence panel and agents copy were hard to read; the progress rail read as video-player chrome with nothing to scrub to in nine seconds.
**Prior**: Reverses the 2026-07-29 "no loop" decision (written for a three-minute take) and the control bar's reason for existing (scrubbing a 199-second tour); the size cap (2026-08-19) and centred axis (100) are untouched.
**Decision**: The clip loops and draws no controls, with the play button kept for reduced-motion readers and autoplay-refusing browsers; the specimen panel shows only lines that carry meaning and states how many it left out, instead of a verbatim dump including a UUID and created_by: "agent:unknown"; the agents copy names what the reader gets, with vendor naming following 2026-08-16 (5).
**Dissent**: A looping clip is motion that never stops, which the design charter is hostile to; rejected because the existing IntersectionObserver pauses it whenever the section is off screen.
**Falsifier**: If the looping clip is reported as distracting while reading the surrounding sections, measure the pause boundary before removing the loop.
**Owner**: not recorded.

## 2026-08-23 (103) — The evidence section shows one transformation, not an inventory

**Why**: The owner rejected the evidence rail as too weak for an open-source description; its rule (three most common relation types, alphabetically first edge) put a Korean-named node joined to an English-named one on screen in one mixed-language line, and 63 of 83 vault nodes (75%) have no Korean name.
**Prior**: Changes what fills the right half that the 2026-08-18 layout decision (cut the section in half, put something real on the right) created; that layout decision still stands.
**Decision**: Stop counting and show one transformation: left, a file that exists in the repository; right, what an agent reads out of it, derived by generate-evidence-specimen.mjs and diffed in CI rather than hand-typed. Keep the map, since StageMap has exactly one consumer here, and link to the file on GitHub as the strongest open-source evidence.
**Dissent**: Dropping the map too and putting file and facts side by side would match the surveyed references' shape more closely; rejected because the map is the page's only interaction.
**Falsifier**: If nobody is observed touching the map in this section, drop it and run file and facts as two panels; if the specimen file reads as opaque, change SPECIMEN_SLUG rather than the device.
**Owner**: not recorded.

## 2026-08-23 (102) — Make all active authored Markdown English; retain only typed locale data and immutable history

**Why**: After the operational control plane reached English-only status, the owner explicitly clarified that the audit must include every Markdown file, not only startup instructions.
**Prior**: Overturns only decision (101)'s deferral of current ontology and sample bodies from the English requirement; (101)'s protection of typed locale data and append-only history stands.
**Decision**: Require zero Hangul in operational and current authored Markdown; keep display_ko in leading frontmatter and cli/templates/vault-ko/** as explicit locale data, with generated mirrors inheriting authored sources. Preserve prior entries in DECISIONS.md, CHANGELOG.md, package changelogs, archives, audits, completed plans, and superseded loop records as historical evidence.
**Dissent**: The Korean locale's long-form ontology body now falls back to canonical English because the schema has localized labels but no localized body field.
**Falsifier**: If Korean-locale walkthroughs show this blocks a core task rather than merely presenting English documentation, revisit when that observation exists or a localized-body schema is proposed.
**Owner**: Jinan (implemented by Codex).

## 2026-08-23 (101) — Englishify the operational agent control plane first; preserve localized and append-only Markdown

**Why**: The owner asked to make every Markdown file and every Claude skill English, which conflicts with standing exceptions for localized data and append-only history.
**Prior**: `docs/GLOSSARY.md`'s English-canonical rule and the 1,532-file comment translation both stand; this record only narrows the order of work.
**Decision**: Translate the operational agent control plane first (AGENTS.md, CLAUDE.md, .claude/rules/**, canonical .claude/skills/**, .claude/agents/**) and update .agents mirrors byte-for-byte; preserve Korean locale data, generated copies, and append-only records; defer ontology/sample body translation.
**Dissent**: The owner asked for "all Markdown"; staging risks becoming a permanent excuse that leaves English contributors blocked by Korean content.
**Falsifier**: An English-only source-hidden agent still needing translation to find a rule, current meaning, or next action after this batch. Overturned by (102), partially, for the current-body deferral only.
**Owner**: Jinan (accountable); implemented by Codex.

## 2026-08-23 (100) — The demo is the center axis, and the screen's copy must say what was recorded

**Why**: The owner opened the deployed screen and objected that "no-edit, no-audio" was unclear and the video placement looked odd, expecting a centered layout like Buzz with a caption.
**Prior**: Overturns half of (99), same day: the stage-to-title alignment call was right but the side was wrong; the 2026-08-19 width cap still stands.
**Decision**: The demo section stands as one centered axis (eyebrow, title, lead, video, caption together); other sections stay left since they fill the column. On-screen copy states only what was captured: the lead says what a visitor will see, and the caption plainly gives length, no-editing, and silence.
**Dissent**: Centering only one section creates two axes on the page; keeping everything left would be more consistent. Rejected because other sections fill the column rather than choosing an axis.
**Falsifier**: If a second "stage" section appears and centering feels awkward there, drop the per-section axis rule and unify everything left.
**Owner**: not recorded.

## 2026-08-23 (99) — The gateway title types one character at a time: we set the speed, and reserve the space in advance

**Why**: The owner asked together whether the download page matches reference quality and whether a letter-by-letter title motion was possible, after reviewing four references and measuring the deployed page.
**Prior**: Partially overturns 2026-08-19's stage centering (only the alignment; the `--gateway-stage-max` width cap stands); revives 2026-07-30's rejection of `mx-auto`.
**Decision**: The title uses a real typewriter (cursor advances, letters light up in place, none appended) at 38ms/char with a 1.8s hard cap (measured 1.14s Korean, 1.80s English), not Buzz's ~200ms/char; line boxes and block height stay fixed before typing starts (measured 1520x158 fixed).
**Dissent**: A typewriter on the one-time headline delays reading the page's single argument; a same-speed "reveal" would finish faster with the same impression. Owner heard this and rejected it.
**Falsifier**: Visitors leaving before the typewriter finishes, or shorter first-screen dwell, would prove the dissent right. Overturned by (100) same day for stage placement left of title (typewriter portion stands).
**Owner**: not recorded.

## 2026-08-22 (98) — ACP's read action moves the map, and overview and detail actions each keep a single entry point

**Why**: Repeated observation of complex map/INDEX/node-detail UI, an ACP-to-map state disconnect, and update-check failures in one workbench pass (solo PO, no subagents).
**Prior**: (92)'s map+ACP workbench and (93)/(94)'s work-state and write-approval rules stand; overturns the 2026-08-03 "no tile removal/merging" clause after repeated owner complaints of too many buttons.
**Decision**: INDEX keeps only the exploration tree; node detail drops duplicate counts and promotes "Ask AI"/handoff as primary action; ACP only reads typed `get_concept`/`find_path` calls made in-turn to drive map focus/path; a top "Expand all" fits all nodes; the updater reads one stable `/update/latest.json`; toolbar recenters when dock and detail are both open at 14 inches.
**Dissent**: Opening every node can shrink nodes and cause label soup in large vaults; removing the persistent legend and detail tiles may hurt beginner discoverability.
**Falsifier**: Any node left off-screen after expand-all, input blocked over 100ms in a 500+ node vault, or a user asking the same question twice about relation meaning or editing.
**Owner**: Jinan (approved implementation and removal); Codex (solo PO, implementation, verification).

## 2026-08-22 (97) — The total volume of checks is not excessive. What's excessive is «the rate that doubled in two weeks»

**Why**: Owner said checks felt excessive, taking all day and hurting both hooks and tests, and asked for a re-measurement.
**Prior**: none.
**Decision**: Measured all 189 contracts and 698 commits; check volume was not excessive (test/code ratio and CI time competitive with peer repos), but 35% of contracts were created in the last two weeks; removed only two proven-duplicate gates, `design-forbidden-class-guard` and `named-offramp-utility-ratchet`; left the other 97 untouched.
**Dissent**: Clean up all 97 low-value contracts now; rejected because a large one-shot change costs more in fallout than bounded, individually-measured batches.
**Falsifier**: If the contract suite grows so CI exceeds 15 minutes, or "follow-up fix" commits keep growing monthly, split the 97 into batches of ten.
**Owner**: not recorded.

## 2026-08-22 (96) — Restore the `pre-push` hook: path-based lanes, parallel, and e2e stays in CI

**Why**: Owner asked how Buzz (block/buzz), this repo's actual reference product, handles pre-push hooks.
**Prior**: Overturns (95): its comparison sample (Ghostty, Zed, Cap) was accurate but incomplete, missing Buzz, which runs a parallel, glob-laned, e2e-free pre-push hook with CI as sole authority.
**Decision**: Restore `.githooks/pre-push` with path-glob lanes run in parallel, no e2e, and no new dependencies; verified against four real regressions including a script-name regex bug that silently truncated a check name and passed.
**Dissent**: Keep hooks removed since Ghostty/Zed/Cap live without them and 8-minute CI suffices; rejected because an actual incident occurred during the short window without the hook.
**Falsifier**: People still using `--no-verify` after restoration, or any lane exceeding 5 minutes, would justify reverting to (95) and relying on docs and CI alone.
**Owner**: not recorded.

## 2026-08-22 (94) — Review every bundled change in full, keep in-app decisions as a local receipt, and start building only after the source is connected

**Why**: Real installed-app use showed simultaneous disconnects in batch review, memory of app-internal decisions, and first-time source setup.
**Prior**: (92)'s map+ACP workbench with human-decided change proposals stands; (93)'s single activity surface for current and past work stands, unchanged for activity.jsonl.
**Decision**: Batch ChangeSets preserve every item as an accordion, approved or rejected as one whole batch; the map previews one selected relation as a dashed ghost edge; in-app write decisions append-only to `.ontology-atlas/acp-work.jsonl` (summary, agent/tool, typed target, status only); starter analysis waits for a connected project source; ACP GFM tables scroll only inside narrow docks.
**Dissent**: Batch-only approval forces rejecting and re-requesting a whole batch over one wrong item among many; partial approval could be faster.
**Falsifier**: Users rejecting a whole batch three times to fix one item, or repeated stalls reviewing 20+ item batches, would reopen partial-selection review, re-validating any subset as a new plan.
**Owner**: Jinan (approved priorities and implementation); Codex (solo PO, implementation, verification).

## 2026-08-22 (95) — Remove the `pre-push` hook: CI makes the verdict, and local only blocks the fast checks

**Why**: Owner asked if this level of hook was needed and how Buzz compares; pushing a 1,536-file comment-Englishing branch made `pre-push` run 657 checks serially, measured at 40 minutes for 35 checks against CI's parallel 8 minutes.
**Prior**: none.
**Decision**: Delete `.githooks/pre-push` and its paired `local-ci-parity` contract; keep `pre-commit` (seconds-long, catches generated-file drift); move the discipline into docs, requiring contributors to run `checks:changed -- --run` themselves before push.
**Dissent**: Shrink the hook to only fast checks instead of removing it; rejected because a green fast hook next to a red full CI teaches people to trust the hook, recreating the "partial check" problem it was meant to prevent.
**Falsifier**: CI turning red twice or more for something a 5-minute local run would have caught would justify reviving a fast-checks hook. Overturned by (96): the comparison sample was incomplete, missing Buzz's working pre-push hook.
**Owner**: not recorded.

## 2026-08-22 (93) — Agent work speaks in present tense only about a confirmed heartbeat, and never uses authorship or the README as work status

**Why**: In the installed app, agent name, progress stage, target, and authorship were mixed into one line and link with different meanings the owner could not interpret.
**Prior**: 2026-07-31's "data uses `created_by`, screen shows work state not authorship" stands and is restored here after a review-ring/tab implementation reversed it; 2026-08-01's work-unit notifications stand, but immediate "in progress" inferred from a recent write alone is reversed.
**Decision**: Only a fresh, valid, non-complete heartbeat counts as `live`; a recent write without a heartbeat is `recent-write`, finished work is `completed`; raw client IDs are normalized for display only (e.g. `codex-mcp-client` to "Codex"); `created_by` keeps provenance but loses its INDEX lens and review ring.
**Dissent**: Heartbeat-less external MCP clients may still be actively working; downgrading log-only sessions to "change detected" could make ongoing work read as finished.
**Falsifier**: A real heartbeat-less agent writing continuously while users repeatedly report "why isn't this in progress" would justify connecting that client to an explicit heartbeat instead of inferring live status from writes.
**Owner**: Jinan (approved implementation); Codex (measurement, sequential review, implementation, verification).

## 2026-08-21 (92) — Edit meaning inside the map, and ACP writes proceed only after a human confirms the change proposal

**Why**: Installed-app measurement showed Studio saved new markdown with no review step, map-created docs called `createDoc` immediately, and ACP contract tests auto-allowed `add_concept` without a card.
**Prior**: none cited as overturned; extends the existing map/ACP focus.
**Decision**: The map and ACP become the primary workbench: manual writes use the selected-node inspector as a `MeaningEditorPanel`, and every create/edit builds an `OntologyChangeSet` confirmed against an accurate before/after before the writer executes. ACP's write permission becomes a ChangeSet confirmed via `allow_once`/`reject_once`; Studio and edit routes become compatibility redirects to `/topology`.
**Dissent**: A standalone Studio allowed focused complex relation editing; a small contextual editor risks becoming a miniature Studio that still blocks the map.
**Falsifier**: At 1512x900, editor+ACP obscuring a key node or 480px+ of map, or users trying to return to the compatibility Studio address, would mean don't restore the standalone page, first reduce edit scope to one relation/field at a time.
**Owner**: Jinan (chose direction B, approved implementation); Codex (measurement, sequential review, implementation, verification).

## 2026-08-21 (91) — Fully retire the Skills product surface, and close the rail cap at seven

**Why**: Real use of `/skills` showed it re-picking an arbitrary folder unrelated to the active vault every time and ending in scan/packet-copy without reading or writing vault meaning; the owner chose full removal across four rounds of review.
**Prior**: Overturns the destination-promotion part of 2026-08-09 "Skills is a separate destination" (its read-only/no-vault-write boundaries remain enforced elsewhere); (90)'s `/agents` destination stands except its "eight is the cap" becomes "seven is the cap" by owner decision.
**Decision**: Fully delete the `/skills` route, LNB tile, shortcut, tour, and the agent-skill entity/feature/view and canonical packet; no redirect or tombstone, an honest locale 404 instead; the canonical destination set becomes exactly seven (map, docs, studio, insights, projects, agents, git), also the cap.
**Dissent**: Removing a verified canonical packet and address without usage telemetry could be over-deleting based on one user's taste.
**Falsifier**: The exact Skill ordinal/line/digest packet or `/skills` being sought even once after removal would mean reconsidering the packet as a missing primitive, without automatically restoring the old LNB.
**Owner**: owner (accountable, full retirement).

## 2026-08-20 (90) — "Agents" is a top-level destination: new `/agents/`, migrated out of the settings sheet

**Why**: Owner asked whether settings should become a full top-level window like Buzz instead of today's popup, choosing "promote agents to top-level."
**Prior**: 2026-08-09's "different answered question, different destination" grammar stands; 2026-08-16's frozen `ai` path stands so `ai` does not move; (88)/(89)'s install conditions carry over.
**Decision**: New route `/agents/` moves `runtimes` and `agent` (MCP connections) out of settings while `ai` and `workspace` stay; rail gets an eighth tile (`Bot` icon, cap of eight); settings keeps one line pointing to the new destination. The real reason to move is that a modal dims the background and owns Escape for what is an ongoing operational task, not a settings choice; earlier width/progress-loss justifications were both corrected during verification.
**Dissent**: `agent` is a once-per-tool config write, not worth a top-level destination; a lighter sheet fix might have sufficed.
**Falsifier**: 30 days with zero reuse of the MCP-connect section would justify reverting it to settings; unchanged install-completion rates after launch would show the container wasn't the problem.
**Owner**: owner (rail cap fixed at eight, by contract).

## 2026-08-20 (89) — The app fetches the Node runtime too: pinned version, embedded hash, app-only location

**Why**: Owner asked whether Node itself could be fetched by the app "like Buzz," the piece (88) had explicitly deferred since npm (needed for the (88) CLI install) requires Node.
**Prior**: Builds on (88)'s four conditions, which stand; corrects (88)'s claim that Buzz was stronger on this axis overall, since Buzz's own CLI/adapter installs are actually unpinned while ours already pin exact versions, and Buzz was only ahead on pinned-and-hashed Node.
**Decision**: Fetch Node into an app-only location (`<app-data>/runtimes/node/`), never touching system Node or PATH; user-triggered only, showing the source URL and hash prefix before download; version pinned and hash checked against the official `SHASUMS256.txt`, failing and deleting on mismatch; listed only for platforms actually shipped (darwin-arm64/x64, win-x64, linux-x64).
**Dissent**: Pinned hashes require manual updates on every bump and are easily forgotten; 195MB is pure waste for users who already have Node.
**Falsifier**: A pinned version stalling unbumped for 6+ months, the offer appearing to users who already have Node, or failed-fetch reports becoming the majority of install questions would justify reverting to link guidance.
**Owner**: owner (decided by direction).

## 2026-08-20 (88) — The app installs the agent CLI for you: only when pinning, verification, and isolation are all in place

**Why**: Owner asked why the app shouldn't install the agent CLI itself like Buzz, and to investigate and change the prohibition if no real issue existed.
**Prior**: none cited as overturned; corrects the team's own reading of `forbidden.md`'s plugin clause, which concerns third-party plugin marketplaces, not installing a CLI for an agent runtime the user already trusts; also found the app already runs `npx` on every chat open, so only CLI install itself was actually prohibited.
**Decision**: The app may install a tool on the user's behalf only when all four hold: user clicks (no auto-install), the exact command is shown first, install lands only in an app-only location removable without trace, and versions are pinned with hash verification where possible. Fetching Node itself is explicitly excluded from this first slice.
**Dissent**: The differentiator is attaching to agents already in use, not onboarding zero-tool users; taking on install ownership adds a maintenance surface unrelated to our strength.
**Falsifier**: Install-failure reports becoming the majority of connection questions, or an app-installed CLI's version diverging from the user's own terminal copy, would justify reverting to link guidance.
**Owner**: owner (decided by direction).

## 2026-08-19 (87) — Reshoot the gateway demo: one uncut 89-second take covering dome, cloud, and a Codex ACP round trip, retiring the provisional 24-second cut

**Why**: Owner directed re-optimizing 3D so it isn't laggy, then recording a new download-page demo explicitly requiring 2D/3D node clicks, cloud/scaling, and a Codex-connected ACP round-trip.
**Prior**: none cited as overturned; supersedes `docs/DEMO-SCENARIO.md`'s 45-second target, written before any 3D placement work existed.
**Decision**: Replace `atlas-tour` with an 88.83-second uncut single take on the installed build against `docs/ontology` (82 nodes), covering folder pick, map settle, 2D click, dome assembly/drag, cloud formation/rotation, flat return, and a read-only Codex-via-ACP exchange; length grew past the old target because cutting scope wasn't the maker's call, and is recorded as fact on-screen and in the clip registry.
**Dissent**: 89 seconds is long for a first-impression slot; most visitors leave within 20s, so the back half (cloud, agent) may go unwatched.
**Falsifier**: Median demo watch time observed under 25 seconds would prove the dissent right, fixed by reordering the route rather than the copy.
**Owner**: not recorded.

## 2026-08-19 (86) — The two effects that draw domain names stop crossfading and hand off the spot directly

**Why**: While preparing to shoot the demo, the installed build showed a selected 3D-dome domain name rendered as garbled overlapping text.
**Prior**: none cited as overturned by this record itself.
**Decision**: A domain draws a readable compact label and a far-only watermark on one anchor via a summed crossfade, so both were visible mid-range; the hidden assumption that the camera always passes through that band broke because the 3D dome parks the camera inside it. Replace the crossfade with a handoff at `DOMAIN_LABEL_HANDOFF = 0.5` so the two are never both visible in one frame, with a test asserting at least one alpha is always 0 across the full range.
**Dissent**: Halving the range where the far watermark's ambient layer appears cuts perceived atmosphere at distance; accepted because readability wins per this repo's existing label-clarity rule.
**Falsifier**: A report that no name is visible at all at constellation altitude would justify lowering the handoff point below 0.5. Overturned by 2026-08-29 ("The spine names itself at every altitude"): no names at constellation altitude and hover-overlap were observed; only the remedy, not the diagnosis, is overturned.
**Owner**: not recorded.

## 2026-08-19 (83) — Remove the whole install section from the gateway (and four honesty facts disappear from the screen); the demo video comes down to a 48rem stage

**Why**: Owner looked at the finished screen and judged the install/download section unneeded since its content is already at the top, and that the demo video was too big.
**Prior**: Partially overturns (70)'s five-section structure (deletes section 5 only; sections 1-4 and motion discipline stand); (73)'s widened hero CTA is the basis and is reinforced; revives 2026-07-30's reasoning against `mx-auto`.
**Decision**: Delete the install/download section entirely, with the owner explicitly informed of and accepting the loss; four honesty facts (checksum, signing proof, notarization proof, separate app/site privacy promises) disappear from the page entirely, leaving only one hero trust line as the page's sole such claim; the demo video shrinks to a fixed 766x465 `48rem` stage owned by the section, reusing the agent section's existing width token.
**Dissent**: Checksum and signing proof were decision material for someone running an unfamiliar binary, and the repo's own comment says trust is earned by exactly that evidence; losing all repository links from the landing page is the same category of loss.
**Falsifier**: Inquiries asking "is this safe / is it signed / where's the checksum," reports of Gatekeeper/SmartScreen abandonment, or visitors asking where the source is would justify adding proof lines and a repo link to the colophon, not reviving the install section.
**Owner**: owner (explicitly informed of and accepted the deletion).

## 2026-08-18 (85) — 3D optimization: remove per-frame allocations and bring cloud transitions under 100ms

**Why**: Owner asked to optimize 3D so it isn't laggy.
**Prior**: none.
**Decision**: Removed four per-frame allocation costs (edge/node depth sorting, latitude-ring projection, meridian control points, node shading) by reusing scratch buffers and caching values; merged the cloud layout's repulsion/overlap loops and lowered its iteration cap from 420 to 260, cutting the one-time cloud-transition stall from 143.1ms to 88.5ms with orbit-drag p95 improving from ~9.3-9.7ms to ~8.8-9.1ms at 125 nodes/258 relations, 120Hz.
**Dissent**: Lowering the iteration cap based on "visually unchanged" risks larger vaults settling into an unfinished, clumped layout misattributed to another cause.
**Falsifier**: Vaults with 300+ nodes showing the cloud clump into one mass would justify revisiting the convergence threshold, not raising the cap (which would also slow small vaults).
**Owner**: not recorded.

## 2026-08-18 (84) — Split the 3D layout in two: "Ownership" (dome) and "Composition" (cloud); the dome stays the default

**Why**: Owner asked whether Atlas could do an organic 3D force-graph look like "neuron flow," configurable in structure.
**Prior**: none cited as overturned.
**Decision**: Split the aesthetic into components, keeping only organic 3D layout and rejecting bloom/glow and always-on particles as charter violations; added a second 3D layout, "cloud" (all relations decide position, revealing clustering hidden by containment), alongside the default "dome" (containment-driven); the picker moved from settings to an on-map "3D" chip menu, and labels changed from abstract nouns to what's visually seen first ("dome"/"cloud"). Perceived crowding is solved by rendering (deeper fog, smaller nodes), not layout, since sphere-to-2D packing always overlaps at center.
**Dissent**: Opening a second layout invites demand for a third and fourth, and a force-based cloud invites "make it glow," directly threatening this repo's color/effect constraints.
**Falsifier**: A third layout request arriving without a distinct answered question, or a glow/particle request for the cloud.
**Owner**: not recorded.

## 2026-08-18 (82) — Orbital inertia lands on a «meaningful position» (and the idle gate that was freezing motion)

**Why**: Same owner directive as (81), following the motion investigation's second-priority remedy.
**Prior**: none cited as overturned; builds on (81) from the same day.
**Decision**: Releasing an orbit flick first projects a natural landing point from release velocity, then retargets deceleration toward a nearby domain meridian only within a narrow 0.14rad window so it never overrides a far-off user-set angle; direct manipulation always wins on new input. Also fixed two motions missing from the idle-detection gate (a residual-gap-closing phase and the entry sweep's final 380ms), previously cut because the gate only watched velocity/drag/pose-tween/ramp.
**Dissent**: Snapping changes an angle the user deliberately set, and even a narrow window can read as "it moved slightly," undermining trust in direct manipulation.
**Falsifier**: Reports of "it moves slightly after I stop it," or repeated redragging to land on a specific angle, would justify disabling it, which costs one constant (`ORBIT_SNAP_WINDOW_RAD` = 0).
**Owner**: not recorded.

## 2026-08-18 (81) — Switch programmatic camera movement to the van Wijk optimal path (the true identity of "what looked like lerp")

**Why**: Owner demanded top-tier 3D-grade motion quality; investigation ranked this fix first, and the repo's own `model/camera-easing.ts` docblock had already promised van Wijk's method without implementing it.
**Prior**: none
**Decision**: Replaced per-axis lerp of x/y/scale with van Wijk & Nuij's analytic zoom/pan path (InfoVis 2003), rho=1.42 (matches d3 interpolateZoom's sqrt(2)); zoom now interpolates in log space and long moves pull back before zooming in. `easeInOutCubic` time warp and `cameraTransitionDurationMs` stay unchanged.
**Dissent**: This also changes every 2D programmatic camera move (focus dive, cluster dive, fit view), and the 2D map's feel was hand-tuned over 45 rounds assuming the old per-axis trajectory.
**Falsifier**: An observation in 2D that the old camera path felt better, or that the camera visibly pulls back even on short moves; reverting is one line (skip the van Wijk path when viewport width isn't exceeded).
**Owner**: not recorded

## 2026-08-18 (80) — 3D manipulation and motion, round 3: pan outside the dome, rotate inside the dome, follow-through motion on programmatic moves too, entry sweep

**Why**: Owner reported three bugs in one pass: no way to pan the 3D canvas when dragging empty space, motion/effects still needed to be much better, and the 3D toggle behaving oddly.
**Prior**: none
**Decision**: Empty-space drag now pans outside the dome and orbits inside it, judged once per pointerdown via an ellipse inscribed in the node bbox (`isInsideDomeGrip`). Follow-through lag now also applies to programmatic camera moves (`chargeTierLag`); an entry sweep tilts pitch from top-down on its own clock, skipped under reduced-motion. The reported 3D-toggle bug did not reproduce.
**Dissent**: Binding the hit region to the drawn node bbox means that once the dome is zoomed larger than the screen, the whole screen becomes "inside" and panning becomes impossible again.
**Falsifier**: A renewed report of being unable to move the map while zoomed in; the fix would be an auxiliary path (wheel+shift, two-finger, right-drag), not shrinking the region.
**Owner**: not recorded

## 2026-08-18 (79) — Revert the app accent to indigo, not via a default constant but by swapping two palettes

**Why**: Owner instructed setting indigo back as the default accent color.
**Prior**: Overturns 2026-08-18 (76)/(78)'s decision that made ember the default (ledger contract 4: reversals are recorded, not silently absorbed).
**Decision**: Default accent reverts to indigo (`#5e6ad2`); ember (`#c14a24`) becomes the settings alternate. The two palettes' stored values were swapped (98 declarations) rather than flipping a constant, since `--color-indigo-*` would otherwise lie about its value. 24 tokens the morning change missed were found; 10 fixed via `var()`, 13 remain unlinked.
**Dissent**: The morning decision's evidence, that 9 of 16 surveyed dev-tool CTAs cluster at 146-262° hue and the old indigo is byte-identical to Linear's brand hex, still stands and reversing within a day discards that measurement.
**Falsifier**: After the first public release, someone confusing screenshots with Linear or saying it looks familiar would validate the morning decision; reverting is cheap since ember stays selectable.
**Owner**: not recorded

## 2026-08-18 (78) — 3D dome, round 3: convex hull, meridian relation lines, depth halo, latitude rings, enhanced perspective

**Why**: Owner asked to push 3D toward near motion-graphics quality ("amazing quality"), keeping the shape-viewing character set by (76)/(77) but raising presentation quality only.
**Prior**: Builds on 2026-08-18 (76)/(77); (76) rejection 3 (no graph-render library dependency) still holds.
**Decision**: Added four dome render layers with no new renderer or library: a convex shell with meridian relation-line control points (fixing chord lines that made the silhouette a cone), an occluding depth halo, depth-sorted edges, latitude rings with per-segment depth ink, a perspective boost (`DOME_FOCAL` 1050 to 760), and node shading that darkens only the shadowed side.
**Dissent**: (76)'s opt-in rationale was a readability cost of 2642 crossings, but curved-line crossings are harder to trace than straight-line ones, so raising visual quality may have raised reading cost too.
**Falsifier**: Path-tracing from a node to a neighbor measured slower or more error-prone in 3D than in the prior straight-line version, using the same vault and pair.
**Owner**: not recorded

## 2026-08-18 (77) — 3D dome camera, round 2: disarming the attention-grabbing rotation, full-range pitch, selection reframe, panel-aware framing

**Why**: Owner reported five issues right after the first 3D ship: autorotation kept spinning during work, background-drag did nothing while a node was selected, pitch could not look up from below, node clicks lacked proper camera motion, and closing the panel with X also deselected the node.
**Prior**: Amends 2026-08-18 (76)'s operation section on autorotation and pitch lock; the rest of that record stands.
**Decision**: Autorotation becomes an armed "attract" loop (`spinArmed`) that disarms on interaction and never self-rearms in-session. Pitch now opens to `±(π/2-0.12)rad = ±83.1°` with rubber-band resistance. Selection does a yaw reframe plus camera tween on one shared clock (`DOME_POSE_MS` 750ms), and in 3D only, panel X now collapses without deselecting.
**Dissent**: none
**Falsifier**: Users wanting autorotation back without "auto align" would need a dedicated toggle; defects near ±83° would widen the pole margin; a "X deselects too" report in 2D would prompt a global change; the 750ms reframe reported as disorienting would shift to shortest-rotation yaw.
**Owner**: not recorded

## 2026-08-18 (76) — Map 3D view: a dome of kind rings, a toolbar "3D" chip, opt-in

**Why**: Owner escalated three times in one day: asking for the real map in 3D, then reacting to the first pass by pointing at the gateway hero's rotating dome as reference, then demanding real cinematic orbit/zoom, then asking why it still lacked the hero's feel.
**Prior**: The morning's "depth view (z-lift), no rotation" record's own falsifier, that the owner would judge the static layer wrong, was observed hours later; that record is superseded.
**Decision**: Ships exactly two map views, 2D (default) and 3D (opt-in), toggled by a "3D" toolbar chip (`atlas.appearance.view3d`, default off). The dome (`model/dome-view.ts`) places project at the apex, domain/capability/element as concentric rings, weak perspective (f=1050), no 3D library or second renderer. Node drag stays within its own kind plane; autorotation runs 48s per revolution.
**Dissent**: none recorded in this entry itself; five alternatives were rejected (settings-sheet toggle, keeping z-lift, a 3D library, a "tilted 2D map", free z node dragging).
**Falsifier**: Users doing real reading/editing work (not shape-admiring) in 3D would require redesigning fog and on-demand labels; click misalignment during rotation breaks the single-frame-source contract; 2D changing without the toggle means the omitted-state gate failed.
**Owner**: not recorded

## 2026-08-18 (75) — The placement of the inline boot script is **a contract, not a preference** (we got it wrong three times)

**Why**: (74)'s fix moved the accent boot script to `<html>`'s direct child, saving five routes, but one locale-less 404 route still failed with React's error that script tags never execute when client-rendered.
**Prior**: Continues from 2026-08-18 (74).
**Decision**: Adopted `<script async>`; React 19 hoists it to `<head>`, and `async` on an inline script is spec-invalid so it still runs synchronously, with zero flash and zero warnings. Rejected: `<html>` direct child (React errors), `<body>` first child (unexecuted on client-rendered routes), explicit `<head>` (404 returned 500), `next/script beforeInteractive` (attribute missing in dev).
**Dissent**: The dev-only client-rendered 404 route still cannot execute any script placement, but since production static export bakes that page at build time, this route does not exist for real users, only in the dev server.
**Falsifier**: A hydration error or dev warning that goes unnoticed by any gate in the future would make excluding the dev overlay from the audit costly; a direct console-error-zero check would then be needed instead of the overlay as a proxy.
**Owner**: not recorded

## 2026-08-18 (74) — Five that CI caught, and **the path by which the boot script's placement turned five gates red**

**Why**: PR #1157's first CI run failed four checks that were all green locally (`tsc`, lint, 7,428 unit/contract tests, both gate e2e), because CI ran checks not run locally.
**Prior**: none
**Decision**: `hover-contrast` failed five routes because the accent boot script (from (69)) sat as `<html>`'s direct child, causing a React hydration error whose dev-overlay badge tripped the gate; moving it to `<body>`'s first child cut console errors to 0. Four smaller fixes: a touch-target gap, a duplicate filled CTA demoted to outline, surfaces cut 14 to 12, a stale scroll-lock test repaired.
**Dissent**: Removing the dev overlay from the audit could also hide real hydration errors the audit was catching, since this very defect was found via that badge.
**Falsifier**: A future hydration error or dev warning that no gate catches would make this exclusion costly, at which point a direct zero-console-errors check replaces the overlay as a proxy.
**Owner**: not recorded

## 2026-08-18 (73) — The hero CTA opens all four destinations, and the visitor's platform decides the winner

**Why**: Owner pointed out three problems directly: no Windows download button, no "web playground" button, and unclear whether "watch demo first" was even a button.
**Prior**: none
**Decision**: Restructured the hero CTA into two rows: row one is a filled primary CTA (platform-detected download, Windows via UA else macOS default) plus outline "watch demo first"; row two (smaller, outline) lists other desktop builds plus "open in browser" (`/topology`). Windows wins carry an inseparable "unsigned" label; warnings/checksum/size stay in the install section (`PlatformStatus`).
**Dissent**: Growing hero controls from two to six risks making the first screen a "choice buffet" again, the exact defect (70)'s remake fixed.
**Falsifier**: A first-five-minute walkthrough showing visitors hesitating at row two instead of the filled CTA would call for demoting row two to a collapsed/link row; a real report of missing the unsigned warning would mean the trust-line placement is wrong.
**Owner**: Owner (via agent proxy, literal execution of 3 flagged issues)

## 2026-08-18 (72) — The agent section sells **an in-app conversation**, not verification: the `mcp-verify` terminal replaced by a real-measured ACP chat reenactment

**Why**: Owner directly flagged confusion over 6 points, wanting the agent section to emphasize that ACP is built into the app so chatting alone can drive ontology analysis.
**Prior**: Continues the public-disclosure boundary set by ledger 2026-08-16 (5).
**Decision**: Replaced the `mcp-verify` terminal reenactment with an in-app ACP chat reenactment (`AcpChatScene`) using the real exchange from ledger 2026-08-16 (7) verbatim (`add_relation` call untranslated, its `why` translated). Cards show agents already in use, folder access asked first, and output stays plain markdown. Copy may not name "Claude Code" or imply the app provides model access.
**Dissent**: The `mcp-verify` terminal scene was the evidence that this product verifies real round trips rather than just a config file, and removing it loses that argument.
**Falsifier**: Visitors without ACP (web-only, terminal MCP users) reading this section as "the app is required for agents" would call for restoring an MCP-path line in the section.
**Owner**: Owner (via agent proxy, literal execution of 6 flagged issues)

## 2026-08-18 (71) — The monument's size is set by the container: `--text-monument` 5vw to 5.8cqw, plus a hero full-width column

**Why**: Owner flagged the headline wrapping to four lines and called it still insufficient.
**Prior**: none
**Decision**: The monument headline now spans the full column as its measure, splitting from the hero object only in the band below; `--text-monument` moved from `clamp(40px, 5vw, 96px)` to `clamp(40px, 5.8cqw, 96px)`. Measured: both Korean sentences fit one line at ≥1024px, English fits one line at ≥1100px; below that the 40px floor still wraps.
**Dissent**: The approved mockup `b-hero.html` split headline-left/object-right, but applying that split to the headline itself leaves too narrow a column for the Korean line budget at 1728px.
**Falsifier**: A renderer glyph-width variance beyond 2.7% causing the English second sentence to wrap at split widths ≥1100px, or Korean wrapping to two lines at any split width, would fail this decision.
**Owner**: Owner (via agent proxy, gateway craft pass)

## 2026-08-18 (70) — Gateway landing remake, "A Living Screen": the map leaves the first screen, and type becomes the monument

**Why**: Owner directly approved a mockup round (`b.html` skeleton plus `b-hero.html` hero object) for a new gateway/download face.
**Prior**: none
**Decision**: Rebuilt `/` and `/download` as a five-section landing: hero (headline, hero object, filled CTA), demo, evidence, agents (`mcp-verify` reenactment), static install section. Motion is informational-only; facts never move. Registered `--text-monument` and `--gateway-section-gap` (160px); grew `--gateway-plate-width` to 880; added one scoped `--gateway-fx-*` motion exception.
**Dissent**: The map was the first screen's proof; removing it from the first screen weakens the gateway's "show the real thing first" argument.
**Falsifier**: Visitors reading the hero object as unconnected to the product, or first-screen bounce worsening, would reopen the hero skeleton. Overturned by 2026-08-19 (83): the install/download section was deleted per owner judgment; sections 1-4 and motion rules remain valid.
**Owner**: Owner

## 2026-08-18 (69) — Change the accent from indigo to **ember (`#c14a24`)**, the empty half of the color wheel

**Why**: Owner delegated color choice ("you decide, just make it higher quality, look at other well-known open source/download pages"), triggering a base-palette swap in `app/globals.css`.
**Prior**: none
**Decision**: New accent = ember `#c14a24` (LCh hue 44.9°), chosen since 9 of 16 surveyed dev-tool CTA hues cluster at 146-262° and old indigo `#5e6ad2` was byte-identical to Linear's brand hex. The ramp was hue-rotated 44.9° preserving lightness/chroma, so contrast hierarchy is unchanged; token names (`--color-indigo-*`) were not yet renamed.
**Dissent**: Site-to-repository referrer traffic over 14 days was 0 visitors out of 31 unique visits and 67 repo views, so a rebrand for visibility does not address the real traffic constraint.
**Falsifier**: If, within 4 weeks of publishing the new landing, `traffic/popular/referrers` shows fewer than 5 net visitors from the linked source, the color change failed to move traffic and the dissent was right.
**Owner**: not recorded

## 2026-08-18 (68) — The focus indicator **must be visible**: a dedicated token with no alpha

**Why**: Owner instructed fixing the focus outline and merging to main; the 2026-08-05 "focus base sets the floor" policy remained valid but had never measured visibility, only presence.
**Prior**: Does not overturn 2026-08-05 "focus base sets the floor" (`:where(...)` base rule, `outline-offset: -2px`, zero specificity); that policy stays valid.
**Decision**: Focus rings measured only 1.75:1 since `--color-indigo-a46` (alpha 0.46) needs compositing to reveal true contrast; introduced opaque `--color-focus-ring: rgb(94, 106, 210)` for the 55 focus-ring sites, kept `--color-indigo-a46` at its other 50 sites, and deleted the unused `--color-indigo-ring-a46`. Result: 107 measured, worst 3.71:1, meeting WCAG 1.4.11's 3:1 floor.
**Dissent**: Removing the alpha makes the focus ring pop too strongly in dense rows; 0.46 was restraint, not a mistake.
**Falsifier**: The owner or a user observing that the focus border is visually distracting would validate the dissent; the fix would be thickness (2px) or `outline-offset` first, not reverting the alpha.
**Owner**: stark

## 2026-08-17 (67) — Delete the old Apple secret only after the new API release succeeds

**Why**: Old `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` secrets remained unreferenced by workflows, but the existing `desktop:release-github` preflight forced their deletion merely for existing, before the new API-key release path had proven itself.
**Prior**: Overturns Decision 65's deletion timing only, from after the workflow reaches main to after that workflow's actual release succeeds; the 3+4 final secret scope from Decision 65 is kept.
**Decision**: `desktop:release-github -- --allow-obsolete-repository-secrets` may be used once, for one transition release, downgrading the three obsolete names' presence to a warning; repository-scope API key copies still fail. The obsolete values are deleted only after a real signed, notarized, published, verified release succeeds, then preflight/status are re-run without the option.
**Dissent**: Keeping the obsolete secrets longer extends repository-level blast radius for one release cycle, but that risk is smaller than the irrecoverable loss from deleting untested credentials first.
**Falsifier**: If any step of the transition release references the three obsolete names, or the option-free preflight afterward misses their persistence, the transition option is removed and the gate redesigned.
**Owner**: Codex, Jinan

## 2026-08-17 (66) — `find_evidence` reports whether every row is a node, and graph identity is required only for nodes

**Why**: A fresh-init vault's `find_evidence({title:"project"})` correctly returned the plain document `AGENTS.md` as `isNode:false` without fabricating `uid`/`kind`, but the public output schema and verifier required both graph-identity fields on every row, failing `mcp-verify` and CLI integration.
**Prior**: none
**Decision**: Kept search scope, scoring, sort, and default `nodesOnly:false` unchanged. Every match row must carry `slug`, `isNode`, `title`, `mtime`, `matchedIn`, `score`, `excerpt`; `isNode:true` rows additionally require valid `uid` and `kind`, `isNode:false` rows omit both, and the verifier applies this discriminator only to `find_evidence`.
**Dissent**: Some MCP clients may flatten conditional JSON Schema and treat `uid`/`kind` as optional on every row, weakening node-handoff typing versus before.
**Falsifier**: A real Claude Code, Codex, or bundled MCP client failing to preserve `isNode:true` as requiring node identity, or rejecting mixed results, would reopen this contract; until then default search stays not nodes-only.
**Owner**: Codex, Jinan

## 2026-08-17 (65) — Three notarization APIs move to `release-signing`; four unrecoverable existing identities stay at repository scope

**Why**: GitHub secrets cannot be read back, renamed, or copied across scopes once stored, and the existing Developer ID certificate pair and Tauri updater keys had no local originals to recreate, so recreating the updater key would break existing installs' auto-update trust.
**Prior**: Overturns Decision 63 and Decision 64's environment-only secret placement only; protected-main admission, API-key notarization, child-env allowlist, and separate publication approval remain valid.
**Decision**: `APPLE_API_KEY_P8_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID` live only in the `release-signing` environment; `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` keep their repository-scope values as canonical, with obsolete Apple ID secrets deleted once the new workflow reaches `main`.
**Dissent**: Decision 63's environment-only placement has smaller blast radius, but deleting irreplaceable values to achieve that would lose update-signing identity, a larger real loss; the four can move to environment-only later if originals are ever recovered.
**Falsifier**: If any non-release workflow references the four repository identities, or the four are exposed before `release-signing` protection applies, this decision is reopened.
**Owner**: Codex, Jinan

## 2026-08-17 (64) — Hosted notarization uses only an API key file, and release subprocesses follow a per-stage secret allowlist

**Why**: `scripts/notarize-macos-dmg.mjs` passed `APPLE_APP_SPECIFIC_PASSWORD` directly after `notarytool submit --password`, leaving it visible in process arguments even though logs were redacted, and `desktop:release-artifact`'s single `&&`-chained script inherited all release secrets into every child process.
**Prior**: none
**Decision**: Hosted notarization now uses only an App Store Connect API key, replacing `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` with `APPLE_API_KEY_P8_BASE64`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER_ID`; the `.p8` body goes to a `0700` temp dir, `0600` file, deleted after use. Eleven release sub-steps now use an explicit secret allowlist.
**Dissent**: The existing Apple ID app-password values were already in place, and switching to API keys requires one operational migration, but secret count stays at 7 and the old path exposed passwords in the OS process table, not just logs.
**Falsifier**: `notarytool` failing to notarize with the API key for the current team, or the private-key temp file surviving a failure, would reopen this for a pre-configured keychain-profile approach instead.
**Owner**: Codex, Jinan

## 2026-08-17 (63) — Protected desktop releases dispatch from `main`, and the signing environment opens automatically only for `main`

**Why**: The tag-push release workflow trusted whatever the tag ref pointed to for secret-bearing jobs, removing the boundary between source admission and signing.
**Prior**: none
**Decision**: `.github/workflows/release-macos.yml` requires `workflow_dispatch` with a `tag` input, checking in an admission job that the tag matches `main`'s head SHA before any secret job runs. Run via `pnpm desktop:release-run -- --tag=<tag> --ref=main`; `release-signing` holds exactly 7 secrets, restricted to `main`, no admin bypass; publish approval stays in the separate `release` environment.
**Dissent**: Keeping tag-push as the trigger is shorter since operators avoid a separate dispatch, but connecting a tag ref directly to a secret-bearing job makes it hard to prove source admission and the protected-`main` policy in one step.
**Falsifier**: A `main`-dispatched run building a different SHA after admission, or a draft publishing without separate `release` approval, would reopen this decision.
**Owner**: Codex, Jinan

## 2026-08-17 (62) — Skipped download verification is a release readiness blocker

**Why**: `check-macos-release-status` with `OATLAS_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY=1` skipped verifying DMG/checksum downloads and marked them "skipped" without counting toward `blocked`, so readiness reported `ready:true` with exit 0 despite verifying zero bytes of the public download assets.
**Prior**: none
**Decision**: The skip environment variable stays for network-free focused tests, but using it now marks `download_assets` as `blocked` rather than `skipped`; human, JSON, and Markdown output all report that blocker and the real `desktop:verify-download` command, and the row only becomes `ok` when the child verifier actually succeeds.
**Dissent**: Reproducing the status script's success path end-to-end without network becomes harder, but the real download verifier already covers success/failure assets separately via local HTTP fixtures, so separating evidence ownership is more accurate than keeping a false-ready fixture.
**Falsifier**: The real verifier succeeding while the status script still leaves a blocker, or a repeated regression in the combined-ready path, would replace the env bypass with explicit verifier-result injection at the function boundary instead.
**Owner**: Codex, Jinan

## 2026-08-17 (61) — Release API values are serialized only from their generating source's data

**Why**: A read-only attack audit found that `generate-download-release-facts` accepted an arbitrary string as macOS asset version and interpolated asset name, URL, tag, publish time, and checksum directly into single-quoted TypeScript; a crafted fake GitHub Release DMG name with quotes and an executable expression escaped the generator's syntax boundary in a fixture.
**Prior**: none
**Decision**: macOS asset version must exactly equal the requested `v` tag with the prefix stripped. All GitHub API and checksum strings are emitted only via `JSON.stringify` as JavaScript string literals, and asset size is validated as a non-negative safe integer before being emitted as a numeric literal. Existing Windows exact-version and checksum filename checks are unchanged.
**Dissent**: GitHub Release API and owner-uploaded assets are usually trustworthy so serialization looks redundant, but the file is a source a later web build imports, so the data boundary is not promoted to code trust.
**Falsifier**: If an official asset/URL/publish-time with a normal matching tag is rejected by the new validation, widen the fixture and acceptance contract rather than reverting to direct string interpolation. Revisit if official release generation fails to reproduce or the output format changes from TypeScript.
**Owner**: Jinan

## 2026-08-17 (60) — Ordinary vault mutations also run inside a stable root/parent FD

**Why**: Following (59), a fixture reproduced that renaming `.ontology-atlas` and placing an external symlink in its place let `write_vault_text_file`'s temp-file and rename logic, which reopened a canonicalized path string, overwrite outside `project-sources.json` with vault content; `ensure_vault_directory` similarly created `new-dir` outside before its post-check caught it.
**Prior**: follows up on (59)
**Decision**: Unix file writes and directory creation open the canonical root piece by piece via `openat(O_DIRECTORY|O_NOFOLLOW)`, hold stable parent FDs, create an exclusive new inode checked for link count before writing and before commit, then `renameat` within that FD; directories use `mkdirat` on the held parent FD. Files use 0666, directories 0777 via umask, kept separate from agent config's 0600/0700 policy.
**Dissent**: the native FD primitive currently lives alongside `agent_setup.rs`, an awkward ownership fit accepted until a third native writer justifies moving it to a separate `secure_fs` module.
**Falsifier**: If atomic replace breaks reliance on permissions/xattrs/ACLs, or a user cannot find a file after its open parent was renamed away, add safe metadata copy and inode/path currentness checks. Revisit on Windows security verification, the above observation, or a third native writer needing this primitive.
**Owner**: Jinan

## 2026-08-17 (59) — Agent configuration is swapped inside a stable parent only after the new inode is complete

**Why**: Following (37), a Sol xhigh read-only attack review found that hardlinking the allowed `.mcp.json` to an outside file let `write_agent_config` truncate the shared inode via open-with-truncate, and that `O_NOFOLLOW` on only the final path segment was insufficient against replacing the `.codex` parent with an external symlink after the check.
**Prior**: follows up on (37)
**Decision**: Unix config writes no longer reopen the canonicalized path string; they hold a stable FD to the config root and allowed parent via `openat(O_DIRECTORY|O_NOFOLLOW)`, create a temp inode with `O_CREAT|O_EXCL|O_NOFOLLOW` mode 0600, `sync_all`, then `renameat` to the final name. Link count is checked as 1 before writing and before commit; an existing hardlinked target is never truncated.
**Dissent**: atomic replace narrows the config file to 0600 instead of preserving its existing inode and permissions, accepted because config is a fully-approved replacement artifact and blocking outside tampering fits local-first better than preserving shared inodes.
**Falsifier**: If a real user depends on config inode/xattr/ACL preservation and an agent connection breaks, design a policy to copy only allowed metadata into the new file instead. Windows reparse-point races remain unproven without native handle-based writes; revisit on Windows security verification or observed inode/ACL dependency failure.
**Owner**: Jinan

## 2026-08-17 (58) — Skip an MCP duplicate only when it's a valid configuration for the current vault

**Why**: Falsifying the MCP session validity boundary after the main-3 merge found that `readOmotCodexCommand`'s parsed command match alone made the app skip injecting its own server even when `codexConfigValid` was false, so a current, matching-command config with the wrong environment could point at the wrong vault.
**Prior**: fixes a regression from commit `c62150326` on `main-3`
**Decision**: the app skips injecting its own MCP server only when both full validation of the config for the current vault and a match on the executed command are confirmed together; a command match alone with an invalid current-vault config still triggers app injection.
**Dissent**: requiring validity too risks the same server starting twice over minor formatting differences the parser rejects, accepted because reading the wrong vault or lacking tools is worse than duplication.
**Falsifier**: If a valid Codex config repeatedly evaluates false and duplicate MCP processes reappear, extend the TOML validity parser rather than reverting to command-only skipping. Revisit on that observation or when another runtime's self-read config is measured.
**Owner**: Jinan

## 2026-08-17 (57) — Judge ACP tree-termination completion by process group, not the leader PID

**Why**: Falsifying the native process-lifetime boundary found that `terminate_tree` checked only the leader PID via `kill(pid, 0)` after SIGTERM, so if the app's wait thread reaped the leader first, a TERM-ignoring grandchild left in the same process group still reported immediate success.
**Prior**: none
**Decision**: Unix ACP termination sends SIGTERM to the whole group, then confirms completion via `kill(-pgid, 0)` against the original PGID rather than the leader PID; only `ESRCH` counts as group extinction, `EPERM` during the grace period is re-checked as alive, and after 1 second a surviving group escalates to SIGKILL without hiding a failed final signal as success.
**Dissent**: waiting up to an extra second on the group may be excessive since children usually exit with the leader, accepted because a lingering process holding files/CPU/memory afterward costs more.
**Falsifier**: If normally terminated sessions repeatedly hit the 1-second cap due to zombies or OS overload, add a platform-specific combined wait rather than faking success. Revisit on that observation or when supporting a launcher whose descendants detach via `setsid`.
**Owner**: Jinan

## 2026-08-17 (56) — The vault behind an ACP permission decision is not chosen by the screen

**Why**: Falsifying caller trust in the native ACP permission boundary found that `acp_permission_verdict` compared the WebView-supplied `vaultRoot` string directly with `starts_with`, so an empty string or `/` made any path, including outside the vault, satisfy `allow-inside-vault`; a further TOCTOU case let a post-start symlink swap of the vault folder get auto-allowed too.
**Prior**: none
**Decision**: the vault root that `acp_start` checked and normalized is bound to the native session; permission verdicts look it up by session ID, not a root string sent by the screen, and close to `ask` when there is no session or the root/requested path is not a valid absolute path. A stored root later replaced by an external symlink is not promoted to the same vault.
**Dissent**: current callers are only app-authored WebView code so the root is likely correct, rejected because IPC is a trust boundary and the verdict function directly grants permission.
**Falsifier**: If a user flow needs one live ACP session to move its permission boundary across multiple vaults, design an explicit rebinding contract requiring session end or native-verified rebinding rather than accepting arbitrary strings again. Revisit when ACP sessions need multi-vault support.
**Owner**: Jinan

## 2026-08-17 (55) — JSON-LD data does not own the script boundary

**Why**: Falsifying the trust boundary of repository content in static HTML found that project details put `JSON.stringify` output directly into `dangerouslySetInnerHTML`, so a value containing `</script><script>...` could close the tag and make the next tag an executable sibling in the static download route.
**Prior**: none
**Decision**: app routes no longer put JSON-LD directly into `<script>`; a single shared `JsonLd` owns serialization and, without changing JSON meaning, escapes `<`, `>`, `&`, U+2028, and U+2029 as JSON unicode escapes.
**Dissent**: the currently bundled sample is trusted repository content, not immediately exploitable user input, rejected because external vault absorption, contribution diffs, and generated docs are the same build input.
**Falsifier**: If a new route bypasses the contract check's string scan via a dynamic `type` or other raw HTML syntax, upgrade the scan to an ESLint AST rule restricting every `dangerouslySetInnerHTML` owner to `JsonLd`. Revisit on that bypass or a change in JSON-LD rendering.
**Owner**: Jinan

## 2026-08-17 (54) — An unverified state isn't a state until it reaches the screen

**Why**: Observing (53)'s recorded dissent within the same change found `readSessionChoices` took only the `offered` array and dropped `unverified`, so the safety verdict's data existed but session state and screen were unchanged.
**Prior**: builds on (53)
**Decision**: the `unverified` state from (53)'s safety verdict is surfaced through the session contract and the existing `Select` workflow picker; an unreviewed mode gets an "unverified" label and a description noting it has not been checked for prompting before out-of-folder actions, with no new screen, token, or component.
**Dissent**: display was proven only against the test adapter's fake responses; a real adapter producing an unverified mode has not yet been observed.
**Falsifier**: If a real unverified mode's label or description gets truncated, or a user mistakes "unverified" for a safety judgment, adjust wording and order within the same `Select` after measuring the installed app. Revisit when a real adapter produces a new mode.
**Owner**: Jinan

## 2026-08-17 (53) — The safety mechanism treated what it didn't know as if it were safe

**Why**: Applying (51)'s lesson, running 5 of 73 never-run checks found `acp:registry:check` red: the mode filter `modes.filter((m) => !GATE_REMOVING_MODES.has(m.id))` was a denylist by name, so a new adapter mode (surfaced by bumping `claude-agent-acp` to 0.69.0 and `codex-acp` to 1.4.0) could reach users unreviewed and silently break the screen's promise.
**Prior**: applies the (51) lesson
**Decision**: modes are split three ways: reviewed-and-dangerous modes are hidden, reviewed-and-fine modes are shown, and unreviewed modes are shown but labeled as unknown, matching the discipline the permission card already uses; the adapter snapshots are then bumped to the versions above.
**Dissent**: "unknown" currently lives only in data, since the screen does not yet say it, so today's benefit is limited to preventing a new risky mode from silently appearing safe.
**Falsifier**: If an adapter actually ships a new mode, surface that label to the screen next to the mode name. Revisit at the next adapter update.
**Owner**: Jinan

## 2026-08-17 (52) — The audit log does not follow links outside the vault

**Why**: Falsifying the local file trust boundary for the audit log found reserve/finalize logic followed symlinks for the sidecar and log file, letting outside content be appended or truncated after the log path was swapped for an external link; Sol xhigh's review found overlapping reservations could also corrupt JSONL, and a FIFO at the log path could hang or leak data.
**Prior**: none
**Decision**: `.ontology-atlas/llm-audit.jsonl` no longer follows symlinks or accepts hardlinked log files; if it cannot open safely, it blocks the send itself. On macOS/Unix a held vault directory FD opens the sidecar and log via `mkdirat`/`openat(O_NOFOLLOW)`, checks link count is 1, and holds that handle plus `flock(LOCK_EX|LOCK_NB)` from reservation through finalize, re-verifying length just before finalize. New folders/files are `0700`/`0600`.
**Dissent**: `openat`/`O_NOFOLLOW` is a platform-specific contract current only on macOS; the public Windows beta lacks equivalent reparse-point handle verification, so non-Unix native LLM chat fails closed at audit reservation until that proof exists (map/vault/MCP surfaces are unaffected).
**Falsifier**: If post-symlink-swap external byte changes reproduce on macOS, or an equivalent Windows handle implementation with replace-attack RED-to-GREEN evidence exists, revisit dirfd retention scope or lift the Windows restriction respectively. Revisit when the above is observed.
**Owner**: Jinan

## 2026-08-17 (51) — A gate that lights up only for the right behavior is a gate that's effectively off

**Why**: The first run of the broadest dogfood gate `pnpm dogfood:verify` found two red checks: a valid `rename_concept` propagation was rejected because its contract required `relation_notes`' `before`/`after` to be a string or string array when it is actually a map, and the MCP validator still required `^ontology-atlas\s` though (47) reversed that on the CLI side.
**Prior**: cites (36) and (47) as earlier instances of the same kind of unmirrored fix
**Decision**: `backlink-key-shape.mjs` widens, without loosening, the accepted `relation_notes` shape to string, string array, or a flat string-keyed map, still rejecting nested shapes, as the single owner of that judgment; the MCP validator's stale alternative-command check is also fixed to match (47).
**Dissent**: this gate had simply never been run before; for 17 rounds only unit/contract checks ran while these two stayed red.
**Falsifier**: If rounds keep accumulating without re-running the broad gate, add it to the per-round checklist (currently about 2 minutes, too slow to run every time). Revisit next round.
**Owner**: Jinan

## 2026-08-17 (50) — Guard the bytes read, not the mtime number

**Why**: Falsifying (16)'s implementation found three gaps: `readDoc` read content before re-stamping mtime, letting different save moments count as one snapshot; backlink plans used the mtime re-measured at plan end, not the read document's mtime; and files like the rename original, overwrite target, or merge survivor had no byte revision before final rename/delete.
**Prior**: upholds (16), closing gaps in its implementation
**Decision**: conflict revision is strengthened from `mtime` alone to source bytes plus mtime; multi-plan operations re-check before start, before each item, and before the atomic rename, and rollback proceeds only if Atlas's own written bytes are still intact. New targets are re-confirmed absent via `expectedAbsent` until the final moment.
**Dissent**: ordinary filesystem rename has no portable "replace only if these bytes" operation, so a tiny non-cooperative race window between the final byte check and `renameSync` is not mathematically eliminated, and large multi-plans re-read each file once more.
**Falsifier**: If edit loss right after the final check reproduces, or revision re-checking dominates wait time at 5,000-node scale, review platform-specific conditional replace/locking/journaling for the former, or switch to digest/descriptor-based revision for the latter. Revisit when the above is observed.
**Owner**: Jinan

## 2026-08-17 (49) — The export said "everything went out" and left the reason behind

**Why**: A user-visible change to the `export` status line found that while `export --format jsonld`'s node/edge counts were fully accurate, the line said nothing about 72 nodes' implementation `path` and 9 edges' `rationale` being dropped, even though this repo states an edge without rationale is a mindmap line, not an ontology claim.
**Prior**: none
**Decision**: the export status line now also states what it did not include, deriving the list of dropped fields dynamically by comparing the just-produced payload against the vault rather than hardcoding it, so new schema fields are reported automatically; payload content itself is untouched and `--format json`, a raw passthrough, states nothing.
**Dissent**: that rationale lives on edges was only learned by this measurement, and a hardcoded flag would need manual removal once a format carries it or it would falsely claim exclusion.
**Falsifier**: If a format begins carrying rationale, derive that flag from the payload too, as node fields already are. Revisit when that is observed.
**Owner**: Jinan

## 2026-08-17 (48) — The brief contradicted itself

**Why**: An outside-facing contract change adding a self-consistency check to `agent_brief` found one response's `readiness.healthChecks: 7` header disagreed with the same payload's `health.checks` array actually holding 8 entries, because `attachVaultValidation` manually incremented `healthChecks` by 1 while `attachProjectMeaning` did not.
**Prior**: none
**Decision**: the brief's `healthChecks` count is derived once at the end by actually counting the payload rather than incrementing manually, and the gate checks only that the two values match rather than pinning an exact number.
**Dissent**: the check only covers the `readiness.healthChecks`/`health.checks` pair; other counts in the brief such as nodes, relations, or maturity score could still mismatch undetected.
**Falsifier**: If the same kind of mismatch is observed in another field, widen the rule so every number the payload states must be derived from what it actually carries. Revisit when that is observed.
**Owner**: Jinan

## 2026-08-17 (47) — "Use this when there's no MCP" was a command that didn't run

**Why**: A contract change to `cliFallbackCommands` shape in `agent_brief`, `match_nodes`, and `match_edges` found `agent-brief` handed out the bare command `ontology-atlas workspace-brief [vault] --limit 5`, nonexistent since registry publishing stopped on 2026-07-27, producing `command not found` exactly when MCP is unavailable; a 2026-07-29 note shows the same defect was already fixed once for the graph DB pack but not this producer.
**Prior**: overturns the prior contract requirement in `validAgentCliFallbackCommands`
**Decision**: CLI fallback commands must be actually runnable; `validAgentCliFallbackCommands`, which required `^ontology-atlas\s` and rejected runnable absolute-path forms, is reversed so bare command names are rejected instead. 13 call sites were fixed (11 single-quoted, 2 template strings), after a grep pass on single quotes alone missed half, the same mistake as in (32).
**Dissent**: in non-file contexts such as a browser bundle or test harness, no absolute path can be constructed, so it falls back to `node cli/src/index.mjs`, which will not run if pasted outside the repository.
**Falsifier**: If that relative-path form is observed reaching a user's hands, have the caller pass the entry point through instead, as the CLI already does. Revisit when that is observed.
**Owner**: Jinan

## 2026-08-17 (46) — The gate I built couldn't see the third copy

**Why**: Cleanup left from (28) plus discovering a defect in the gate (28) created found `meaning-assessment.mjs` still held a third copy of a word list because that file used double quotes while the scanner's regex `'([a-z_]+)'` matched only single quotes, the same single-quote-only blind spot `design-gates.md` already records for an icon scanner that missed 73% of files.
**Prior**: references (28), the gate this fixes, and the icon-scanner precedent in `design-gates.md`
**Decision**: the third word-list copy is removed and replaced with an import, and the scanner is fixed to name the file; verified both directions with a probe, old scanner plus copy passes reproducing the defect, new scanner plus copy fails red. Also confirmed for the first time in 13 rounds that the repo is shippable: static export build passed, Rust release build passed (51.78s).
**Dissent**: this gate still scrapes source via regex; a list turned into an array variable used as `new Set(NAMES)` would still be missed.
**Falsifier**: If a fourth copy is found, drop source scanning and instead check via import statements whether each consumer imports the canonical source. Revisit when that is observed.
**Owner**: Jinan

## 2026-08-17 (45) — Dying mid-answer and finishing cleanly looked like the same screen

**Why**: A user-visible screen change adding a conversation notification found that when an adapter died mid-turn, the chip said only "ended," identical to a normal finish, so a user could believe a truncated answer was complete; testing also found the final state was actually `error`, not `exited`, because the in-flight call's rejection wins.
**Prior**: none
**Decision**: whether the screen states the fact depends on the state at the moment of death, not the state's name: if a turn was in progress, one notification line is left in the conversation; otherwise nothing is said, since no event should be invented that did not happen.
**Dissent**: the "turn in progress" judgment trusts the app's own state machine; if the adapter dies before announcing it started a turn, that moment is `ready` and no notification fires.
**Falsifier**: If a report of sending a message and getting silence with no response appears, extend the judgment to cover "sent, but no answer yet." Revisit when that is observed.
**Owner**: Jinan

## 2026-08-17 (44) — The card was asserting a scope it never verified

**Why**: A user-visible screen change to the permission card found the third button claimed "allow the entire folder containing the above path" for the rest of the conversation, while the adapter's actual `_meta.permission.changes[].targets[]` value was a tool (`{ type: 'tool', toolName: 'mcp__atlas-vault__...' }`), not a folder.
**Prior**: none
**Decision**: the card states only what the adapter itself declares about what "always allow" grants: a tool name if scope is per-tool, a folder if per-folder, nothing asserted, recommending allow-once, if undeclared, and "unknown" if scopes are mixed; the app no longer computes a folder from a path itself, and the old wording was deleted.
**Dissent**: the card now shows raw tool names such as `mcp__atlas-vault__add_concept`, which read as unfamiliar to a person.
**Falsifier**: If a reaction of not understanding what this means is observed, move the tool line to the existing human-readable `tool.*` wording, while unknown tools keep their raw name. Revisit when that is observed.
**Owner**: Jinan

## 2026-08-17 (43) — A verified ACP subscription runner does not accept arbitrary credentials from its parent

**Why**: A solo PO pass with Sol xhigh security review found `Command::new` for ACP sessions only overrode a rebuilt PATH while inheriting the rest of the parent environment, leaking `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GH_TOKEN`, `NODE_OPTIONS`, `DYLD_*`, `BASH_ENV`, and routing-altering base URLs to children, per Claude and OpenAI docs on subscription auth precedence.
**Prior**: none
**Decision**: only `claude-acp` and `codex-acp`, whose subscription login and permission gates were measured, get an explicit environment after `env_clear()`: home, temp, locale, username, shell, standard proxy/CA, plus `CODEX_HOME`/`CODEX_CA_CERTIFICATE` for Codex. API keys, tokens, provider/routing vars, loader vars, and SSH agent are not passed; PATH is rebuilt by the app; sessions and auth-status verdicts share one environment-building function. The other 36 unverified runners are untouched.
**Dissent**: users who deliberately keep an enterprise gateway, custom provider, or SSH agent in their environment lose that capability in the app's ACP, unlike a terminal.
**Falsifier**: If a real user of a verified runner needs an explicit enterprise/provider path instead of subscription auth and must repeat work in a terminal, design a visible runner-specific opt-in environment profile with an audit trail rather than restoring full inheritance. Revisit after one such case, or when a new runner's subscription auth and enterprise-network measurement completes.
**Owner**: Jinan

## 2026-08-17 (42) — Pin external code CI runs to the full commit SHA

**Why**: A solo PO pass over supply-chain input touching release secrets and artifacts found 47 of 50 external Action calls in workflows and local composite Actions used owner-movable references like `@v6`, `@v2`, `@stable`, and the first gate only read `uses:`, missing 5 `- uses:` lines and 2 lines inside a shared Playwright composite Action.
**Prior**: none
**Decision**: every external Action in `.github/workflows/` and `.github/actions/` is pinned to the full 40-character commit SHA its tag currently points to, with a human-readable version in an adjacent comment; local `./.github/actions/*` references are exempt. The contract test scans both directories and `uses:`/`- uses:` syntax, and fails on an empty check set.
**Dissent**: moving tags let maintainers auto-deliver security fixes, but pinned SHAs stay on a known-vulnerable version if not updated.
**Falsifier**: If a pinned Action gets a disclosed high-severity vulnerability or runtime-deprecation notice and no update lands by the next release, keep SHA pinning but also enforce an update path such as Dependabot. Revisit on an Action security advisory, runtime deprecation warning, or the next release preparation.
**Owner**: Jinan

## 2026-08-17 (41) — It only asked "where", never "what"

**Why**: The permission card, the most expensive single decision point in the product, showed only the target path in mono, with no indication of whether the agent wanted to read, modify, or delete it; a read of `/etc/hosts` and a delete of `/etc/hosts` looked identical.
**Prior**: none
**Decision**: The permission card now also states what the agent intends to do, driven by the `toolKind` value through an intent-word table (`INTENT_BY_KIND`). Unknown intent renders as unknown, never defaulting to "read"; `other` is never collapsed into "read" either. The path display is unchanged, added to rather than reduced.
**Dissent**: `INTENT_BY_KIND` only covers known adapter values; a new adapter using different names falls back to unknown, making the card less helpful.
**Falsifier**: If real conversations often show the reaction "it doesn't say what it's trying to do", check the actual values that adapter sends and widen the table, never by guessing.
**Owner**: Jinan

## 2026-08-17 (40) — The app's curl does not read the user's curlrc

**Why**: The app passed API keys, headers, and body via curl config on stdin, but the invocation started with `--silent`; curl 8.7.1's manual states a separate `--config -` still reads the default curlrc unless `--disable` is the first argument, so a user's curlrc (redirect, proxy, header options) could alter the app's chosen key-transmission boundary.
**Prior**: none
**Decision**: Fix the first argv argument shared by connection checks and conversation round-trips to `--disable`. Keys, URL, and body remain only in stdin config, never argv; the redirect ban and existing timeouts are kept. Rust tests pin the first position and the absence of duplicates.
**Dissent**: Clearing proxy environment variables too could leave corporate-network users unable to connect, so they were preserved this time; HTTPS destination pinning and the redirect ban still hold, but user-specified proxy and trust stores remain part of the OS environment.
**Falsifier**: A reproduction showing inherited proxy environment exposes plaintext keys or body to a destination different from the one the app displays. Then design an opt-in corporate-network path together with removing the default env.
**Owner**: Jinan (owner), Codex (RED repro, implementation, verification)

## 2026-08-17 (39) — The checksum must prove the installer file name too

**Why**: `generate-download-release-facts` only read the first 64-character token of the `.sha256` body; a fake GitHub Release whose sibling asset name matched but whose body read `<hash>  unrelated.exe` still exited successfully and recorded that hash for the download screen.
**Prior**: none
**Decision**: The facts generator now uses the same single checksum parser the DMG verifier uses. The body must be a non-empty single line, a 64-character SHA-256, and the exact expected filename; both macOS DMG and Windows installer checks compare the sibling filename and the filename the body itself names. A test using a fake `gh` runs both failure and success generation and joins the standing `test:desktop:check` gate.
**Dissent**: This generator only echoes the public checksum to the screen and does not rehash the actual installer bytes; that rehash of published bytes is owned by (34)'s public release verifier, and re-fetching network bytes here would duplicate that responsibility.
**Falsifier**: If the facts generator runs before or independently of the public byte verifier and an unverified hash reaches the screen, tie workflow order together with a machine gate or merge the two steps into one receipt.
**Owner**: Jinan (owner), Codex (RED repro, implementation, gate verification)

## 2026-08-17 (38) — Stage the hashed Windows installer bytes exactly as they are

**Why**: Staging read the NSIS installer once to compute SHA-256, then read the same path again via `copyFileSync` to produce the public file; a deterministic fixture that changed the source between the two reads produced a checksum from the first bytes and a staged installer from the second.
**Prior**: none
**Decision**: Use the single `Buffer` returned by the first `readFileSync` as the shared source of truth for both the hash and the staged installer write. The source path is never read twice. Filename, version, architecture, and checksum format are unchanged.
**Dissent**: Holding the whole installer in memory could be costly for large files, but the existing code already held the same full `Buffer` before hashing, so this change adds no memory and only removes the second disk read.
**Falsifier**: If staging memory failures are observed at Windows installer sizes, replace this with streaming to one temp file, hashing from the same stream, and an atomic rename.
**Owner**: Jinan (owner), Codex (RED repro, implementation, verification)

## 2026-08-17 (37) — Even an allowlisted config name is refused if it's a link

**Why**: `write_agent_config` restricted filenames to five names but never checked whether the named file or its parent directory was a symlink; linking a temp vault's `.mcp.json` to a file outside the vault and calling the allowed write succeeded and overwrote the outside `keep-me` with `overwrite`, and linking the `.codex` directory outward produced `.codex/config.toml` outside too.
**Prior**: none
**Decision**: After the allowlist check, inspect every target file and parent first; if any is a link, reject all configs before writing any. After creating a missing parent, re-check it and confirm the normalized parent is inside the config root. On Unix, the final file open uses `O_NOFOLLOW` to close the check-to-write race window. The allowed filename list and config-root selection rule are unchanged.
**Dissent**: Windows does not get an equivalent final-open protection to this Unix `O_NOFOLLOW`; static file links and outward parent resolution are covered by a common check, but a race where a local process swaps a reparse point right after the check is not proven closed with the same strength.
**Falsifier**: If a Windows-native reproduction shows a link swap between check and write changing a file outside the config root, add a Windows handle-based no-follow write as a separate slice.
**Owner**: Jinan (owner), Codex (RED repro, implementation, verification)

## 2026-08-17 (36) — The term was declared in two places

**Why**: The same four-item gap and prescription word list existed byte-identical in two files, both used as checkers: `project-source-receipt.mjs:76` (`!ACTION_IDS.has(value.id)` to null) and `project-meaning-inventory.mjs:112` (`!SOURCE_ACTION_IDS.has(...)` to reject); fixing only one side when adding a prescription lets the receipt pass while the inventory silently rejects.
**Prior**: the cleanup flagged as the falsifier of (35)
**Decision**: Declare the source receipt's gap and prescription words in exactly one place. Add a gate that fails if the list is duplicated again: a copy is any file-local Set of these words whose overlap with the canonical set exceeds half. Reviving a duplicate confirmed the gate turns red.
**Dissent**: "more than half overlap" is a heuristic judgment; a legitimate list that happens to overlap by more than half would be wrongly flagged.
**Falsifier**: If a report shows a legitimate Set caught by this check, narrow the judgment to trigger only on an exact match with the canonical set.
**Owner**: Jinan

## 2026-08-17 (35) — A table filled in only for the cases it happened to encounter is a table with holes

**Why**: Extending the external `health` message's prescription vocabulary surfaced that the table built in (23) only covered states the author had personally seen; running meaning confirmation forward on the project's own vault produced a raw id, `needs_evidence (competency_question_incomplete)` with `Next: resolve_competency_question`, and the table also contained an invented id, `answer_competency`, that does not exist.
**Prior**: builds on (23), the "diagnosis without prescription" fix
**Decision**: Attach a human-readable sentence to every prescription id, and add a gate that fails if a gap reopens: every prescription the source can emit must have a sentence, and every sentence must point to a real prescription, matched by machine rather than by a person.
**Dissent**: The gate scans the source with a regular expression; if a prescription is constructed in a new shape, for example passed through a variable, the scan misses it and the gap can silently reopen.
**Falsifier**: If a raw id is observed reaching the screen again, declare the prescription vocabulary in one place and have the source import it (currently two files each declare the same list separately, itself flagged as the next cleanup).
**Owner**: Jinan

## 2026-08-17 (34) — Re-download and re-hash the published Windows installer too

**Why**: `desktop:verify-download` actually re-fetched and SHA-256-hashed the published macOS DMG asset, but the Windows path only read the string in `.exe.sha256`; a fixture altering only the published `.exe` bytes while leaving the checksum file untouched passed the existing verifier.
**Prior**: none
**Decision**: The same public and draft verifier requires exactly one Windows x64 installer and cross-checks the release tag against the file version. After reading the sibling `.exe.sha256`, it actually GETs the installer and recomputes SHA-256; empty files, missing checksums, and byte mismatches fail closed. Existing macOS DMG, draft, prerelease, and updater verification are unchanged. External Action SHA pinning and artifact attestation remain a separate supply-chain slice.
**Dissent**: The verifier's name is historically `check-macos-*`, hiding the Windows responsibility; renaming now would widely touch package scripts, release status, and doc references, growing this integrity fix's surface.
**Falsifier**: If a future maintenance drops Windows verification, or an operator mistakes it for macOS-only, give it a generic name in a separate behavior-preserving rename slice.
**Owner**: Jinan (owner), Codex (TDD, implementation), Sol xhigh (independent priority review)

## 2026-08-17 (33) — "Show in Finder" could execute a program

**Why**: `open_vault_in_finder` only checked `is_dir()`, but a `.app` on macOS is a directory, so it passed that check and the following `open <path>` launched the program instead of opening a folder.
**Prior**: none
**Decision**: An app bundle can never be a vault root and is never opened; the same judgment is made in the vault-root rejection door (`vault_root_rejection`) so the two checks cannot diverge. On macOS the opener is pinned with `open -a Finder` so execution still cannot happen even if rejection is bypassed. Bundle detection uses the extension name, since the accurate `Info.plist` check requires already looking inside. The recommendation bubble was verified end to end in the installed app: the sentence lands in the composer, send becomes enabled, it is not auto-sent, and the starter vault (3 nodes) correctly recommends `bootstrap`.
**Dissent**: The bundle list is a name list, so a bundle with an extension not on the list is not blocked by it; `open -a Finder` is the second defense so execution still cannot happen, but it could still be accepted as a vault root.
**Falsifier**: If a report shows a bundle outside the list was accepted as a vault root, add an `Info.plist` existence check as a second judgment.
**Owner**: Jinan

## 2026-08-17 (32) — Separate the public meaning diff from the internal write plan

**Why**: `pnpm dogfood:verify` rejected `rename_concept` dry-run's `relation_notes` object map as "before drift" because runtime returns before/after relation evidence as an object while the public output schema and validator allowed only strings or string arrays; `backlinkUpdates` could also mix in `plan`, needed only for atomic writes, containing absolute paths and full Markdown.
**Prior**: none
**Decision**: Public backlink change values allow only non-empty strings, string arrays, or non-empty maps of whitespace-free string keys and values; empty maps, blank values, and nested objects fail closed. Public `backlinkUpdates` returns only `updates` and `totalUpdated`; the atomic-write `plan` stays only inside `deferWrite`, never in rename, reclassify, or merge dry-run or confirmed responses. `relation_notes` before/after, text and `structuredContent` equivalence, plan absence across the three confirmed paths, and malformed-map rejection are fixed as contract. No new tools, UI, relation types, general JSON objects, or separate audit API are added.
**Dissent**: Existing clients may depend on the non-contract `plan`, and a human-written `relation_notes` value might have valid non-string structure, making the string-map contract too narrow; conversely, allowing arbitrary JSON objects would freeze non-relation-evidence frontmatter into the public contract too.
**Falsifier**: If a confirmed write loses its internal plan and breaks atomicity, or a valid non-string relation-evidence value is repeatedly observed, or `plan` reappears in the public payload, revisit this decision.
**Owner**: Jinan (accountable), Codex (TDD, implementation), PO Council five seats (independent review)

## 2026-08-17 (31) — Release credentials are visible only at the stage that needs them

**Why**: A long-term security and source-quality audit found the desktop release workflow's global `contents: write` and `checks: write` were passed to every job including build and test; macOS Apple certificate and notarization secrets and Windows updater signing secrets were in job-wide `env` rather than the consuming step, and Pages' `pages: write` and OIDC `id-token: write` were also global through build and hosted verification.
**Prior**: none
**Decision**: The workflow's default token becomes `contents: read`; Windows native-check reporting gets only that job's `checks: write`, draft-release creation gets only `stage-macos`'s `contents: write`, post-approval publishing gets only the existing `contents`/`actions: write`. Pages' `pages`/`id-token: write` goes only to the `deploy` job. Apple and Tauri secrets are passed only in the `env` of the step that reads them; the signed macOS artifact step keeps Apple certificate values since it re-checks credentials internally.
**Dissent**: Repeating the same secret mapping across steps risks a release script change to credential consumption missing one step, breaking only the signed release.
**Falsifier**: If a tag release fails even once from a missing required secret or token permission, the dissent is right; then centralize consuming steps via a reusable workflow or composite action that preserves the permission boundary, rather than widening job exposure again.
**Owner**: Codex (TDD, implementation), Sol xhigh (independent permission/release-path review), Jinan (long-term security/quality approval)

## 2026-08-17 (30) — Saying "couldn't find it" as "it doesn't exist" erases correct relations

**Why**: Adding a reconciliation column to `infer_imports` surfaced that running the scanner on this repository itself reported `inBoth: 0`, `inVaultNotInCode: 3` as "3 vault depends_on edge(s) have no matching code import (review for stale)", but all three were correct relations the scanner simply could not see: `acp-runtime -> mcp-server` is implemented in Rust (`src-tauri/src/acp.rs`), `cli-developer-entry -> mcp-server` is a process-launch relation not an import, and `mcp-server -> vault-ontology` is same-folder so no module edge is generated.
**Prior**: none (this repo's own CodeGraph rule and `mcp/README.md`'s "Rust coverage still fail closed" state the same intent)
**Decision**: Code inference no longer calls what it cannot judge "possibly stale". When an endpoint's `path:` has an extension the scanner does not read, or an unknown path, it goes to a new column `notJudgeableByImports`. The remaining cases are no longer asserted stale; the message now says import is only one kind of evidence and the reader should read the code before treating it as stale.
**Dissent**: A `path:` pointing to a directory (`mcp/src`) is still treated as readable since it may contain readable files, so the two process-launch relations still remain in `inVaultNotInCode`.
**Falsifier**: If an agent tries to delete a relation based on those two, add "same-folder so no module edge is generated" as another deferred-judgment case too.
**Owner**: Jinan

## 2026-08-17 (29) — What only became visible after opening the installed app

**Why**: Per owner instruction to inspect on an actual macOS screen, a running dev app (`tauri dev`) window was read and screenshotted directly; the conversation-view recommendation itself worked correctly (starter vault of 3 nodes recommending "scan the code to start the map"), but its shape was wrong.
**Prior**: none
**Decision**: Change the conversation recommendation from `Chip` to `RowButton` and give it a resting-state surface. The first attempt hand-added `w-full justify-start text-left` to `Chip`, copying values the `row` shape already has, which read on screen as a bordered full-width box indistinguishable from the composer above it; `RowButton` has no border or fill and read as plain text with no press affordance, so the list rows' existing resting `overlay-1` surface is applied; zero new values added.
**Dissent**: This judgment has no ruler; "reads like an input field" and "reads like plain text" are both visual calls made on a day the instruments were wrong four times, though this is also a layer value-based rules cannot express.
**Falsifier**: If the owner looks at this and judges differently, that judgment wins, and "what should a recommendation look like" goes to two design seats.
**Owner**: Jinan

## 2026-08-17 (27) — A blocked ACP input stops only its own session

**Why**: A security and source-quality audit found `acp_send` held the global session-registry Mutex during `write_all`/flush to the child's stdin; a blocking-writer reproduction showed one session's stalled write kept another session's send, stop's PID retrieval, child-exit cleanup, and app-quit drain from completing within 250ms; the existing 138 Rust tests missed this boundary.
**Prior**: (24)'s "an unsent request fails immediately" and (25)'s "an exit event only closes the session it was born in" remain valid; this record is the internal synchronization boundary between them.
**Decision**: The global registry holds only `Arc<AcpSessionHandle>`; stdin locking moves inside the session handle. Send clones the handle under the global lock, releases it, then locks only that session's stdin, serializing `line + newline + flush` as one critical section. Stop, child exit, and app quit never hold the stdin lock; if stop runs first, later send gets `session-not-found`, otherwise send racing exit either succeeds or ends in `write-failed`. No writer thread, channel, async runtime, write timeout, or new dependency is added.
**Dissent**: If concurrent ACP sessions or pipe saturation are rare in real use, the internal trait object and two lock layers are complexity for an unobserved risk.
**Falsifier**: If JSON lines from one session interleave, a send that acquired its handle before stop vanishes for no reason, or one new poison error appears in single-session use, the dissent is right; then reduce handle ownership and lock ordering again, not expand public behavior.
**Owner**: Codex (TDD, implementation), Sol xhigh (independent concurrency-boundary review), Jinan (long-term security/quality approval)

## 2026-08-17 (26) — If the state you read has disappeared, don't write

**Why**: In a temp vault, four defects were independently reproduced: a target with `expectedMtime` that was deleted still got recreated with stale content; a failed batch write left a new empty directory while reporting the vault unchanged; CLI `relate` overwrote a relation someone added in the meantime; and a dry-run read failure was turned into success with "would write". Existing MCP (760), CLI lib (247), and CLI command (41) tests all passed without catching this boundary.
**Prior**: none
**Decision**: A target with a numeric `expectedMtime` that disappeared or changed is rejected as a conflict before any write. Batch-write precheck never creates directories; only directories created by the current apply are removed bottom-up on failure. CLI `relate` carries the revision from its initial relation read through to the final write, rejecting deletions or changes in between, and surfaces dry-run read errors as non-zero. No new MCP fields, CLI commands, vault schema, UI, or shared transaction package are added.
**Dissent**: If real contention frequency is very low, this fix ranks below a broader security audit, and CAS could add false conflicts to normal single-writer work.
**Falsifier**: If even one false-positive conflict is observed in a normal single-writer flow, or zero target contention is seen in the first 100 MCP/CLI writes, the priority dissent is right.
**Owner**: Jinan (accountable)

## 2026-08-17 (25) — An exit event closes only the session it was born in

**Why**: A long-term source-quality audit reproduced a two-session handoff: a previous ACP process's exit event could sit in the event queue and, even after unsubscribing, still fire once a new process and session were ready, and the callback (without checking its own session) cleared the current `clientRef` and permission responder, marking the new conversation `exited`.
**Prior**: none
**Decision**: An exit callback only cleans up state, permission requests, and client when both its creation-time generation and ACP process ID still match current values. Unsubscribing remains the first line of defense but no longer substitutes for this ownership check on already-queued events.
**Dissent**: Since Tauri events are already filtered by session ID, checking UI generation too is redundant and only raises the risk of missing exit handling, leaving processes behind.
**Falsifier**: If even one case shows a real current session's exit event blocked by the ownership check, leaving a client or process behind, the dissent is right; then fix the ref-update ordering at session registration or replacement instead of removing the check.
**Owner**: Codex (implementation, TDD), Jinan (long-term security/quality approval)

## 2026-08-17 (24) — A request that couldn't be sent is a failure, not a wait

**Why**: A long-term source-quality audit reproduced a real send rejection: when `transport.send()` was rejected by a session-exit race or IPC error, the client only logged a diagnostic and kept the JSON-RPC request in the pending map; the handshake then failed only after 60 seconds, and the intentionally timeout-free `session/prompt` never ended, leaving the screen stuck thinking.
**Prior**: 2026-08-16 (4)'s "cap the ACP handshake with no response" and "no arbitrary time cap on long conversation turns" remain valid; this record distinguishes a late reply from a request never sent at all.
**Decision**: A request awaiting a response is removed from pending immediately on send rejection, and the caller gets an `acp-send-failed:<method>` error; a later stray response is ignored. Fire-and-forget notifications the caller does not wait for, like cancel and permission responses, keep their existing separate path but log failures. The existing timeout policy for normally sent but slow-to-respond requests is unchanged.
**Dissent**: A send failure at the moment a child process is exiting is a common, normal race, so surfacing it as an error may show the user an unnecessary red state on an already-closed conversation.
**Falsifier**: If 5% or more of normal exits (user cancel or panel close) show a send failure surfaced as a user-facing error, the dissent is right; then distinguish an intended exit by caller generation and end quietly, without reverting to leaving pending entries behind.
**Owner**: Codex (implementation, TDD), Jinan (long-term security/quality approval)

## 2026-08-17 (23) — The ACP permission gate is a start condition, not a notification

**Why**: A security audit traced an existing failure path into execution: `acp_start` launched a non-isolated child and only notified `gate-off` when `claude-acp`'s isolated config prep failed, letting it inherit global `Bash(*)`/`Write(*)`; `useAcpSession` set `ready` even when `codex-acp`'s `session/set_mode(read-only)` failed, opening a gate-less writable session.
**Prior**: 2026-08-16 (2)'s "Claude's isolation config is the permission gate" and (8)'s "Codex's `read-only` session mode is the permission gate" remain valid; this record overturns 2026-08-16 (8) decision 3 and its "notify gate-apply failure, then keep the conversation open" implementation.
**Decision**: An executor advertising config isolation launches only once isolation prep succeeds, else surfaces `isolation-failed:*` with zero children. An executor using session-mode gating becomes `ready` only once the mode applies, else closes into an error state and terminates any launched adapter. No isolation method is invented for unverified executors.
**Dissent**: If a transient permission error or one momentary adapter failure blocks the whole conversation, it excessively blocks a user willing to accept the risk and keep working; showing `gate-off` prominently and continuing would be better for availability.
**Falsifier**: If gate-prep failure repeats in 1%+ of normal installed sessions post-ship and retry/config-repair guidance alone does not recover it, the dissent is right; the fix is a per-cause recovery action and an explicit risk-disclosing choice screen, not silent fail-open.
**Owner**: Codex (implementation, TDD, gate probe), Jinan (long-term security improvement approval)

## 2026-08-17 (28) — A freshly created vault claimed it was broken

**Why**: Adding a gap id and message format to `query_ontology health` surfaced that checking a freshly created vault immediately reported `vault health needs_attention`, `meaning_assessment ... first project: invalid (assessment_input_invalid)`, even though the user did nothing wrong; the cause was `readProjectMeaningAssessment`'s no-receipt branch going to `invalidAssessment`, deliberately feeding a wrong contract to manufacture "input is invalid".
**Prior**: this is the mirror case of (19), which called nothing-done "normal"; here nothing-done was instead called "broken"
**Decision**: No receipt is now named `competency_not_authored`; genuinely broken input remains `assessment_input_invalid`, and a test blocks the two from being conflated again. The evaluator already computed `nextAction` but the check discarded it; the message now states what to do next. Judgment is unchanged: since meaning is genuinely not yet confirmed, `warn` is kept; only the name and prescription changed.
**Dissent**: "Not yet done" still carries the state name `invalid`; the gap id is now honest, but the code reading the state column still reads it as broken.
**Falsifier**: If the reaction "it says invalid but I don't know what's wrong" recurs, introduce a new `not_assessed` state and revisit the exit-code contract together.
**Owner**: Jinan

## 2026-08-17 (22) — Connect the names in the answer to the map

**Why**: Per owner instruction ("hovering in chat could also highlight our node on the map"), real, existing node names appearing in an agent's answer needed a marker, with hover lighting up that node on the map.
**Prior**: none
**Decision**: Tag real, existing node names appearing in agent answers; hovering highlights that node on the map. Only known graph names are matched, not arbitrary-looking `a/b` text, giving zero false positives. No new visual language is introduced: the map renders the hover exactly as an existing hover, marked only with a dotted underline meaning "known to the map", not "clickable link". No render runs per hover; a ref is passed instead, per the existing footprint-brushing contract (measured 68-109ms per hover). The marker must attach to markdown's rendered output, not the whole component, since wrapping the component broke it on unparsed raw text mid-parse.
**Dissent**: The marker is not attached in tool-call lines, since the place a slug appears most, a tool argument like `get_concept({slug})`, is rendered on a different path not included in this slice.
**Falsifier**: If a reaction like "the name shows but why isn't it lit here" appears, add the same marker to tool-call lines too.
**Owner**: Jinan

## 2026-08-17 (21) — The map that told you to fix 83 things that couldn't be fixed

**Why**: While implementing "raise ACP to top priority," vault health miscounted plain markdown docs as nodes: dogfood vault has 163 docs but only 80 real nodes, web reported needs_attention with 83 islands, while CLI and MCP compiler counted only `kind:`-bearing docs as nodes.
**Prior**: none
**Decision**: A document without `kind:` frontmatter is not a node; the web's health calculation now counts nodes the same way the MCP compiler does. The chat panel only recommends an action backed by a real observed vault fact (`computeVaultHealth`'s `islands`, `missingContainment`). After the fix the web reports 80 nodes, healthy, 0 islands, matching the CLI.
**Dissent**: Recommendations get less accurate as the vault grows, since only the first item of each category is surfaced with no stronger reason than "sorted, took the first."
**Falsifier**: Users report the recommendation surfaces an unimportant node; then switch the selection criterion to "largest island" or "most recently changed."
**Owner**: Jinan (owner)

## 2026-08-17 (20) — The lie that it was deleted makes people walk away on the spot

**Why**: An externally-used contract changed so `secret_clear` can now fail; old code discarded the result of `handle.delete_credential()` and always returned `stored: false`, so a locked keychain left the key in place while the screen claimed it was deleted.
**Prior**: none
**Decision**: Credential deletion failure is now reported honestly instead of always claiming success, verified with a pure function `is_cleared` that distinguishes the kind of keychain error directly. Verification does not use `secret_status`, which deliberately downgrades all keychain errors to "absent."
**Dissent**: Deletion is now an action that can fail, whereas it always "succeeded" before; in environments with frequently-locked keychains users will see new errors.
**Falsifier**: Reports that "deletion keeps failing" arrive but the key was actually deleted; then the re-read verdict is too strict and `Step::Failed` re-read handling must be revisited.
**Owner**: Jinan (owner)

## 2026-08-17 (19) — If there's nothing to count, everything passes

**Why**: An externally-used contract changed (an item added to `query_ontology health`'s checks array); `health` reported "healthy, exit 0" for a non-vault folder because all six checks passed vacuously, the web recomputed the same checks with the same flaw, and `relate --dry-run` reported a write would succeed when the real command would refuse it.
**Prior**: none
**Decision**: Added `vault_present` as the first check, so an empty/near-empty target now returns needs_attention, exit 1; mirrored the fix on the web side (reverting it alone turns 8 tests red). Extracted the refusal rule into a pure function `relationWriteRefusal` so both real writes and dry-run call it, and recorded the ACP-over-MCP relationship in the vault via the CLI.
**Dissent**: `vault_present` also fails on a deliberately emptied vault, e.g. someone who deletes the 5 starter nodes after `init` to build from scratch gets a false red light.
**Falsifier**: Reports of "health stays red starting from an empty vault"; then downgrade the verdict from `fail` to `info` and change only the status sentence (exit 0 recovers).
**Owner**: Jinan (owner)

## 2026-08-16 (18) — With two mirrors, fixing only one side is the default

**Why**: Public contracts changed (CLI write path, the app's settings-file write, an added validation rule) under the owner's directive to keep going; review caught CLI writes non-atomic mid-write (`FULL_SIZE 420000102`, `MIN_OBSERVED_DURING_WRITE 0`), and the app's "connect agent" wiped the user's other MCP server entries.
**Prior**: none
**Decision**: CLI writes now use the already-existing safe write, previously used only for the settings file. The connect-agent flow now replaces only its own entry and preserves the rest, like the CLI, gated by `tests/contract/mcp-config-merge`. Vault damage from an unescaped quote in `user's` breaking the comma delimiter was restored, and a check for the pattern was added to both validators.
**Dissent**: The "swallowed reason" check can false-positive on a normal sentence that legitimately quotes a neighboring slug with a trailing colon.
**Falsifier**: A report that a normal sentence triggers this check; then narrow the verdict to require a declared target preceded by a comma and space.
**Owner**: Jinan (owner)

## 2026-08-16 (17) — Write an instruction instead of changing the tool, and settle that instruction with a real measurement

**Why**: Owner asked whether connecting via ACP follows their custom system prompt or uses MCP tools, and whether everything should move to the system prompt instead.
**Prior**: none
**Decision**: Tools and instructions are complementary; keep tools unchanged and expand instructions only. A 5-run experiment ("payment cancellation" when "refund" exists) showed current instructions create a duplicate node unasked while new instructions find it and stop (50s/45s vs 88s, 0 vs 2 raw file reads). Also fixed: instructions were attached only to new conversations, not resumed sessions.
**Dissent**: "When in doubt, ask" increases follow-up questions, reading as sluggish to someone who wants immediate action.
**Falsifier**: Reports of "why does it keep asking"; then narrow the asking criterion (e.g. only on name overlap) and rerun this experiment whenever the wording changes.
**Owner**: Jinan (owner)

## 2026-08-16 (16) — Never lose the user's markdown: plug four gaps, and make the analysis screen 100x faster

**Why**: Public contracts changed (frontmatter serialization rule, conflict detection for multi-file writes); measured: a newline inside `note` containing `kind: element` changed the node's kind, writes were not atomic, `expected_mtime` only guarded single-file paths, and the insights screen rebuilt its index per node (1,760ms measured vs 17ms after the fix, at 2,000 nodes).
**Prior**: none
**Decision**: The writer folds newlines with `\n` and the reader unfolds it, applied across all five places the rule was implemented (MCP, CLI, three in the app). The existing safe write now covers user data, not just the settings file. Multi-file rename/merge/reclassify now checks `expected_mtime` like single-file writes; the insights index rebuild only runs when needed.
**Dissent**: The multi-file write conflict check increases refusals: a user who leaves their editor open and asks the agent to rename something will now fail, where it previously "succeeded" silently overwriting their edit.
**Falsifier**: Reports of "rename keeps failing"; then the screen must show what changed and offer a retry path rather than disabling the check.
**Owner**: Jinan (owner)

## 2026-08-16 (15) — This server reads only the folder it was granted

**Why**: A public contract changed (the input boundary of four MCP tools); a real server run confirmed `analyze_repo_structure {"rootPath":"/etc"}` succeeded and returned the directory structure, and since all four are read tools, `OATLAS_READ_ONLY` did not block them either.
**Prior**: none
**Decision**: The four folder-scanning tools (`analyze_repo_structure`, `infer_imports`, `index_project`, `validate_vault`)'s `rootPath`/`repoRoot` must be inside the vault or its repository; outside paths are refused with a human-readable reason, gated by a test that boots the real server and checks over JSON-RPC (`tests/contract/mcp-scan-containment.contract.test.ts`).
**Dissent**: There is a legitimate need to scan outside the repository for users whose vault and code live in different locations, who will read this boundary as "why can't I."
**Falsifier**: Reports of "my code is in a different folder and analysis doesn't work"; then allow-list folders the user has explicitly connected via `connect_project_source` rather than removing the boundary.
**Owner**: Jinan (owner)

## 2026-08-16 (14) — The screen speaks in plain human language, and the hole we said we'd plugged yesterday wasn't plugged

**Why**: A public contract changed (permission-verdict path extraction, session instructions), on the owner's real bug report questioning why errors were unfriendly and hard to understand.
**Prior**: none
**Decision**: Errors now show as one human sentence plus a next step; unknown branches are not invented and are collapsed into a details section. The path check that supposedly blocked outside writes was not running at all: it read only `rawInput.file_path`, a field our MCP server never sets (measured: `file_path` 0, `filePath` 30), so every request was auto-allowed; the passing test had hand-constructed a value the real server never produces. Session instructions no longer unconditionally claim the `atlas-vault` server is connected.
**Dissent**: Sorting errors into categories risks a mismatch some day, e.g. showing "you're logged out" when it's actually a network issue, causing the user to do the wrong thing.
**Falsifier**: A report of "I logged in again like it said and it's still broken"; then fall back to the unrecognized-error bucket more readily rather than adding categories.
**Owner**: Jinan (owner)

## 2026-08-16 (13) — Plug three holes in the gateway: a name is not a passport

**Why**: A public contract changed (permission-verdict path, `keepGateSafeModes` list), on the owner's directive to thoroughly review everything starting from ACP.
**Prior**: none
**Decision**: Removed codex's `agent` mode from the list, since measurement (`src-tauri/src/acp.rs`) showed 0 permission requests while writing outside the working folder in that mode. Our own MCP tools now have their path checked too, since a tool named `mcp__atlas-vault__*` can still touch outside the vault (`absorb_document` rewrites originals in place relative to the repository root). The server name is passed through, enabling auto-allow, only when genuinely connected. Also fixed three related hangs: no response on verdict failure, no cap on the handshake, no client cleanup on adapter exit.
**Dissent**: Leaving codex with only `read-only` may read as "this tool can't do anything," even though vault MCP tools still work in that mode and the screen never states that.
**Falsifier**: A codex conversation produces "why can't I write anything" or "there's only one mode"; then the screen must state that the map still fills in under read-only.
**Owner**: Jinan (owner)

## 2026-08-16 (12) — The hover axis set is handed off by **the component**: unreachable in the value layer is the same as not existing

**Why**: A spec file changed (`src/shared/ui/controls.tsx`, exported types in `control-class.ts`), starting from the owner's real report wanting hover effects on each area.
**Prior**: none
**Decision**: `Chip`, `IconButton`, and `RowButton` now accept `hoverInk`, `hoverSurface`, `hoverBorder` and pass them straight to the value layer, with zero new axes, values, or tokens. Measured: these axes landed in the value layer on 2026-08-15 but components had no way to receive them, so 17 of 29 `RowButton` consumers hand-wrote hover in `className` (13 `hover:text-`, 4 `hover:bg-`).
**Dissent**: Opening axes to components blurs "what is a component's job"; the next person will ask for `hoverShadow`, `activeInk`, and so on.
**Falsifier**: A request to open a fourth hover axis beyond these three; then this door was actually a door for adding more axes.
**Owner**: Jinan (owner)

## 2026-08-16 (11) — The chat window is **one**: keep two branches, merge the door and the window

**Why**: Owner's real report that the chat window was confusing, asking which agent a given window belonged to and requesting a single chat window.
**Prior**: none
**Decision**: One door, one window: two conversation branches remain (coding-agent ACP, API key), but the opening door is a single "agent" chip in the utility lane that decides the branch, no path opens both at once, and hand-offs from a node/address go to the same window. The verdict lives in one function, `src/views/home/model/agent-chat-door.ts`, proven across 16 inputs that both branches can never be true at once.
**Dissent**: With two branches users will eventually need to know which branch their window is in; the runtime dropdown currently only exists on the coding-agent branch.
**Falsifier**: A key-branch user asks again "why can't I choose a model" or "isn't this different from before"; then merging the door alone was insufficient.
**Owner**: Jinan (owner)

## 2026-08-16 (10) — Raise dropdown text from 9.5px to the control-label spec (12.5px)

**Why**: Owner request to evaluate font size, plus a shared value-layer change (`src/shared/ui/select.tsx`); measured in one chat panel screen: `text-caption`(9.5px) on the Select trigger/items, `text-label`(11px) on tool rows, `text-body`(12.5px) on bubbles, `text-body-lg`(14px) only on markdown headings.
**Prior**: none, though it cites the settings-sheet dialect contract requiring `text-body`(12.5px) on labels with `text-caption` unused on root sheets, and the 2026-08-09 audit that flagged this same `AiConnectionPanel`.
**Decision**: Raise the Select trigger/items to `text-body`(12.5px) across all 6 consumers (project form, node creation, workshop compass, domain merge, AI connection, chat panel); raise chat bubble text to `text-body-lg`(14px); increase line spacing proportionally (8 to 12px).
**Dissent**: Raising the primitive's type step could overflow existing dropdowns placed in narrow spots elsewhere in the app.
**Falsifier**: Any screen where the Select trigger's text is observed clipping or wrapping; then fix that spot's width rather than reverting the type step.
**Owner**: not recorded

## 2026-08-16 (9) — "Ready" checks **all the way through login**, and does not install in the user's place

**Why**: Owner's real report that Claude Code and Codex were shown "ready" immediately despite needing per-tool login; "ready" only checked file presence, so an installed-but-not-logged-in user hit `Authentication required` on opening a chat, a failure already measured in 2026-08-16 (2)'s fourth line.
**Prior**: 2026-08-16 (2)
**Decision**: Added a `login-needed` state; readiness checks only the exit code of a short-lived probe (`claude auth status`/`codex login status`, measured 300ms/45ms, both exit 0) without reading or storing output; a launch failure or 5-second timeout yields `None` ("unknown"), never counted as failure. Atlas does not run install scripts on the user's behalf; it only links to official install instructions.
**Dissent**: Silently launching the user's CLI whenever the settings screen opens is an unrequested execution, a crack in the local-first promise.
**Falsifier**: The check produces a user-visible effect (login window pops up, usage counted, or slowdown); then move the check behind a "recheck" button instead of first load.
**Owner**: not recorded

## 2026-08-16 (8) — The codex gate is built as **session mode, not settings**, and fixes what could not be chosen while the gate sat there

**Why**: Extending 2026-08-16 (2)'s "isolate only measured runtimes" to codex; measured with a real adapter writing outside the vault: isolation off and isolated `CODEX_HOME` (`approval_policy="untrusted"`, `sandbox_mode="workspace-write"`) both gave 0 permission requests and a file outside the vault, while session mode `read-only` gave 1 request and no outside file.
**Prior**: 2026-08-16 (2)
**Decision**: The gating method differs per runtime, kept in one table (`src/features/acp-session/model/runtime-gate.ts`): claude uses settings isolation, codex uses session mode `read-only`, unmeasured runtimes get no mode set. `read-only` does not cut functionality since vault writes already go only through the injected MCP server. Unified the runtime picker (previously keyed on `r.isolated`, excluding codex) into one function, `isGuardedRuntime`.
**Dissent**: The name "read-only" can confuse users into thinking the map can't be written, and silently swapping the mode is an unannounced change.
**Falsifier**: A user asks "why read-only" or why their configured mode changed; then the screen must state the fact rather than reverting the mode.
**Owner**: not recorded

## 2026-08-16 (7) — What one round of measurement caught: **the gate was blocking our own tool**

**Why**: Verifying the completion condition of the same-day "ACP adoption" decision item 7; under the app's exact conditions, all 4 permission requests were "outside, (no path)" and auto-refused, and the agent reported it couldn't write to the map because every MCP tool call was blocked.
**Prior**: none
**Decision**: Auto-allow tool calls from the injected vault MCP server (`mcp__<server-name>__*`), using the injection constant rather than a literal name, reading the tool name from `_meta.permission.changes[].targets[].toolName` with `title` as fallback. Root cause was that the policy only understood file paths, so path-less MCP calls fell into "unknown, ask" with no auto-responder present. After the fix, the test sentence produced a relation with the user's own sentence preserved verbatim in `why`.
**Dissent**: Auto-allowing by name prefix can be spoofed if a project's own `.mcp.json` defines a server of the same name.
**Falsifier**: An observation, in a vault with a real server of the same name, that the verdict lets a third party's tool through; then make the injected server name different per session.
**Owner**: not recorded

## 2026-08-16 (6) — Add **session management and model/working-mode selection** to in-app chat: the protocol already offered all three

**Why**: Owner request for chat-like conversation management plus agent/model settings; measured that real adapters already expose session list/load, work-mode switching (Claude 6 modes, Codex 3), and model listing (none for Claude, 33 for Codex).
**Prior**: 2026-08-16 "ACP adoption" record, whose removal list had put a 38-runtime registry browser and selection-method implementation out of scope.
**Decision**: Widened that boundary since adapters already provide these features, so no local store, schema, or sync is needed. Conversation lists are filtered locally since `session/list` returns titles from other folders even given `cwd` (measured). Work modes that remove the gate (`bypassPermissions`, `acceptEdits`, `agent-full-access`) are excluded; unavailable fields (e.g. Claude's model list) are not drawn at all. Also fixed: 20 of 38 runtimes were shown "ready" based only on `npx` availability; split into a separate `cli-unknown` group.
**Dissent**: Filtering modes decides on the user's behalf about their own tool, and blocking a mode eventually sends users back to the terminal (same category as 2026-08-16 (2)'s dissent).
**Falsifier**: A user asks why a mode is unavailable, or repeats in the terminal what they did in-app; then the screen must explain the gate tradeoff rather than removing the filter.
**Owner**: not recorded

## 2026-08-16 (5) — ACP shippability: licenses all pass, **one brand rule was being broken**, one term is left to owner judgment

**Why**: Owner inquiry into whether using ACP is policy-safe and releasable, ahead of the first public release.
**Prior**: none
**Decision**: Confirmed via primary sources that the ACP spec, `@agentclientprotocol/claude-agent-acp`, `@agentclientprotocol/codex-acp`, the agent registry, and `openai/codex` are Apache-2.0, Buzz is Apache-2.0, Atlas is MIT, and nothing is redistributed except vendor-contributed icons. Fixed one branding violation (must say "Claude Agent" not "Claude Code"), gated by `tests/contract/vendor-naming.contract.test.ts`. Left open for owner judgment: a clause discouraging third-party claude.ai login/usage without approval; no decision made among three options now.
**Dissent**: Deferring the terms judgment means deciding it under time pressure right before release when screens already assume one premise, making change expensive.
**Falsifier**: When revisited before public release, if the change needed exceeds one screen (the chat panel's auth guidance); then that dissent was right.
**Owner**: not recorded

## 2026-08-16 (4) — Draw another product's mark **on a light plate, in that vendor's color**: the one seat exception to the dark-only rule

**Why**: Owner's real report that the icon needs color, plus a design-token change (`app/globals.css`); 38 runtime marks were invisible on screen because the ACP registry rejects color-baked SVGs (`fill="currentColor"`) and `<img>` rendering defaulted to black on a dark panel.
**Prior**: 2026-08-16 (3) (decided to show all 38 registry entries; this record only decides how they are drawn)
**Decision**: Draw marks as a CSS mask painted by Atlas, locking the source to `/acp-icons/<id>.svg`. Colors come only from vendor-published, human-verified pairs sourced at build time from simple-icons (CC0), since automatic name-matching produced wrong colors (e.g. Google AMP blue for `amp-acp`); only 11 confirmed entries get color, 27 stay neutral. Only the 32px tile is a light plate, since 6 of 11 confirmed colors are near-black and invisible on dark.
**Dissent**: Opening a place exception to "one dark screen" invites the next person to justify a light plate elsewhere, as happened before with the workshop-game exception.
**Falsifier**: A file using the `--color-vendor-plate` tokens beyond the one mark tile, or a light plate appearing outside the runtime list; then that dissent was right.
**Owner**: not recorded

## 2026-08-16 (3) — The owner reversed "start with Claude alone": ship all 38 registry kinds, and state what the app can't gate in that row

**Why**: Owner override (no council convened) reversing the same day's first record recommending claude-code alone and excluding a 38-runtime browser; owner said to show everything usable via ACP, citing Buzz's runtime list and Ollama's launch list.
**Prior**: overturns 2026-08-16 first record ("first slice is claude-code alone", "38-runtime browser is OUT")
**Decision**: Ship all 38 registry runtimes, but label honestly which the app can auto-request permission for. Codex cannot be isolated (writing outside the folder gave 0 permission requests even with isolated `CODEX_HOME`), so it's excluded from the isolation table and marked unverified; failure to isolate does not block launching. The registry and icons (38, 16x16 monochrome `currentColor` SVG) are fetched at build time and committed, not at runtime.
**Dissent**: Listing 34 unverified runtimes reads as endorsement, since presence in the list speaks louder than an "unverified" label to a first-time user.
**Falsifier**: A user picks an unverified runtime and a file gets modified outside the vault, or says "I thought Atlas would block that"; then add a one-time confirmation for unverified picks rather than shrinking the list.
**Owner**: stark (accountable)

## 2026-08-16 (2) — The permission gate exists only if **settings are isolated**: the app does not inherit the user's global Claude settings

**Why**: The same day's first record reserved measuring whether `requestPermission` fires when told to write outside the working folder; with `claude-agent-acp` 0.68.0 and no declared file capabilities, the owner's real global `~/.claude/settings.json` (defaultMode auto, `Bash(*)`/`Write(*)`/`Edit(*)` allowed) produced 0 permission requests and a file created outside the folder; only isolated settings (defaultMode default, allow []) produced 1 request.
**Prior**: none
**Decision**: App-launched sessions use their own settings directory and never inherit the user's global settings. Credentials are symlinked rather than copied. Policy is judged on the structured absolute path in `toolCall.rawInput.file_path`, not on title text; vault-inside is auto-allowed, outside asks. The app never itself picks `allow_always`.
**Dissent**: Isolation ignores settings the user configured on their own tool; missing skills will read as broken and send the user back to the terminal.
**Falsifier**: A user asks why their skills/settings are missing, or repeats the same task in the terminal while using an in-app session; then find a narrow path that lets the app override only the permission portion.
**Owner**: stark (accountable)

## 2026-08-16 — Bring the user's agent into the app via ACP: reverse the "delegated worker" boundary, keep "the map is primary"

**Why**: PO council (5 seats) convened over a new in-app surface plus BYOK removal review. Real-vault in-app chat usage was 0 (the demo vault's 91 lines were the owner's own model A/B test); claude-agent-acp 0.68.0 and codex-acp 1.3.0 work without API keys via existing subscription auth, negotiated down to v1.
**Prior**: Partially overturns 2026-07-27 (panel-vs-delegate-laborer distinction); upholds 2026-08-01 ("the fourth connection is a door, not a vendor") and tool-catalog.ts's terminal-owns-code rule.
**Decision**: Adopt ACP v1, first slice claude-code only via embeddedContext for one round trip with existing proposal cards (codex next). Freeze BYOK, keep local runner; require requestPermission with no allow_once auto-approval; ACP folders limited to vault-bound repos, read-only, MCP-only writes.
**Dissent**: Building without a terminal-usage count is an unfounded second supply-side bet; the 2026-08-01 zero-key door already tested "remove friction and they'll use it" and hit 0 uses after 15 days, with the in-app question never actually asked (N about 1).
**Falsifier**: If in-vault ACP round trips are fewer than 5 within two weeks of shipping, the dissent was right and the in-app AI hypothesis is fully reconsidered; a secondary signal is why/provenance line count not rising versus pre-ship.
**Owner**: stark

## 2026-08-16 — Expose Go imports as typed package evidence, not mixed into existing file edges

**Why**: PO council convened over a public MCP output contract change and a false-green in a held-out large Go repository, weighing evidence honesty, agent-only handoff, differentiation, and a 4-day appetite together.
**Prior**: Upholds 2026-08-15 ("production import evidence is observation, not approved impact"); applies 2026-08-16's C-coverage rule that public enum expansion is a contract change needing a matched strict consumer.
**Decision**: Add Go package imports as a separate typed public receipt instead of widening file edges. infer_imports reads only root go.mod module-local imports as bounded text, returning {fromFile,toPackage,...}, reused by the analyzer and index_project; no arbitrary representative file is chosen.
**Dissent**: A separate package branch costs schema/CLI/bundle consumers more; smaller to keep edges.to with a root-contained package directory and widen wording to "source dependency endpoint".
**Falsifier**: If the receipt fails to raise held-out q4/q5 over a README-only fix, exceeds the 4-day appetite or source/bundle parity, or a direct MCP consumer can't safely adopt the new branch, the dissent is right.
**Owner**: owner (per full work, verification, and main-merge request)

## 2026-08-16 — The dogfood meaning answer states structural completeness and meaning incompleteness together

**Why**: Project competency had 7 domains and 26 capabilities yet abilities named only one domain (partial), while only two dependencies made impact "answered": an unresolved inconsistency.
**Prior**: none
**Decision**: Promote the implementation entry points already named in 9 capability bodies to canonical path:. Mark project abilities "answered" using all typed relations across 7 domains/26 capabilities as witnesses; keep evidence and impact "partial" (folder-only/low-confidence evidence; gap outside the agent-facing schema chain).
**Dissent**: Not marking all competencies "answered" before beta may make quality look unfinished.
**Falsifier**: If a version hiding partials, or promoting behavior/impact to answered from path existence alone, scores more accurate and complete under source-hidden evaluation, this decision is wrong.
**Owner**: owner

## 2026-08-16 — Split meaning-repair handoff and detailed review into two fixed-budget contracts

**Why**: 2026-08-04's 5 KiB falsifier was observed in dogfood: raw meaningRepair:v1 for 7 domains/26 capabilities/34 targets measured 5,135 bytes, 15 bytes over the public CLI validator's 5,120-byte cap, and aborted.
**Prior**: Upholds 2026-08-04 (5 KiB cap, typed evidence, deterministic order, 20-item limit, approval/verification order) and 2026-08-03 (action-first review, no-auto-write/finalize); overturns only 2026-08-04's single-materialized-manifest approach.
**Decision**: agent_brief.meaningRepair:v2 stays a compact manifest (scale, status, first action); full typed evidence and full-body reads move to query_ontology's meaning_repair_review via a stateless cursor, each page under 5 KiB, max 20 items, ordered project/domain/capability, bound to graph/source/mtime.
**Dissent**: A stateless cursor prevents page-mixing but gives no receipt that an agent consumed every page and full-body call; approving from the manifest alone or skipping pages could still breach human sovereignty.
**Falsifier**: If a trial approves/writes before the last page, needs over 5 extra lookups or 2 minutes to restore all 34 items, or source/bundle return different pages for one cursor, a separate completion receipt is a new decision (cap and re-merge stay rejected).
**Owner**: owner

## 2026-08-16 — Purpose/domain "answered" and high confidence require independent meaning evidence matching the claim

**Why**: analyze_repo_structure's q1/q2 showed false-green: a held-out C proposal citing one README.md got confidence 0.95/0.91 and scope/domains "answered", while a fresh source-hidden reviewer downgraded the same claims to weak/partial-weak.
**Prior**: none
**Decision**: Before purpose/domain gates count confidence >=0.8 or "answered" scope/domains, require two separate current trusted semantic sources that actually support the claim's non-generic meaning; otherwise close as an existing finding, add evidence, or lower confidence to "partial" with an explicit gap.
**Dissent**: In a small repository one README may be genuinely sufficient authority; requiring two documents could optimize document count over accuracy and increase retries of honest proposals.
**Falsifier**: If low-confidence partial becomes unreviewable in a fresh single-source repo, round trips rise without cutting unsupported claims, or aligned multi-source proposals stay stuck at weak, this gate is too broad and must be narrowed.
**Owner**: owner

## 2026-08-16 — Deliver the native implementation path as a build-role representative set, not a file list

**Why**: A held-out C field trial mis-selected the canonical capability path and left source-hidden q4's implementation role unanswered: most of the 36 prior source picks were same-named platform files, the public header template wasn't even a candidate, and configure.ac was called an "implementation entry point".
**Prior**: none
**Decision**: Within the 36-source cap, read Autotools' static build declarations as role evidence, preserving public interface, common preparation, specialized API, and selectable platform backend as representative paths per role, using existing title/path/evidence.source fields.
**Dissent**: Putting role into existing title/excerpt fields is weaker than a new typed field; a fresh proposal agent could still pick a specialized source as canonical.
**Falsifier**: If an independent proposal again picks a raw/platform source as central, or source-hidden q4 fails to distinguish roles, this minimal contract is insufficient and a typed role contract is reconsidered (q5 impact staying unknown is not this failure).
**Owner**: jinan

## 2026-08-16 — Unsupported C and an explicit relation path fail closed at the evidence contract before write

**Why**: importScanCoverage:v1's public enum expansion met a source-hidden field trial's relation-evidence mismatch, risking false-green for C support and relation grounding.
**Prior**: Upholds 2026-08-15's source-hidden hard-block and candidate-only no-write decision; does not open approval, qualification, or writePlan.
**Decision**: Add "c" to detectedUnsupportedLanguages only when Autotools manifest and bounded source discovery both confirm .c/.h files present, aligning the MCP enum, producer, CLI validator, and verify contract together. A relation's evidence[] must contain the exact path its why names at both ends; no substring or arbitrary-filename match.
**Dissent**: An external client exhaustively consuming the rust-only enum could break when "c" is added; broad detection or path-token boundaries risk false-positive blocking.
**Falsifier**: If CLI/verify parity rejects the new value, an Autotools metadata-only repo is falsely flagged "c", a longer path token is wrongly blocked, or the same jq retest still shows false-complete or mismatch, the dissent is right.
**Owner**: owner

## 2026-08-15 (20) — The first held-out trial stops exactly at qualification failure

**Why**: A solo field trial on three unfamiliar repositories passed all transport/mutation checks, but the starter-template vault stayed at 0 semantic writes and canWrite:false, with the source-hidden evaluator reporting Q1-Q5 missing, Q6 weak, setup_failure:true.
**Prior**: none
**Decision**: Accept this run as safe no-write/setup-failure evidence only; it does not claim improved semantic quality or a passed 4-phase trial, and baseline is not updated. The next real trial measures Phase 2-4 only on a populated vault meeting qualification and explicit exact-plan acceptance.
**Dissent**: The candidate proposal already had sufficient path/README meaning, so writing for test purposes to measure persisted handoff was proposed.
**Falsifier**: If a real populated vault is built within the same boundary and its persisted answers/claim audit are observed to improve over baseline, this hold is updated.
**Owner**: owner

## 2026-08-15 (19) — A source-hidden failure is not an approvable visible gap

**Why**: A mutation probe reproduced a fail-open: classifying sourceHiddenTask.status:"failed" as an axis:pragmatic gap with human acceptance still returned writeEligibility:"executable" and a writePlan while qualificationStatus was "not_qualified".
**Prior**: none
**Decision**: Unless sourceHiddenTask.status is exactly "passed", the lifecycle returns a source-hidden-task-not-passed diagnostic and hard-block; no accepted gap may open a writePlan. Existing human approval, digest binding, and no-write stay unchanged.
**Dissent**: If a human explicitly accepts a pragmatic/functional gap, some users may still want a reviewable plan, so source-hidden failure could follow the same path.
**Falsifier**: Reconsidered only if a failure packet is shown to preserve the evaluator's answer accurately, without lowering independent handoff quality, and reproducibly safe to open write eligibility; the current probe observed the opposite.
**Owner**: owner

## 2026-08-15 (17) — Align the contract for proposal evidence the analyzer already emits

**Why**: A held-out re-audit needed repeated field-joins using only existing reviewQuestions; the analyzer already returns definition/evidence/excludes, domain/capability boundary/confidence, and import why/evidence/uncertainty, but outputSchema allowed only slug/title/reason and omitted the package-contract role.
**Prior**: Builds on (15)'s no-go on new top-level Q1-Q6 fields.
**Decision**: Hold off any new tool, top-level Q1-Q6 field, UI, writer, or aggregate score; align outputSchema with metadata the analyzer already returns and add package-contract to the role enum, keeping reviewQuestions/semanticEvidence/qualification no-write boundaries. Q1-Q6 tracing stays scratch-only.
**Dissent**: Bundling Q1-Q6 status/evidence/nextAction into one public packet could reduce agent confusion before the first write.
**Falsifier**: If a fresh evaluator cannot reproduce the same Q1-Q6 results from existing fields across H2/Axios/Undici, or repeated field-joins cause handoff failures, this is reconsidered.
**Owner**: owner

## 2026-08-15 (18) — library product prose can seed a proposal-only request capability

**Why**: A generic lib/-based library with trusted prose calling it an HTTP client, plus real implementation elements, still produced 0 capability candidates, leaving q3 "missing" for lack of a clue linking request/client meaning to adapter/dispatcher/handler witnesses.
**Prior**: none
**Decision**: Add a vendor-neutral HTTP request client clue to GENERIC_NARRATIVE_CAPABILITY_CLUES. Expose capabilities/request-client as proposal-only in proposedBusinessOntology.capabilities only when both a trusted sentence and a repository-relative element path exist; no new field/tool/UI/writer/promotion.
**Dissent**: Creating a capability from HTTP/client vocabulary plus an adapter-like path risks over-reading implementation as business meaning.
**Falsifier**: If a fresh held-out repository generates the candidate without a trusted sentence or exact implementation witness, or a source-hidden handoff reads it as approved fact, this clue is judged failed.
**Owner**: owner

## 2026-08-15 (16) — Production import evidence is an observation, not an approved impact relation

**Why**: Rerunning the tracer per (15)'s falsifier only added review questions without an impact boundary; prior analysis linked import evidence only to Python paths even in JS/TS repos, leaving Axios/Undici's q5 not_measured.
**Prior**: Per 2026-08-15 (15)'s falsifier condition.
**Decision**: The analyzer reuses infer_imports as bounded internal evidence common to JS/TS/Python. meaningGate.reviewQuestions marks [observed - impact] with a boundary count; no depends_on approval relation, new public field, or write path is added, and observed q5 stays "weak" pending separate exact-evidence review.
**Dissent**: Running an import scan every analysis increases time for large repositories, and static imports risk being over-read as runtime impact or a business relation.
**Falsifier**: If a large-repository trial exceeds the allowed bounded-scan time, production imports fail to reproduce exact source witnesses, or an evaluator mistakes the observed question for accepted impact, this is reconsidered.
**Owner**: owner

## 2026-08-15 (15) — Meaning correction starts with the tracer for the existing output contract

**Why**: PO council convened on whether a new meaningGate.diagnostics field would expand the public MCP contract; candidate-packet transport was lossless, but H2/Axios/Undici source-hidden evaluation still left scope/domain/ability/impact and omitted-behavior gaps.
**Prior**: none
**Decision**: The first calibration only strengthens existing meaningGate.reviewQuestions and implementationEvidence.reviewRequiredCapabilities.reason to surface insufficient scope evidence, README-only domain boundaries, implementation-only capabilities, unmeasured impact, and future/negated/deprecated evidence as grounded questions; no new field/tool/UI/writer/score or auto-write.
**Dissent**: Without a proposal, early analysis is hard to structure by severity/action using only existing fields, so meaningGate.diagnostics should be added now.
**Falsifier**: If existing fields plus the tracer can't reproduce the q1-q6 gaps and next actions across three trials, or the same consumer repeatedly needs field-joins, an additive diagnostics field is reconsidered.
**Owner**: owner

## 2026-08-15 (14) — The candidate packet was lossless; meaning correction comes next

**Why**: Rerunning source-hidden evaluation on (13)'s Candidate Envelope Probe packet: all three H2/Axios/Undici packets kept identical reviewPlan body, row order, and digests after a JSON round trip, with missing/foreign/truncated mutations detected and sourceHidden:true, canWrite:false, no writePlan preserved.
**Prior**: Follows from 2026-08-15 (13)'s Candidate Envelope Probe.
**Decision**: No new candidate handoff envelope, public field, tool, UI, storage, or writer is created; add a candidate-packet gate to the field-trial skill separating candidate evaluation from persisted-vault handoff. Next slice is semantic/evidence calibration on H2's scope/domain/ability/impact and Axios/Undici's omitted-behavior gaps.
**Dissent**: The low complete rate in packet-only results should be read as an analyzer failure requiring new transport/schema.
**Falsifier**: The transport hypothesis is falsified because the same packet preserved body/digest/order across three trials yet the evaluator still returned the same semantic/unknown results; the dissent is recorded as losing.
**Owner**: owner

## 2026-08-15 (13) — Judge candidate handoff with a scratch probe first

**Why**: After tying qualification claims to an exact reviewPlan, three fresh OSS trials showed the source-hidden evaluator sometimes sees only a starter vault or a manual envelope: H2 and Axios scored 0/6 starter-only, while Undici's manual exact full body (9/9) still yielded not_qualified/canWrite:false/hard_block.
**Prior**: none
**Decision**: No new public MCP/CLI tool, schema, UI, storage, writer, or auto-write. First run an unmodified scratch Candidate Envelope Probe delivering reviewPlan, planDigest, sourceDigest, planRevision, requiredGapIds, and all full bodies as-is, checking deep-equal body/order/digest and fail-closed mutations; if lossless across three trials, skip this slice and move to semantic calibration.
**Dissent**: The current MCP response already returns full body/digest/gap, so a separate handoff boundary may be redundant; H2/Axios's 0/6 may be a harness error, not a transport problem.
**Falsifier**: The handoff slice is dropped if unmodified delivery reproduces identical body/order/digest and matches manual-envelope results across three trials with no-write preserved; built only if payload equality breaks or mutated rows pass.
**Owner**: owner

## 2026-08-15 (12) — Bind the qualification claim to the exact reviewPlan

**Why**: A fresh trial showed the qualification packet failed to distinguish its evaluated artifact from the actual reviewPlan: Pydantic passed path/role/relation/citation checks yet left 11 proposal claims outside source-hidden scope with no impact witness, and Datasette's evaluator read only a 5-node starter vault.
**Prior**: none
**Decision**: Derive deterministic proposal coverage refs in memory from the canonical reviewPlan and check whether the qualification claim covers each concept/relation/competency/impact ref; missing, unexpected, or foreign refs fail-close qualification/admission, but a shadow admission is still returned even on failure.
**Dissent**: A manifest risks becoming a second ontology schema counting IDs while obscuring semantic truth, or blocking a valid visible-gap packet.
**Falsifier**: If a mutation matrix omitting or swapping one concept/relation/CQ/impact fails to produce an accurate diagnostic, or a valid plan's visible-gap packet can't reach partial_visible_gap, this contract is discarded and redesigned.
**Owner**: owner

## 2026-08-14 (11) — Measure self-qualification with shadow admission first

**Why**: Convened over repeated requests to minimize human approval plus a public MCP construction-lifecycle change; a fresh trial actually showed incomplete qualification and source-hidden gaps, not approval burden, giving no basis to open automatic write.
**Prior**: none
**Decision**: Keep M1.5's requirement for human approval before real writes; add a shadow-only admission to analyze_repo_structure classifying self_qualified, partial_visible_gap, human_review_required, and hard_block. self_qualified is only an observation and does not bypass canWrite, writeEligibility, writePlan, or human edit/reject/lock.
**Dissent**: This trial has no actual self-qualified row and no human reversal after auto-apply, so this contract itself could optimize an unverified approval bottleneck.
**Falsifier**: Automatic write stays closed unless 2 of 3 fresh trials produce a self-qualified row with zero unsupported claims, zero human reversal, and zero source-hidden regression; even then, exact-row write and validate-compile-finalize are verified separately first.
**Owner**: owner (approved)

## 2026-08-14 (13) — Classify MCP selector errors as argument errors

**Why**: get_concept/get_concepts rejected execution when both selectors were omitted or both selector families given at once, but exposed the error as a generic tool_error, leaving callers unable to choose a recovery path.
**Prior**: none
**Decision**: Each tool accepts exactly one selector family (slug or uid; slugs or uids for batch). Violations return the MCP invalid_arguments contract; valid selector payloads and TOML dotted-key whitespace notation are preserved, fixing runtime rejection and test error classification to the same contract.
**Dissent**: Unifying all call failures under tool_error is simpler to implement, but was rejected because it stops callers distinguishing input errors from server errors.
**Falsifier**: Reconsidered if a valid selector is rejected as invalid_arguments, an invalid selector passes via silent correction, or config repair deletes an unrelated section.
**Owner**: jinan

## 2026-08-14 (12) — Codex fresh trust and MCP registration are separate proofs

**Why**: In Codex CLI 0.147.0's fresh project registration path, the generated .codex/config.toml needed to be distinguished from actual project trust and MCP registration.
**Prior**: none
**Decision**: agent-setup --json's Codex status starts as projectTrust: unknown, registration: unverified, mcpConnection: unverified, connected: false, separate from config readiness; guidance approves fresh Codex trust at the exact project root, then checks codex mcp list and connection_info in order, falling back to the printed global codex mcp add command if ignored.
**Dissent**: Marking Codex registration complete once project config is generated was rejected for not observing the fresh trust prompt or actual server inventory.
**Falsifier**: Reconsidered if codex mcp list and connection_info can be independently reproduced in a fresh credential-less project with config-only status guaranteeing the same vault/inventory.
**Owner**: jinan (human owner)

## 2026-08-14 (11) — Client configuration, trust, and actual connection are different states

**Why**: A fresh client registration audit found a nominally healthy MCP reading the wrong vault, and Codex trust incompletion or missing Claude auth was indistinguishable from config-file existence alone.
**Prior**: none
**Decision**: mcp-verify's first contact must call connection_info and fail-closed as wrong_vault/wrong_repo_root if vaultRoot/repoRoot differs from verifier scope; agent-setup --json separates config readiness from live MCP connection, and Claude auth and Codex trust stay unknown until verified.
**Dissent**: Treating a valid config file as "connected" was rejected because it doesn't observe actual client trust/auth and vault rebinding, risking writes to wrong data.
**Falsifier**: Reconsidered if a fresh client is shown to reproduce the correct vault and MCP inventory from config file alone, without trust/auth, and never reads a different vault.
**Owner**: jinan (human owner)

## 2026-08-14 (9) — 100+ node structural stress and meaning qualification are separate gates

**Why**: A 130-node/132-edge OSS vault (5-starter plus 50+50+25 via Atlas MCP) passed validate/compile/pagination, but a source-hidden audit found typed node 129/130, citation 5/130, unknown capability 120, 4 audience CQ 0 measured, other axes not measured.
**Prior**: none
**Decision**: Node count, pagination, and compile-green are never promoted to a semantic score or qualification. A 95-point claim needs a fresh source-hidden evaluator passing 4 audience CQ, 7 axes, citation truth, closed via constructionQualification:v1 and human approval. Unmeasured fields stay `not_measured`; mismatches are recorded as blockers.
**Dissent**: none
**Falsifier**: Revisit if an independent evaluator reproduces the 130/130 claim and citations, passing 4 audience CQ and 7 axes at 95+. If numbers stay green while semantic conclusions stay empty, 100+ stress is not qualification grounds.
**Owner**: not recorded

## 2026-08-14 (10) — Consume large import responses without losing compact review

**Why**: A Locust trial produced 237 files, 277 file edges, 1,153 external imports, 105 module-edge candidates; MCP compacted results over 128 KiB into `automatic_compact`, but the CLI required a full array, treating a normal compact read as failure.
**Prior**: none
**Decision**: `index` and `infer-imports` verify compact delivery against the MCP contract and preserve queue/scan-summary/delivery provenance. Compact state disallows writes; only calls needing the threshold request the full array via `reviewMode: full` plus `allowLargeResponse: true`. Compact acceptance is not semantic `depends_on` approval; 100+ candidates are transport evidence only.
**Dissent**: "Always deliver full payload" was tested and reproduced context loss and retry cost at the 128 KiB boundary; explicit threshold/full paths stay available.
**Falsifier**: Reopen if the compact queue diverges from the actual MCP schema yet passes validation, or full opt-in stops returning the complete array while threshold stays green.
**Owner**: not recorded

## 2026-08-14 (2) — The Skills packet closes even for an independent source-hidden consumer

**Why**: The prior K1.3 review only confirmed the canonical packet via the production unit path; a new source-hidden consumer received only packet bytes (no SKILL.md) and read the gold plus 27-step fixture.
**Prior**: none
**Decision**: K1.3 is promoted to complete. The independent consumer reproduced 4 semantic labels, 2 ambiguous diagnostics, `edges: []`, and source/packet digests, preserving 27/27 ordinal, order, span, resource; it rejected exact-text changes, noncanonical JSON, forged edges, digest mismatches. The packet carries no source text or frontmatter.
**Dissent**: "Same verifier called again, no independence" is resolved since the consumer checked bytes/digest/edge/tamper via separate code; carrying original text in the packet is still rejected as source-leakage.
**Falsifier**: Reopen K1.3 if a source-hidden fresh agent fails to reproduce 27/27 step/line/digest/resource from packet-only state, or passes tamper/forged edges.
**Owner**: not recorded

## 2026-08-14 — Expert disclosure and the Skills gold packet do not discard evidence

**Why**: U1.3's summary and fail-closed passed, but expert disclosure hid CQ status/witness refs, span/digest/currentness, verdict sentences, rationale/evidence refs, and 7-axis refs; K1.2/K1.3 lacked proof of independent gold corpus and byte consumer.
**Prior**: none
**Decision**: Keep the same digest-bound artifact but expose that evidence on the expert screen as a field-level diff of session-draft changes. Skills gets a separate `agentSkillProcessGold:v1` corpus and independent digest consumer; admitted-label precision is 100%, ambiguous labels stay 0, packet carries no source text/frontmatter, keeps `edges: []`. Not a new UI verdict or vault write.
**Dissent**: "Show evidence only in raw JSON" fails basic-user speed vs expert provenance; "put all source in the packet" breaks the leakage/handoff boundary.
**Falsifier**: Reopen K1.3 clipboard-only if a consumer demands raw Markdown or fails digest/line/resource truth. Revert U1.3 if receipt/draft diff disagree or disclosure overlaps at 390px.
**Owner**: not recorded

## 2026-08-13 — Separate structural readiness from meaning qualification at the review layer

**Why**: Agent handoff and ontology-sync surfaces were exposing structural readiness together with semantic qualification, requiring an explicit separation at the review layer.
**Prior**: none
**Decision**: Agent handoff and ontology-sync expose structural readiness separately from semantic qualification; finalize goes through independent qualification and explicit human approval. topology-map-v2 canvas and desktop smoke verify as separate evidence; `query_ontology`'s payload stays open until a separate contract is set.
**Dissent**: none
**Falsifier**: Revisit if a receipt finalized without qualification/approval repeatedly produces no actual semantic errors, and all query operations provide the same stable field set.
**Owner**: not recorded

## 2026-08-13 — Activity log's agent is heartbeat > connection handshake (clientInfo.name) > null

**Why**: `activity.jsonl`'s agent display needed a defined fallback order because clientInfo.name is not an identity guarantee.
**Prior**: none
**Decision**: `activity.jsonl` agent display falls back only: heartbeat, connection greeting (clientInfo.name), then null. Permanent `created_by` stamping trusts only an intentional heartbeat; clientInfo.name is display-layer only.
**Dissent**: none
**Falsifier**: If different agents using the same name break activity distinction, display heartbeat-registration status alongside the name.
**Owner**: not recorded

## 2026-08-13 (1) — The boundary between the MCP production gate and ontology meaning judgment

**Why**: MCP tooling needed a clear boundary between operational verification and semantic judgment.
**Prior**: none
**Decision**: `tools/list`, `connection_info`, `git_status`, `git_history`, `verify`/`dogfood:walk` verify actual root and bounded metadata. `query_ontology` fixes only the operation discriminator and `compiledSummary`, leaving envelopes open. A stale receipt may show a new revision but is not finalized without an evaluator and human approval.
**Dissent**: none
**Falsifier**: not recorded
**Owner**: not recorded

## 2026-08-14 — The U1.3 expert draft is a session-only revision depth of the same receipt

**Why**: General users read only the summary for approval/blockers, while experts need to adjust the same artifact's CQ/evidence/plan without escaping to raw JSON.
**Prior**: none
**Decision**: Inside "view evidence/diagnostics," provide an editable review draft for CQ sentences, witness refs, and review plan. It exists only in the React session, never changes the original receipt/plan/digest/verdict, shows dirty state and a re-qualify boundary, and reverts to original. No autosave, localStorage, vault, or external transfer.
**Dissent**: none
**Falsifier**: Fails if editing the draft changes the receipt/digest/qualification, a new evaluator allows writes without revalidation, or fields are truncated at 390px/1023px; then remove the draft.
**Owner**: not recorded

## 2026-08-14 (7) — A source-bound MCP template does not pretend to be a portable launch

**Why**: Tracked `.mcp.json.example` and `.codex/config.toml` embed `node ./mcp/src/index.js`; copied into an empty cwd outside the MCP checkout it yields 0/1 launch, and existing wording could read as the whole config being portable.
**Prior**: none
**Decision**: No new npm/npx channel or relative-path fallback is created. `agent-setup` results label scope `source-bound` or `app-bundled` and state `portable` explicitly. `ready` still passes only an absolute source-entrypoint or installed app's bundled binary. The relative-path template stays but closes with `review` and source-bound diagnostics; "portable data" never implies a portable runner.
**Dissent**: none
**Falsifier**: not recorded
**Owner**: not recorded

## 2026-08-14 (5) — Sample Skills show the actual process

**Why**: The `/ko/skills` product sample had only a one-line description instead of numbered steps, making a normal feature look like `process unavailable` to a first-time viewer.
**Prior**: none
**Decision**: Product sample Skills must have at least two explicit numbered steps; these are static demo copy creating no ontology node or vault record. If real source has no numbered steps or scan is truncated, keep the existing `unavailable`/diagnostic state; non-numbered sentences are never inferred into steps.
**Dissent**: none
**Falsifier**: Discard and redesign the fixture/scan boundary if the sample fails 2+ numbered steps, a real non-numbered Skill auto-becomes `ready`, or reading the sample triggers a vault/MCP write.
**Owner**: not recorded

## 2026-08-14 (6) — Fail an indented frontmatter declaration losslessly too

**Why**: The four parsers only diagnosed colon-less top-level declarations and orphan list items, ignoring indented colon-less lines; such a line could sit where a relation was expected while `validate` still returned `ok=true`.
**Prior**: none
**Decision**: Every non-empty colon-less line in a frontmatter block, except blank lines, comments, and normal block scalar/list/object, is preserved as `malformed-frontmatter-line`. MCP/CLI/scripts/web parsers share the contract; validator errors, compiler issues, and health close as `needs_attention`. Local/static manifests also preserve diagnostics.
**Dissent**: none
**Falsifier**: Reopen if a normal block scalar/list/object or indented comment produces a new error, or a malformed line fails to reach compile issue and health `needs_attention`.
**Owner**: not recorded

## 2026-08-13 (3) — Correct vault binding comes before candidate recovery: 100+ is not a generation target

**Why**: `init vault-a` then `init vault-b` in the same cwd left `.mcp.json`/`.codex/config.toml` pointing at the first vault, and `agent-setup --write` did not fix it, risking 0 tools or wrong-vault starts. Separately, `infer_imports` lost per-candidate `absentEndpoints` in the compact review, proposing lookups for missing slugs.
**Prior**: none
**Decision**: Binding identity atomically merges/rebinds exactly the `ontology-atlas` entry, preserving other config; invalid/duplicate config is not overwritten, closing as example plus nonzero review. Candidate-local recovery carries its own `absentEndpoints` and read-only recovery args, zero lookup prompts for missing endpoints. Calibration freezes only at 100% citation, 0 unsupported, exact approval, non-regressed baseline. 100 is not a quota; an honest sub-100 plan is a recorded shortfall, not padded.
**Dissent**: The strongest losing argument: A/B/C should be one zero-to-100 tracer so seam defects aren't missed by separate fixtures.
**Falsifier**: If B and A's gates pass but frozen C repeatedly fails from state transfer between them and the defect doesn't reproduce independently, promote C to one integration gate; if calibration fails to hold baseline accuracy, halt 100+ for a smaller ontology.
**Owner**: not recorded

## 2026-08-13 — Bind the ontology's first entry to the meaning approval gate and parser integrity

**Why**: PO review and an MCP field audit reproduced two blockers: `index --apply`/`--quick-start` created semantic nodes without approval or a digest-bound writePlan while reporting `healthy · ready · 100/100` despite `meaningAssessment: invalid`; and one missing colon in YAML made the parser silently drop a line/relation while validate/compile stayed green.
**Prior**: none
**Decision**: First CLI entry defaults to a write-free review plan; `bootstrap`/`index --apply`/`quick-start` cannot write nodes without an exact plan digest and human acceptance. `agent_brief`/health must not report `healthy · ready · 100/100 · nextActions=[]` when meaning is unassessed; they return the first blocker instead. The four parsers preserve missing-colon/orphan-list as `malformed-frontmatter-line`, shared MCP/CLI/UI, without false positives on normal blocks.
**Dissent**: none
**Falsifier**: Unapproved `index --apply` must end review-only, byte-unchanged; a malformed-line fixture must go red then green on restore, 0 new diagnostics on normal fixtures; a semantically invalid graph shown as healthy/100/empty-next-actions fails the decision.
**Owner**: jinan (approval pending)

## 2026-08-14 — A large ontology list marks omissions and reads through to the end

**Why**: An independent Luna trial on a 500+ node vault found `list_concepts({limit:500})` returned only a large `total` with no way to reach remaining nodes; unmarked truncation contaminates later judgment, and summary-only lists failed to close body evidence.
**Prior**: none
**Decision**: `list_concepts` sorts by canonical slug, accepts `offset`/`limit`; response includes `returned`, `limited`, `pagination`, and `nextOffset` when `hasMore`. The first page is never the full census; page unions on 100+ fixtures recover the total without duplication or omission. Handoff must cite exact `get_concept({body:"full"})` evidence to mark domain/capability complete.
**Dissent**: none
**Falsifier**: Reevaluate priority if three independent sessions show the first response recovers without omission and claims verify without `hasMore`/`nextOffset`; conversely if nodes beyond 500 are ever missed, or meaning is asserted from summary alone, this stands.
**Owner**: jinan

## 2026-08-13 (2) — Implementation-path focus comes before confirming a large array

**Why**: A re-run trial on a fresh server showed Claude Code chose `reviewMode:"next"` (13 calls, 0 overflow), but Codex self-approved the second confirmation and made three 3.94 MB scans, growing the transcript to 3.8 MB; "explicit confirmation means understood cost" did not hold.
**Prior**: tests the same-day 2026-08-13 decision on 128 KiB import evidence delivery.
**Decision**: Once an FDE gets one file path, use `focusPath` before the complete import graph; `reviewMode:"focus"` is the same contract. Focus counts exact file-level static imports incoming/outgoing, returns a deterministic cursor and at most 100 receipts, no vault needed. Focus asserts only source boundary, not blast radius or `depends_on`, `writeAllowed:false`. Full+confirmation is not the default.
**Dissent**: Focus gives no help at cold start when the exact path is unknown.
**Falsifier**: If a fresh Codex/Claude fails to find `source/feature-manager.tsx` focus for Refined's feature-registration question, or picks full again, add an executable focus call to `index_project` plan or a CodeGraph integration boundary.
**Owner**: jinan

## 2026-08-13 — Large import evidence does not exceed 128 KiB on the default call

**Why**: Uncoached investigation of Pyspinel, Textual, and Refined GitHub via Codex/Claude Code with only Atlas MCP found Refined's `infer_imports` complete shape made 874 candidates / 253 endpoints at an expected 3,942,607 bytes; both clients requested `full` or re-read the whole array, spending up to a million input tokens on first contact.
**Prior**: none
**Decision**: If `reviewMode` is omitted, the complete shape returns as-is only when expected size is 128 KiB or less. Above that, with reconciliation possible, auto-return one write-free `nextRelationReview:v1`, a cursor, and a `delivery` receipt; full response needs `{reviewMode:"full",allowLargeResponse:true}`. `reviewMode:"next"` stays explicit and bounded. Import evidence remains source fact, not `depends_on`.
**Dissent**: This only stopped runaway growth, not where an FDE should start; Refined's first candidate was `action-pr-link`, not the seam `feature-manager`, and no query asks a specific endpoint's fan-in/out.
**Falsifier**: If two or more fresh Atlas-only agents again choose full+confirmation or iterate the large cursor, promote endpoint/source-path focus filter to P0. If two of three repos fail to answer boundaries via Atlas-only plan, withdraw the "FDE sole tool" positioning.
**Owner**: jinan

## 2026-08-13 — Project detail: retire the radial domain map for one grammar of rows plus ratio bars (branch B)

**Why**: The owner sent three screenshots calling the radial domain map "not great design" and "looks slapped together, redesign entirely." Its caption promised bigger domains render bigger, but a 17-chip vs 6-chip size difference was only 4.7px, two lines crossed hub text, and the same domain count was stated three times on one screen.
**Prior**: branch documents A-D (with measurements) were presented to the owner, who chose B.
**Decision**: Retire the radial map (MiniDomainMap) and card grid (DomainCompositionGrid); replace with 9 domain rows in the composition tab (shared ratio bar plus in-place expand plus a map-focus link). Branch B's spec also placed rows beside the hero, but that grew the hero to 495px and duplicated the rows twice, so the list stays only in the composition tab.
**Dissent**: Branch B's own falsifier: if clicks from this page to the map decrease versus before, the picture was serving as an invitation.
**Falsifier**: If that click-decrease is observed, revert to branch C (keep the picture, remove only false claims); branches A, C, D remain preserved.
**Owner**: not recorded

## 2026-08-12 — The write screen's name is Studio (the owner reversed the retired-name ban)

**Why**: The screen's label flip-flopped between Studio, Workshop, and Assembly Bench, and the owner rejected the third too: "I don't like 'assembly bench'.. anything else? it's fine if it's a bit more generic."
**Prior**: The name gate (`validate-messages.test.mjs`) banned "Studio" as retired; this overturns that ban by owner decision, while "Builder," "Insight," and "Ontology" stay banned.
**Decision**: The owner chose the fifth, gate-blocked candidate: "Let's go with Studio." The route was already `/ontology/studio`, so address and label now match, and it fits the wish for a more generic name.
**Dissent**: The same-day morning gate comment argued Studio was retired for a game-related exception association; that exception has since been dropped.
**Falsifier**: If the owner rejects this name a third time, or visitors fail to recognize what the screen does from "Studio," revert to a generic candidate.
**Owner**: not recorded

## 2026-08-12 — When there is nothing to open, **the Skills screen becomes a stage**, and the stage slot joins the spec

**Why**: The owner objected via screenshot: "doesn't it look spatially off? the right/bottom empty space is too much?", alongside a screenshot of the assembly-bench entry screen suggesting a similar strategy.
**Prior**: The 2026-08-11 "add a form column to the page frame" record addressed the same screen; that prescription (960 column plus cards) proved insufficient, so this adds a layer rather than overturning it.
**Decision**: When there is nothing yet to open, the Skills screen skips the header row and becomes a stage: title becomes the stage title; left rail states the destination. `PAGE_COLUMN_STAGE = "mx-auto w-full max-w-[640px]"` is added to spec, reusing the 640px already used by the assembly-bench entry screen.
**Dissent**: The 2026-08-09 owner point that a stage empty state feels different from other destinations; if this dissent is right, the split itself becomes the problem.
**Falsifier**: If the owner again asks "why is this one different," or objects to the layout jump between states, abandon the stage for balancing under the header row.
**Owner**: not recorded

## 2026-08-12 — Open review in the project body, and Skills keeps the exact rail even on a narrow screen

**Why**: PO Council approved the visual/interaction/responsive/handoff contracts for U1.3/K1.1/K1.3/K1.2; Design Council (8 seats, 2 rounds) plus Design Guardian (gpt-5.6-sol) reviewed them.
**Prior**: none
**Decision**: `Build and verify`; shipping waits for a rebuilt installed-app workbench and motion evidence. U1.3 enters only via the hero's "open review result," reading one local JSON in-session and projecting it inline below the hero, no modal/new route/vault write; default depth shows purpose, next decision, first blocker, approval, plan count. Skills keeps 340px master plus fluid detail at 1024px+, drill-in below that, restoring focus/scroll/selection. K1.3's first action is "copy packet" with source/packet digest, confirming only after clipboard success.
**Dissent**: Clipboard-only packet may hit transport limits on large skills, requiring file export.
**Falsifier**: If a clipboard-to-fresh-agent round trip fails reproducibly at the upper-bound packet size, add one file export of the same serializer bytes.
**Owner**: Owner (direction), Design Guardian (implementation), Codex (verification)

## 2026-08-12 — Construction reads the same artifact at two depths, and Skills opens with a lossless handoff first

**Why**: A request to continue implementing U1.3 (make completed O1.5 judgable by humans) and the source-bound Skills process K1.1-K1.3, following O1.5's completion.
**Prior**: none.
**Decision**: Adopted direction C: construction's basic and expert depth are the same digest-bound artifact's screen-local disclosure, not separate personas or schemas; basic always shows the next decision, blockers, and approval state, while a details view expands CQ, witness, and the write plan. Skills open in order U1.3, K1.1, K1.3, K1.2.
**Dissent**: Building K1.3 before K1.2 risks shipping an empty envelope wrapping raw Markdown, since the packet carries no semantic overlay.
**Falsifier**: If a blinded fresh agent given a K1.1-only packet does not beat a raw-Markdown control on step/line citation, diagnostic truth, recovery, and tamper detection, halt K1.3 and do K1.2 first; check right after the K1.1 source-hidden A/B, before K1.3 build.
**Owner**: owner (approved direction C and full sequential implementation); Codex (Council synthesis, baselines, implementation, verification).

## 2026-08-10 — Close evidence ingress up to the scan boundary and separate it from qualification

**Why**: Landing judgment after a public MCP contract change and three products' re-qualification.
**Prior**: the bounded meaning evidence ingress direction recorded directly below this entry (same date).
**Decision**: Maintains that direction (all three trials stayed not-qualified, 0 writes); adds a 256 KiB pre-read cap on general semantic Markdown, caps the combined three-root walk at 1,000 directories without revisits, and marks oversized/budget/broken-link/cycle as `skipped`, leaving existing caps and no-auto-write rules unchanged.
**Dissent**: This ingress is only a quality gate that code-search/doc tools could replicate, and with zero writes across trials it hasn't yet built a local meaning-asset moat.
**Falsifier**: If across two human-approved post-write trials a source-hidden agent can't reuse the vault's starting point/direction/refusal, or doesn't cut source reads/calls/time versus baseline, shrink discovery and duplicate import scan; check right after those two trials.
**Owner**: owner (approved ontology construction priority and continuation); Codex (Council synthesis, TDD, gate probe, final verification).

## 2026-08-11 — A briefly appearing surface **declares its own kind**, and adds a form column to the page frame

**Why**: Owner found three linked defects live: a dead-end toast appeared 500px away bottom-right, never auto-dismissed, and blocked arrow-key navigation while shown; all three traced to one cause (shared toast; sonner's dismiss timer stops when its close button gets focus).
**Prior**: none.
**Decision**: Transient surfaces declare kind via `data-transient-surface` (anchored/menu/sheet/notice/hint); notice/hint can't take focus, the rest close on Escape and return focus. Page frame adds a form column (`PAGE_FRAME_FORM`, 960); `/project/new` top padding moves 40 to 48. Exit-motion list is now extracted from CSS (8 rules) instead of hand-maintained.
**Dissent**: Adding the marker plants a test-only marker in screen code, conflicting with this repo's ban on `data-testid` as a runtime selector; this marker risks becoming decoration too.
**Falsifier**: If within six months an undeclared transient surface appears and a human finds a violation before any test does, the marker isn't working; then force one surface primitive structurally instead. Recheck when transient surfaces exceed 12 sites.
**Owner**: not recorded.

## 2026-08-09 — Extend the settings-sheet type dialect's **reach to the drill-in** (reverses the 2026-08-02 scope decision)

**Why**: Owner said the agent-connection settings text looked inconsistently small; an 8-screen census at 1512x900 then found 9.5px text in 42% of visible characters on that panel (versus zero elsewhere), including a label smaller than its own value.
**Prior**: 2026-08-02 "settings sheet has one type dialect" (label 12.5, description 11, 9.5 forbidden); overturns only its scope judgment, not its spec values.
**Decision**: Extends reach into the drill-in chain (`VaultAgentSetupPanel` -> `AgentClientButtons` -> `WebManualConnectPanel`) and narrows the noise exemption instead: the only 9.5px still allowed is an eyebrow label where `uppercase` is on the same className. No new tokens or ramp steps.
**Dissent**: Path codes and step badges read as micro-labels, so promoting them to 11px could feel heavy, and the drill-in's higher density could justify one smaller step by design.
**Falsifier**: If after promotion the drill-in's scroll length grows so three steps no longer fit on screen, or the owner says it now looks too big, register a separate drill-in density spec instead of reverting. Recheck when the owner reviews this panel in the installed app.
**Owner**: stark (owner).

## 2026-08-10 — Expand meaning evidence ingress within the existing read-only contract

**Why**: In O1.5, three products' original architecture/product docs and exact import endpoints didn't reach portable-proposal verification, so FDE CQ and evidence axes repeatedly failed.
**Prior**: "O1.5's first red fixes the meaning-evidence boundary before UI" and M1.5's human-approval lifecycle remain valid.
**Decision**: No new MCP tool, schema, kind, or UI; `semanticEvidence` reads root `ARCHITECTURE.md` and `docs/`/`site/`/`website/` as bounded discovery (200-file cap, archive/assets/etc excluded, max 6 docs, 1,200-char excerpts). `analyze_repo_structure` also recomputes `infer_imports`'s scan in-call for TS/JS/Python; existing caps, approval, and reviewPlan/writePlan boundary are unchanged.
**Dissent**: More document candidates and import recomputation only grow packet size and proposal latency, while source-hidden quality might not improve.
**Falsifier**: If supported claims/FDE CQs don't improve across two modified trials, or re-verification time blocks field use, shrink discovery roots/scoring/import scan again, without turning unsupported claims green. Recheck right after the three products' O1.5 qualification.
**Owner**: owner (approved priority and next work); Codex (solo pass, TDD, gate probe, field re-verification).

## 2026-08-10 — O1.5's first red fixes the meaning evidence boundary first, not the UI

**Why**: Fresh Sol builder and source-hidden evaluator runs on three products all failed mandatory quality axes; one plan's validator passed while citing a `claim-review-required` README beside an ordinary source dir, and the evaluator confirmed an unsupported claim.
**Prior**: "ontology construction quality closes before Skills/UI" and "reviewPlan -> exact approval -> writePlan" remain valid.
**Decision**: O1.5 stays incomplete; work doesn't move to U1.3/Skills/Projects. The first tracer narrows the proposal citation validator's semantic boundary (no new schema/tool/kind/UI): structural candidates prove implementation existence/location only, and unlocking risky temporal/negated/deprecated semantic claims needs a separate current-semantic-evidence row in the packet.
**Dissent**: Since all writes are already blocked, the lifecycle already did its job, and building the user-visible U1.3 could come before more precise evidence repair.
**Falsifier**: If two or more repaired re-runs show no improvement in supported claims/FDE CQ/source-hidden handoff while time/calls grow, merge or remove non-performing stages, keeping human approval and separated axes. Recheck after a repaired fresh trial and the next three products' qualification.
**Owner**: owner (approved priority and next work); Codex (aggregated three trials, solo pass, minimal repair).

## 2026-08-09 — M1.5's persistent ledger extends only to the existing competency body and finalizer receipt

**Why**: Implementation hit a conflict between "first reviewPlan and final writePlan rows are identical" and "persist post-approval CQ revision/axis/gap-acceptance/prior-regression into those rows."
**Prior**: the M1.5 lifecycle decision below (reviewPlan/writePlan identity plus the post-approval persistence rule), both previously approved.
**Decision**: All three seats ruled the two rules can't both hold, since `planDigest` covers the first review plan and `writePlan` is its exact clone. Narrows the persistent ledger to the project body's competency answer/witness/visible-gap and the finalizer receipt's digest/provenance; CQ/axis/gap/regression detail stays transcript-only evidence, not claimed to survive a restart.
**Dissent**: Without persisting exact gap approvals and prior-CQ results, the lifecycle is only session-deep ritual, so M1.5 should pause for a storage decision first.
**Falsifier**: If an O1.5 fresh-process audit can't restore the same CQ/visible gap from body+receipt alone, causing even one wrong write/maintenance judgment, discard (a) and bring a separate persistence contract back to Council. Recheck right after the first O1.5 fresh-process trial.
**Owner**: owner (approved next work); Codex (found the contradiction, reconvened, decided scope).

## 2026-08-09 — Enforce the Construction lifecycle as `reviewPlan → exact approval → writePlan`

**Why**: O1.3's `constructionQualification:v1` runs with an independent evaluator but has no runtime consumer, and `analyze_repo_structure` returns `canWrite:true` and a `writePlan` before approval, source-hidden task, and prior-CQ regression.
**Prior**: "ontology construction quality closes before Skills/UI" and "Construction Qualification is a categorical per-axis verdict" both remain valid; this connects them to the bootstrap runtime.
**Decision**: M1.5 only extends `analyze_repo_structure`'s proposal-validation contract (no new tool/kind/UI): a first call returns a non-executable `reviewPlan`; a second returns the identical `writePlan` only after per-gap human approval, auto-invalidated if the plan changes. Only functional/pragmatic partial/unknown can become `gap_accepted`; red axes are never approved around.
**Dissent**: Letting humans approve functional/pragmatic red risks laundering a useless ontology into shared state as "honest partial," so all writes should stay blocked until every axis is qualified.
**Falsifier**: If two of three O1.5 products show a `gap_accepted` plan storing an unsupported claim, or the same gap stays unclosed, promote that axis to mandatory pre-write instead of discarding the lifecycle. Recheck after the M1.5 gate probe and first O1.5 trial.
**Owner**: owner (approved next work on the active track); Codex (convened PO Council, decided final scope).

## 2026-08-09 — Construction Qualification is a categorical judgment on an independent axis

**Why**: Existing structural validation and a green `meaningAssessment:v1` could still leave exaggerated source-hidden answers, with no contract to re-run one fixture from construction requirement through human approval.
**Prior**: "ontology construction quality closes before Skills/UI" (eight stages, seven axes) and "CQ quantifier integrity" (targetSet/covered/uncovered, human-sovereign/maker-independent) both remain valid.
**Decision**: `constructionQualification:v1` combines graph/source digest, separated builder/evaluator, human-owned CQs, an exact-text claim ledger with citation checks, a source-hidden task, and seven axes, passing only when all pass together; `coveredTargets` input has no authority and is re-derived. Output is only qualified/not_qualified/invalid, never an averaged score.
**Dissent**: If all seven axes must pass, a small initial ontology can never pass, and teams will just paint axes green ceremonially.
**Falsifier**: If in two of three O1.5 trials an honest unknown/partial still supports the next safe action but binary qualification blocks real use, let a human owner declare a per-scenario readiness profile and mandatory-axis set instead of averaging axes. Recheck after M1.5 connects and O1.5's claim ledgers are gathered.
**Owner**: owner (approved next work); Codex (implemented O1.3, gates, documentation).

## 2026-08-09 — The workshop does not dress up an evidence-less empty relation as a recommendation

**Why**: Workshop displayed the first empty UP socket and same-domain/name-similar candidates as `is_a` recommendations, violating the meta-model rule that same-domain/name similarity/folder nesting are not subsumption evidence.
**Prior**: the 2026-08-09 meta-model decision and the O1.2 -> O1.1 -> O1.3 order remain valid.
**Decision**: Keeps the four fixed compass directions, but the empty-socket state is always neutral; "recommended"/amber "expected" needs a target-specific `rationale + evidenceRefs + safe_to_add preflight` receipt, and since none exists, zero runtime recommendations is honest. `is_a` candidates are restricted to the same kind and surfaced via neutral Browse, not auto-recommendation.
**Dissent**: Removing the first socket's indigo guide and amber "expected" could lower first-relation completion for beginners, but the guide was pushing an unproven assertion, not a correct next action.
**Falsifier**: If time to a first valid relation repeatedly grows versus baseline, or users stall twice saying there's no recommendation, add O1.3's CQ/evidence collection or a neutral start guide instead of reverting to recommendations. Recheck when O1.3 produces real evidence receipts or the stall recurs twice.
**Owner**: owner (approved O1.1 execution); Codex (implementation, verification).

## 2026-08-09 — The Atlas meta-model is canonical only as long as it does not hide the current implementation's boundary

**Why**: The writer creates only 5 kinds while the reader reads 6 including the reserved `vault-readme`, and `broader` exists in schema/validator/Workshop but is absent from the public MCP relation enum and spec relation table.
**Prior**: "ontology construction quality closes first" and the O1.2 -> O1.1 -> O1.3 order remain valid; the falsifier hasn't been observed.
**Decision**: `docs/ONTOLOGY-ATLAS-SPEC.md`'s meaning-model section is the sole public canon for the 5 kinds, relation semantics, `is_a` determination, and RDF/OWL/SKOS/SHACL non-conformance; `broader` is absent from the public relation enum, so it's patched via `patch_concept` with `get_concept`'s `mtime`, verified by `validate_vault`. Same-domain/name/nesting are not `is_a` evidence.
**Dissent**: This is a generic, easily-replicated glossary, and since dogfood uses zero `document`/`broader` instances, the current green suite doesn't prove the new contract is real (strongest from PO-evidence and PO-wedge).
**Falsifier**: If a source-hidden human and fresh agent judge folder/team/workflow and `is_a` direction correctly three times using only the spec, shrink this to an honesty note; if they keep diverging even with the new canon, hand the problem to O1.3's evidence/CQ judgment. Recheck at 3 comparison runs or a failed 2-hour deletion probe.
**Owner**: owner (approved next work on the active track); Codex (convened PO Council, decided scope).

## 2026-08-09 — The current MCP inventory derives only from the active runtime registry

**Why**: Raw `initialize.instructions` claimed `33 = 19 + 14` listing 16 write tools while `tools/list` returned `35 = 19 + 16` in full mode; read-only instructions kept advertising 16 write tools while `tools/list` had only 19 reads.
**Prior**: "the standard for documentation checks" and "trust contract closes first" (M1.4 order) both remain valid.
**Decision**: Filtered `TOOLS_FOR_LIST` is the sole executable canon for both the raw initialize inventory and `tools/list`; header, names, and counts are generated mode-aware so full and read-only always match their own session's `tools/list`. Fixed counts and duplicated lists are removed from Settings/starter/prose in favor of `tools/list`/`mcp-verify`.
**Dissent**: The smallest fix is deleting the optional detailed inventory entirely and exposing only the protocol-authoritative `tools/list`, since no behavior log shows an agent missing a tool from the count mismatch.
**Falsifier**: If fresh Codex/Claude/Cursor pick the right scope and first safe action from `tools/list` alone across three runs with no wrong write calls, or the detailed list measurably pressures context, shrink the formatter to a short summary and delete the detailed list. Recheck across three clients or after one working day.
**Owner**: owner (approved M1.4 execution); Codex (convened PO Council, decided final scope).

## 2026-08-09 — quick-start does not promote partial success to completion

**Why**: A fresh fixture reproduced bootstrap/MCP exiting nonzero while still printing green "quick start done," "bootstrapped," "MCP already wired," and an agent prompt; the packed install printed the same text even when quick-start itself failed from a missing runtime import.
**Prior**: "trust contract closes first" (M1.3 order) and "agent config ready means a supported launch shape" (ready/live separation) both remain valid.
**Decision**: Quick-start treats scaffold/config write, bootstrap, and live MCP verification as separate states. A nonzero exit returns that code with no success text, instead showing a recovery block with partial-success state, the `mcp-verify` diagnostic, and a retry command. Source checkout and tarball install share one wording/exit contract.
**Dissent**: Automation reads the nonzero exit anyway, so the human-facing completion text could stay, and showing the agent-restart step even on failure is less blocking.
**Falsifier**: If the recovery block makes users think written config disappeared, causing repeated init/overwrite, or recovery time is repeatedly shorter under old mixed output, refine the wording without reviving false-success text. Recheck if this reproduces in two environments.
**Owner**: owner (approved M1.3 progress); Codex (implementation, packed runtime verification).

## 2026-08-09 — `ready` in agent config means a supported execution shape

**Why**: An install-app audit found a normal source-checkout config judged `0/3` while a nonexistent npm launch was judged ready, and `.mcp.json.example` was counted in the denominator.
**Prior**: "the app carries MCP" (bundled stdio binary and source-checkout fallback only, npm discontinued) remains fully valid; this turns that boundary into an executable check.
**Decision**: Ready recognizes exactly two launch shapes: source is `node` plus the absolute path `.../mcp/src/index.js`; bundle is the absolute `ontology-atlas-mcp` executable with empty args. CLI verifies the target is a real file; the active denominator is exactly `.mcp.json` and `.codex/config.toml`, examples marked as templates, and ready is never merged with live verification.
**Dissent**: Shape and file existence alone cannot prove an agent is currently connected, so calling it "ready" is itself an overstatement.
**Falsifier**: If a fresh config with correct shape and coordinates repeatedly fails to start MCP after restart, or users keep misreading ready as a live-session confirmation, narrow the label to "configured" and move live verification to a separate layer. Recheck if this reproduces in two environments.
**Owner**: owner (approved M1.2 execution); Codex (implementation, install-app verification).

## 2026-08-09 — Close ontology construction quality before Skills and UI expansion

**Why**: Owner directed that building the ontology properly be top priority, re-researching if findings were thin, with any needed UI coming only from the design system; a prior field trial showed a structurally valid vault could still yield exaggerated source-hidden claims.
**Prior**: "fan-out cap replaced by node-eligibility gate" and the bridge-eligibility/observed-proposed-shared boundary remain valid; this adds a lifecycle around the node-eligibility check without redeciding them.
**Decision**: Fixes `docs/FOUNDATIONS.md`'s contract to eight stages (purpose/authority through prior-CQ regression) across seven separate quality axes so no total masks a red one; an LLM may draft/repair but never approves its own output. Order is M1.1-M1.4, then O1.2/O1.1/O1.3, then M1.5, then O1.5, with no new kind until O1.5 proves a repeated missing primitive.
**Dissent**: Existing node eligibility/fan-out/validator are already strong, so adding a lifecycle artifact and independent qualification will only slow the first five minutes and reduce output.
**Falsifier**: If across three product trials the new stages don't improve supported claims/CQ answers/handoff while only adding time, or information gets duplicated across canons causing drift, merge or remove the low-value stages while keeping human approval and separated axes. Recheck when O1.5 finishes or two trials show the falsifier together.
**Owner**: owner (confirmed ontology-construction priority and design-system boundary); Codex (research, execution ledger).

## 2026-08-09 — Close the trust contract first, validate the 5-kind, then open the Skills process

**Why**: The installed app and fresh MCP trials together showed finalize rejecting approved evidence, an unexecutable agent config judged ready, quick-start failures that looked like success, groundless `is_a` recommendations, and lost Skill procedure steps; owner required one work ledger that wouldn't miss anything.
**Prior**: none.
**Decision**: `docs/BACKLOG.md`'s 2026-08-09 active track is the sole status canon, in order: witness parity, executable agent readiness, relation recommendation, truthful quick-start and runtime-derived MCP inventory, 5-kind/relation/CQ verification, a source-bound Skills rail, and a narrow semantic overlay; no new kind until a missing primitive repeats across three trials.
**Dissent**: (1) To support C-level/staff usage, outcome/role/process must be added as root kinds now. (2) If Skills process is ephemeral it disappears from handoff, so it must be persisted into the ontology.
**Falsifier**: (1) If the same question fails across three products from missing outcome/role/process even with a better evaluator. (2) If exact step/diagnostic/claim keeps getting lost even given an approved digest-bound packet. Recheck when either is observed as real trial evidence.
**Owner**: owner (approved start of implementation); Codex (wrote the execution ledger).

## 2026-08-09 — Extend the arrow cleanup to **every document rendered on screen** (the boundary is "does a user read it")

**Why**: Owner said "do the rest too"; a full census found the Markdown side was larger than expected, so the boundary became "does a user read this" rather than "is it Markdown."
**Prior**: none.
**Decision**: Removed em dashes from `docs/CHANGELOG.md` (1,722, at /changelog), `docs/guide/**` (148, at /guide), and `docs/ontology/**` (105, vault nodes); excluded `docs/DECISIONS.md` (append-only) and agent-read files. Substitution now splits at replacement time, after one fix-up regex wrongly treated the demonstrative "i" as a particle and corrupted 6,700 lines (fully reverted).
**Dissent**: none.
**Falsifier**: not recorded.
**Owner**: not recorded.

## 2026-08-09 — The "30 kinds" of surface combinations was **a count mixing two layers** (14 surfaces, 17 controls)

**Why**: Owner said "proceed with option 2" (fold 30 surface combinations to 4-5 roles); starting the census found the premise was wrong.
**Prior**: none.
**Decision**: 17 of the 30 were buttons/chips already owned by `controlClass` (8 tones x 8 shapes); only 15 are ownerless surfaces. A radius of `3.35544e+07px` is Tailwind v4's computed `rounded-full` value, not a defect. One real drift found: `/projects`'s metric strip used the map-panel-only token, fixed to `overlay-1`. The 14 surface kinds are not folded now since most differ by genuine role.
**Dissent**: 14 is still too many, fold it now.
**Falsifier**: If building a new surface finds none of the 14 kinds fit, the roles are real; if "why is this different from that" comes up, fold them. Recheck the first time a new surface is created.
**Owner**: not recorded.

## 2026-08-09 — Remove **every** arrow from UI copy (cap becomes ban)

**Why**: Owner said "do all of it perfectly starting from item 1," replacing the prior screen-by-screen plan with a growth cap.
**Prior**: the earlier round's screen-by-screen plan with a growth cap, replaced here by full removal.
**Decision**: Removed all 494 em dashes (230 Korean, 264 English) using period/colon/parenthesis rules; 19 mechanically-broken cases were hand-fixed. The cap became an outright ban at 0. Six component tests asserting whole sentences broke and were rewritten to match only the fact-carrying fragment, per the existing ban on pinning whole human-written sentences.
**Dissent**: none.
**Falsifier**: not recorded.
**Owner**: not recorded.

## 2026-08-09 — Give depth **only where meaning lives** in example docs, and remove arrows from the vault

**Why**: Prior record's leftover task: of 125 example documents, 113 were the same length (~176 chars), reading as machine-stamped.
**Prior**: the previous record's leftover task (113 same-length example documents).
**Decision**: Not all 113 were lengthened: 9 domains and 8 decision-heavy capabilities got real depth where meaning lives (domains 165-386 to 376-522 chars; capabilities up to 556), while 61 elements stayed one-liners. About 40 em dashes introduced while adding depth were removed (93 instances, 66 documents); the gate now also bans them in the example vault.
**Dissent**: none.
**Falsifier**: not recorded.
**Owner**: not recorded.

## 2026-08-09 — Make the example vault carry **what the product means to show**

**Why**: Measuring the domain-bar decision's own fork condition found the sample vault's capability ratios sat at 38-57% (nearly flat) versus the real vault's 8-60%, so the demo showed the product weaker than it is.
**Prior**: none.
**Decision**: Added domains/loyalty (83%, a planned-but-unbuilt area) and 6 elements to domains/inventory (50% to 29%), widening ratio spread to 29-83%, and added tests/contract/sample-vault-integrity.contract.test.ts checking real slugs, unique uids, and ratio spread of at least 0.4.
**Dissent**: "Deliberately making the demo uneven makes the product look bad."
**Falsifier**: If a first-time viewer reads the sample as "this product's data is messy" rather than noticing under-evidenced areas, the dissent is right.
**Owner**: not recorded.

## 2026-08-09 — The domain bar states **composition, not size**

**Why**: Owner asked for a better graph than the old length-coded bar; measured at 1440x900 on /ko/projects/ that the smallest domain still filled near half its track (100/94/88/82/76/65/53/47%) using 414 of 685px (60%) of card height, while the same numbers were already printed as text.
**Prior**: 2026-07-26 color decision (grayscale plus one indigo) stands.
**Decision**: Changed the bar's denominator from the list's max value to each row's own sum, so the track always fills completely and only the boundary position (capability-to-element ratio) is read, with zero new data and unchanged colors, row count, and order; a radar/spider chart was rejected per Cleveland and McGill (1984) encoding accuracy and because 8 domains have no fixed axis order.
**Dissent**: The same design pass flagged that if real vaults' ratios cluster like the sample vault's (38-57%), this ink goes silent too; measured this repo's real vault at 8-60%, so it doesn't, but the sample vault's flatness is left as a separate task.
**Falsifier**: If real users' vaults also cluster their boundary at one point, this decision is wrong.
**Owner**: not recorded.

## 2026-08-09 — There is no spec for the box's shape: first **pin a cap with a ratchet**

**Why**: Owner asked what's not yet built on the design system; measuring boxes at 1440x900 across 10 screens (76 boxes) found 30 distinct surface combinations (radius x border color x background), all individual values inside the ramp but combined arbitrarily.
**Prior**: none.
**Decision**: Did not reduce the 30 combinations to roles now, since that is a per-site design judgment across dozens of files; instead locked today's value of 30 as a ceiling in tests/e2e/surface-vocabulary-ratchet.spec.ts, which lowers only when the count drops, requiring a "system" convening before any new role is added.
**Dissent**: "A ratchet is deferral; the spec should be set now."
**Falsifier**: If the ceiling blocks legitimate work, deferring was wrong; if 30 never drops over months, the ratchet only blocked without forcing improvement.
**Owner**: not recorded.

## 2026-08-09 — Set the **page frame** for list-shaped destinations as spec (`PAGE_FRAME`)

**Why**: Owner asked why /insights, /projects, and /skills have different top spacing despite a design system existing; measured at 1440x900 that spacing to title (48/32/20px), left-right gap (40/40/32px), and max width (1600 JS constant/1600 CSS token/1400 hardcoded) all differed.
**Prior**: 2026-07-26 decision that spacing is not forced onto a ramp stands.
**Decision**: Defined PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW once in src/shared/ui/page-frame.ts, zero new CSS tokens, adopted by /projects, /ontology/insights, /skills. The full 48px comes from top padding alone (md:pt-12), after a first spec attempt (top-40 plus items-end) failed under measurement. Moving the frame into the shell was rejected, per the 2026-08-07 bottom-bar decision.
**Dissent**: "Just extract one top-spacing token"; rejected since it wouldn't stop drift on the left-right or width axes.
**Falsifier**: If a member screen must legitimately break from the frame, or /skills's 1600 width is shown to break a two-panel layout, the frame is split per axis.
**Owner**: not recorded.

## 2026-08-09 — Build Skills as a **separate destination** (the owner reversed the same-day council's "LNB not yet")

**Why**: A same-day 5-seat council had converged on CLI-first with LNB deferred, but the owner overturned it on the spot ("it should be in the app screen"), since the council's sole reason for deferring, not knowing usage frequency, was something the owner already knew and no council seat could observe.
**Prior**: overturns the same-day 2026-08-09 record "Will Atlas Answer for the Agent Skill Bundle?"
**Decision**: Build a read-only /skills route and rail destination showing when a skill fires, what opens, and what executes, via the official 3-tier load order; the user picks the folder each time with no memory and no new native permissions, and four constraints (no vault writes, no kind: promotion, no risk scores or badges, no editing skill files) remain in force.
**Dissent**: "Moat" seat: inventory will still read as a security audit tool.
**Falsifier**: If the first question a first-time user asks is "is this safe?" rather than "when does this skill fire?", the dissent is right; a second dissent notes the call-chain feature exceeds council-approved scope, falsified if people rarely expand it.
**Owner**: owner (accountable).

## 2026-08-09 — Should Atlas answer for the agent's **skill bundle**? Only a read-only inventory slice, LNB not yet

**Why**: Convened over a candidate new LNB surface; the convener re-verified the claim that execution code changed silently overnight and found it false (git status empty, no commits since 2026-08-07, last real change fa0fa64 on 2026-07-16), leaving only static-size evidence (60 loaded skills, 509 files, 89-92 executables, reference depth 6, no audit tooling despite docs demanding audits).
**Prior**: 2026-07-29 "do not build a skill editor," still valid; its non-compliance (a bootstrap path writing into others' SKILL.md) was found and referred to #1006.
**Decision**: Build one read-only skill-inventory slice reading only installed_plugins.json's installs, surfacing name collisions, trigger overlaps, and broken self-folder references; no vault writes, no kind:, no risk scores/badges, no script-content analysis, no new LNB yet. Precondition: block bootstrap writes of uid/kind into others' SKILL.md, done as #1006.
**Dissent**: "Moat" seat: inventory still reads as an audit tool and loses to dedicated scanners. Convener's own second dissent: with the silent-update claim retracted, remaining evidence proves "hard to manage," not "dangerous."
**Falsifier**: If the first question a user asks after trying this slice is "is this safe?", moat is right; if an auto-update that actually changes executable content is ever observed, the danger concern is restored.
**Owner**: owner (accountable); appetite 2 days.

## 2026-08-07 — The bottom tab-bar reserve is **owned by the page** (reverses the previous day's "move it to the shell" recommendation)

**Why**: A 2026-08-06 audit had recommended the shell own the bottom-tab-bar reservation after fixing the gateway's missing one; re-measuring to implement that recommendation at 390x844 found /topology and /docs don't scroll and correctly must flow under the bar, while /, /ontology/insights, /projects, and /project/*/edit scroll and correctly must avoid it.
**Prior**: overturns the 2026-08-06 recommendation to move the reservation into the shell.
**Decision**: Keep the reservation owned by each page, not the shell, and widen tests/e2e/scroll-end-gap.spec.ts to 17 routes x 3 widths (1280/768/390), judging only scrolling surfaces; this gate did catch the gateway's original omission.
**Dissent**: the prior day's own reasoning, that per-page reservation will recur as an omission (#65-style drift) since the shell owns the scroll container; not weak, since the gateway's omission happened exactly as predicted.
**Falsifier**: If a new screen passes the scroll-end gate yet is still covered by the bar (a non-scrolling surface needing avoidance, or a screen outside the audited routes), moving the reservation to the shell would have been right.
**Owner**: stark (delegated review).

## 2026-08-06 — Converge the shadow ladder to hand-written geometry 0, keep **the map panel's second ink ramp**

**Why**: A full design-system audit found 3 gate holes and 4 hand-written shadow geometries off the shadow ladder.
**Prior**: none.
**Decision**: Zeroed 4 off-ladder shadows (button.tsx, a ProjectSelectorPage card, a ProjectForm sticky bar) to ladder values, deleted the unused --color-shadow-a16 token, and changed the shadow lint rule from whole-value to per-layer (0 violations on enable, lint totals unchanged). Left the map panel's second ink ramp unconverged, locking it into a contract test instead.
**Dissent**: converging the panel ink ramp to global values would raise contrast (e.g. secondary 7.14 to 12.23), but was rejected because that would flatten the panel's deliberately compressed ink hierarchy and its own distinct hue family, and design.md states map values are research-based.
**Falsifier**: If panel readers report they can't read secondary text, or a later audit finds the panel ink values hand-adjusted without a ledger update, converging to global values would have been right.
**Owner**: stark (delegated review).

## 2026-08-05 — Touch contract: icon shape is fixed, **`--control-h-*` promotion is left to owner judgment**

**Why**: Accessibility round 2 measured that shape:'icon' controls (51 spots) never get the coarse-pointer 44px touch promotion, since that promotion only reads 8 CSS tokens this shape never emits.
**Prior**: none.
**Decision**: Added touch-hit-expand to the icon shape's value layer, widening only the hit area under pointer: coarse, zero layout shift, zero measured overlap across 8 mobile routes. Left --control-h-sm/md/lg (28/32/40) unpromoted: at 390px across 5 routes, 21 of 38 sub-44px controls have under 12px neighbor clearance and would overlap if widened.
**Dissent**: "Having set a 44px contract and not honoring it is worse, promote --control-h-* now"; rejected as a mobile-wide density decision needing per-site review, not a value-layer switch, since 32px already meets WCAG 2.5.8 AA.
**Falsifier**: If the owner finds controls hard to tap on a real device, promotion was right; if promoting is observed to reduce visible items per screen, keeping as-is was right.
**Owner**: stark (owner).

## 2026-08-05 — Focus: **the base lays the floor**: no hand-fixing 104 spots

**Why**: After covering 106 spots via controlClass's FOCUS constant, a full source sweep found 104 interactive elements across 53 files (rail, chrome, hand-written buttons, inline links) still bypassing the value layer and drawing the browser's default OS focus color.
**Prior**: none (follows the same pattern this repo already used for cursor policy in globals.css base).
**Decision**: Added a zero-specificity (:where()) base focus-visible rule (2px solid var(--color-indigo-a46), outline-offset -2px) covering buttons, links, role=button, tabindex not -1, excluding programmatic focus; added outline-none to 3 components missing it. Measured across 10 routes: 202 elements, 197 correctly focus-visible, 197/197 with a visible indicator.
**Dissent**: "Pull the remaining 104 into the value layer instead"; rejected since each bypasses it for a different legitimate reason and cursor policy already lives in base the same way.
**Falsifier**: If outlines are observed overlapping neighbors in tight rows, or a component's own ring is hidden by the base outline, the design needs adjustment.
**Owner**: stark (owner).

## 2026-08-05 — Four-subagent parallel audit: the value layer **had no focus ring**, and the color gate **had never run**

**Why**: After the solo auditor reported "0" and was overturned three times, the owner split investigation (4 parallel read-only subagents) from remediation (1 agent); value-layer primitives had zero occurrences of "focus" (Chip, IconButton, RowButton, the main rail nav all drew OS-default focus), and check:tokens was defined but called by no script, workflow, or pre-commit hook, so it never ran.
**Prior**: none.
**Decision**: Built tests/contract/focus-ring-presence.contract.test.ts; wired check:tokens into CI, widened its scope, which found ::selection and --topology-blocking-composer-shadow hand-copying token values instead of referencing them, and found and deleted src/shared/lib/domain-color.ts, a dead 8-hue palette violating the grayscale-plus-indigo charter.
**Dissent**: "Fix the remaining 34 hand-written controls too"; rejected since each bypasses the value layer for a different reason requiring separate judgment.
**Falsifier**: If value-layer rings are observed overlapping neighbors, the ring-inset choice was wrong; once check:tokens runs in CI, a later red PR reveals how much unauthorized color entered since.
**Owner**: stark (owner).

## 2026-08-05 — "All zero" was **DOM-only**: two drawing surfaces sat outside the gate

**Why**: The owner asked whether the design system was really applied to all UI/UX after a prior "0 across all axes" report; checking what hadn't been scanned found two entire layers missed, canvas map-renderer text using ctx.font with a hard-coded weight in 4 spots, and inline SVG (MiniDomainMap) using fontSize/fontWeight as JSX attributes with no class string, rendered on only one route.
**Prior**: none (corrects the prior record's unqualified "0").
**Decision**: For canvas, mirrored the weight ramp in JS as FONT_WEIGHT (same pattern as ICON_SIZE and MOTION), applied at all 5 spots; for inline SVG, switched attributes to className so existing lint/ratchets apply. Added tests/contract/drawing-surface-type.contract.test.ts checking CSS/JS mirror parity and zero literal weight usage; swept 20 more unmeasured cases, found only this SVG dirty.
**Dissent**: "Also move canvas size constants (12/13) to the ramp"; rejected since canvas text scales by zoom and design.md requires redoing map research to change map-specific size values, unlike weight.
**Falsifier**: If a ruling later requires canvas size to share the DOM ramp, this deferral was wrong; if another drawing channel (WebGL, OffscreenCanvas) appears, the current regexes are insufficient.
**Owner**: stark (owner).

## 2026-08-05 — Off-ramp value **0** (DOM-only): paid off all 205 remaining cases, and my analysis was wrong along the way

**Why**: The owner pushed back on two prior deferrals covering 104 line-height ratio cases and 103 icon-size ties, and re-checking found the line-height analysis had compared candidates against only 8 px steps, missing 2 ratio steps in the ramp; with the full ramp, 95 of 98 cases moved 1px or less and 0 moved over 2px.
**Prior**: corrects the analysis behind the two preceding 2026-08-05 records on line-height and icon-tie deferrals.
**Decision**: Paid down all 205 remaining cases (102 line-height ratio cases matched to nearest full-ramp value, 2 held-back cases resolved, 103 icon 13/15 ties resolved via an adjacent-step window within plus or minus 1px). Verified with two builds across 12 routes: identical document heights, 13 of 364 marks moved over 2px (max 4px), no new overflow.
**Dissent**: "Also pay down ratio cases that are 1px or less and loosen readability (36 spots)"; rejected as an invented threshold applied in bulk to Korean readability judgments.
**Falsifier**: If any screen shows visible line-height change after this, the pixel-0 measurement was wrong; if the installed app's font rendering differs enough to change perceived leading, the web-build measurement was insufficient.
**Owner**: stark (owner).

## 2026-08-05 — Split line-height debt **into two kinds**: 86 numeric cases go to pixel 0, ratio cases go to design judgment *(partially reversed, see record above)*

**Why**: The 2026-08-04 line-height finding had over-generalized the whole axis as "not mechanical," but re-measurement split it into numeric leading classes (leading-4 through 7, 86 cases), which match the ramp's px values exactly, and ratio classes (relaxed/snug/none/tight, 104 cases), which don't.
**Prior**: corrects the 2026-08-04 record; itself later partially overturned by the 2026-08-05 record resolving the remaining 205 cases.
**Decision**: Moved all 86 numeric-class cases to the ramp with zero pixel movement, verified via paired 12-route build comparison (identical heights, 0 of 364 marks moving 2px or more). Left the 104 ratio-class cases untouched since replacement isn't mechanical (relaxed+text-label would tighten 1.88px), recording measured movement for a future pass.
**Dissent**: "Also pay down ratio cases that are 1px or less and loosening (36 spots)"; rejected as an invented threshold used to change Korean readability in bulk.
**Falsifier**: If any screen shows line movement after the numeric-class replacement, the pixel-0 measurement was wrong; if the later ratio-class pass finds different movement than recorded, font loading state differed.
**Owner**: stark (owner).

## 2026-08-05 — Owner visual review: weight/icon change **all 3 falsifier conditions unobserved, so kept**

**Why**: Carrying out a re-review condition set by three prior weight- and icon-axis decisions, requiring the owner to view the built screens directly.
**Prior**: re-review of the "weight axis was never closed," "700 still rendered after closing it," and "icon ramp had zero consumers" decisions.
**Decision**: Compared a worktree build of the prior commit (3c1d33c40) against current main at the same viewport and routes rather than simulating old values at runtime; all three falsifier conditions (titles bolding, button labels thinning, digits blurring) were unobserved, so all three prior decisions were kept and values were not reverted.
**Dissent**: none recorded.
**Falsifier**: If the owner later observes the weight feels off in the installed app (not a web build), reopen.
**Owner**: stark (owner, after viewing comparison images: "good").

## 2026-08-05 — 700 was still being rendered **even after** closing the weight axis: a defect where the value doesn't stick

**Why**: Re-checking a built static export after #942 supposedly closed the weight axis (216 named-step spots moved to the ramp) still found 700 rendered in 8 spots, because <b> without an explicit weight class defaults to the browser's bold=700, outside the ramp and outside any source scan's view.
**Prior**: corrects #942, which had only half-closed the weight axis.
**Decision**: Added tests/contract/implicit-bold-weight.contract.test.ts (baseline 0) requiring an explicit weight class rather than banning 700 specifically; moved all 8 spots to strong (650), matching sibling convention, while font-normal(400) still passes as an explicit "turn off emphasis" declaration. Re-measured a static export across 8 routes: weight, radius, and font-size off-ramp all 0.
**Dissent**: "Stop using <b> altogether, unify on <span> plus tokens"; rejected since <b>/<strong> carry accessibility semantics this repo has repeatedly refused to trade away.
**Falsifier**: If another tag-default-outside-ramp case appears (h1-h6, em, code), widen the gate to a tag list; if source stays clean but the screen shows another off-ramp value, the same defect exists on another axis.
**Owner**: stark (owner).

## 2026-08-05 — Split the design doc: not the 254KB, but **the 63KB carried every turn**

**Why**: The owner asked whether to split the docs table of contents or read everything into memory, then asked why design.md and DESIGN-SYSTEM.md exist separately; measured load costs showed design.md (63.4KB) loads on every .tsx open, larger than AGENTS.md, while DESIGN-SYSTEM.md (254KB) costs 0 unless read, and 43% of design.md was gate history.
**Prior**: none.
**Decision**: Did not split DESIGN-SYSTEM.md into files (a docs-vault node, 151 inbound references, none section-specific); instead generated a table of contents from headings, checked by pnpm design:toc:check. Split design.md into rules (kept) versus gate history (moved to .claude/rules/design-gates.md, loaded only when editing gates), cutting design.md from 63.4KB to 48.8KB.
**Dissent**: "Just merge everything into one file"; rejected since that would load 310KB on every .tsx open, the exact regression CLAUDE.md had deliberately fixed.
**Falsifier**: If a PR repeats a mistake design-gates.md would have prevented because it wasn't loaded, widen its load paths; if sessions keep reading all of DESIGN-SYSTEM.md despite the table of contents, reconsider per-section file splitting.
**Owner**: stark (owner: "if it won't be done properly, use the best method").

## 2026-08-05 — The icon ramp had zero consumers, and the gate was missing 73%

**Why**: The icon ramp (sm 12, md 14, lg 16), registered 2026-08-04 with a contract test, was found to have zero consumers of ICON_SIZE/--icon-* (216 hard-coded numbers happened to match), and true off-ramp debt was 230 cases across 41 files, not the documented 64/17; the scanner also matched only single-quoted lucide-react imports, missing 72 of 99 double-quoted ones.
**Prior**: same reasoning this repo used to delete two unused padding tokens ("a token nobody consumes isn't a spec"), applied here by building consumers instead of deleting.
**Decision**: Moved 207 already-on-ramp literals to ICON_SIZE references (0 pixel change) and paid down 127 unambiguous-step cases; left 103 cases (values 13 and 15) unresolved since the ramp's tiebreaker (neighboring type) is absent in 59 spots. Also fixed BottomTabBar rendering 4 nav icons at 17px, and added a double-quote-import gate probe plus a real-coverage assertion for both quote styles.
**Dissent**: "Pay down all 103 mechanically using the neighboring-type rule"; rejected since that rule has no type to use in 59 spots and would shrink some icons 20% with no judgment.
**Falsifier**: If a later design pass finds the type rule alone resolves all 103, this deferral was excessive; if another off-ramp icon appears, another consumption syntax is still unseen.
**Owner**: stark (owner).

## 2026-08-05 — The forbidden list is one canonical source plus subsets: merging into a single file is rejected

**Why**: The owner asked whether design-related markdown files should be consolidated into one; measuring found 3 files, not 2, with different item counts (forbidden.md 9, design.md 8, DESIGN-SYSTEM.md 14) and no two matching, with some items missing from files that already had contract tests enforcing them.
**Prior**: none.
**Decision**: Made DESIGN-SYSTEM.md's "Absolute rules (Don'ts)" the sole canonical list (15 items); made forbidden.md a declared, intentional subset (10 items) enforced as a subset, not an equal set; made design.md carry zero items and only point to the canonical list. Added tests/contract/design-donts-parity.contract.test.ts comparing dont: slug keys, not sentence text.
**Dissent**: "forbidden.md should carry all 15 or an agent reading only the resident file misses six"; rejected since the resident file's cost is paid every turn, and the six matter only when actually working on UI.
**Falsifier**: If a PR violates one of the six items missing from the resident subset, promote it to the resident file; if slugs are repeatedly deleted or changed, move the keys to a separate data file.
**Owner**: stark (owner, chose option 3 of 3).

## 2026-08-05 — The weight axis was never closed: 216 places where a comment pretended to be the spec

**Why**: A same-day earlier entry claimed the weight axis was closed, but lint only checked bracketed numeric weights; the actual majority, named steps (font-medium 115, font-semibold 94, font-bold 1, 216 spots/82 files), passed through no rule, though globals.css's own comment allowed only three non-default weights. Adoption measured 26%, versus 96%+ for tracking and shadows.
**Prior**: corrects the same-day earlier record claiming the weight axis was closed.
**Decision**: Moved all 216 spots to the ramp before enabling the gate (0 violations on enable, lint unchanged): font-medium(500) to signature(510), 115 cases; font-semibold(600) split by role, 33 titles to strong(650), 61 inline cases to emphasis(560); font-bold(700) to strong(650), 1 case. font-normal(400) stays unblocked. Fixed two scope blocks that had silently exempted several axes.
**Dissent**: the audit had recommended ratcheting the 216 cases for per-site judgment; owner rejected this ("fix in order"), since 115 cases needed no judgment and 13 precedent cases already defined the role rule for the rest.
**Falsifier**: If the 61 emphasis(560) cases draw an observation that button labels got thinner, reclassify them to strong; if the 33 strong(650) cases draw "titles got bolder," narrow the role rule; if another named-step usage appears, another consumption syntax exists.
**Owner**: stark (owner: "fix it now, in the order given").

## 2026-08-05 — Name only half of the tier ladder (that half is the honest line)

**Why**: z-index was used consistently across 11 layers, but no code recorded which layer sits above which, so the next person just raised numbers when something was hidden.
**Prior**: none
**Decision**: Registered only the 6 layers with real consumers as tokens (z-25, 60, 70, 75, 80, 100; 17 sites moved, 0 stacking change). The bottom 5 (z-10/20/30/40/50, 68 sites) stay Tailwind steps; ladder excludes values below 20, lint only checks z>=20.
**Dissent**: A half-named ladder mixes z-40 and var(--z-dialog) on one screen; accepted, but the alternatives (blind replace of 68 sites, or unconsumed tokens the gate rejects) were worse.
**Falsifier**: A real z-collision at the lower tier is observed, or a new surface picks z-40 wrong and stacking flips. Not yet observed.
**Owner**: stark

## 2026-08-05 — Filled accent buttons darken on hover (convention vs accessibility)

**Why**: Measured hover states across 17 routes found primary CTAs fail WCAG AA on hover (one button 4.70 resting to 3.51 hovering, need 4.5); measure-contrast.mjs and contrast-ratchet only scan resting-state DOM.
**Prior**: none
**Decision**: Darkened hover for filled accent buttons: --color-indigo-brand-hover: #5661c4 (contrast 5.38), applied in 15 places. Scope limited to filled buttons; tint/transparent-background hovers still lighten.
**Dissent**: Dark UI users learned "hover = lighter"; making only filled buttons invert breaks that signal. Rejected: WCAG has no short-label exception, and the split tracks the visible filled-or-not distinction.
**Falsifier**: User or owner observes confusion about whether a button was pressed, or hover not visible. Then move the signal to a non-color channel, never revert to breaking AA.
**Owner**: stark

## 2026-08-05 — Close the three axes: letter-spacing, weight, palette, and record that hover contrast was never measured

**Why**: Full audit found real drift: letter-spacing (146 files/21 values/243 occurrences), weight (13 occurrences of 560/650), palette (4: text-white x3, border-white/35). Uppercase micro-labels (194 occurrences) had no tracking step.
**Prior**: none
**Decision**: Registered a layer (dock-shadow/--radius-micro precedent): added --tracking-caps-08/10/12/14/16 at existing values, moving 213 of 243 occurrences to 0px change. Registered weight 560/650 and border rgba(255,255,255,0.35) as-is. Gate: lint error, ramp block only.
**Dissent**: The five --tracking-caps-* values just name the status quo (0.12em at 60 sites and 0.14em at 48 sites are twin peaks, no basis to collapse); accepted, kept at five so the collapse decision can be made later in one place.
**Falsifier**: If caps tracking should collapse to 3 or fewer steps, these five were excessive. Unresolved: filled indigo CTA passes AA at rest (4.70) but fails on hover (3.84, 2.87) across 15 sites; deferred to next round.
**Owner**: stark

## 2026-08-05 — Bring ramp-debt exceptions to zero: move the last 93 cases into the design system

**Why**: Owner directed a full sweep; 93 occurrences across 7 files (text-[Npx] 68, rounded-[Npx] 25) remained outside the ramp despite an earlier deferral to "design work, not a lint PR."
**Prior**: none
**Decision**: Moved all 93 occurrences to nearest ramp steps (caption/label/body/body-lg/display/hero, micro/chip/card/panel/sheet), ties broken by role. Measured 0 document-height change, 0 testid-mark shifts >=2px across 8 routes. Flipped rampDebtExemptions so an empty allowlist can't pass free.
**Dissent**: text-[8px]→9.5 (+19%) is the largest relative change, on a small project-card badge, risking hierarchy competition with the title. Rejected: 8px appears only 5 times, mixed ad hoc with 9/10/11px; a smaller step should come as a new tier, not an exception.
**Falsifier**: Owner observes the badge competing visually with the card title. Then the design-system seat decides whether to register a smaller step, not revert to scattered text-[8px].
**Owner**: stark

## 2026-08-05 — Everything clickable uses the `pointer` cursor

**Why**: Measured cursors across 1512 elements/7 routes/127 controls: a[href] used pointer (75), <button> defaulted to default (49, only 5 hand-set pointer); hand-added cursor-pointer classes were scattered across 10 files/22 spots, buttons split 5:56.
**Prior**: none
**Decision**: Everything clickable uses pointer, via one app/globals.css base rule (button:not(:disabled):not([aria-disabled=true]), summary). Removed 13 duplicate classes (22 to 8 remaining). Untouched: disabled controls, canvas map (grab/grabbing), 3 scrim surfaces (cursor-default).
**Dissent**: This app targets a native macOS workbench; native buttons show an arrow, and web convention risks reading as "a wrapped website." Rejected: consistency comes first, and reverting costs only one base-block line if wrong.
**Falsifier**: Owner or user names a "feels like a website" impression tied to cursor. Then the direction flips, still from the single base rule.
**Owner**: stark

## 2026-08-04 — Fold the workshop's parallel shadow ladder into the canonical ladder, plus an inline `boxShadow` gate

**Why**: StudioCompass.tsx hand-wrote 8 inline style={{ boxShadow }} shadows in 3 shapes, caught by no gate because the elevation-ladder guard only checks class strings, not inline styles.
**Prior**: cites the shadow ladder's earlier "unregistered 6th layer" incident (same failure, different syntax).
**Decision**: Folded all 8 onto the canonical ladder (--shadow-elevation-dock-bottom, --shadow-elevation-2 popover x6, --shadow-elevation-3 dialog x1); no new layer. Added an inline-boxShadow lint rule using the same allowlist, applied to both the global block and the ramp block.
**Dissent**: The Studio compass stage may need shallower, denser shadows for legibility. Rejected for lack of intent evidence: values were scattered across 3 variants, undocumented, one value differed from canon by only 2px (copy-drift).
**Falsifier**: Popovers in the compass are observed separating less from the stage (adjacent contrast <3:1). Then register a formal "popover on stage" layer, not scatter inline values again.
**Owner**: stark

## 2026-08-04 — Flip the color gate from rejecting registered tuples to allowing only neutrals, and remove the OS focus ring on the first-run sheet

**Why**: With pnpm check:tokens passing, 28 raw rgba occurrences survived because the gate only flagged literals exactly matching HUE_FAMILIES tuples, letting any unlisted value through (hand-copied tokens, exact duplicates, untokenized pale indigo, neutrals, canvas values).
**Prior**: none
**Decision**: Flipped the check to pass only rgba where r===g===b; everything else fails. Files where var() can't reach (canvas) are exempted per-file with a stated reason. Fixed first-run sheet's default browser focus ring via focus-visible:outline-none. Widened AUDITED_ROUTES to all 17 routes and wired judgeAdjacentMarks into the harness.
**Dissent**: "Neutral-only passes" is too broad and grows the exemption list (grew by 2 lines: starfield.ts, grid.ts) into its own blind spot. Accepted the tradeoff but added a contract checking exemptions aren't dead weight (caught and removed indigo-tokens.ts).
**Falsifier**: If ALLOWLIST exceeds 6 lines, redesign the judgment rule instead of the exemption list. Or when the adjacent-mark instrument first catches a real shortfall (currently 0).
**Owner**: stark

## 2026-08-04 — Make ‘Connect’ actionable: `connect_project_source` / `disconnect_project_source`, plus source-root inference from the vault location

**Why**: The app told users "no code folder connected" and named the next action connect_source, but nothing executed that name in MCP or CLI; only the installed app's Tauri folder picker worked. Same diagnosis-without-remedy pattern observed 3 times in one day.
**Prior**: none
**Decision**: Added connect_project_source({projectSlug, rootPath?, confirm?, repair?}) and disconnect_project_source({projectSlug, confirm?}); CLI mirrors connect-source/disconnect-source. Root inference names the enclosing git repo, else nearest manifest folder, scoring by path existence (dogfood 55/55=high). Writes require confirm:true; roots live only in a gitignored sidecar.
**Dissent**: Skip propose and auto-confirm when a git repo is found, since dogfood inference was 55/55 correct and revert is one command.
**Falsifier**: Users abandon at propose-then-confirm, or 6 months pass with zero observed wrong inferences; then auto-confirm for high confidence + git naming only.
**Owner**: stark

## 2026-08-04 — Type-size separation rejected: predicted 56, measured 2-3, type rides along with size, instead reclaim allocation 10 from link-floor-24

**Why**: Reference research (Carbon, shadcn, Fluent) predicted separating type from size could open ~56 debt sites; the design-system seat tested that estimate against control-class.ts's size axis.
**Prior**: cites the link-bottom-24 round for the 10 recovered anchors.
**Decision**: Measured first: predicted 56, actual measured 2 to 3 (1 anchor, 1 button, 1 conditional). Rejected all three separation approaches since real openings were 0-3 consumers, below the no-basis threshold, while multiplying 5x4 choices across 32 combinations. Instead recovered 10 anchor sites today's syntax already opens (anchor debt 77->67), 0 font-size change at every site.
**Dissent**: Owner approved "best direction," so a type axis should be built regardless. Rejected: approval was conditioned on validating the estimate first and accepting a small number as the answer.
**Falsifier**: If 8+ debt sites are later measured to open by type override alone, reopen the axis question. If recovered anchors are observed reading as thicker/spread, re-adjudicate.
**Owner**: stark

## 2026-08-04 — Split out ‘no evidence’ from control debt: a number that can never reach 0 is not a progress gauge

**Why**: Owner asked that debt not needing design-system treatment be excluded from the count rather than confusing progress tracking.
**Prior**: upholds the 2026-08-04 integration round (registered 30, debt 168) and value layer round 3 (no 0-1-consumer axes); verifies their category counts per site.
**Decision**: Created NO_BASIS (nothing to express, not a control), distinct from registered (can't express) and debt (not yet moved). Verification rejected 20 of a prior 24-claim headline and accepted only 4 (click-surface: 1 quick-edit scrim + 3 map-blocking backdrops, judged by inset-0 AND zero ramp-owned properties). Button debt moved 78->74, no-basis 0->4, 0 code behavior changed.
**Dissent**: Adding a category makes debt look smaller. Rejected: this round rejected 5x more than accepted (4 vs 20), and split-off sites are ones no round could ever move.
**Falsifier**: If NO_BASIS grows over two rounds, freeze it. If a split-off site is later moved into the value layer, re-examine the judgment function. If debt payoff slows after the split, re-adjudicate the category's value.
**Owner**: not recorded

## 2026-08-04 — Register the 3-step content icon size ramp (12/14/16): the first gap the field trial actually measured, the value lived in a prop channel so no gate saw it

**Why**: A real-use trial found content icons had no size spec; the tester copied a sibling because "nothing told me a different value." Owner directed a full fix with reference research.
**Prior**: none
**Decision**: Full recount of 167 lucide icon sites found the governing channel is the JSX size={N} prop, outside every gate's reach. Registered --icon-sm:12px, --icon-md:14px, --icon-lg:16px at existing dominant values (0 pixel movement), plus a JS mirror ICON_SIZE. Gated by a ratchet: mirror parity, per-file ledger of 64 off-ramp occurrences/17 files, unspecified-size ratchet, synthetic probe.
**Dissent**: Icon size should be a function of type step, not an independent ramp. Rejected: the pairing isn't 1:1 (12 serves both label-11 and body-12.5 in 77 sites). Also: enforce with lint now; rejected since the 64-occurrence debt is pixel-moving and can't clear in one PR.
**Falsifier**: If sm(12) reads too large next to caption(9.5) within two rounds, pull the micro-tier measurement forward. If the 64-item debt doesn't shrink across two rounds, revisit lint enforcement. If ICON_SIZE consumers stay 0, the mirror was over-engineered.
**Owner**: stark

## 2026-08-04 — No ramp for width: surface width is a derived value, and ‘the lightweight path for additive expansion’ documents what already existed rather than adding something new

**Why**: A real-use trial invented a width value for a detail panel, observing the gate made "just use w-96" cheaper than adding a ramp line.
**Prior**: none
**Decision**: No width ramp is created; every width token (--settings-content-measure=658, --git-evidence-min=600, --agent-panel-width, --topology-v2-panel-width) is a derived value a fixed-step ramp can't represent. The "lightweight path" already exists free: the census and design.md's triggers only watch ramp tokens. docs/DESIGN-SYSTEM.md documents this. For ramps, addition still equals change.
**Dissent**: The silence around w-96 is the real hole; add a width ratchet now. Rejected: most raw widths are one-off placements (mode is max-w-[440px] x7), not ramp demand.
**Falsifier**: If new screens keep choosing raw widths after documentation, it's a discoverability problem; add a width section to /design-build.
**Owner**: stark

## 2026-08-04 — Link floor 24: remove the 44 the value layer misquoted, and replace the inline axis with a runtime instrument

**Why**: The integration round found link cited WCAG 2.5.8 (AA, 24x24) while carrying the 2.5.5(AAA)/HIG value 44 (min-h-11), which design.md's touch contract reserves for coarse pointers only.
**Prior**: cites the integration round judgment that flagged this misattribution.
**Decision**: Changed link's floor to min-h-6 (24); coarse 44 now comes from .touch-hit-expand (coarse-only, 0 layout shift), attachable only with >=12px neighbor clearance. Deleted the inline axis (only 3 of 14 consumers were true prose). Added a fine-pointer instrument across 4 routes, catching 1 real violation (fixed to min-h-6). Anchor debt 83->77. Added .prose-link contract for true prose links.
**Dissent**: The 24 floor still pushes true in-prose links' line height; those should stay exempt. Rejected: it revives the misconfiguration path this round removed. Also: unattached coarse-44 sites need forced expand; rejected, forced attachment causes tap-stealing, the fix is spacing not attachment.
**Falsifier**: If the fine-pointer instrument stays violation-free for two rounds, widen from 4 routes to 17. If coarse mis-taps are reported at unattached sites, pull the gap-remediation round forward.
**Owner**: stark

## 2026-08-04 — Consolidation round: inventory debt-168 in one table and judge it by combination, 7 registration verifications, confirm `link`'s wrong floor (citing the 2.5.5 value as 2.5.8), and notice of promoting the mono command-tag part

**Why**: Control debt stalled at button 85/anchor 83 for three rounds with 0 new axes, since remaining sites overlapped 2+ gaps at once.
**Prior**: none
**Decision**: Re-measured 85/83 in one table; largest recoveries are "link redesign ~37" and "mono component + tint + inset decomposition ~31," not a single axis. Verified 7 deferred chrome-token candidates, moving button debt 85->78 at 0 pixel change; retired --topology-search-sheet-close-size, converged onto --overlay-close-size (coarse 32->44). Confirmed link's WCAG misattribution but deferred its fix. Promoted the mono command tag (12 occurrences) to a future component.
**Dissent**: Expanding registered is bookkeeping. Rejected: this round's verification found real defects. Also: fix link's floor now; rejected, it needs a per-site before/after table, deferred to its own round.
**Falsifier**: If the link-reset round hasn't opened after two more rounds, 44 effectively hardens as spec. If registered grows further without measurement, freeze it. If the mono component's consumer count is <=6, reconsider its promotion.
**Owner**: stark

## 2026-08-04 — Don't call the current source and a stale competency receipt by the same `source_changed`

**Why**: After "Measure again," the dogfood agent_brief reported source as verified_current/current, yet the same response's top gap was source/source_changed with next action remeasure_source, even though only the competency receipt fingerprint was stale (graph hash matched); remeasure_source wouldn't even refresh the competency receipt.
**Prior**: upholds 2026-08-02 and 2026-08-03 decisions on meaningAssessment separation and repair; keeps source_changed/remeasure_source for genuinely stale source.
**Decision**: When current source fingerprint differs only from the competency inventory's cited fingerprint, keep overall status fail-closed review_required, but preserve the source dimension as verified_current/current and emit top gap {dimension:"competency", id:"competency_source_changed"} with next action {id:"reevaluate_competency"}.
**Dissent**: Top-level nextActions[0] already points to competency repair, so the new id may only add consumer maintenance cost.
**Falsifier**: If fresh MCP consumers all already choose competency review without the new category, or agent behavior doesn't change while consumer parity breaks, a single canonical top-level action contract is considered instead.
**Owner**: stark

## 2026-08-04 — The ink-ramp boundary an open surface confirmed: codify the license instead of raising the value again

**Why**: The new a11y-open-surfaces instrument found 5 color-contrast failures: 2 indigo marks in the settings sheet (#7170ff at 4.12 and 3.91) and 3 quaternary instances in global search (#82828a at 4.38, 4.14, 4.39), all below raised-background thresholds.
**Prior**: upholds 2026-08-03's tone:'accent' split and the quaternary #787c84->#82828a raise; this instrument confirms on-screen the boundary that decision's prose had already flagged.
**Decision**: Migrated 23 hand-written accent-on-tint sites (18 files) to --color-indigo-text-soft; ratchet baseline 23->0. Converted 6 global-search sites to tertiary. Codified: quaternary licensed only on resting neutral backgrounds; raised backgrounds require tertiary; depths tertiary still fails require secondary. Added a quaternary-ink-surface contract; color-contrast baseline 5->0.
**Dissent**: Raise quaternary once more instead. Rejected: overlay compositing has no depth cap, no single value beats every depth, and raising further compresses the hierarchy step ratio below 1.06.
**Falsifier**: If tertiary substitutions exceed double-digit percent of quaternary consumers, redesign the full ramp. If a real screen needs a 4-tier hierarchy on raised surfaces, reconsider a per-surface ink scope axis.
**Owner**: not recorded

## 2026-08-04 — Rust's first evidence is not a dependency arrow but the canonical provenance of a feature condition

**Why**: infer_imports returned filesScanned:0, edges:[], moduleEdges:[] for a real repo with Rust files; a census found positive/negative/compound cfg and cfg_attr conditions making naive feature-to-file linking a false reassurance, though a bounded-receipt fresh FDE could still answer implementation location without reopening source.
**Prior**: upholds 2026-08-04 decisions on import-as-evidence and value-use-gated approval; extends 2026-08-02's bounded package-contract scope to repo-contained literal direct workspace members.
**Decision**: No new tool. analyze_repo_structure and index_project return bounded Rust feature-configuration evidence: package/feature declarations, exact path and line, separating cfg inclusion from cfg_attr attribute, predicate text, polarity, source role, counts, bounded sample, truncation status. infer_imports reports Rust use/mod graph as unsupported; 0 edges isn't evidence of no dependency.
**Dissent**: This creates no approvable dependency arrows; if only optional-feature sub-questions improve, this is a bigger commodity Rust scanner.
**Falsifier**: If two fresh Rust field trials still can't answer optional-feature implementation start or mistake unsupported for full coverage, this investment stops. If a compiler-resolved module/macro graph beats this with 0 false edges, a separate resolver decision opens.
**Owner**: stark

## 2026-08-04 — An import approval question only qualifies when there is evidence the product code actually uses the value

**Why**: Walking the full queue via source stdio found 180 candidates/472 imports: 139 production-only, 5 test-only, 36 mixed, with the second candidate being test-only plus a single import type.
**Prior**: upholds import-as-evidence and one-approvable-question decisions without overturning them; closes the gap where accurate paths existed but role/type-only status wasn't structured.
**Decision**: Every file edge now carries sourceRole: production|test|unknown and importUsage: value|type_only|unknown. Module edges compute sourceRoleCounts, importUsageCounts, and productValueCount. The review packet is eligible_after_semantic_review only when productValueCount > 0; at 0, no product depends_on question is triggered. Human approval and non-empty why remain required.
**Dissent**: Since exact .test.ts paths are already visible and test-only is only 5/180, a fresh agent could already defer correctly; the new schema may just add maintenance cost.
**Falsifier**: If fresh agents already distinguish test-only/mixed without the new fields, or misclassification recurs in real repos, revert to an instructions-only boundary. If test-only keeps reopening despite the label, reconsider a separate priority contract.
**Owner**: stark

## 2026-08-04 — The first output for import candidates is one approvable relation question, not a list of 180

**Why**: Owner directly requested: read imports, ask "these two concepts depend on each other, right?", draw the arrow only after explicit OK, never automatically.
**Prior**: upholds import-as-evidence and evidence-eligibility-first decisions; closes the gap between candidate, reading both concepts, reasoning, approval, and a single write.
**Decision**: Kept the existing 33 tools. Added a compact review mode to infer_imports returning one nextRelationReview:v1 record: from/to, import count, up to 5 file receipts, writeAllowed:false, reads for both concepts, a stop condition, no proposedAction before approval. An agent asks one explicit (from,to,type,why) question only after reading both concepts; only explicit yes triggers add_relation. New writes fail closed without nonblank why.
**Dissent**: A capable FDE could already form the same question in two calls without the new packet; the compact cursor is a common review queue adding schema maintenance cost.
**Falsifier**: If fresh FDEs already form the question within two calls using the existing contract, or re-exploration doesn't drop and approved relations don't increase, queue investment stops. If continuity breaks only after approval, MCP Elicitation is reconsidered.
**Owner**: stark

## 2026-08-04 — The first answer about impact is evidence qualification, not a number

**Why**: The same 154 relations were merged to 152 structural relations as "impact" in MCP while the app showed a settled ranking, a cross-surface inconsistency.
**Prior**: executes the second PR contract from the import-as-evidence decision cited just below it.
**Decision**: MCP/CLI/UI unify on depends_on only for impact/blast_radius; structural types route to reachability/subgraph instead. Compiled edges preserve relation_notes rationale. Impact responses return counts of declared/reasoned/needs-review/source-backed relations plus unknown completeness; current risk is unknown without source receipts. UI shows a status-first card rather than a new tab.
**Dissent**: Weakening the settled ranking may make the early product look less capable, pushing users back to repeated structural exploration.
**Falsifier**: If three real uses find no next action after "unknown," or users repeatedly reopen structural links as causal answers, a separate non-causal section is considered; structure isn't folded back into the risk formula.
**Owner**: stark

## 2026-08-04 — An import is evidence of a dependency, not a self-approving ontology relation

**Why**: PO council (5 seats) found 152 of 154 dogfood relations were containment and only 2 were actual `depends_on`, yet `blast_radius` merged structural paths into impact and returned it as a confident answer; Rust/Python source-hidden field trials also failed to produce source-backed impact for the same question.
**Prior**: Upholds 2026-08-03 "typed CQ does not mistake incomplete project meaning for completeness" and the 2026-07-30 Python/Rust field-trial `unknown` principle; keeps import as evidence, not automatic meaning, removing the contradicting CLI auto-apply path.
**Decision**: Two PRs in order. First, `infer_imports` attaches up to 5 exact file citations per module edge and returns `rationale_review_required`, blocking `proposedAction`, `infer-imports --apply`, and automatic `depends_on` writes. Second, unify MCP/CLI/app impact semantics to exclude containment from impact/risk (sent to reachability/subgraph instead). Declared `depends_on` stays visible but is `unknown` for completeness/risk without source receipt, direction, reason, and human approval; without `why` it is `reviewRequired`, with `why` it is `declaredWithRationale`, never `sourceBacked` without current receipt.
**Dissent**: Removing all structural edges from impact and leaving under-evidenced results as unknown could hurt early recall, making users feel the tool cannot answer anything (po-leverage).
**Falsifier**: If human-approved real impact relations repeatedly get stuck as unknown, or three separate field trials show the structural-only path is the only useful causal witness, structural signal is reintroduced as a separate non-causal section, never merged back into impact/risk.
**Owner**: stark (owner)

## 2026-08-04 — The first read of meaning repair is 20 executable unit calls, not derived instructions

**Why**: Source-hidden FDE dogfood restored the prior decision's `project_and_all_review_targets` to the actual 27 slugs, but the public `get_concepts(body:"full")` cap of 20 made the first provided call unexecutable.
**Prior**: The falsifier of 2026-08-03 "meaning repair's first read is an evidence-separation packet bound to the first action" was observed; classification and approval principles are kept, but the 4 KiB cap and self-materializing slugs before execution are explicitly overturned.
**Decision**: `meaningRepair:v1.workflow[0]` builds the exact deduplicated union `[projectSlug, ...sorted(domainSlugs), ...sorted(capabilitySlugs)]`, cut into batches of at most 20, and provides literal `get_concepts({slugs:[...], body:"full"})` calls; the current 27 targets become two calls of 20+7. `derivation` stays as an auditable rule in the step but occupies no execution-argument slot; `witnessCapabilities` is not reduced.
**Dissent**: Embedding concrete slugs means batch count and payload grow with the vault; if the packet exceeds 5 KiB or first-read batches keep climbing, deleting typed evidence or raising the cap again would only hide the problem.
**Falsifier**: If a normal single-project packet exceeds 5 KiB, or the first read needs 3+ batches, or a source-hidden FDE executing the literal calls shows omissions, duplicates, or tool rejection, the dissent is right; then pagination or a bounded review-read contract is designed as a new PO decision.
**Owner**: stark (owner)

## 2026-08-03 — Meaning repair is an evidence-separation packet staked on the first action, not a longer handoff

**Why**: The installed app's fresh MCP `agent_brief` knew both source `verified_current/current` and competency `partial` but left top-level `nextActions` empty, forcing the FDE to re-explore already-computed graph/source evidence.
**Prior**: Upholds the same-day "CQ quantifier integrity" and "fresh MCP source currentness" decisions; connects the `partial` those decisions produced to a human-approvable next action without promoting containment or path existence to meaning completeness.
**Decision**: `agent_brief.nextActions[0]` now carries `review_competency_repair`, pointing to a compact read-only `meaningRepair:v1` packet reporting current declarations, a structural review candidate set, a source-path candidate set, and remaining unresolved targets as separate collections (abilities declared 1/6, candidates +5, unresolved 0; evidence declared 2/20, candidates +9, unresolved 9). Candidates are not `answered` until a human approves meaning.
**Dissent**: The installed MCP response is already about 75 KiB and the handoff prompt about 22 KiB; adding a detailed repair list could bury the first action again, and a thin count-plus-slugs action may achieve the same result.
**Falsifier**: If a fresh source-hidden FDE, given only the packet, cannot restore 6/6 structural candidates, 11/20 source-path candidates, and 9 unresolved items within 5 lookups and 2 minutes, or auto-approves candidates, or the packet grows past 4 KiB, or the FDE follows generic readiness instead, the dissent is right. Implementation measured the actual packet at 3,533 bytes with 0 private source coordinates exposed.
**Owner**: stark (owner)

## 2026-08-03 — The new MCP handoff re-verifies the person's source connection on its own

**Why**: After connecting/re-measuring a source in the installed app and running `finalize_project_meaning` via the real stdio MCP, a new process's `agent_brief` showed the receipt as `verified_current` while currentness was always `unavailable`, so `verify_source_currentness` could not be executed.
**Prior**: Upholds the 2026-08-02 "source receipt read-back re-compares against current graph/source inventory" decision; closes the gap that the re-comparison existed only in the app process.
**Decision**: For a private root a human explicitly connected in the installed app, a new MCP process locally reproduces the same bounded inventory fingerprint. Only when kind, source ID, revision, and fingerprint all match the receipt is it `current`; any mismatch is `review_required / source_changed`. Permission, filesystem, or Git failures fail closed to `unavailable`. Private root and raw inventory are never exported; no new public tool, schema, or UI is added.
**Dissent**: If MCP starts re-reading private source, per-handoff I/O cost grows on large repositories and blurs the existing privacy boundary that only the app read source.
**Falsifier**: If the bounded probe noticeably delays handoff on a normal repository, or absolute root/raw inventory leaks in a response, log, or error, or app and MCP fingerprints diverge on the same file state, the dissent is right; automatic re-verification is withdrawn for a separate explicit local verification action or shared native probe.
**Owner**: stark (owner)

## 2026-08-04 — Value layer round 3: classifying the remaining 77 found not a single gap but an overlapping one, 0 axes, 1 dialect ruling (404 standard button), 5 reclaimed

**Why**: Control ratchet stalled at 113. After excluding the three out-of-value-layer categories (git chrome 15, shared/ui 10, workbench absolute-positioning 11 = 36, registered in parallel), the remaining 77 were fully classified.
**Prior**: none
**Decision**: Full classification is the deliverable. Of 77: 25 were re-judged out-of-value-layer (chrome token contract 10, scrim/overlay 5, settings-sheet contract string-locked 4, error/404 standard button slots 6), and 52 were real value-layer holes, most overlapping 2+ holes at once, so no single axis opens more than 0-1 sites; no axis, shape, tone, or token was created this round. The 404 pages' three exits were a dialect of the standard Button 3-variant (fill/outline/ghost) with AA-failing ink (4.42:1); 4 `<button>` became `<Button primary/ghost>`, one `<Link>` became `buttonVariants({variant:'outline'})` (radius 9999 to 12, type 12.5 to 14, ink #f7f8f8 to #fff, 4.42 to 4.70 AA pass, px 16 to 18). Two byte-only renames applied. The out-of-value-layer 25 and overlapping-hole 52 are registered as inputs for the next round; "mono uppercase micro CTA" (3rd consecutive round) is top priority next, checked first as a possible component rather than an axis.
**Dissent**: Self-rejected: "404 back/home exits were intentionally a quiet hierarchy (11px, tertiary ink); adopting Button ghost/outline flattens all three to weight 510/14px." Rejected because Button's variants carry hierarchy through surface treatment, not ink, and preserving ink hierarchy would preserve AA-failing ink too.
**Falsifier**: If an owner/user observation reports the 404 exits look equally weighted, the dissent was right and ghost is demoted to `controlClass link`. If a future re-count resolves overlapping holes as a prior axis opens and one axis's recovered count rises to 5+, the "0 axes" verdict is reversed for that axis.
**Owner**: design-system (design-systems seat), owner merge confirmed

## 2026-08-03 — Delete two dead primitives. Keep the `↗` allowed column, but fix the gate to stand without a consumer

**Why**: Owner instruction to make the design system complete and problem-free; the ratchet ledger had carried forward "4 dead, non-rendering primitives" for three consecutive rounds.
**Prior**: Follows the precedent of deleting `Card`/`Badge`/`DetailCard` (0 production consumers, per `control-class.ts` header).
**Decision**: Delete `src/shared/ui/{link,chip}-list-editor.tsx` and their unit tests, and remove both exports from `shared/ui/index.ts`; ratchet baseline 123 to 119. `link-list-editor` was the only `.tsx` using `data-external-link-marker`, and `label-decoration.contract.test.ts` depended on that fact, but 0 of 13 files using `target="_blank"` in production use the marker. Chose keeping the allowance column and fixing the gate instead of deleting the column, since a leading `↗` is a WCAG G201-recommended warning and the dead thing was the component, not the rule's clause. Extracted the judgment into one function `externalMarkerSitsOnExternalLink(source)` shared by scan and probe; the set that must stay non-empty is "scanned files" (already locked by `files.length > 100`), not "files using the exception."
**Dissent**: An unused allowance column is misinformation, not a specification, the same argument used to delete two dead tokens (`--pad-card`/`--pad-panel`); removing the clause simplifies the gate.
**Falsifier**: If a commit ever uses `data-external-link-marker` as a workaround (non-external link, or placed after the label), the column is removed. If production consumers remain at 0 by 2027-02-03 despite multiple external-link work items in between, that also shows the clause is dead.
**Owner**: stark (owner), executed on owner instruction, confirmed by merge

## 2026-08-03 — Tile size is one value: delete `--docs-header-tile-size` (34), every square icon tile becomes 36

**Why**: The same role (square icon tile) had two values: `/ko/docs` header 34px vs `/ko/topology` chrome 36px, each with its own coarse-pointer promotion rule.
**Prior**: none (neither the ledger nor `docs/DECISIONS.md` recorded why 34 was chosen)
**Decision**: Delete `--docs-header-tile-size`; `DocsHeaderTile` reads `--chrome-tile-size` (36px), and the duplicate coarse-promotion declaration is deleted so it inherits. The only justification found for 34 was a comment noting `ChromeTile` hard-locks 44px, but chrome tile was lowered to 36px on 2026-07-23, so 34's justification vanished that day and was never re-derived; it was a fossil of the 44px era. Measurements at 1440x900 show 3 header tiles going 34x34 to 36x36 with header band height unchanged at 44 (movement 0). Added `tests/contract/control-height-ladder-scope.contract.test.ts` checking every `--*-tile-size`/`--*-tile-height` declaration against the height vocabulary.
**Dissent**: The docs header is density-critical; even with band height unchanged, the 5-to-4 margin shrink is 20%, and if two values are valid, register both instead of assuming convergence is right.
**Falsifier**: If the docs header wraps to two lines at narrow widths, the width budget of that spot is the fix, not re-registering 34; or if the owner observes the header got bigger, that is the observation.
**Owner**: stark (owner), executed on owner instruction, confirmed by merge

## 2026-08-03 — Add a gate to ‘changing the spec calls the system’: the ruling comes from a spec census, not a file name

**Why**: A rule audit measured that design.md's rule 3 (convene design-system for spec changes) was unenforced; only 1 of 5 recent commits widening the value-layer ramp had a matching ledger entry, and `pnpm decisions:check` only watches routes and MCP/CLI contracts.
**Prior**: none
**Decision**: Add a third trigger, "spec change," to `decisions:check`. Judgment is based on a difference in the spec census (cva axes/options/defaults, ramp token names and values, exported primitive names, design.md's scale-lock numbers), not whether trigger files appear in the diff. The trigger file list lives only in `.claude/rules/design.md`. Implementation: `scripts/lib/design-spec-census.mjs`; contract: `tests/contract/design-spec-ledger.contract.test.ts`.
**Dissent**: `--color-*` as a whole should count as a ramp since color is one of design.md's five ramps; rejected because it has 200+ tokens, mostly single-surface alpha ladders, which would repeat the noise failure the repo suffered from the blanket `shadow-[` ban (lint 144 to 548). The census is narrowed to hue-defining roots (background 3, text 4, indigo 3, signal 4).
**Falsifier**: If a new hue or alpha family enters via surface-only tokens bypassing root tokens, the census widens to prefix-family set changes. If the ledger accumulates repeated false-positive notes after enabling, the census is narrowed further.
**Owner**: owner, instruction executed, confirmed by merge

## 2026-08-03 — Fill three recurring gaps in the value layer: the micro tier (radius `micro` + chip `xs`), majority default-border alignment, and reassigning the `tone: 'success'` text role

**Why**: Control normalization stalled at 123; the ratchet ledger repeatedly reported missing slots, and a rule audit (PR #890) measured the absence of a gate.
**Prior**: none beyond the ratchet ledger's own repeated counts
**Decision**: All three are registrations of values the ledger repeatedly counted, not new axes. `--radius-micro` (4px): 96 occurrences survived a 3-step ramp; machine-replaced (0 pixel movement), then eslint selectors enabled (0 violations, lint 96 to 93), registered in globals.css, `cn.ts`'s `RADIUS_RAMP_STEPS`, and contract `RADIUS_STEPS`. Chip `size: 'xs'`: set to `min-h-6`, `px-1.5 py-0.5`, caption, radius micro; non-chip `xs` aliases `sm`; 0-consumer `segment/sm` redefined to actual most-common values. Chip/pill default border divider(0.08) to border-soft(0.06): hand-set borders were 74:18, meaning the default was the minority. `tone: 'success'` migrated to `--color-success-text-a94` (0 consumers per #884), aligned to danger's role; 6 sites migrated (ratchet 123 to 117); 5 new contracts plus a named-off-ramp per-family ratchet added.
**Dissent**: Self-rejected: lowering chip/sm inset for the micro tag was rejected since sm has real consumers; promoting all 96 `rounded-sm` sites to 6px was rejected since sample review showed 4px was the micro scale's identity, not drift; converging `--docs-header-tile-size` (34) to 36 was held pending reading its documented density prescription.
**Falsifier**: If micro tags at 24px break their own line, the fix is that spot's line-height budget, not xs's floor. If 4px keeps arriving via eslint-disable after `rounded-micro` is registered, consumers are promoted to chip and micro is deleted. If chip/pill border 0.06 is reported invisible, a per-background border judgment opens.
**Owner**: design-system (design-systems seat), owner merge confirmed

## 2026-08-03 — Second correction to the height ladder: the restoration had stopped at chips and pills, an explicit floor across every horizontal-shape combination

**Why**: A residual normalization census reported that decision #884 (height-ladder restoration) reached only halfway.
**Prior**: builds on decision #884 (height-ladder restoration), not overturned
**Decision**: A full census of 6 shapes x 3 sizes (210 sites) found the two named defects were not defects (chip/pill `md`=`lg`=32 was already owner-confirmed, 26 consumers; chip 40px had 0 demand); the real shortfalls were segment/sm at 22px (below WCAG 2.5.8 floor), row/lg at 42px (outside vocabulary), card/sm at 30px (outside vocabulary, 15 sites), card/md at 34px (squatting on the chrome-locked step, 5 sites). All horizontal shapes (chip, pill, segment, row, card) get an explicit `min-h-*` floor; only these four rise (24/44/32/36; card ladder 32/36/40), everything else keeps natural height. 0 new tokens. The gate upgrades to a class gate: explicit height on every combination, vocabulary membership (24, 28, 32, 36, 40, 44), and blocking arbitrary `min-h-[...]`.
**Dissent**: chip/pill has 3 size steps but only 2 heights; should align to a 28/32/40 ladder. Rejected because `lg`=32 was already owner-confirmed and has 26 consumers; the 3 tokens are a subset of the full 7-step vocabulary (24, 28, 32, 36, 40, 44, with 34 chrome-locked), not the whole ladder.
**Falsifier**: If chip/pill `lg` is reported indistinguishable from `md`, or demand appears for heights above 32, `lg` is raised to 40. If new floors cause a single-line card to wrap, the width budget is at fault, not the floor value.
**Owner**: design-system (design-systems seat), owner merge confirmed

## 2026-08-03 — The first top-level bar for ontology construction is a qualification ruling that never lets a CQ's `each` pass falsely, not ‘a longer prompt’

**Why**: Owner requested best-in-class ontology construction via dogfooding. The vault showed structural health (71 nodes, 154 relations, 0 issues), yet `agent_brief.meaningAssessment` was `invalid`: the evaluator checked only that a witness-type array was non-empty, not obligation coverage. `abilities` answered `answered` with only 1 of 6 domains witnessed; `evidence` covered only 2 of 20 capabilities.
**Prior**: Upholds 2026-07-31 "node qualification gate, not a fan-out cap" and 2026-08-02 "typed competency witness + visible gap" / "source-hidden field trial"; does not recreate fixed node counts or aggregate confidence.
**Decision**: Adopts "Construction Qualification v2, CQ quantifier integrity." For each of the five CQ questions, derive `targetSet` and `obligations`, report `covered`/`uncovered`; `answered` is kept only when all obligations resolve, else `partial`/`visible-gap` with typed witnesses. Applies the same fixture across MCP proposal validation, internal proposal/apply, fresh-process receipt. Out of scope: new public tools/schema/UI, system-prompt rewrite, aggregate scores. Appetite max 2 days.
**Dissent**: Interpreting "each" as covering all project containment risks turning a small ontology into a game of formal completeness over real handoff utility.
**Falsifier**: If an honest `partial`/`visible-gap` proposal becomes unwritable, or Python 11/12 / Rust 16/16 baselines regress, or handoff accuracy stays flat while enumeration increases, coverage is withdrawn. Shipped: unit regression 539/539, stdio verifier 33/33; second agent restored 1/6 and 2/20 (9/12); no falsifier observed.
**Owner**: stark, owner, approved the long-term goal and first slice

## 2026-08-03 — Flip ‘padding decides height by default’: the ladder decides control height, and the `fixedHeight` axis is removed

**Why**: design.md's spec-change trigger list flags `control-class.ts` and the `globals.css` ramps; the same morning had asserted default padding decides height and added a `fixedHeight` axis to cover a leftover 2px.
**Prior**: Explicitly overturns two same-day decisions: the "default padding decides height" assertion in `control-class.contract.test.ts`, and the `fixedHeight` axis (and its 3-step expansion).
**Decision**: A single source of truth, `--control-h-{sm,md,lg}` = 28/32/40, has existed since 2026-07-25 (7 consumers) but was not consulted when the value layer summed padding+line-height+border, producing chip 24/30/34 and pill 20/22/30, none of which appear in the app's height vocabulary (24, 28, 32, 36, 40, 44). Chip/pill `md`/`lg` now sit at `min-h-8` (32px); `sm` stays 24px (WCAG 2.5.8), with pill `sm` raised from 20px to 24px. The `fixedHeight` axis and its 12 compound variants are deleted (18 of 19 consumers unchanged, 1 moves from 28 to 24). 0 new tokens. Adds a "control height ladder" section to `docs/DESIGN-SYSTEM.md`.
**Dissent**: Only 38 of 143 chips have explicit height, so forcing height changes 70% of them; partially right, narrowed by measurement: most movement was within +-2px, but pill `md` was +10px (3 sites: `DocsSidebarBody`, `SearchPalette`, `DocsQuickDrawer`) and pill `sm` was +4px (9 sites), larger than expected because pill uses `py-0.5`.
**Falsifier**: If a control at 32px wraps to exceed 32px height, that spot is `sm` or not a chip. If pill `md`'s +10px is reported as a density defect at the named sites, pill's size ramp is reopened. If a single screen still shows 8+ distinct control heights, the remaining cause is chrome tokens (34/36/44/variable).
**Owner**: stark (owner), design-system judgment plus owner confirmation

## 2026-08-03 — README proves the real screen first, and splits the technical contract into a short boundary plus an authority guide

**Why**: Trigger was a change to public wording a stranger reads first, and a visual-hierarchy change to the README.
**Prior**: Upholds 2026-08-03 "README's recent-change proof preserves the full installed-app frame," 2026-08-02 "README is the public quality contract, internal docs own the rule authority map," and 2026-08-01 "Windows x64 is a public unsigned beta"; keeps images and warnings, trims duplicated prose.
**Decision**: Chose direction B (image-first, staged disclosure) over A (long-form) and C (persona-branching, not mixed in). macOS and `Windows x64 beta` sit together on the first download row, pointing to a stable download page; the unsigned/SmartScreen/managed-PC-block warning sits immediately after the CTA and again in Status. All existing Journey images and captions are preserved; SDK migration, CLI transcripts, relation tables, and verification runbooks move to MCP/CLI/relations/development guide. UID/slug/path, no graph cap, typed relations, local-first, and no npm stay in the README body. The 4-column comparison table moves below Journey and agent workflow.
**Dissent**: Trimming technical prose risks Atlas reading as a pretty graph app rather than a typed ontology and agent-native layer; deferring the comparison table costs technical evaluators a later encounter with differentiation.
**Falsifier**: If a fresh reader cannot answer the role of UID/slug/path or typed relations after Journey, or the Windows warning is read later than the download, the dissent is right and the missing typed fact is restored, not the long-form text. README shrank from 732 lines/5,527 words to 505 lines/3,701 words, keeping all 8 captures; GitHub render confirmed layout at 390x844 and 1512x900.
**Owner**: owner (jinan), accountable

## 2026-08-03 — Collapse the screen that called the same thing by six names down to one ‘folder’, and tie the signal that made a locked feature read as broken to connection state

**Why**: Two simultaneous triggers: a solo pass scored 16/24 (below the 18 pass line), and "a stranger reading this for the first time," starting from seven raw owner remarks passed unfiltered to five PO seats.
**Prior**: Upholds 2026-08-02 "first-run card: demote trigger to caption, promote lead to attention winner" (PR #831, 13/24); addresses that slice's deferred `dismiss/reopen semantics`. Overturns 2026-07-20 "the first-run dialog never says 'ontology'"; boundary set at container="folder", built thing="ontology".
**Decision**: Vocabulary sweep replaces "vault" and "markdown folder" with "folder" (same commit, ko/en); binds "this is a sample" to connection-state lifetime, not card lifetime; action tiles restructured into 3 tiers with `items-stretch` to `items-start`; agenda item 6 reduced to a day-1 toast link only; removes the "workspace" chip (a map chip earns its place only if it changes the map). Out: canvas coordinate placement, drop gesture, zoom transition motion, new tokens, tile removal/merging. Appetite 1 day. Rubric total 17/24 (pass line 18).
**Dissent**: The two AI-action tiles hide their destination behind the same prefix and should name it instead; not adopted (3-tier grouping already signals the distinction). A second dissent, that the fix arrived before the problem was confirmed, was conceded and fixed by moving the cheap test earlier.
**Falsifier**: If users click "copy" and still ask where it went, the destination-naming dissent is right. If the day-1 toast link still produces "I don't know what this attached to," an attachment indicator was needed. Recheck: end of day-1 slice and first 3 external users.
**Owner**: owner, accountable

## 2026-08-03 — README's proof of the recent change preserves the full installed-app frame and parent context

**Why**: Trigger was a visual change adding the installed app's Recent lens as public evidence to README.
**Prior**: none
**Decision**: Place a 3248x2122 Retina PNG full-width between Journey 3's node description and Footprints; do not crop internal graph/INDEX/app chrome or invent new overlay colors/tokens. Recent is derived from local Markdown file mtime; the on-screen "7" is a photography-fixture result, not a graph/fan-out/product cap, and caption/alt text state this explicitly. Captured natively from a photography-only local copy of `samples/storefront` with Recent 7d running live in the installed app; doc-link check confirms PNG references and GitHub render confirms full-width placement.
**Dissent**: The full frame is honest about context, but at README's scaled-down size the recent ring may read as just a complex pretty graph; addressed via full-width placement and explicit caption rather than internal cropping.
**Falsifier**: If a reader interprets "7" as a product cap, or cannot identify what Recent highlights without the caption, the image and explanation have failed.
**Owner**: not recorded

## 2026-08-02 — README owns the public quality contract, internal docs own the rule-authority map

**Why**: Public README's ontology policy/format/product-surface claims diverged from the current writer and surface contract, and the owner asked whether standards should live in project docs, README, or both.
**Prior**: Elevates the same-day decisions "no cap on total node count, direct connection width is a qualification signal" and "UID is permanent identity, slug is the current address" into the public contract; keeps Python's 12/4/2 as a processing bound, not re-emphasized in README.
**Decision**: README summarizes only no total cap, contextual fan-out, legitimate hub, earned bridge, packet bound != graph bound, UID/slug/path, external-trial isolation. Fix README's missing required UID, raw `elements:` paths, stale claims, and broken brand assets in the same correctness slice. Align SPEC's path-style element slug allowance and the guide's raw-path relation examples to the current flat role slug + `path:` evidence contract. Raw HTML doc assets are added to the doc-link gate. Full README IA/screenshot/video reshoot happens later, verified via installed-app Computer Use; no external trial output is imported.
**Dissent**: A hand-written authority map is also hand-maintained and will be the first thing to go stale at the next threshold/schema change; hiding current analyzer numbers from README makes boundedness harder for an FDE to audit.
**Falsifier**: If the next contributor cannot find the correct owning file/verification from the map alone, or the map/README drift apart after an analyzer change, or a fresh FDE reinterprets the processing bound as a graph cap, the dissent is right; move to a code-generated current-limits reference, or remove the authority map.
**Owner**: owner, accountable

## 2026-08-02 — There's no ceiling on total node count; direct-connection breadth is a signal that asks for qualification

**Why**: Owner's direct correction; the Python field trial's "20 or fewer" phrasing was read as a whole-project node cap, when the original question was whether one node's direct neighbor/child fan-out should generally stay under roughly 10-20.
**Prior**: none
**Decision**: There is no cap on total node count for a vault or project; node count is an observation, not a target. `ontology-bootstrap`'s "20+ curated nodes" is only a workflow-routing threshold to `ontology-sync`, not a storage limit. Python's 12 candidates, 4 exact picks, and 2 reserved risk slots limit one evidence packet's width, not graph size. Direct fan-out follows the 2026-07-31 spec: domain to capability 6-10 (center 8), capability to element 5-7 (center 6), and live p90 are review triggers, not hard caps. A hub can be wide if references are resolved, roles are exclusive, and provenance is clear. Bridges are created only when a shared behavior is definable in one sentence and exclusive of siblings, not to reduce a count. The map's density gate folding 12+ children is a rendering rule, independent of ontology quality rules.
**Dissent**: Without a total/direct-width cap, agents could again grow meaningless flat lists.
**Falsifier**: If a real hub passing reference-resolution, role-exclusivity, and provenance gates grows to 20+ direct children and neither humans nor agents can handle the list, revisit toward a degree-based review signal and bridge proposal rather than a fixed per-kind cap.
**Owner**: owner (correction)

## 2026-08-02 — The Python source-hidden field trial passes the fixed acceptance line

**Why**: Completion of a fixed source-hidden falsifier test of the two Python selection specs (model picks up to 4 exact endpoints; 12-candidate cap with 2 reserved risk slots), on the same MIT Python repository and six questions.
**Prior**: Tests the specs from "the exact Python import endpoint lets the model select at most 4" and "the Python risk-ownership boundary reserves at most 2 slots among 12 candidates" (same date).
**Decision**: With a fresh `gpt-5.6-sol/high` builder, baseline P/P/U/U/P/P = 4/12 rose to A/A/A/A/A/P = 11/12. Required flags all passed: `exact_client_entrypoint=true`, `security_owner=true`, `service_transport_boundary=true`, `source_backed_impact=false`. All 12/12 cited paths existed in the source checkout with 0 hallucinated paths. Builder produced project 1, domain 1, capability 3, element 8 (an observation, not a cap); the trial vault had 18 nodes including 5 starters. `finalize_project_meaning` failed with `source_receipt_unavailable` and `pattern_walk` required runtime `slug` instead of schema `seed`; both left as follow-up MCP operability defects.
**Dissent**: The risk-basename heuristic may be overfit to this repository's questions.
**Falsifier**: If two different external Python trials find the reserved risk endpoint irrelevant to the FDE's questions, or it displaces a more important direct boundary causing Q1/Q2/Q5 to regress, the heuristic is withdrawn for a source-symbol evidence row.
**Owner**: not recorded

## 2026-08-02 — Python's risk-ownership boundary reserves at most 2 slots among 12 candidates

**Why**: A second fresh builder, applying the "model picks up to 4" spec, again selected `client.py`/`Request.py`/`Response.py`/`connections.py` but missed `SecurityAccess.py` folded inside a long import payload, showing free choice alone doesn't reliably recover risk owners.
**Prior**: Responds to the observed falsifier of "the exact Python import endpoint lets the model select at most 4" (same date).
**Decision**: The automatic-element cap stays at 12. Exact static import endpoints whose basename names a security/authentication/authorization/permission/credential/policy/encryption role reserve up to 2 priority slots within that 12 (not 12+2). The naming heuristic is used only for discoverability; domain/capability, behavior contracts, and impact relations are not auto-generated. `ontology-bootstrap` must leave visible gaps for any exposed risk endpoint chosen or omitted; exact `depends_on` still passes only observed file-edge direction.
**Dissent**: A file named "security" isn't necessarily the core risk owner, and in a typical library the two reserved slots could displace a more important direct boundary.
**Falsifier**: If a fixed trial fails to recover `security_owner`, or two external Python trials find the reserved endpoint irrelevant, or a missing direct boundary regresses Q1/Q2/Q5, the heuristic is removed for a separate source-symbol evidence row.
**Owner**: not recorded

## 2026-08-02 — For an exact Python import endpoint, the model selects at most 4

**Why**: The falsifier of the prior automatic-candidate decision occurred: a re-test raised the source-hidden score from 4/12 to 7-8/12 and recovered the exact `client.py` entrypoint, but failed to answer the `SecurityAccess.py` ownership path folded under `services/`, failing the required `security_owner` gate.
**Prior**: Responds to the field-trial falsifier of the automatic-candidate selection decision (same date).
**Decision**: Automatic candidates stay capped at 12 direct module/package boundaries. An external LLM may also select up to 4 exact file endpoints, already observed by `infer_imports`, as complete-proposal elements, each answering a distinct discovery question (execution entrypoint, external/transport boundary, security/policy/risk implementation, shared request/response/schema); fewer are chosen when meaning overlaps. Atlas validator checks, before the write plan, that selected paths are real endpoints, exist in the repository, don't exceed the cap, and that proposed `depends_on` direction matches the exact file edge. Selected endpoints remain structural evidence only, never auto-promoted to domain/capability or behavioral meaning. No new MCP tool, input shape, or vault schema is added.
**Dissent**: Giving the model file-selection discretion risks overweighting impressive-sounding names or ritually filling all 4 slots.
**Falsifier**: If the same fixed trial still fails to recover `security_owner` and the exact entrypoint together, or a selected endpoint's role claim is false, or endpoints not answering distinct questions ritually fill all 4 slots, this spec is withdrawn for a separately designed source-symbol evidence contract. There remains no cap on total vault/project node count.
**Owner**: not recorded

## 2026-08-02 — Python impact evidence promotes only the import-participation boundary to element candidates

**Why**: The prior Python decision opened a Slice 2 source-hidden impact gap: agents could not answer service/transport impact questions without real imports.
**Prior**: Upholds "Python cold-start splits semantic ingress and import impact into two contracts" (next record); its falsifier condition was observed, closing Slice 2.
**Decision**: `analyze_repo_structure` stops cloning the whole top Python package as file nodes; `infer_imports` surfaces up to 12 element/path candidates ranked by degree and import count, limited to boundaries seen in observed edges (excess to `skipped`). Import endpoints are citation evidence only, never domain/capability; proposed `depends_on` must match observed direction or fail closed.
**Dissent**: Module imports include conditional imports, re-exports, and internal detail, so a high-importance boundary is not automatically a stable ontology element.
**Falsifier**: If the same Python source-hidden trial does not rise from a 4/12 baseline to 6/12 or higher, or fails to recover exact path, security owner, or source-backed impact evidence.
**Owner**: not recorded

## 2026-08-02 — Python cold-start splits meaning ingress and import impact into two contracts

**Why**: A source MCP query on a real MIT Python repo with clear purpose and package description returned files 0 and semantic evidence 0, and the Atlas-only builder refused to write; an input scope defect, not missing repo information.
**Prior**: Upholds 2026-08-01 "a tool's sightline is the vault's range" and 2026-08-02 "Rust package contract is one bounded evidence row"; the latter's revisit condition (a second non-Rust trial hits the same citation gap) was observed.
**Decision**: Slice 1 extracts title and bounded semantic evidence from `README.rst`, reads only static `setup.py` literals as one `package-contract` row, and treats the top `__init__.py` package only as an element/path candidate, never a capability. Slice 2 (`.py` import inference, max 4h) opens only if Slice 1 leaves impact as the sole gap.
**Dissent**: Fixing only ingress leaves the user-requested code impact answer empty, so "Python support" stays half-built.
**Falsifier**: If after Slice 1 the source-hidden agent still cannot answer impact without static import inspection, Slice 2 opens immediately; if ingress alone resolves it, an embedded Python source index was unnecessary scope.
**Owner**: owner

## 2026-08-02 — A mandatory UID is vault format v2, and it ships with an official migration path

**Why**: A mandatory UID on every node could not be squeezed into `docs/ONTOLOGY-ATLAS-SPEC.md`'s v1 additive-only policy, forcing an explicit breaking vault format change.
**Prior**: Does not repeal "UID is the node's permanent identity" (record below); closes the deployment/compatibility gap that record left open, raising the spec itself to v2.0-rc.
**Decision**: Official migration ID is `2026-08-02-add-node-uids`, dry-run by default, only `--write` commits, failing before the first byte on malformed or duplicate UID claims. Uncommitted Markdown is blocked by the dirty guard, bypassed only by `--force`. `scripts/migrate-node-uids.mjs` becomes a wrapper delegating to it. New nodes come only from Studio/MCP/CLI writers, which issue fresh UIDs.
**Dissent**: Without external users yet, v2 naming and migration-runner registration may be procedural cost rather than real data recovery.
**Falsifier**: If no v1-format vault remains, the conversion path is never run once, and v2 notation is observed to only lower user understanding, remove the migration compatibility layer next RFC.
**Owner**: not recorded

## 2026-08-02 — UID is a node's permanent identity, and slug is its current human-readable address

**Why**: A vault schema, MCP/CLI selector/output, and interop export contract change was needed; a rename/export URN break was reproducible via a synthetic journey.
**Prior**: Does not repeal 2026-08-01 "slug is a flat identifier"; narrows "slug=identity" to "slug=current address" by adding a separate permanent identity that survives address changes.
**Decision**: Every `kind:` node requires an immutable lowercase UUIDv4 `uid` via `crypto.randomUUID()`. `slug` stays the file address and URL; UID is never the map label. Creation surfaces issue UIDs; import rejects collisions. Rename preserves UID; merge folds source UIDs into `merged_uids`; delete makes no tombstone. MCP selector fails closed on mismatch. Interop uses `urn:uuid:<uid>`.
**Dissent**: Without observed repeated rename failures by real users, and if aliasing solves current problems, permanent UID may be a schema cost paid for the future.
**Falsifier**: If a synthetic pre-rename-reuse journey gets the same exact lookup, snapshot identity, and import distinction from slug alias alone, with UID adding no recovery or lineage value.
**Owner**: owner

## 2026-08-02 — The project inspector speaks the result the user gets, not internal handoff jargon

**Why**: Owner directly observed via screenshot that "Copy AI Handoff Note" and surrounding copy in the installed app's project compact inspector read as internal jargon.
**Prior**: Upholds "the project inspector removes its healthy-gap sentence and duplicate actions" (2026-08-02), which set the sticky footer's single copy action to "Copy AI Handoff Note"; keeps the one-action structure but overturns that wording on this observation.
**Decision**: Rename "Copy AI Handoff Note" to "Copy Project Info for AI". Remove internal jargon (handoff note, packet, container) from visible surfaces; relation counts become Child Items/Parent Items and Evidence Docs, actions become Open Document/Edit Relation/Ask AI/View Details. Generic node copy becomes "Copy Item Info for AI". Structure, payload, and tokens are unchanged, only visible text and toast change.
**Dissent**: A single shorter shared CTA "Copy Content for AI" reused across all nodes would reduce compact-footer width and translation upkeep.
**Falsifier**: If context wording actually wraps in the 14-inch app, or a walkthrough shows a user mistaking one copy action for another feature, converge on a short shared label before hiding payload target.
**Owner**: design-guardian

## 2026-08-02 — Competency read-back recombines the canonical Markdown and the post-write receipt in a fresh process

**Why**: `meaningAssessment:v1` is a pure function and `agent_brief` only combines source receipt; nothing re-verifies the five persisted competency answers together with version/graph hash/source fingerprint in a fresh MCP process.
**Prior**: Upholds "meaning assessment opens with a pure contract separated from structural readiness" (2026-08-02, below); keeps its 0/1 source cardinality, private-root non-exposure, and currentness separation.
**Decision**: Project Markdown stays the sole editable record of answer/witness/gap. Only after writes plus `validate_vault` and compile succeed does finalize record evaluator version, body digest, graph hash, and source fingerprint into a sidecar. Read-back re-derives `meaningAssessment:v1` each time, never promoting drift to `verified_current`. A new tool ships only after restart proof.
**Dissent**: A versioned Markdown parser alone could restore answers/witnesses without a separate finalize receipt; requiring one creates staleness after a human edits Markdown.
**Falsifier**: If two independent MCP processes losslessly restore the same typed CQ and current provenance from Markdown alone, without false current after partial writes or concurrent edits, the finalize contract is unnecessary.
**Owner**: owner

## 2026-08-02 — Meaning assessment opens with a pure contract separated from structural readiness

**Why**: Reviewing analysis rate/confidence after the project inspector's source receipt reproduced a structural false-green: `agent_brief`'s 100-point/healthy status held with no semantic grounding.
**Prior**: Upholds the rule below ("the project's current source evidence is a single receipt...") that `verified_current` isn't given by path existence and graph shape alone; decides the minimum judgment contract before wiring it into public UI/MCP.
**Decision**: Build a pure derivation contract `meaningAssessment:v1` with synthetic fixtures, taking readiness, five competency receipts, and source status/currentness as input, outputting only categorical status and provenance, never raw witnesses or percentages. `verified_current` needs all competencies answered, witnesses resolved; else `needs_evidence`/`review_required`.
**Dissent**: Keeping the last verified receipt as `verified_current` with currentness marked `unavailable` when source-hidden would avoid over-demotion.
**Falsifier**: If `review_required + unavailable` repeatedly blocks use of already-verified evidence in real handoffs, and walkthrough evidence shows no misjudging, revisit the promotion rule.
**Owner**: owner

## 2026-08-02 — Remove the project inspector's ‘healthy gap’ sentence and its duplicate actions

**Why**: Owner directly observed in the 1512 installed app's project inspector that "No top-level gap confirmed" and six equal-weight actions read as cluttered and undifferentiated.
**Prior**: The falsifier of the source-receipt decision just below was observed: receipt beat relation facts and actions duplicated, so the earlier promise to trim the rail is now executed; receipt stays in the inspector's existing slot, no separate card/dashboard.
**Decision**: Compact receipt groups status/source and measuredAt/currentness into two lines under "Code Evidence", separated from inline actions by hairline. `topGap:null` stays `none` in the marker but is never shown as a row for a healthy absence; only a real gap shows. Remove inline "Copy AI Summary" and "Path", keeping only the footer's "Copy AI Handoff Note" and four actions. No new tokens.
**Dissent**: Keeping inline "Path" as a fifth action better preserves ontology-exploration discoverability for users who don't know the context menu.
**Falsifier**: If a walkthrough shows a user repeatedly searching the inspector to start path analysis, or failing to find path in the context menu, reconsider before re-adding actions.
**Owner**: design-guardian

## 2026-08-02 — The source receipt replaces the project inspector's existing hierarchy, not a new card

**Why**: Real observation in the installed app (1512x949, project selected) showed the inspector stacking six equal actions and a sticky "Full Details" with no source binding, measured revision, or top gap, while the real `agent_brief` has graph readiness 100 but no project source receipt field.
**Prior**: Upholds "the project's current source evidence appears to both humans and agents as a single receipt" (below); that decision defined the fact, this one defines its hierarchy and state transitions in the dense workbench.
**Decision**: Only when a project is selected does the receipt replace the slot: categorical source status plus `measuredAt`, a max two-line `topGap`, and the footer's primary becomes `nextAction`; other actions demote to utility. No new panel/card/dashboard. Every surface reads the same versioned receipt; paths/remotes are never shown. Swap is atomic; failure preserves prior state.
**Dissent**: Promoting source receipt to attention winner could push relation/evidence-document facts to utility and become a diagnostic UI while source measurement is still weak.
**Falsifier**: If in the installed app a user must scroll to see either project relation facts or the receipt's next action, or two external trials show top gap repeating vague text without improving handoff accuracy, shrink the rail and expand source-role evidence first.
**Owner**: design-guardian (acting)

## 2026-08-02 — The project's current source evidence shows to both people and agents as one receipt

**Why**: Two field trials reproduced different false reassurances: one stored 6 concepts/5 relations but source-hidden handoff fully answered only 1/6 and got an entrypoint wrong; another honestly returned `canWrite:false` yet its clean nodes still left a receiver judging all 6 questions unknown; structural health alone can't distinguish the two.
**Prior**: Upholds same-day "`canWrite` preserves both the witness of the competency answer and the visible gap" and 2026-07-31 "a node-eligibility gate, not a fan-out cap"; ties both to the project's actual source revision.
**Decision**: A project's active analysis source is 0 or 1: canonical worktree root plus HEAD fingerprint in Git, canonical folder root plus fingerprint outside it. Multi-root aggregation is excluded from v1. Paths/remotes go only to the gitignored sidecar, never Markdown. One generator derives status as `not_measured`/`needs_evidence`/`review_required`/`invalid`/`verified_current`.
**Dissent**: An agent re-scoring its own witnesses from the same bounded evidence packet could produce a more sophisticated false green, so bounded source-role evidence may need to precede any UI.
**Falsifier**: If a wrong canonical path receives `verified_current`, or a trial repeats `needs_evidence` without top gap/next action while handoff accuracy doesn't improve, stop expanding UI and open bounded source-role evidence next.
**Owner**: owner

## 2026-08-02 — `canWrite` preserves both the competency answer's witness and its visible gap

**Why**: An MCP-only field-trial builder on an unfamiliar repo stored 6 concepts/5 relations losslessly and got `canWrite:true`, findings 0, but a source-hidden receiver fully answered only 1 of 6 questions; the stored capability named the wrong canonical path, and an impact competency passed with a non-empty string despite no dependency relation existing.
**Prior**: Upholds same-day "`canWrite` passes only the deterministic write plan of the approved full graph" and 2026-07-31 "a node-eligibility gate, not a fan-out cap"; the former's falsifier (storing the whole exact-plan graph still doesn't improve handoff) was observed in this next trial.
**Decision**: Change the five competency answers from plain strings to a structure carrying `answer`, `status`, and real `witnesses`. `answered` is allowed only when required witnesses resolve; otherwise it stays `partial` or `visible-gap`, preserved into findings and the persisted body. `canWrite` remains a boolean readiness gate only, never approval or completeness.
**Dissent**: The current packet is README/Cargo-centric, so typed witness alone can't let the machine judge whether a path is the canonical role without also adding source-role evidence.
**Falsifier**: If typed CQ fails to demote the false canonical path/unfounded impact claim from `answered`, or a fresh source-hidden handoff still hides gaps after demotion, open bounded source-role evidence next.
**Owner**: owner

## 2026-08-02 — init's vault and repo root are computed in the same canonical coordinate system

**Why**: A real field trial's CLI-generated MCP config pointed at a non-existent repo root, stalling the first agent connection.
**Prior**: Upholds 2026-08-01 "the three the handoff trial found"'s rule against measuring code drift with an unverified `OATLAS_REPO_ROOT`; this is a downstream violation where init mixed macOS's `/tmp` and `/private/tmp` notations for the same folder.
**Decision**: After scaffold completes and vault/cwd directories exist, canonicalize both with `realpath` and compute vault-local/cwd-local config relative paths and the global Codex registration command in that one coordinate system. Config keys, file locations, existing-file preservation policy, and MCP tools/CLI commands are unchanged.
**Dissent**: `/tmp` is a macOS special case, so documenting it and letting users supply an absolute canonical path would suffice.
**Falsifier**: If canonicalization breaks a vault that intentionally preserves a real symlink location pointing at a different repo root, or changes an existing relative-path init fixture.
**Owner**: owner

## 2026-08-02 — `canWrite` only passes a deterministic write plan for the fully approved graph

**Why**: In a real MCP-only bootstrap, an approved proposal had 6 concepts and 7 typed relations, but the public validator schema accepted only 4 kinds, so `canWrite:true`/findings 0 was returned while the agent silently dropped 2 elements and all 7 relations rebuilding write input by hand, losing an already-validated capability's domain.
**Prior**: Upholds "the Rust package contract is one bounded `package-contract` evidence line, not a node" (2026-08-02); that grew evidence-packet provenance but not whether the approved graph survives unchanged between validation and write.
**Decision**: `analyze_repo_structure.proposal` validates the entire approval target in one pass. Only on success does it return a deterministic `writePlan` in `add_concepts`/`add_relations` row format, preserving domain, path, evidence, and rationale. If any concept row fails, the relation batch does not run. `canWrite` never means approval or actual write success.
**Dissent**: If two fresh MCP runs with only the current skill fixed can preserve the approved full graph, expanding the public schema over one copy mistake is over-engineering.
**Falsifier**: If a control run under the current contract losslessly stores the full approved set twice in a row, or a new exact plan storing the full graph still doesn't improve handoff, or the writer still drops rationale/evidence.
**Owner**: owner

## 2026-08-02 — The Rust package contract is one bounded `package-contract` evidence row, not a node

**Why**: In an MCP-only field trial a builder submitted `Cargo.toml` as feature-capability evidence but the proposal validator rejected it as `unknown-citation`; falling back to `README.md` kept path accuracy but left package-manifest implementation detail unknown to a source-hidden receiver.
**Prior**: Upholds 2026-08-01 "the tool's sight is the vault's reach"; that decision's root-independent-package gap became a silent hole, and this extends measured scope without overturning it.
**Decision**: When a repository root `Cargo.toml` has a real `[package]` section, provide its limited identity/description fields plus `[features]` names as one bounded `semanticEvidence` row with `role: package-contract`; a citation candidate only, never a domain/capability/element proposal. Zero nodes are added per feature name.
**Dissent**: Generalizing one repo's observation into a universal manifest strategy risks promoting raw TOML, comments, or hostile strings to semantic evidence, ballooning into an unverified manifest subsystem.
**Falsifier**: If the new row pushes existing mission/architecture evidence out of the packet, trusts raw/comment content, grows manifest-per-node counts, or workspace/parser expansion becomes necessary before a second field trial.
**Owner**: owner

## 2026-08-02 — Capability implementation evidence opens with one canonical `path:`, not `elements:`

**Why**: 9 of 19 self-vault capabilities lacked implementation evidence; `maintenance_plan` told agents to put file paths into `elements:`, but `write-path-gate.test.mjs` flags that same input as `path-shaped-reference`, a round-trip contradiction.
**Prior**: Upholds 2026-07-31 "a path is evidence, not a meaning slot" and its `path-shaped-reference` gate; only overturns 2026-08-01's `capability_without_evidence` prescription that allowed raw paths in `elements:`. Write is still never blocked.
**Decision**: Formalize capability's `path:` as the one repo-relative canonical file or directory opening this behavior's implementation. `elements:` holds only resolved element slugs. An element is promoted only when a file earns an independent role in one sentence; no file-mirror nodes are created to clear maintenance findings.
**Dissent**: `path:` already means one element's location, so overloading it with capability-claim evidence is another semantic overload; a separate `evidence: string[]` would separate relation from literal evidence more honestly.
**Falsifier**: If a capability needs multiple non-overlapping implementation roots and an MCP-only agent given only canonical `path:` re-explores source or misses implementation, observed across two vaults.
**Owner**: owner

## 2026-08-02 — The local agent forces an answer after 3 rounds of evidence gathering and closes at 60 seconds

**Why**: Owner directly asked to dogfood whether the local MCP+Ollama agent builds meaning-based ontology well; repeated `gemma4:12b` runs showed tool-skipping conclusions, a 291.45s 7-round-trip audit, a 117.31s silent synthesis, and a forced-toolchoice run timing out at 180s while Ollama was actively generating, misreported by the UI as a connection failure.
**Prior**: Upholds 2026-07-31 "a node-eligibility gate, not a fan-out cap"; this trial shows a local model mistaking a list for real nodes more clearly, not a reason to cap fan-out. 2026-08-01 "the fourth connection is a door"'s revisit condition was met.
**Decision**: URL-addressed runners get `reasoning_effort:none`; the first turn names one read tool; after 3 tool turns tools are revoked and an answer forced from verified evidence. `element` means "implementation role," not "file." Audits read real parents before judging fan-out, then report incomplete after 3 turns. Local cap 60s vs 180s remote; macOS relinks the Tauri binary, clears caches.
**Dissent**: `reasoning_effort` isn't guaranteed supported by every OpenAI-compatible runner; turning off all reasoning may hurt hard duplicate/bridge judgments.
**Falsifier**: If a supported model rejects `reasoning_effort` or named `tool_choice` as unsupported, or the conditional policy degrades real-parent reading/citation versus default, the dissent is right; the 60s cap is reconsidered if normal local responses repeatedly need 60-180s.
**Owner**: stark

## 2026-08-02 (2) — Translate ‘looks AI-designed’ into six fingerprints, and remove one corridor

**Why**: Owner directly said the screen looked too "AI-designed" with a blue background and asked whether a redesign was possible; the design bench convened because one sheet's hierarchy, selection grammar, installed-app contract, and agent handoff were all touched.
**Prior**: Executes 2026-08-02 (1)'s deferred OUT item A-3 (remove the corridor panel, promote LNB); execution of something deferred, not a new decision.
**Decision**: Keep the four connect buttons as full-width blocks, not segmented, since each writes a different config file and a person often attaches more than one. Do not wire client-detection signals yet; remove the hardcoded `primary` prop. Replace `StepCard` with `StepRow`. Demote `>_` glyph, unify button backgrounds, remove the "missing" badge, add a focus ring, lower the step-3 text.
**Dissent**: Pre-filling Claude Code as default could be right if usage data later shows Claude Code share >=70%, in which case the fix is "say it's the default," not re-flattening; wiring unverified "currently used" signals risks a new explicit-lie defect.
**Falsifier**: A 5-second exposure test or real usage showing Claude Code share >=70% justifies a default; across 10+ vaults, if "most recent exists file" and "most recent heartbeat.agent" disagree >=30% of the time, exists-only wiring is rejected for heartbeat-primary.
**Owner**: owner

## 2026-08-02 — AI connection and agent turn: cut four spots where the screen said something untrue (including 2 repeated findings)

**Why**: Owner directly instructed three times, repeatedly pointing out the settings AI-connection design, the agent input box lacking choices, and the AI-connection popup being too wide.
**Prior**: none
**Decision**: Split across PR #832/#833. `citation.ts`'s `demoted` verdict wrongly counted only `[[slug]]` citations despite real tool reads, fixed via a two-branch check. The "web unsupported" notice was corrected since Ollama's default allows CORS; rewritten as a permanent choice, not a CORS claim. Dropdown moved to a portal; scroll bugs fixed; duplicate warnings merged; raw markdown stripped.
**Dissent**: Motion seat argued against its own 180ms `--motion-base` transition, saying the highest-frequency input box should use at most `--motion-fast` (120ms) or none.
**Falsifier**: If enabling a grow transition draws a "typing feels heavy" report, step down to `--motion-fast`, then remove it if still heavy; the reported clipped text is fixed by scroll-multiple alignment, not the transition, so this dissent winning doesn't bring the symptom back.
**Owner**: owner (signature pending)

## 2026-08-02 — First-run card: on a screen that says ‘this is a sample’ four times, the heaviest ink was the sample's size, demote the instrument to a caption and make the lead the attention winner

**Why**: Owner asked to improve the first-run card's design; measurement showed the card's boldest ink (a 19px mono sample count) beat the lead sentence and CTA in the attention stack, with 25.4% empty bottom space and a self-dismissing tab.
**Prior**: Cites and keeps valid 2026-07-30 "`/` is a gateway surface for web visitors" and 2026-07-26 `design.md`'s two-source-of-truth rule (found not violated, since the card reuses the same glossary key); also cites 2026-08-01 "CI does not count vault nodes."
**Decision**: Demote the 3-part `MeterCell` gauge block to a one-line caption (source stays census-derived); replace one relation example with static copy only, no live wiring; reduce status signals 4 to 2; keep the bold lead but add one gray agent sentence; fix the self-dismissing tab; fix 4 strings; remove only the false promise in the developer command label, not the command.
**Dissent**: One live edge would teach "relation" better than counting aggregates; withdrawn in round 2 for gauge demotion, partly honored via static example copy only.
**Falsifier**: If a visitor still can't say what a "relation" is after reading the demoted caption, or mistakes the static example for a live queried fact, a live edge must be wired.
**Owner**: owner

## 2026-08-01 — The demo doesn't fork by address: `/` and `/download` show the same thing (owner signed)

**Why**: Owner directly instructed that entering the download page showed no demo video while `/` did, and demanded unification since `/download` is effectively the same promo page.
**Prior**: Explicitly overturns half the placement of 2026-07-29 (night) "the demo video goes on the first page", while keeping its two filming principles (never film shared surfaces; show only what web can't do in principle).
**Decision**: Remove the `showDemo = pathname === '/'` conditional so the demo section (and its `44rem` stage) appears on both `/` and `/download`. Narrow the scroll-gate test from "first screen ends without scroll" to "the 3-step install block never gets clipped." Add an assertion that `demo-stage` appears on both addresses.
**Dissent**: `/download` used to serve link-arrivals who just want to install, and promo assets could dilute that goal; still valid in principle, but owner redefined `/download`'s job as a promo page.
**Falsifier**: If the install-button reach rate drops after `/download`, or scroll-less bounce rate rises after adding video, the fix is moving the video below the install strip, not re-splitting by address.
**Owner**: owner

## 2026-08-01 — ‘Work is done’ is judged by going quiet: threshold 5 minutes, notify **only per task**

**Why**: Owner directly instructed that the screen must show agent/MCP activity in progress, and that the content of that notification needed fixing.
**Prior**: Upholds 2026-08-01 "tool-call logs are not drawn" as the basis for excluding tool calls from the notification list.
**Decision**: `AGENT_TASK_IDLE_MS = 5 minutes`, chosen as 2.24x the observed max in-task silence, matching `AGENT_ACTIVITY_STALE_AFTER_MS`. Notifications are five kinds only: task start/end with summary, domain create/destroy, bridge interruption, vault problem; tool calls excluded. Domain events come from the manifest, not the log. The tray is a popover, zero new routes. Never say "connected."
**Dissent**: 5 minutes is too long to wait to learn a task ended; accepted as bounded tradeoff since "done" is valued for its summary, not immediacy, which a 2-minute "in progress" indicator already covers.
**Falsifier**: If users report one task split into multiple notifications, raise the threshold; if "done but no notification" recurs, lower it; if logs dominated by non-batched writes are observed, the log alone could catch domain events.
**Owner**: stark

## 2026-08-01 — Three things the handoff trial found: give the full body as opt-in, state what was withheld, and make an unevidenced capability visible instead of blocking it

**Why**: A field trial built a vault via a real MCP agent on an unfamiliar repo (50 nodes, 126 relations), then a second agent, given only the vault with no source, answered questions and admitted in its own words it could not do three things.
**Prior**: none
**Decision**: get_concept gains opt-in body:'full', with bodyInfo (lengths, truncated flag) plus a hint on every response; get_concepts, find_evidence, and list_concepts get matching fixes. The CLI stops guessing process.cwd() when OATLAS_REPO_ROOT is unset, reporting pathDrift.checked=false instead. capability_without_evidence flags empty-elements capabilities as review/info, never rejects.
**Dissent**: Rejecting evidence-less capabilities outright was proposed but rejected, since naming a behavior must precede attaching files and rejection would push agents to route around the tool; a second dissent said bodyInfo on every response bloats payload, but it is only 4 fields unless truncated.
**Falsifier**: If a later handoff agent still reports missing body content, opt-in was insufficient; if capability_without_evidence flags half or more of a vault's capabilities, it is noise and must narrow; if skipping an evidence-less repo root causes a missed real code drift, skipping should become asking.
**Owner**: stark

## 2026-08-01 — The web's ‘cannot connect’ was false: ask the person who knows the value the browser doesn't

**Why**: Owner observed that on the deployed web, clicking "Connect AI agent" showed "can't connect from this screen," with the only alternative link dropping the visitor into the middle of a docs page.
**Prior**: Cites both parts of surfaces.md "don't build web equivalents" as still valid: web BYOK stays rejected (this is MCP connection, not LLM calls), and the web still cannot write agent config files. Nothing is overturned; only the read path narrows.
**Decision**: Correct the demotion card to "cannot auto-save," then add a path that finishes on screen: ask the user for values the browser cannot know (absolute vault path, absolute Atlas checkout path) and generate per-tool config and an agent-setup one-liner from them. Zero transmission, zero storage.
**Dissent**: Making users paste two paths by hand looks worse than the app's one-click flow, and requiring a checkout raises the barrier further, so traffic should be pushed to the app instead.
**Falsifier**: If the path fields in the web sheet are effectively never filled in (copy button stays locked) and /download/ conversion stays flat or falls, the "finishes on screen" premise was wrong, and the fix is reopening the checkout requirement, not reverting the card.
**Owner**: stark (owner directive)

## 2026-08-01 — Report: regenerating the shopping-mall sample, the bridge spec is a tool for repair, not construction (first real-world verification)

**Why**: The 2026-07-31 construction spec required a regeneration report for the shopping-mall sample, demanding zero manual corrections, or else location plus reason as spec gaps.
**Prior**: Cites and keeps valid 2026-07-31 "Construction spec" and 2026-08-01 "Slug is a flat identifier"; overturns nothing.
**Decision**: Two bridge nodes were created (wallet-payment, carrier-integration) after fan-out triggers fired; one was made below the trigger threshold since a sibling-difference test failed even at 5 children. Two spec gaps surfaced: the web derives edges from `dependencies` while the schema recommends `depends_on`, and domains must list `elements:` back or the compiler raises `missing_domain_containment` per element (54 cases).
**Dissent**: Bilingual body text doubles document length and makes /docs' table of contents look duplicated; the alternative was a `description_<locale>` schema key, rejected as widening the schema for one sample.
**Falsifier**: If a user or the owner flags the English description on /ko as a defect, or the bilingual body makes /docs hard to read, that dissent wins and `description_<locale>` gets added to the schema.
**Owner**: not recorded

## 2026-08-01 — The fourth connection is a door, not a vendor: open a keyless ‘connect by address’ branch that absorbs Ollama, LM Studio, and llama.cpp into one place

**Why**: Owner directly requested that agent/chat mode also support connecting to Ollama and other open-source runners, since the owner was already using Ollama and wanted it available from settings.
**Prior**: Implements what local-first.md v9 already permits (opt-in LLM connections with transmission-scope UI and a local audit log); the named-vendor-freeze-at-three test in secrets.rs stays passing unmodified.
**Decision**: Ollama is not added as a fourth named vendor, since it fails the "dedicated auth uncoverable by Bearer" bar. Instead the "user types an address" branch already promised in secrets.rs opens: provider id `local`, user-entered base URL, zero keys, OpenAI-compatible endpoints only, so LM Studio, llama.cpp server, vLLM and LocalAI enter the same door. Plaintext http is loopback-only; models are chosen from a fetched list.
**Dissent**: Tool-calling support on OpenAI-compatible endpoints varies by runner/model and lags native APIs, so a user on a tool-less local model may find "connected but does nothing," which a native adapter might handle more reliably.
**Falsifier**: If a user connecting via a local runner is observed failing the first round trip specifically due to tool-call failure, the dissent was right; the fix is making the connection-check verify tool support, not adding a native adapter.
**Owner**: stark (accountable)

## 2026-08-01 — CI does not count vault nodes: remove every count gate that stays true only by manual adjustment, and leave only assertions computed at runtime

**Why**: Owner directive to remove CI checks that measure node counts, since these numbers change constantly and were slowing checks down for no benefit.
**Prior**: Direct consequence of the 2026-07-31 "dogfood vault full regeneration," which turned every count-pinned gate red at once; the fault was the gates, not the vault.
**Decision**: CI no longer measures node/relation/file counts of the dogfood vault; anyone wanting the count runs `overview`. Assertions requiring a human to hand-tune a number are removed (node-count contract test, README census computations, exact-sentence pins); assertions computed at runtime from the same source (download caption vs its own graph, public tool-inventory counts, parsed-count-equals-displayed-count) are kept.
**Dissent**: Wrong counts in copy carry a trust cost; this repo already paid it once with mismatched section counts and once with a caption of 97 against a vault of 98.
**Falsifier**: If a wrong count is ever observed exposed to a user, the dissent was right; the fix is moving that sentence to a runtime computation, not reviving the old gates.
**Owner**: not recorded

## 2026-08-01 — Ship Windows x64 as a public unsigned beta, making the warning and native proof part of the download

**Why**: Whether to publish a Windows x64 installer without a real device to verify SmartScreen, and where to place the warning, came up as blocking; the prior stance was to keep Windows "coming soon" until it met macOS's signing bar.
**Prior**: Overturns the prior "keep Windows coming soon until signed" stance for the beta stage; owner chose to publish unsigned deliberately to gather demand signal first.
**Decision**: From v1.0.0-rc.5, ship an unsigned Windows x64 NSIS .exe as a public beta asset; the release job verifies the artifact is actually NotSigned, and a native CI job runs dependency audits, a Defender scan, unattended install, and MCP smoke tests, which does not substitute for real SmartScreen verification on hardware. The download page separates macOS and "Windows x64 beta" into two sections with the warning bound to the CTA via aria-describedby, and a browser fallback kept as a lower lane.
**Dissent**: Independent PO seats recommended limiting the first release to an oversized unsigned beta, arguing a public unsigned release mixes SmartScreen friction and distrust into the demand signal.
**Falsifier**: If the first 20 Windows downloads show installs completing without repeated warning complaints, the dissent was overstated; if warnings repeat or install evidence is scarce, return to signing or an oversized-beta distribution.
**Owner**: jinan (owner override, accountable)

## 2026-07-31 — Marking human-made nodes: there is no retroactive provenance, a write-time `created_by` stamp is the first slice, 0 new surfaces, and the screen label reads as work status, not authorship

**Why**: Owner directly requested marking which ontology nodes were human-authored vs agent-authored, and a way to collect "human-made only" nodes, asking whether it needs a new tab or button.
**Prior**: Same-day "construction spec" restructures vault.mjs write primitives (PR1); this slice wires a stamp at the same point, so whichever merges first the other rebases against.
**Decision**: Add a write-time `created_by` field (human | agent:<name>), stamped only where the call path proves it: MCP write tools = agent, web composer = human, internal chat panel apply = agent, CLI = unknown. `patch_concept` preserves existing values; absence stays permanently unknown, never inferred. No retroactive backfill and no UI in this slice.
**Dissent**: `activity.jsonl` held only 4 lines across 98 nodes, so "no log = human" would falsely mark 94/98 as human; a screen label should not surface authorship as primary, since that reads as credit/blame, citing the 2026-05-03 VS Code git.addAICoAuthor rollback; a competing dissent argued for `reviewed_by` first instead, since it alone gives no selector.
**Falsifier**: If `created_by` accumulates but no real session uses it as a selector, that dissent was right; if users keep demanding explicit authorship labels after work-status labels ship, or demand ways to avoid the stamp after authorship labels ship, the corresponding dissent is confirmed.
**Owner**: pending (owner sign-off not yet given)

## 2026-08-01 — [Extension] Bridge nodes become first-class concepts in the spec: give an unnamed procedure a name and qualification criteria

**Why**: Owner directly asked how to handle nodes fanning out to dozens of children; existing construction-rules step 4 already told agents to name shared behavior and re-parent children, but had no name for the target, so agents could not recognize it as sanctioned.
**Prior**: Extension of existing construction-rules step 4; no council convened, chief coordinated solo with two implementation calls delegated.
**Decision**: A bridge node requires four conditions together: it names a behavior the children actually share (not an arbitrary split); that behavior is statable in one sentence; the bridge is semantically exclusive from its siblings; and children are actually re-parented under it, or it is an empty bucket. Code defense should catch bridges with zero children or unedited template bodies. No new kind is introduced; a one-shot bridge tool is not built now.
**Dissent**: none
**Falsifier**: If a session creates an empty bridge despite the four conditions being in the prompt, escalate to code defense; if agents fail to complete the multi-step procedure, reconsider a one-shot tool.
**Owner**: not recorded

## 2026-07-31 — [Correction] Fill the construction spec with a ‘researched recommended range’: bootstrap trigger 8 (domain to capability), 6 (capability to element), prioritizing living-vault p90, and the dogfood vault is fully regenerated, not repaired

**Why**: Owner issued two corrections: the council's rejection of hard fan-out caps was being conflated with the owner's actual request for a researched recommended range for new users, and the owner explicitly reversed the prior record's decision to only partially repair the dogfood vault.
**Prior**: A single po-evidence pass researched descriptive vs normative ontology-size guidance. The qualification gate, no-hard-cap stance, and advisory principle of the immediately preceding record stay valid; this record corrects and extends two points on it.
**Decision**: Recommended trigger ranges are set at domain-to-capability 6-10 (center 8) and capability-to-element 5-7 (center 6); a live vault's own p90 takes priority over these defaults once a kind has 10+ parents. Dense-parent warnings fire only below 70% reference-resolution or with bulk-provenance. The dogfood vault and shopping-mall sample are deleted and regenerated from scratch by an agent following the new construction spec, with zero manual correction allowed.
**Dissent**: none recorded as such; two prior factual claims are corrected: OQuaRE's NOCOnto does have threshold bands, and Miller's 7±2 does not apply to recognition tasks so is not used as this spec's basis.
**Falsifier**: If the new vaults' measured median distribution converges clearly away from 8/6, replace the constants with the measured values; if fully-resolved parents with 20+ children still prove unmanageable, count-based signaling is reconsidered.
**Owner**: owner approved, 2026-07-31; whether 8/6 themselves are right remains open pending regeneration results.

## 2026-07-31 — The ontology construction spec is a node qualification gate, not a fan-out ceiling, the 92 were unresolved strings, not children. The spec has three canonical sources (values, logic, text); LLM text derives from one English canonical source through two paths (MCP, internal chat)

**Why**: Owner demanded that 60 children under one parent makes no sense and that tools must organize well, holding for both code defense and system prompts including non-frontier LLMs; a public-contract and direction change convened a full 5-seat PO council.
**Prior**: The 2026-07-31 "3D split-device rejection" record's DENSITY_GATE_THRESHOLD=12 stays valid as a render-geometry constant, independent of this decision.
**Decision**: `cli-developer-entry`'s 92 `elements:` were unresolved file-path strings, not real children (92/92 unresolved against 41 real element nodes vault-wide); a fan-out cap would not have caught this category error. The spec's core is a node-qualification gate, not a cap: no fixed count cap at any layer. Three canonical sources are set: values in schema.mjs, write-time resolution checks in vault.mjs, and English-only procedural text in a new construction-spec.mjs, interpolated everywhere. Violations warn plus suggest an action; they never hard-reject.
**Dissent**: The strongest dissent: N&M's 2-12 branching-factor guidance is still valid, citing OntoQA/OQuaRE keeping branching factor first-class and schema.org/GO/SNOMED top-level counts, arguing count itself deserves a warning.
**Falsifier**: If, even after all qualification gates are active, a parent made entirely of real nodes still grows to 20+ unmanageable children, count-based signaling is reconsidered after PR4/PR5's first growth report.
**Owner**: owner approved, 2026-07-31, as an execution order.

## 2026-07-31 — The prescription for 140ms drag: candidate 2, ‘make the limit real’, adopted, but 78% of the real culprit was separation, not FA2, and Barnes-Hut was already on

**Why**: Owner-confirmed defect on node dragging: rAF work of 139.9ms measured during drag, 136.8ms on the owner's own machine, with persistent long tasks.
**Prior**: Cites 2026-07-29 "background origin redefinition" and 2026-07-28 /download's dissent #3, whose falsifier ("the map stutters") is now partially observed; that record's "repair cost structure, don't abandon the engine" is this record's starting point.
**Decision**: Candidate 2 ("make the limiting real") is adopted: microbenchmarking showed 78% of the cost (109.3ms) came from relaxNodeSeparation's O(N^2) pass over all 3000 nodes, not FA2 (22.7ms); Barnes-Hut was already enabled, so candidate 3 was a no-op. Fix: a one-time sub-simulation scoped to the affected hop set, a required moveableIds argument using a uniform grid (109.3ms to 0.92ms), and committing the tug offset at release to avoid a velocity-sign reversal.
**Dissent**: Candidate 1 (fully disable FA2 during drag, settle with FA2 only at release) was simplest with zero sub-sim maintenance cost.
**Falsifier**: If neighbor-trajectory curvature in motion-verify S1 is imperceptible, or the sub-sim boundary ring causes new defects, candidate 1 was right; recheck after candidate 2 ships and one S1-S5 pass.
**Owner**: owner delegated the call to chief, 2026-07-31; reversal would be recorded.

## 2026-07-31 — 3D rejected even as a ‘splitting device’: the root of the density is having no expand gate, plus 0 rank channels for the crowd

**Why**: Owner reported a real defect on a synthetic map (~150 nodes, only 2 labeled, identical squares, a "+61" chip expanding all at once): "too crowded to tell apart, any fix?" This reopened whether a third dimension could split density on one plane rather than adding to it.
**Prior**: none (a prior 3D round exists only in conversation, unrecorded; this record retroactively documents its conclusion too).
**Decision**: All four design seats reject 3D again, including as a density-splitting device, since no axis justifies it and free rotation destroys the radius ramp that is the only working hierarchy channel. The real root cause is that DENSITY_GATE_THRESHOLD=12 is not applied recursively to expansions. This slice applies the existing gate recursively: only top-K (DOI-ranked) children show, the rest nest into a chip, reusing the existing 12 cap.
**Dissent**: The expansion cap is hygiene, not the answer: a working-copy test cut nodes from 150 to 72 while labeled ratio stayed 13.3% and legible ink increased 0%; the owner's complaint was "can't tell apart," not "too many," and the real fix is the label contract.
**Falsifier**: If the owner reports "still can't tell apart" again after the gate ships, or labeled ratio in expanded crowds doesn't rise, the hierarchy seat's ordering was right and its label-contract item is pulled forward immediately.
**Owner**: pending (accountable: owner)

## 2026-07-31 — Instructions are loaded when needed, not all at once: AGENTS.md stays under 32KiB, rules go from 73KB to 13.6KB conditional, and mandatory rules move into hooks

**Why**: Owner directive to overhaul the agent-context harness; measured fact: AGENTS.md was 39,617 bytes and Codex was silently truncating everything past its 32,768-byte cap mid-sentence, hiding the entire vault write loop from Codex, unnoticed because the existing check that reported this wasn't wired into any workflow.
**Prior**: none
**Decision**: Keep AGENTS.md under 32KiB (cut to 29,280B), trimming only content derivable from the codebase, and wire `pnpm agents:check` into CI with an early-warning band. Only three of `.claude/rules/` files stay always-loaded (forbidden, git, local-first); five become path-conditional, with a contract test verifying each glob actually matches files today. Irreversible rules (unsafe git ops, hand-editing generated JSON) move from prose to PreToolUse hooks.
**Dissent**: A partial diet is insufficient, since 85KB is still large and the official cost-reduction strategy is conditional loading from the start.
**Falsifier**: If new violations don't decrease after the diet, or an agent violates a stated rule again, escalate to a full restructuring, recheck two weeks after this overhaul merges.
**Owner**: not recorded

## 2026-07-31 — Split the guide into six chapters (`/guide/[segment]`), and the reading surface sits at the center of the screen

**Why**: New surface (`/guide/[segment]`) requested directly by the owner: "analyze it and split the guide into several pieces for me."
**Prior**: Cites and keeps valid 2026-07-30 "Two reading surfaces at the gateway"; nothing it decided is reversed, only one page becomes six.
**Decision**: Split the guide into six chapters at `/guide/[segment]`, with order/slugs/translation keys sourced from a single `GUIDE_PAGES` constant; no new content store is created, and the first chapter renders directly at `/guide`. Reading surfaces also center the prose column on screen, correcting an out-of-scope application of the gateway's "everything shares one x" rule.
**Dissent**: There is not yet evidence six chapters beat one; the split originated from another product's doc layout, not bounce data, and a single document loses Cmd+F searchability across chapters.
**Falsifier**: If guide visitors bounce only on the first chapter and rarely open a second, the dissent was right, and what to revert is the table-of-contents labeling, not the split.
**Owner**: owner ("analyze it and split the guide into several pieces")

## 2026-07-30 — Ship two reading pages on the gateway: `/guide` and `/changelog`, rendering the vault documents, not a hand-written marketing page

**Why**: New routes normally require council review, but the owner decided directly: "let's build a real guide for this project, using guide instead of docs since docs is already taken."
**Prior**: none stated
**Decision**: Two new routes render vault-internal markdown (GUIDE.md, CHANGELOG.md) directly rather than hand-written marketing copy, plus two gateway chrome links and a disabled X placeholder. "Guide" is used instead of "docs" since `/docs` is already the vault picker/editor. The changelog is truncated to the last 12 entries, with the UI stating the truncation and original location.
**Dissent**: There is no second observation channel confirming this is needed; the change originated from the owner seeing another product's nav, not visitor complaints, with 14-day unique visits at 35 and no observed download conversion.
**Falsifier**: If post-launch download conversion stays at zero and `/guide`/`/changelog` visits stay under 5% of gateway visits, the dissent was right, and the fix is questioning what the gateway promises, not these pages' content.
**Owner**: owner ("okay, let's build it!")

## 2026-07-30 — Redefine clip A as a ‘feature tour’: the terminal and typing clause is gone, and the tool button order now derives from `AGENT_CLIENTS`

**Why**: Owner directly stated the connected-to-Claude-Code state doesn't need to be shown since it's just a feature-tour video, and separately ordered the button-order bug fixed, the app rebuilt, and the clip reshot.
**Prior**: Cites and partially overturns 2026-07-29 "scenario" record's definition of clip A (terminal plus human typing) and its shooting-order rationale.
**Decision**: Clip A is redefined as a feature tour (map focus, docs, composer, insights, projects, back to map), dropping terminal/typing beats, so the "human typing only" clause no longer applies since its subject vanished. The tool-button row order is fixed to derive from and match `AGENT_CLIENTS`, locked by a contract test; this requires an app rebuild, so clip B is reshot too.
**Dissent**: none
**Falsifier**: If clip A's redefinition was wrong, visitors watching the demo would report not understanding what they're doing with the agent, since clip B alone can't convey connection value; recheck after publish and first feedback.
**Owner**: jinan (two direct quotes)

## 2026-07-30 — `/` decides only the language: route-restoration removed, the gateway is the web's main face

**Why**: Owner opened `/` and got redirected to `/ko/topology/`, reporting it as a bug, though the code worked as designed: the browser simply remembered the last route.
**Prior**: Cites 2026-07-30 "root-first-open reversal" as still valid (made `/` the face); route restoration was left untouched then, and this record removes only the restoration behavior.
**Decision**: Remove route-restoration behavior; `/` now only routes to `/{ko|en}/`, never to a remembered prior route. Restoration stays a virtue inside the installed app, but on the public gateway it makes the site's face vary by visitor history, so even the owner can't see their own first impression.
**Dissent**: Returning visitors genuinely found restoration convenient, avoiding re-navigating to the map every visit.
**Falsifier**: If returning visitors are observed having to re-navigate to the map every visit, the dissent was right, and what should be restored is a quicker path from gateway to map, not the face-varies-per-person behavior.
**Owner**: owner ("yes, do that")

## 2026-07-30 — Global scope is added as an option, without flipping the default; outside the vault, the tool writes, not the app

**Why**: Owner observed that most people connecting agents probably prefer a global setup over per-project, and asked whether global scope should be supported.
**Prior**: Cites `agent_setup.rs`'s rationale (writing a user's global home config is too broad for the "writes require explicit approval" principle) as still valid; the request is satisfied without the app touching the home directory.
**Decision**: Add one "scope: this folder / this whole computer" segment (no new surface); when global is chosen, the app writes nothing but gives commands with the vault's absolute path filled in. Default stays project scope, sticky once chosen. Research across 12 MCP-vendor docs found 12/12 offer a copyable CLI command, 0/12 recommend direct config editing, 0/12 default to global.
**Dissent**: Defaulting to project costs most users one extra click, since the owner's own observation is that most will want global; accepted as an option but rejected as the default.
**Falsifier**: If installed users choose global over project at a rate exceeding project, and abandon the flow without copying anything, the default flips to global; if a vendor formalizes direct config writes with a merge/lock strategy, promote the scope-user command copy to one-click.
**Owner**: owner (delegated the research-then-decide call)

## 2026-07-30 — Demo recording: the owner overrides cursor discipline (automation allowed), and two gate clauses updated

**Why**: Owner directly instructed the agent to start and finish the demo shoot itself using computer use, while the owner stayed hands-off.
**Prior**: Overrides the same ledger's 2026-07-29 "scenario" record's cursor rule (human hands only, no automation) and clip A's "human hand typing" clause.
**Decision**: Keep the two-clip script as-is, but override the cursor/typing rule: the agent shoots using cliclick, moving via quadratic-bezier arcs with ease-in-out to preserve inertia, since the ban's real reason (no inertia in straight teleports) is honored, not automation itself. The demo vault switches from the dogfood copy to a music-streaming vault since dogfood's internal vocabulary doesn't suit an audience unfamiliar with agents; shooting order is forced B-then-restart-then-A.
**Dissent**: The agent's own original clause (human hands and typing only) is the recorded dissent.
**Falsifier**: If the final footage shows constant-velocity cursor movement or viewers say it "looks synthetic," the original clause was right and shooting reverts to human hands.
**Owner**: not recorded

## 2026-07-30 — Implement the flip of ‘root-first-open’: `/` is the face for web visitors, the map is `/topology`

**Why**: Owner asked whether `/` used to show the download page and questioned why `/topology` was separate, prompting implementation of a previously signed-off but undeployed change.
**Prior**: Delayed implementation of the 2026-07-29 night record, which had already signed off on changing `/`'s character; code had partially shipped but the screen hadn't caught up.
**Decision**: `/` and `/topology` are swapped: `/` becomes the promotional/download face for web visitors without a vault, `/topology` is the map. Route memory is kept, prioritizing returning visitors as workers. The app's own `/` still opens the map via `isGatewaySurface()`; `/` and `/download` render the same view, differing only in breadcrumb chrome.
**Dissent**: The prior root-first-open argument (the map should be the zero-click first screen even for self-hosted users) survives half: vault-open users and the installed app still get zero-click map; the half that died is that the map is better even for a visitor who hasn't opened anything yet.
**Falsifier**: If, after the switch, direct `/topology` traffic doesn't rise while download conversion also stays flat, the face didn't do its job, and the fix to try first is questioning the face's copy, not reverting `/` to the map.
**Owner**: not recorded

## 2026-07-29 — Brand mark: adopt the sheet's ‘layered hexagon’, normalize the geometry, keep the stroke hierarchy as original (thin at the middle, thick at the core), 3 size tiers (full, abbreviated, mini), and brand-asset gradients stay outside the charter's reach (limited to the single indigo hue ramp)

**Why**: Chief ruled solo (no council) because the owner had already finalized the mark and named fable, saying "make it perfectly"; trigger was a full brand-asset replacement plus forbidden.md's gradient-ban boundary.
**Prior**: none (first brand-mark record in this ledger).
**Decision**: Normalize the generated image's errors but keep the original's measured stroke hierarchy (outer 18, middle 13, core 19, spoke 13, node r23, 512 viewBox). Three size tiers apply (full >=64px, abbreviated 20-48px, miniature <=18px). Brand assets alone may use one indigo hue ramp (#787EF6 to #3E4BDF); the in-app mark stays solid currentColor.
**Dissent**: Reading "use perfectly" as pixel-exact reproduction, since normalization could change the impression of the image the owner picked.
**Falsifier**: If the owner sees the normalized mark rendered and says it differs from the original, revert to the original ratio (0.843) and the measured stroke values; revisit right after the owner sees the new icon live (Dock, nav rail, favicon).
**Owner**: owner (signed for mark adoption itself; normalization interpretation and 3-tier sizing still pending recommendation).

## 2026-07-29 — Finalize the background 3-option choice (owner signed, partially reversing the redefinition above): dots, proximity constellation, depth dots

**Why**: Direct owner decision overturning the council record immediately above; the owner rejected deleting all three moving backgrounds and asked for dot plus proximity constellation plus one more "cool effect" background.
**Prior**: overturns part of 2026-07-29 "redefine the map background origin," which recommended deleting all three moving backgrounds.
**Decision**: Keep dot and proximity constellation (web); delete flow and gravity fields. Add a third background, depth dots: three parallax layers of the existing dot (alpha 0.030/0.044/0.055, capped under 0.08), zero new tokens, reusing `--canvas-bg-particle-rgb`/`--canvas-bg-ink-max`. Users who picked flow or gravity are migrated to web.
**Dissent**: The council's 4-seat verdict to delete all three moving backgrounds lost the proximity-constellation portion to the owner's decision.
**Falsifier**: If proximity constellation is observed obstructing map reading (node-reading delay or misreading reports), delete it; if depth dots read as "messy" rather than boring at rest, reduce layers 3 to 2 or revert to one dot. Revisit after 4 foreground-promotion items ship plus one owner hands-on check.
**Owner**: owner (explicit signature on this record).

## 2026-07-29 — Redefine the map background from first principles: the background's job is to be a ruler, fixed to a single dot style, delete the three moving backgrounds, and move “wow” to the foreground

**Why**: All 11 background candidates (round 5) were rejected on the same surface, and the owner reversed the previously adopted flow/proximity-constellation/gravity trio ("all bad, who designed backgrounds like that"), after repeated solo-path failures.
**Prior**: none formally overturned; the 3-background adoption itself was never logged in this ledger, only in a code header.
**Decision**: Fix the background to dot only; delete `animated-background.ts` and its wiring in `use-topology-loop.ts`; remove the "map background" settings picker row and its storage key; delete the orphaned `--canvas-bg-ink-max` token. "Wow" moves to 4 future candidates (edge weight, cursor-response recipient, camera arrival altitude, drag mass), out of this slice.
**Dissent**: design-workbench argued for opt-in retention of the 3 backgrounds with only cursor-heating removed, citing zero prior art of persistent particle graphics behind a work canvas.
**Falsifier**: If, after deletion, the owner re-requests a moving background, the deletion was excessive; reopen as cursor-inert plus 3s sleep. If gravity's data channel is spontaneously read by a majority after 30s idle, the "dead channel" verdict was wrong.
**Owner**: pending (accountable: owner; not yet signed as of this record).

## 2026-07-29 — Audit follow-up: 4 MCP public-contract items are bug fixes, not direction decisions, restore them to where the docs already promised, without widening the contract

**Why**: `decisions:check` flagged the `mcp/src/index.js` change as a public-contract change; only 2 of 4 items actually change observable behavior, so a one-line false-positive dismissal was not enough and a record is kept.
**Prior**: none named as overturned; frames itself against AGENTS.md's existing promises.
**Decision**: Treat all four MCP items as reverts, not new capability: `validate_vault` gains `duplicate-slug` (error); `compile_ontology` stops counting `.md` files without `kind:` and reports `skippedNonNodeCount`; `query_ontology(cycles)` counts length-1 cycles; the `vault_conflict` error names the real recovery instead of `force:true`.
**Dissent**: Item 2 changes an observable number (a compile count could shift from 98 to 97 overnight), silently breaking any agent dashboard built on the old value; item 3 could similarly wake automation trusting `totalCycles: 0`. A safer path adds a new field (`graphNodeCount`) and keeps the old value.
**Falsifier**: If even one bug report surfaces after release from an agent or script broken by the `compile`/`cycles` number change, restore the old value as a separate field and promote `skippedNonNodeCount` to default exposure.
**Owner**: stark (per owner instruction "fix everything that needs fixing").

## 2026-07-29 — Footprint customization: accept the owner's reversal, a ‘map’ drill-in subview instead of tab syntax, yellow becomes a dedicated token separate from the hub, glow gets a new charter exception (static, capped at 6px, default 0), and 11 values become 8 exposed controls

**Why**: The owner explicitly reversed items 6 (amber+glow, unanimously rejected) and 7 (settings customization rejected) from "retrial of the walked path," asking for size/weight/fill/distance/alpha to be configurable in Settings, with footprints glowing yellow.
**Prior**: overturns items 6 and 7 of 2026-07-29 "retrial of the walked path"; whether to build the feature at all was not contested.
**Decision**: No new tab; add a "Map" drill-in row (segments: Background, Footprints) reusing existing subview push/pop. Default yellow via new token `--color-footprint-trail` (distinct from hub amber #d4b478). Glow gets a charter exception (opt-in, default 0, cap 6px). perEdge becomes a 2-step density toggle, edgeScale fixes at 0.9, edgeGap merges into one distance control, strokeWidth shows only when filled=off; ranges lock (opacity min 0.5, size min 9, bloom max 6). Delete `footprint-ring.ts`.
**Dissent**: design-lead opposed both the glow slider ("hiding a forbidden default-0 value behind a control is a trap") and defaulting to yellow, since amber already plays two roles in the first viewport.
**Falsifier**: If a shipped glow screen shows ink inversion (footprint outranking hub/selection ring), remove the glow slider; if hub/footprint confusion is reported, switch default to indigo; if the owner reports glow feels too weak at the 6px cap, raise it back toward 12px.
**Owner**: pending (accountable: owner; items narrower than the owner's original wording will be logged if reversed).

## 2026-07-29 — Visited trail re-ruling: step, not rank, the number moves into an existing number slot rather than a new badge, and footprints go into a lane beside the line

**Why**: The owner's hands-on check diverged from the prior verdict, and that record's falsifier 1 was observed (the 6px glyph was invisible in real use); the owner also asked explicitly for a UX-considered presentation.
**Prior**: partially overturns 2026-07-29 "the walked path: erase the ring, use a footprint glyph" (rank model, cornerless glyph, rank alpha ladder, rank0 indigo numeral are reversed; ring deletion, lens-on repair, arrival motion, and imprint-not-glow stay valid).
**Decision**: Replace the rank model (recency decay, cap 3) with a step log (visit order 1,2,3..., revisits are new entries); `buildFootprintRanks` becomes `buildFootprintSteps`. The step number takes over the existing engraved numeral slot in the node, hidden on unvisited nodes during the lens; footprints move to a lane beside walked edges (two filled ellipses, 10px, single-side, 3 marks, fading toward the older end, no rotation). Alpha becomes uniform 0.70 for visited elements; unvisited items and INDEX demote to alpha 0.42. Amber, glow, and settings customization are rejected again.
**Dissent**: design-infoviz argued map numerals should be current-position-only with history in a sidebar, that removing node alpha decay loses recency signal, and that shoe-anatomy glyphs are illegible at 8-10px; design-system argued both-side edge placement was more faithful to the owner's wording.
**Falsifier**: If visited-node numerals clutter the map, shrink to current-position-only; if recency is reported lost, add a signal on the last-step node; if footprints aren't perceived as footprints, simplify shape; if dense-hub fixtures show no interference, reconsider both-side placement; if taste mismatches recur, open a motif on/off toggle.
**Owner**: pending (accountable: owner; amber/glow rejection and single-side placement are recommendations against the owner's own proposal).

## 2026-07-29 — Visited trail: remove the ring, use a footprint glyph instead (translate "make it glow" as imprint, not glow)

**Why**: Convened by owner request ("bring in the designers too") after the owner reported the footprint feature did nothing visible on the map, plus the charter-conflict word "glow" and prior emotional-framing overreach risk (07-24).
**Prior**: none named as overturned; footprint motif adoption itself was already closed by the owner.
**Decision**: Delete the footprint ring entirely, replacing it with a footprint mark: a 6px stroked, unfilled glyph at the node's top-right corner, colored `tokens.edgeSelected`, drawn only for ranks 0-2 at alpha 0.70/0.56/0.45 (all pass 3:1 contrast), rank 3+ not drawn; only rank0 carries a visit-order numeral. Repair lens-on rendering, demote the left vault CTA with map dimming, and translate "shine" as imprint, not glow. Code lands only after demo-video recording.
**Dissent**: design-infoviz/chief argued even outside the orbit, three ranks remain unreadable; design-interaction proposed dashed adjacent-step edges on brushing, deferred out of slice.
**Falsifier**: If rank1/2 glyphs prove invisible outside the orbit, collapse to rank0 only; if corner glyphs overlap labels at dense zoom, reconsider partial-arc. Overturned by 2026-07-29 "retrial of the walked path" for the rank model, glyph, alpha ladder, and rank0 numeral; ring deletion and imprint-not-glow remain valid.
**Owner**: pending (accountable: owner).

## 2026-07-29 — First-page demo video scenario: 2 clips, 2 tabs, no cuts, no loop, silent

**Why**: This is the first public-impression asset with high reversal cost (no regeneration pipeline), so chief convened two targeted seats (po-craft and design-motion) in parallel, each submitting a complete scenario after real-app measurement.
**Prior**: none named as overturned; builds on the same-day placement decision to put the demo on the front page.
**Decision**: Two clips, two tabs, muted, no loop, no BGM, DOM-overlay `.vtt` captions (ko/en). Clip A (21s, uncut, autoplay): a dogfood-vault copy, terminal with Claude Code connected, a typed instruction completes an `add_relation` call and the map/record tab react live. Clip B (11s, poster + play button): connecting an agent via "Connect to Claude Code," ending on the actual returned node name. Human hand only for cursor movement; the causal subject in-frame must be the external agent/terminal/git.
**Dissent**: po-craft argued for 3 separate looping clips (connect 8s, reflect 7s, record 7s) with an honesty caveat against implying a live claim; design-motion self-rejected a single uncut clip with no tabs, contingent on rehearsal timing.
**Falsifier**: If clip A's completion rate is under 50% before the 0:11 reflection beat, po-craft's 3-clip split was right; if rehearsal 1 measures the connect-to-reflection span at <=25s, design-motion's single uncut take without tabs was right.
**Owner**: pending (accountable: owner).

## 2026-07-29 — The demo video goes on the first page (contrary to the council verdict) (night, owner signed)

**Why**: Same-day, chief's 5-seat PO council verdict recommended placing an uncut clip in the `/download` corridor, pending owner signature; the owner instead decided to place the demo prominently on `/` for an audience including people unfamiliar with agents.
**Prior**: overturns the same-day PO council verdict recommending `/download` corridor placement; also revises the "root-first-open" decision that `/` shows the map directly with no separate marketing landing.
**Decision**: Place the demo video prominently on the `/` home page (Orca-style home structure); the council's two founding principles still apply (don't film shared surfaces; show only what the web structurally cannot do). `/download`'s "zero scroll" contract narrows to "the install 3-step doesn't collapse."
**Dissent**: The council's 5-seat convergent recommendation was an uncut clip in the `/download` corridor, reasoning that cutting reads as advertising while an uncut take reads as evidence, and enlarging the space would force cuts and captions back in.
**Falsifier**: If, after the front-page section ships, download conversion doesn't move, or visitor feedback still says "I still don't know what this product is," the council was right, and the fix narrows to one uncut take rather than a bigger section.
**Owner**: owner (signed same day; placement and audience assumption are closed by this record).

## 2026-07-29 — Gateway demo: translate "full tour at the bottom" into "one uncut take down the corridor", and the GitHub button is a separate hygiene issue

**Why**: Owner instruction ("show it all at the bottom") plus a same-day tension with the morning's "one screen" scroll contract, and this being a first-public-impression asset, triggered a 5-seat PO council over 2 rounds.
**Prior**: none explicitly overturned; interacts with the same-day "one screen" contract (kept unmodified) and repays the evening hierarchy-seat dissent about a "reserved empty corridor."
**Decision**: Score 13/24 (below the 18 pass line) yields "shape a slice," not full build. One uncut clip only: "Connect Agent" writes a real absolute path, the agent edits the vault, and the map/record tab react live, on this repo's own vault. Placement is the corridor right of the download card in the first screen, sized from `computeGatewaySafeInset`'s atomic values. Master stays retina 2x; web delivery is compressed (10-15MB, self-hosted). GitHub button gets a weight promotion only, as separate hygiene.
**Dissent**: po-wedge argued for building a regeneration pipeline (re-recording the demo each release via a real agent session) now, to reach a higher Differentiation score.
**Falsifier**: If the video drifts out of sync with the real screen after the next redesign and stays unfixed, po-wedge was right, opening a regeneration pass; if "what does installing change" is still asked or conversion stays flat, one scene wasn't enough; if install-versus-web CTA ratio stays unchanged, the bottleneck wasn't evidence absence.
**Owner**: pending (accountable: owner; confirmation items: accepting this corridor translation, and the "developer already knows agents" audience assumption).

## 2026-07-29 — Gateway alignment origin: keep the "one set" principle, change only the "fixed left" clause to a symmetric derived origin (verdict 3, second narrowing) (night)

**Why**: Owner pointed out at 1920 width that the left side had noticeably less empty space than the right ("left and right should be equal") and the top bar had right-side empty space too; measurement showed band left margin 64 vs right 256, because the band was left-aligned.
**Prior**: a second narrowing of the same-day morning verdict item 3 (one shared alignment origin); the principle stays valid, only the "no `mx-auto`, meaning left-fixed" clause is overturned, since the evening's atomic-inset refactor removed the reason `mx-auto` was rejected that morning.
**Decision**: Promote a single symmetric alignment origin: `origin = max(--gateway-gutter, (vw - --page-max) / 2)`, consumed identically by the band, panel, GNB, install strip, footer, and the camera reserved inset (1920: 160px each side; 2560: 480px each side). `--page-max` and the gutter step count are unchanged.
**Dissent**: The morning verdict's own argument: making the origin a function of viewport width means every consumer must track it, and if any one goes stale, the +96/+416 mismatch recurs.
**Falsifier**: If, after the expanded gate passes, a panel/inset x-mismatch or left!=right margin is still measured right after a resize, fold the symmetric origin back to left-fixed with honest asymmetry or a discrete symmetric step.
**Owner**: pending (accountable: owner).

## 2026-07-29 — Gateway gutter: keep the "one-set grid" principle, detach only the value (evening)

**Why**: Owner feedback at 1920 width ("too cramped, no breathing room, boxed against the left") triggered a design-lead/design-system/design-responsive session.
**Prior**: partially overturns the same-day morning verdict item 3: the "same x across all widths" principle stays valid, but the fixed 40px value for that x is overturned.
**Decision**: Gutter grows in discrete steps by width: 40 / 64 (>=1536) / 96 (>=2400), matching the app's existing wide-breakpoint vocabulary rather than a fluid `clamp()`. The `544` reserved-width literal is decomposed into three named atomic values (gutter, panel width, gap) consumed only through one function, `computeGatewaySafeInset`.
**Dissent**: design-lead argued the real defect was a "reserved empty corridor," not the gutter: the panel's right edge sits well left of where map ink begins at all three widths tested, so the page's claim that "the product is the background" was still false; the countered proposal was to zero the reservation and raise camera zoom from 1.15 to 1.85.
**Falsifier**: If visitors read the background map as "a pretty pattern" and fail to connect it to the product, design-lead was right, and the fix reopens the skeleton (figure-ground relationship), not the gutter.
**Owner**: not recorded for this evening record (built and compared per owner instruction "make both and show me"; owner picked option 1).

## 2026-07-29 — Gateway download: the caption counts its own drawing, the grid becomes one set, and the map gets a leash

**Why**: A 2-round design council converged on type promotion (34px) and fixed-floor stage removal, and design-infoviz flagged a number contradiction (hub-engraved 379 vs caption "96 concepts") as a pre-composition P0 repair.
**Prior**: none named as overturned; the "map is the page" skeleton from 2026-07-28 is kept (its falsifier unobserved).
**Decision**: The caption counts the same rendered graph it describes (`useStageGraph()` output), showing "287 concepts · 447 relations," hub-engraved 280; replace `stage-graph.ts`'s own recursive descendant count with the shared `computeDomainCensusRows` call. Left-fix the panel so its right edge is 520 at every width (removing 3 `mx-auto` re-centerings). Add `--topology-v2-camera-pan-leash`, default 0 (unchanged for `/topology`), 220 for the gateway only. Deleted: `--page-col-utility` token, the install-3-step's section status (kept as 3 lines in the footer strip), `releaseGateNote`'s free paragraph, CTA label's `· {size}` suffix, the `md:text-[34px]` eslint-disable exception, and `stage-graph.ts`'s 26-line recursive census.
**Dissent**: design-workbench argued nothing should be cut since every line is a fact needed for the install decision, specifically that removing the headline from the panel leaves a "context-less button box"; design-infoviz separately argued for a contrast promotion to 3:1, found unnecessary after remeasurement (H1 18.62:1, lead 6.09:1).
**Falsifier**: If visitors ask what "287 concepts" counts or contrast it with README's "97 nodes," change what the map draws, not the caption; if the pan leash is reported stiff, raise 220; if a file-size inquiry appears at `<sm`, restore it to the facts row; if 31px scroll at 1280x800 is reported as a defect, widen the promised first-screen width.
**Owner**: not recorded (unsigned as of this record; owner confirmation pending).

## 2026-07-28 — Gateway council, 4 seats: scroll trap, camera hard cap, "this page has never said what it is"

**Why**: Owner directly requested convening design, motion, and marketing specialists after reporting the graph felt "fixed" when they wanted to drag it, and that it should be able to be a bit bigger.
**Prior**: none named as overturned.
**Decision**: Fix the accidental scroll trap where the wheel handler's unconditional `preventDefault()` blocked page scroll on a canvas covering 62.1% of viewport, by promoting the behavior to a contract, `wheelIntent: 'zoom' | 'page-scroll'`. Raise `--topology-v2-camera-scale-max` from its hard cap of 2.6 so the graph fills more of the frame (measured ink bbox 438x409 to 1020x670, panel contrast 0.79x to 3.0x). Promote the H1 sentence below the fold at 778px ("You find code with grep. Where do you find why?") above the fold, replacing the viewer-verb H1 claiming Obsidian's territory. Reject the GitHub star badge (5 stars is disconfirming, not trust-building).
**Dissent**: design-motion argued gateway visitors structurally never reach the ambient-idle sleep state (30s delay) so burn-in prevention doesn't live on this page, and that at-rest ink change is only 0.056%/s, meaning the comet is imperceptible while still paying workbench-level cost.
**Falsifier**: If low-end-device heat or stutter reports emerge, or gateway-session CPU is measured as a problem, the ambient-idle dissent was right; fix via the `ambientSleepDelayMs` prop (3000ms), left unapplied in this pass.
**Owner**: not recorded (unsigned as of this record; owner confirmation pending).

## 2026-07-28 — `/download` redesign: **the map is the page**. The product is the background and download floats on top of it

**Why**: Owner directly criticized the download page twice in one day ("why is this so ugly? there's not even a dmg download"), then rejected an incremental-improvement option and asked for a full rebuild without reusing prior memory.
**Prior**: overturns PR #730 "download screen remake" and the same-day "`/download` is a gateway-style landing" decision; that record's GNB/hero-holds-CTA/single-filled-indigo structure survives, only its organizing principle is rejected.
**Decision**: Turn the hero into a stage running the real dogfood vault graph on the same canvas engine (`TopologyMapV2`) as `/`, draggable but without workbench chrome (no INDEX panel, datasheet, or control bar); the download panel becomes one opaque card floating on top. Fix data-source pinning via `useDogfoodInsight` so the caption's vault claim matches what's rendered. Below the fold carries the sales pitch and 3-step install, while signature/notarization/checksum proof is demoted to a footer disclosure, not deleted. Delete `miniature-layout.ts` and its test, and the earlier static-portrait generator `dogfoodVaultPortrait`.
**Dissent**: PR #730's own point ("returning to a landing brings back the bloat of 17 boxes") stands as dissent, alongside a po-leverage-style dissent asking why redesign a page with only 6 measured downloads, and a workbench/performance dissent that the physics engine adds first-paint cost.
**Falsifier**: If box count exceeds 10 again or page height exceeds 2000px, the reversal was wrong; if after v1.0.0 ships downloads still don't track visits, the problem was inflow/release, not the page; if gateway first-paint metrics visibly worsen, fall back to a cheap first-frame layer under the engine (and fix `/` the same way).
**Owner**: not recorded (unsigned; pending owner decision on whether to feature the currently-live signed RC).

## 2026-07-29 — Skill md answers with a "copy-matching view," not an editor (read-only, desktop only)

**Why**: Owner requested that skill (.md) management also be possible "from Docs," a new-surface candidate requiring a 5-seat PO council rather than a solo pass; solo-pass rubric scored 17/24, under the 18-point convening threshold.
**Prior**: none named as overturned.
**Decision**: Ship only po-wedge's slice 1: a read-only, desktop-app-only view showing whether skill copies match across `.claude/skills` and `.agents/skills`, judged match / diverged / missing. Data is read via the desktop bridge (absolute paths), not the manifest, since the manifest walker's dot-directory filter structurally excludes `.claude/`/`.agents/` from web reach. Reject a new editor and reject promoting SKILL.md frontmatter to the vault's `kind:` schema. Fixing divergence stays an off-screen handoff (CLI `agent-files`), not an in-app action.
**Dissent**: po-evidence questioned whether this desktop-only, dogfood-only scope is a legitimate product decision, since the entire measured population might be this one repository, in which case CLI `agent-files` is already the correct home.
**Falsifier**: If, after shipping, no non-dogfood vault with dual skill copies is observed and the view catches the same divergence set CLI `agent-files` already catches, the view was a duplicate; remove it and return to the CLI as the single answer.
**Owner**: stark (signed 2026-07-29, "proceed as is").

## 2026-07-28 — Cut exploding graph queries honestly, with a budget (`cycles`)

**Why**: A code-quality review found and measured that `query_ontology({operation:"cycles"})`'s DFS is exponential and its only early-exit was "a cycle found," so a healthy zero-cycle graph (60 nodes, 444 edges) took 10.9 seconds and blocked the single-threaded stdio MCP the whole time.
**Prior**: none named as overturned; extends the existing `allPaths` budget mechanism rather than inventing a second one.
**Decision**: Port `allPaths`'s budget contract onto `cycles` unchanged: add `searchBudget`, `expandedStates`, `exhaustive`, `truncatedByBudget`, `totalCyclesExact`, and `evidence` to the response, and accept a `searchBudget` argument, matching field names and `saferQuery` formatting from `allPaths`.
**Dissent**: A token-budget dissent argued six new fields is a real public-surface cost, and reusing an existing field like `limit`, or silently truncating with only the budget noted, would keep the response lighter.
**Falsifier**: If agents never cite the new fields and only read `totalCycles`, or if the larger response is measured causing real context pressure, fold the fields back and merge into a single `evidence` field.
**Owner**: stark (per owner instruction "proceed in that order").

## 2026-07-28 — `/download` is a gateway-style landing page: it sheds the workbench rail, and the hero holds the primary CTA

**Why**: Owner reported dissatisfaction ("why does this look so bad, the download button barely renders") and questioned the left-rail workbench structure, suggesting a top GNB or scroll-driven layout.
**Prior**: overturns PR #730 "download screen remake" (2026-07-27), which defined the page's job as "judge install eligibility, then get the right file" and removed the landing hero; that record was never logged in the ledger, only in the commit body.
**Decision**: Classify `/download` as a gateway route: drop the left workbench rail for a top GNB, give the page's one filled-indigo CTA to the hero, and keep the macOS card as an action-less fact card. `gh release list` showed 0 published releases at the time (only rc.1/rc.2 tags existed), so the page couldn't perform its defined job, and measurement (1512x950) found the strongest CTA pointed off-page and only 3 of 7 type-ramp steps in use.
**Dissent**: PR #730's own reasoning stands as dissent 1 (reverting brings back the bloat of 17 equal-weight boxes); dissent 2 argues once a release publishes, the original job revives and the structure will need to change again.
**Falsifier**: If box count exceeds 10 again or page height exceeds 2000px, dissent 1 was right (current: 1 filled indigo, 0 horizontal overflow); if after release publication users still can't find the file with the hero CTA promoted to the DMG, dissent 2 was right (mitigated since `HeroActions` keeps the same slot before/after publication).
**Owner**: stark (owner, direct instruction).

## 2026-07-27 — Web and app do not promise the same screen: one codebase, capability gates, vault folder as single source of truth

**Why**: Owner directed that web and app need not match if they use the same data; the equivalence premise had already broken through a stream of desktop-only capability shipping (keychain, MCP bundling, updater, git).
**Prior**: none named as overturned.
**Decision**: Abolish the surface-equivalence obligation. The app is the home base (judgment, agent-connection hub); the web is the gateway (job 1) plus a second-best workbench for Chromium without the app (job 2). One codebase (`frontendDist: "../out"`) plus 4 capability bridges plus honest degradation implement the split; cross-surface data lives only in the vault folder. Web equivalents (web BYOK, web MCP config writing) will not be built; round-trip verification is replaced by 3 web smoke tests plus separate desktop measurement.
**Dissent**: Dissent 1 (web rot): once the owner uses only the app, the web becomes unstaffed even though it's the only inflow channel (35 of 35 visits in 14 days were web). Dissent 2 (identity): repeatedly experiencing "same product, doesn't work on web" turns the gateway into a disappointment device.
**Falsifier**: If the web smoke gate stays red for 2 consecutive weeks, or broken-web reports arrive, re-expand web verification scope; if visits keep growing while download conversion stays 0 and traces to missing web features, reopen the definition of the web's job.
**Owner**: not recorded (unsigned as of this record; owner confirmation pending).

## 2026-07-27 — AI conversation lives in the app's "Agent" panel: inside means an on-screen companion, outside means a delegated worker, web has no touchpoint

**Why**: Owner assigned this design to fable directly; trigger was that the app's new MCP-hosting slice changed the premise of why an in-app chat panel was needed at all.
**Prior**: none named as overturned; keeps the already-shipped Agent panel (#694-#704).
**Decision**: Keep the shipped Agent panel as a screen-viewing companion (context injection, suggest-and-consent, forced citation, session-volatile), distinct from external agents as delegated workers (code evidence, long loops, MCP into the same vault); handoff is vault + git + a copy packet. The web gets no AI touchpoint since key storage is structurally unsafe in a browser (XSS exposure, and the vendor's own header name flags it: `...-dangerous-direct-browser-access`); Windows' AI gap is closed only by a future Windows app.
**Dissent**: Dissent 1 (redundancy): once MCP is available, the panel is an inferior duplicate leaving permanent multi-vendor maintenance cost. Dissent 2 (Windows neglect): the web-no-touchpoint principle leaves Windows users with zero AI even though "the data is the same."
**Falsifier**: If a 4-week audit log shows near-zero `purpose:"agent"` calls while MCP heartbeat is active, freeze the panel and revisit the tertiary-audience hypothesis; if Windows inflow appears, promote a Windows app rather than reopening web BYOK, which stays closed until a vendor officially supports direct browser calls.
**Owner**: not recorded (unsigned as of this record; owner confirmation pending).

## 2026-07-27 — The app embeds MCP: bundled stdio plus auto-written config, and the npm publish plan is dropped

**Why**: Triggered by a public-distribution contract change plus an installed-app identity contradiction: installing the app still left agents unable to connect, and the only guidance was a 100%-failing `npx` command.
**Prior**: overturns the same-day 5-person PO council convergence on "publish to npm first," attributed to the convener's framing error (the "app hosts the server" option was missing from the candidate list).
**Decision**: The app bundles a compiled MCP binary and its "Connect Agent" button writes client config for the user (stdio kept; HTTP transport deferred). The npm publish plan is dropped, but the `mcp/`/`cli/` source directories and publish-guard hooks stay, since 40 dogfood/CI paths still use them. Vault folders outside the repo get written to directly, not the global `~/.claude.json`; quarantine is bypassed for a properly notarized, code-signed nested binary spawned externally, while ad-hoc/unsigned binaries get SIGKILLed; a compiled bun-runtime binary passed the full 32-tool verify suite.
**Dissent**: Dissent 1 (po-leverage): with 0 downloads, this builds a new channel when npm publish was one command. Dissent 2 (ecosystem): MCP registries assume npm distribution; app-only sacrifices discoverability. Dissent 3 (HTTP): stdio has no "is it on" state.
**Falsifier**: If, 2 weeks after the button ships, connect-and-verify success is still 0, the channel wasn't the problem; if external inflow logs show MCP-registry-driven traffic, resume npm publishing, since removal is reversible and publishing isn't; if "is the server on" is asked again after self-verification and heartbeat ship, open `--http` on the same binary.
**Owner**: not recorded (draft; owner judgment pending).

## 2026-07-27 — Build in-app updates (the owner reversed "do not build it" the same day)

**Why**: Apple Developer Program enrollment completed and a Developer ID certificate was issued the same day (expires 2031-07-28), removing the exact risk cited earlier ("an unsigned self-replace fails as the app won't open"); the minisign keypair Tauri's updater needs is also free and one command.
**Prior**: overturns the same-day "in-app update notification is not built yet (6/24)" record.
**Decision**: Build the in-app update popup now, right before the first release, since it's cheapest before users exist; keep the app's restrained aesthetic (no glow or exaggerated motion), and make it easy to dismiss since the app initiates the prompt.
**Dissent**: The observed-phenomenon problem is unchanged (still no users, so "stuck on an old version" can't yet happen); building for zero users means designing frequency, dismissal memory, and failure copy entirely on assumption.
**Falsifier**: When v1.0.1 ships, if people who see the notification actually update, this decision was right; if the notification is ignored or triggers "why is this here," the dissent was right, and frequency/copy/dismissal get redesigned from real measurement.
**Owner**: Jinan (accountable; owner decided directly, "let's do it now, make the popup pretty").

## 2026-07-27 — In-app update notifications are not built yet (6/24, zero critical out of three)

**Why**: Request came in the language of a solution ("build an update popup") with no phenomenon behind it; measurement on 2026-07-27 found 0 public releases, 0 downloads, 1 issue, so "stuck on an old version" cannot yet occur.
**Prior**: none named as overturned.
**Decision**: Do not build (yet). Self-score: Problem insight 0, User moment 2, Differentiation 0, Ontology value 0, Agent value 0, Verification 4, total 6/24 with 3 critical zeros, so no code is written for an unobserved problem.
**Dissent**: The owner's own request is the counter-argument: an app with no update path carries its first bug forever, and building only after users exist is inherently one beat late.
**Falsifier**: After v1.0.0 is actually downloaded, if v1.0.1 draws stale-version complaints or "how do I update" questions, the dissent was right; if people self-check the release page and reinstall, this decision was right. Overturned same day by "build the in-app update" (Jinan).
**Owner**: not recorded (accountable role unspecified here; superseded same day by the reversal record above, signed by Jinan).

## 2026-07-27 — Ship v1.0.0 as an unsigned DMG, and give honest guidance instead

**Why**: There was no Developer ID certificate (no Apple Developer Program membership), and the release workflow deliberately fails without signing/notarization secrets, blocking v1.0.0 from shipping; on macOS Sequoia (15) the right-click bypass is gone, so an unsigned app blocks first launch until System Settings -> Privacy & Security -> "Open Anyway".
**Prior**: none
**Decision**: Ship v1.0.0 as an unsigned DMG but disclose that fact first: replace trust copy claiming all public builds pass signing/notarization with what is currently true, name the Gatekeeper step in the install path, and keep publishing checksums as the only integrity check while unsigned.
**Dissent**: The author's own losing recommendation: first impressions are a one-time resource, forcing every recipient through System Settings is irreversible, and $99/year plus a day or two is cheaper than that cost.
**Falsifier**: If unsigned-DMG recipients actually completed install, the dissent was wrong; if downloads occur but installs or "won't open" complaints follow, the dissent was right. Overturned same day: a Developer ID certificate was issued (expires 2031-07-28) and releases returned to the signed path. The dissent was later confirmed correct: the unsigned DMG was never publicly released.
**Owner**: Jinan

## 2026-07-27 — Turn the council into agents callable from documents (5 PO seats, 8 design seats, chief)

**Why**: A new callable-council surface plus a direction change matched the mandatory-convening trigger list exactly, though this decision itself was made without convening any council.
**Prior**: none
**Decision**: Turn the PO OS's 13 lenses into 5 agents and the Design OS's 7 bench seats into 8 (adding responsive), each as an agent, with `chief` placed above both councils; each of the 6 rubric rows has one signer, and contract tests guard the wiring.
**Dissent**: An adversarial review (opus) argued the very commit creating these councils bypassed council review, with zero council records in the repo, and recommended deleting `chief` and cutting the whole layer to a third: `chief`'s defining constraint ("cannot fix code") contradicts its own `Bash`/`Agent` permissions, no test watches `chief` (seat-count text has already drifted), and nothing actually forces convening (the trigger list is prose in a skill description, tested only for existing).
**Falsifier**: If fewer than 3 records in this ledger show an actual council pass within 8 weeks, the dissent was right and this layer should be shrunk or backed by real enforcement such as a `PreToolUse` hook.
**Owner**: Jinan

## 2026-07-27 — Make the download page a single publish-or-not state, app version v1.0.0

**Why**: Built without convening its own gate; the PO OS rubric scored 10/24 (pass line 18) with two critical zeros (Ontology value, Agent value), which the PO OS says blocks building.
**Prior**: none
**Decision**: Make size, checksum, and download links come only from a single module generated from the actual GitHub Release, removing six placeholders; mark Windows "coming soon"; bump version 0.1.0 to 1.0.0; add a draft to approve to publish gate to the release workflow.
**Dissent**: po-leverage argued `/download` was not a binding constraint: 14-day unique repo visits were 28, external referrers 0, both npm package names unclaimed (E404), so every install path 404s regardless of the page fix; po-evidence separately issued a "Do not build."
**Falsifier**: If the dissent was wrong, download counts should rise meaningfully relative to page traffic after v1.0.0 ships; if right, downloads stay near zero until npm publishing and traffic channels open.
**Owner**: Jinan

## 2026-07-27 — Mobile/tablet and responsive belong in one seat, not two

**Why**: Solo research plus an owner decision on whether mobile/tablet and responsive should be one seat or two.
**Prior**: none
**Decision**: A single "responsive & touch" seat owns the full pointer x viewport matrix; the "workbench" seat keeps only the installed-app platform (14-inch first viewport, window lifecycle, wide density).
**Dissent**: The owner's original request was for two seats ("of course we need mobile/tablet experts, and responsive experts matter too"); research recommended merging because `responsive-sweep` already runs both in one pass, the primary surface (macOS app) is not touch, and two seats conflict without a mediator ("widen the target" vs "tighten density").
**Falsifier**: If a native mobile surface or store-compliance requirement emerges, the merged seat cannot carry platform-certification work, proving the split should have stood.
**Owner**: Jinan

## 2026-08-01 — A slug is a flat identifier: R15 drops the "two element-slug patterns," the write gate rejects path-shaped slugs, and CLI add also stamps authorship

**Why**: An agent with zero spec context regenerated the dogfood vault reporting path-style `elements[]` references dropped from 227 to 0, but measurement showed the win had only moved: all 43 element slugs were paths (e.g. `elements/src/views/home`), and no gate measured slugs themselves.
**Prior**: builds on the 2026-07-31 construction spec "path is evidence of a concept, not the concept," applied here to identity; also revises the 2026-07-31 ledger's "CLI=unknown (omitted)" created_by rule.
**Decision**: Tool-created node slugs are a flat `folderForKind(kind)` name; location is carried only by `path:`. Add a hard-error `flatSlugIssue(kind, slug)` gate (mirrored in `mcp/src/schema.mjs` and `cli/src/lib/schema.mjs`) wired into every write path (`add_concept`/`add_concepts`/absorb, `rename_concept`, `reclassify_concept`, CLI add/import), fix the suggestion generators that proposed path-style slugs (`analyze_repo_structure`, `infer_imports`, `mcp/README.md` R15, CLI add hint), and flatten all 43 existing vault slugs via `rename_concept`. CLI add now stamps `created_by` the same as MCP `add_concept` (`agent:<heartbeat|unknown>`; human declared via `--created-by human`).
**Dissent**: The losing alternative (B) held that slugs are already relative vault file paths, local-first promises respecting user folder structure, and the real bug is the web derivation's tail-folding; fixing identity to the full slug would also resolve nested user-vault basename collisions that flat slugs still leave unresolved.
**Falsifier**: If a real user vault shows screen-merging from nested paths outside schema folders plus tail collisions, alternative B's full-slug identity fix becomes necessary regardless of this decision (the `ambiguous-alias` warning is the current observation channel).
**Owner**: stark

## 2026-08-01 — The tool's field of view was the vault's reach: analyze couldn't see the top-level package, and half of the 8 gate cases were "detecting absence," not "demanding a defect"

**Why**: The regenerated vault was missing `mcp/` and `cli/` entirely (all 43 `path:` values were `src/`), because `analyze_repo_structure` only walked `src/` FSD layers and `apps/`/`packages/` workspace members, leaving root-level independent packages invisible; the product's own agent surfaces (32 MCP tools, 52 CLI commands) were blank on its own map.
**Prior**: continues the same day's "slugs are flat identifiers" finding, a third instance of the same tool-scope bug.
**Decision**: Fix `analyze_repo_structure` to propose root-level directories containing their own `package.json` as element candidates (`detectRootPackages`), gated by `mcp/src/analyze.test.mjs`; reclassify 8 prior "failing gate" cases (half were correctly detecting real absence, not enforcing a defect), restore `capabilities/mcp-server` and `capabilities/cli-developer-entry` via CLI add/relate, correct the self-ontology README census to name the actual command instead of a fixed number, and do not create `scripts/`/`tests/` nodes since they are not independent packages.
**Dissent**: The two capability documents are effectively a third copy of `cli/README` and `mcp/README`, and the gate pins dozens of sentences that a vault node's body should not carry; a node should hold meaning/boundary/evidence and link to reference docs instead.
**Falsifier**: If these two documents' alignment gates break 3 or more times purely from prose-sync drift rather than real content errors, the dissent was right and the gate should shrink to a link-plus-summary contract.
**Owner**: stark

## 2026-08-01 — The criterion for documentation checks: check only what a machine can produce

**Why**: `scripts/check-package-contracts.test.mjs` had grown to 3,419 lines and 2,126 assertions, of which measurement showed 1,915 (90%) merely checked whether a sentence existed in a README, while only 150 (7%) compared against values derived from code; the file's own comments had already noted 4 times in the last month that "the gate was wrong and the docs were right," and a vault regeneration deleted `docs/ontology/domains/onboarding-ux.md` without any of the 1,915 prose pins catching it.
**Prior**: none. Web research found no open-source project enforcing prose pins in CI; only generate-then-diff and lint/broken-link checks are actually used (e.g. Kubernetes `hack/verify-generated-docs.sh`, GitLab `graphql-verify`, OpenClaw `pnpm config:docs:check`).
**Decision**: Check only what a machine can produce; do not check sentences a human judged and wrote. Implement generate-then-diff via `pnpm docs:surface:build`/`docs:surface:check` querying a running MCP server's `tools/list` and checking name coverage in `mcp/README.md` and `cli/README.md`; add broken-link checking via `pnpm docs:links` (external links split into `pnpm docs:links:external`); and remove prose pins, excluding historical documents (`CHANGELOG.md`, `docs/DECISIONS.md`, `docs/archive|audits|superpowers|plans|prototypes/**`) from prose path-citation checks but not from link checks.
**Dissent**: Prose pins were the only device protecting whether docs accurately describe tool behavior; name coverage only sees mentions, not correctness of description, making the new net weaker against docs that describe a tool incorrectly.
**Falsifier**: If within 3 months a case is observed where inaccurate docs caused a user or agent to make a wrong call or expectation, the dissent was right, and the fix is not reverting to prose pins but widening argument/enum comparison against generated registries.
**Owner**: stark

## 2026-08-01 — Lock "out-of-scope state" as a category: a declared-scope registry, and an explicit statement that `vaultScopeKey` is not scope

**Why**: The owner caught one banner in the app ("why does this show in the docs vault?") that turned out to be a class of bug: the same pattern of state outliving its vault scope recurred in five places, producing screens that assert false things (map `?p=` treating a missing node as selected and blurring the whole map; `?pathFrom`/`?pathTo` asserting "no path" when neither node exists in this vault; change baseline and notification-read timestamps keyed globally instead of per-vault).
**Prior**: none
**Decision**: Fix all five occurrences (clear scoped state the instant vault identity changes; state honestly when a link came from elsewhere), and add a gate, `tests/contract/scope-registry.contract.test.ts`, requiring every map query key and every persisted storage key be tagged `global`/`vault-scoped` in a registry, failing on unregistered keys, dead lines, or unprotected vault-scoped keys. Also codify that `vaultScopeKey()` alone is not a scope (it collapses both bundled samples into one `'server'` namespace), introducing a separate `vaultIdentityScope` (`local:<folder>` | `sample:<sample>`) for identity comparisons while freezing the coarse scope only to the four already-shipped locations.
**Dissent**: The registry is a hand-maintained table that taxes every new key and risks becoming perfunctory; cataloging event names too made the table even larger.
**Falsifier**: If within 3 months a case is observed where a registry line exists but is mis-tagged and a defect passes anyway, the dissent was right, and the fix is not deleting the table but making tags auto-classified by value shape rather than human-chosen.
**Owner**: not recorded

## 2026-08-01 — Port the mockup's expansion instrumentation into settings, and **replace** today's chip affordance with an "overhead bar"

**Why**: A prototype instrumentation tool (`.qa-scratch/proto-expand.html`) measured 27 combinations of affordance (floating pill, overhead bar, shoulder badge), expansion structure (fan, ring, column), and three numbers; the owner directed porting the result into the real source with a new settings LNB section.
**Prior**: none
**Decision**: Add an "Expand" section to the settings LNB between "Map background" and "Footprint"; set the default affordance to "overhead bar" (replacing the always-visible `+N` pill and its dashed leash with a docked `+N` bar above the selected node only), keep the other defaults unchanged (expansion structure stays `disc`, open-at-once 24, label-try count 8, max-expanded-parents 3, now sourced from settings), and export all three to settings, choosing explicit defaults rather than leaving the choice unmade.
**Dissent**: The bar only exists after selecting a node; the collapsed-bundle count is shown by the node's own imprinted number, but the "clickable to expand" affordance is invisible before a click, unlike the pill which was visible without asking.
**Falsifier**: If user walkthroughs report "can't find the expand button" or "didn't know it was collapsible," the dissent was right and the default should move to shoulder badge; if two of the three affordances go unchosen for 6 months, the premise that they genuinely trade off is wrong and the options should reduce to one.
**Owner**: stark

## 2026-08-02 — The default expansion layout is a "fan," and one node's controls use different orientations

**Why**: A design review paired the prototype and the implementation under identical conditions (1512x982, sample vault, same slider values) right after the owner reversed the prior day's expansion-structure default from `disc` to `fan`.
**Prior**: overturns the 2026-08-01 default of `disc` for expansion structure, and explicitly relaxes that decision's "only one affordance may change the screen by default" principle (now two defaults change the screen: bar and fan).
**Decision**: Set the expansion-structure default to `fan`; keep `disc` in the option list as the only way back to the prior screen; raise fan's arc/tier spacing from 26 to 34 and center-align the last tier (0 overlapping marks measured, down from 26 pairs); and assign each of a node's controls a distinct compass direction (bar=north, badge=northwest, orbit "focus only" button=east) after finding the badge/orbit overlap was actually a full click-block, not mere overlap.
**Dissent**: Fan uses more screen area than the spiral; in this vault (13-17 children per domain) the same 3 marks went off-screen for both, but in vaults with dozens of children per domain, disc's bounded sqrt growth could win again, which is why `disc` was kept rather than removed.
**Falsifier**: If fan collides with sibling domains or goes off-screen (especially at 40+ children per domain), the fallback is `disc`.
**Owner**: stark

## 2026-08-02 — The settings sheet is outside the "scale-lock contract," and the inside was two dialects

**Why**: The owner flagged that the settings interior felt cramped, the Expand section's choice buttons were too small, and the LNB buttons and overall sizing needed improvement.
**Prior**: references the 2026-07-30 decision that the settings sheet is a modal destination, and the 2026-07-28 decision removing `GatewayNav` chrome for similar reasons.
**Decision**: Rule the settings sheet out of scope for the workbench chrome scale-lock contract (chrome pill/tile 36px, chrome label 11px, rail icon 20px) since it is a modal destination people read to decide, not a glancing toolbar; unify the sheet's two competing type dialects onto `text-body` (12.5px) for pressable text/row labels, `text-label` (11px) for descriptions/values, and `text-caption` (9.5px) reserved for micro-labels only; make LNB match `SettingsRow`'s padding (38px) with `text-body-lg` (14px) and 16px icons; and raise panel height from 640 to 672 (derived from minimum window 720 minus overlay gutters).
**Dissent**: The "Expand" section had been shrunk from 412 to 270px by an earlier audit to make it read as "a place to choose"; this change grew its controls back to 296px, judged to come from enlarging the two remaining decision controls rather than re-expanding collapsed detail, so the decision count stays two.
**Falsifier**: If 14px LNB competes visually with the 12.5px right pane so "where to go" reads before "what to change," revert LNB to 12.5px; if the "Screen" section keeps overflowing, the real fix is splitting the section, not more height; if 9.5px is judged "too small" in drill-in subviews too, the scope exclusion was wrong; if the "Expand" section is observed growing again, the fix is the hint sentence, not the height.
**Owner**: stark

## 2026-08-02 — What makes a bar a bar is the "text button," and "visited trail" tints the nodes and edges too

**Why**: The owner caught two shipped-but-incomplete promises directly in the installed app: the overhead bar looked the same as the overhead badge, and clicking a footprint-trail node did not highlight it and its edges in yellow; the prior day's ledger had already logged the first issue as "backlogged for rc.6" with a deferral reason ("canvas renderer has no translation") that was self-admittedly false.
**Prior**: revises the 2026-08-01 "overhead bar" decision, treated here as an undelivered defect rather than backlog.
**Decision**: Make the overhead bar a text button with a verb ("Expand all"/"Expand {count}"/"Collapse", ko/en, routed through the map's existing translation path); show a count only when it differs from the node's own imprinted total; allow the bar to be wider than the node itself since it now conveys a sentence, using a deterministic CJK-aware width estimator (`estimateCanvasTextWidth`) as the single source for hit-test, draw, and reservation; demote unaddressable controls (batch-reveal "+N more" chip, ego "neighbors +N" chip) to pill fallback via a new `dockable` flag; and make the "walked path" lens raise visited nodes' own stroke color and traversed real edges to trail color (no new hue, lens-scoped, no glow).
**Dissent**: The prior day's rule "the bar must stay within the node's own diameter" was right in spirit (prevents ink inversion) but wrong because it was written as an absolute dimension; it loses if users report the bar hides sibling nodes or names.
**Falsifier**: If a language longer than Korean (e.g. German) causes the bar to cover sibling nodes, revert the width rule and shorten copy; if trail amber and hub amber are confused on one screen, revert the trail-lens rule to footprint glyphs only; if stacking bar plus ego pill plus more-pill on one node reads as "box soup," merge into a single two-cell bar.
**Owner**: stark

## 2026-08-03 — `tone: 'accent'` was a marker, not ink: split tone into two

**Why**: A value-layer normalization round (PR #886) found that `controlClass`'s accent tone renders marker indigo (`--color-indigo-accent` #7170ff) in text positions; a full census of 29 accent-tone consumers found 26 sitting on indigo tint fills/hovers or danger tints where #7170ff measures 3.49-4.42:1, below WCAG 2.2 AA's 4.5.
**Prior**: none
**Decision**: Keep accent as marker indigo but restrict its license to the darkest bare surfaces (canvas 5.18, panel 4.96, elevated 4.53), and introduce a new tone `accentOnTint` = `--color-indigo-text-soft` (6.46+ across all surfaces) for tinted positions, migrating 26 consumers with zero new tokens and zero dimension changes.
**Dissent**: The losing alternative changed accent's own ink to text-soft everywhere at once so all 29 consumers pass AA without adding a tone, but 99 lines of hand-written `text-[color:var(--color-indigo-accent)]` links/labels on bare surfaces would then diverge into two dialects (ramp links vs hand-written links).
**Falsifier**: If those 99 hand-written lines later converge onto the ramp in another round, that alternative should be reopened to collapse the two tones back into one; a standing contra-assertion gate mechanically forces this re-check when it goes green.
**Owner**: design-system seat (owner signature pending)

## 2026-08-03 — Quaternary ink was a value that only holds up on a raised surface: #787c84 → #82828a

**Why**: An accessibility-debt ratchet round (PR #896) paid down 6 of 14 debts, leaving 8 that all traced to one token, `--color-text-quaternary`; measurement found #787c84 passes on canvas (4.76) and panel (4.55) but fails AA (4.5) on panel+overlay-1 (4.37) and elevated (4.16), while the token has 584 consumers across the codebase.
**Prior**: none
**Decision**: Raise `--color-text-quaternary` to #82828a, passing all four surfaces (canvas 5.23, panel 5.00, panel+overlay-1 4.81, elevated 4.57) with zero new hues or tokens, converging with the map panel's own prior quaternary value (#82828a) reached earlier for the same reason; the existing rule that pressable-row text must start at tertiary remains in force since hover/selection surfaces still measure 4.36.
**Dissent**: The losing per-site alternative would raise only the 8 failing spots to tertiary, fixing the count but not the underlying defect since the value itself fails on elevated surfaces, so the next quaternary-on-elevated instance would fail again.
**Falsifier**: If after the value raise quaternary is reported "too light to distinguish from tertiary" in real screens, revert the value and enforce a lint constraint that quaternary is canvas/panel-only instead.
**Owner**: design-system seat (owner signature pending)

## 2026-08-04 — Split the control-adoption ratchet into "outside the registered value layer" and "debt not yet migrated"

**Why**: `control-adoption-ratchet.contract.test.ts` counted 113 hand-written controls as one lump, mixing places the value layer (`controlClass()`) cannot structurally reach with places it simply had not been extended to yet, making it impossible to tell whether the count not shrinking meant negligence or genuine impossibility.
**Prior**: none
**Decision**: Split the count into an `OUTSIDE_VALUE_LAYER` registry (23 registered) and `DEBT` (90, the only number expected to shrink), admitting only three justified categories (`chrome-token`, `stage-geometry`, `value-layer-peer`); of 36 submitted claims, 13 were rejected as false and left in debt, since "the value layer doesn't have that shape yet" is not a valid registry reason.
**Dissent**: The losing alternative registered by directory (e.g. `atlas-git-panel/**`) for collection convenience, but that would turn the registry into an allowlist letting hand controls grow unchecked inside registered directories (three real `CommitDetail` gaps would have been silently swallowed).
**Falsifier**: If maintaining per-file counts by hand actually blocks rounds in practice, with diffs rising mechanically without stating "why," directory-level registration was right after all.
**Owner**: classification round (owner signature pending)

## 2026-08-04 — Rebuild the idling gate set on a full source scan

**Why**: `/design-system-audit` (PR #904) found three of eight gates gave zero reaction when defects were injected; running the two old gates with two defects injected simultaneously produced "20 passed," complete silence, while the new gates produced 3 failed on the same defects.
**Prior**: none
**Decision**: Rebuild the hard-cut ratchet's input from a hand-written registry to a full scan of `src/` and `app/` (13 found: 11 inline + 2 named); add anchors (`<Link>`, `<a>`) as a third, separately-tracked count to the control ratchet (109 found, kept apart from the 85-item button debt since remediation differs); and add a second spec measuring opened surfaces to the accessibility ratchet (7 violations across 5 surfaces, versus first-screen-only measurement that saw 0).
**Dissent**: One losing alternative would require hard-cut debt to reach 0 in this same PR, but 13 sites each hold their own render-gate model during exit windows, making it a design-pass task, not a mechanical one; another argued unnamed `<div>`s are hard to register by name so only named surfaces should be counted, but inline made up 11 of 13, the majority.
**Falsifier**: If the 13 hard cuts do not shrink across two rounds, the ratchet is legitimizing debt and 0 should be hard-pinned red; if the inline detector's false positives call for a human every round, the categories should split.
**Owner**: gate round (owner signature pending)

## 2026-08-04 — Register overlay radius as a single `sheet` (18) step, and put the line-height naming utility into the ratchet

**Why**: `/design-audit` (PR #906) measured overlay radii at six different values (settings popover 12, docs palette/quick-drawer 9, shortcuts/vault-guide/search-palette 22, studio-entry card 16, quick-action/gesture hint 18, drawer hero 20) plus a mobile `rounded-t-[28px]`, and found line-height utilities (208 sites) had no governing gate at all.
**Prior**: reverses part of a prior drawer decision that treated hero=20 as an explicit sheet-tier exception.
**Decision**: Register `--radius-sheet: 18px` as a single new tier (`rounded-sheet`) for large temporary overlay surfaces (sheets, palettes, floating hints, mobile bottom sheets), excluding anchored popovers/menus (card/panel) and small confirm dialogs (panel), and forbidding sheet for in-flow content regardless of size; migrate six radius values to 18 or 12 accordingly and retire two legacy tokens; add a per-family ratchet (`named-offramp-utility-ratchet`) baselining the 208 line-height utility sites rather than fixing them in this PR.
**Dissent**: The losing alternative would collapse everything to panel (12), keeping vocabulary minimal, but that would retroactively erase the prior drawer decision's basis (sheet tier vs content tier) and make a 45rem sheet and a 365px content box share a radius.
**Falsifier**: If sheet consumers stop growing and eslint-disable workarounds pile up again, the tier was taste, not a real distinction; if the 22-to-18 reduction is judged "cheap-looking" by the owner, only the value need change and the tier stands.
**Owner**: design-systems seat (design-system), owner signature pending

## 2026-08-04 — Hardcoded values 13 → 0: register a large-surface grammar (`motion="overlay"`) on `Surface`, and fix the detector that went blinder the more debt was paid down

**Why**: The same morning's full-source-scan rebuild had measured 13 hard cuts (11 inline overlays + 2 named surfaces), judged "not payable in one PR," but paying them down showed 10 of 13 were a single line, `<Surface open={...} origin="...">`; what was missing was assets, not discipline.
**Prior**: continues the same day's "gates rebuilt on full source scan" decision, which set the 13/19 baselines being replaced here.
**Decision**: Add a `motion` axis to `Surface`: `chrome` (default, `topology-chrome-in/out`: move 3px + scale 0.98 + brightness) and `overlay` (`map-overlay-in/out`: brightness only, using `globals.css` keyframes that already existed but were never wired to a primitive); pass through `role`/`id`/`aria-*`/`style`/`ref`/`onClick` so surfaces keep their own accessibility identity; and fix the detector so migrated call sites (`<Surface open=`) are still counted (denominator moved 19 to 20), changing the appearing-surface probe from requiring `violations>0` to requiring real file/denominator coverage.
**Dissent**: The losing alternative would hand-attach `usePanelPresence` to each of the 13 sites without touching the primitive, but that is exactly the pattern that created this debt (one site forgot its exit class); it loses if either `motion` axis value shows zero consumers after 6 months.
**Falsifier**: If `BASELINE_HARD_CUTS` regresses above 0, or a `<Surface>` row is found double-counting one surface, the migration/dedup is incomplete.
**Owner**: design-systems seat (design-system), owner signature pending

## 2026-08-04 — Flip ramp coverage from an allowlist to a denylist: new screens get the standard from day one

**Why**: A live test planted four violations (`text-[13px] rounded-[5px] leading-[1.9] duration-300`) in a brand-new `src/views/<name>/ui/*.tsx` file and `pnpm exec eslint` reported 0 errors, 0 warnings, because `eslint.config.mjs`'s ramp selectors were spread only onto an allowlist (`codexMigratedGlobs`) that new directories are never added to.
**Prior**: none
**Decision**: Force ramp selectors onto `rampCoveredGlobs = ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}']` (a denylist model) with file-level, not directory-level, exceptions for legacy debt, since a full-repo count found only 125 violations concentrated in 12 files; rewrite `type-ramp-coverage.contract.test.ts` to check that not-yet-existing FSD-layer paths still receive ramp selectors, and add a matching ratchet for the 12 exception files that only shrinks.
**Dissent**: The losing alternative would clean up all 125 violations and set exceptions to zero in this same PR, but each is a pixel-changing design judgment requiring a design pass, not a lint PR.
**Falsifier**: If half of the 12 exception files still remain unfixed after 6 months, "soon to be cleaned up" was false and a ratchet needs a deadline instead; if the exception list under the denylist model grows past 20 entries, it has effectively become an allowlist again.
**Owner**: design-systems seat (design-system), owner signature pending

## 2026-08-04 — "Connect my agent" is a **step**, not a list (and the red box was lying)

**Why**: The owner flagged the "Connect my agent" settings tab as needing a redesign ("it's weird, the blue box is too long"); measurement also found the panel asserted a false fact: a red "HANDOFF BLOCKED" badge claimed vault validation errors must be fixed before an agent can edit the ontology, when only `git_snapshot({confirm:true})` is actually blocked.
**Prior**: Applies the 2026-08-03 decision unifying six names for one thing down to "folder" to this surface; extends `surfaces.md`'s "false cannot-connect" rule (2026-08-01) in the opposite direction (falsely claiming something is blocked).
**Decision**: Restructure the tab as a step-by-step flow (owner-chosen direction B): expand one step at a time, push verification/repair/commands/other-folder connection behind a "Having trouble?" disclosure, correct the false badge to state only that commits are refused when errors exist (reads and fixes still work), collapse four numbering schemes into one 1-2-3 scheme, remove nine unused tint tokens, and reorganize connect buttons into a 2x2 layout with copy chips in wrapped rows.
**Dissent**: "Just shorten it" (deleting verification/CLI sections) loses because collapsed information is needed exactly when something breaks; auto-complete detection for steps 2-3 loses because the app cannot know restart or MCP status, recreating the falsehood just corrected.
**Falsifier**: If nobody opens "Having trouble?" within 6 months, collapsing was wrong and content should move to a separate document. If heartbeat wiring later reaches this screen, step 3 could get a real completion check and this decision should be revisited.
**Owner**: design-guardian, owner signature pending

## 2026-08-04 — An inline collapse does not wear a floating-surface grammar (a partial reversal of the morning ruling)

**Why**: Owner reported that after clicking, motion opened stiffly instead of smoothly, with a screenshot showing step 3 expanded while step 1's header stayed lit. A 120fps-to-30fps frame capture showed the sibling row jump twice within one frame: the entering body mounted at full height immediately while the exiting body still occupied its exit-window space.
**Prior**: none
**Decision**: Move the two disclosure branches of "Connect my agent" (`AgentSetupStep` body and the "Having trouble?" drawer) from `Surface` to the list-row disclosure grammar (`.ai-row-disclosure` + `useRowDisclosure`), and add a chevron-rotation expand channel to the step row header, reusing the drawer toggle's channel. Zero new tokens, keyframes, or durations.
**Dissent**: Losing alternative: make the "current step" badge follow whichever row is expanded (`stepState` to `openStep`). Rejected because merely viewing step 3 would move the "do this now" marker there, making the screen misstate actual flow progress.
**Falsifier**: If users still report not knowing which step they are on, the chevron channel's intensity is the problem, and the expanded row's header tone should be promoted instead. If the sibling row still double-jumps in a later recording, suspect `useRowDisclosure`'s height-measurement timing, not the grammar choice.
**Owner**: design-system (System seat), applier; owner sign-off pending.

## 2026-08-05 — Lay the finger floor with **actual height, not a hit-area expansion** (value-layer chips, rows, pills)

**Why**: The 44px touch-target contract and token already existed, but the value layer emitted heights as Tailwind literals (`min-h-6`, `min-h-8`, `min-h-9`) instead of reading `--control-h-*`, so the coarse-pointer promotion never reached chip/row/pill controls. Mobile 390x844 measurement found 38 spots under 44px.
**Prior**: `touch-target-contract.spec.ts`'s own header, which had already warned the promotion could fall into an empty room.
**Decision**: Under `pointer: coarse`, `controlClass`'s `chip`, `row`, and `pill` now grow to `min-height: var(--touch-target-min)` (44px) via one marker class, `.atlas-touch-floor`, placed outside all cascade layers at the end of `app/globals.css`. `icon` and `link` stay exempt for separate reasons.
**Dissent**: Losing alternative (B): `touch-hit-expand`, hit-area only, zero layout shift. Rejected after remeasuring: 21 of the 38 sub-44px spots sat within 12px of a neighbor (EN/KO toggle 1px, tab pairs 2px), so invisible hit-area growth would overlap and cause mis-touches; `min-height` pushes neighbors apart instead. Cost: mobile `/docs` header grew about 50px taller.
**Falsifier**: If mobile users report the screen no longer fitting or new scrolling, the density cost was too high; the fix is not reverting to (B), since the overlap problem would remain, but widening neighbor spacing first to make (B) safe.
**Owner**: design-system (System seat), applier; owner sign-off pending.

## 2026-08-05 — A checkbox's target is **the label, not the checkbox** (WCAG 2.5.8 AA)

**Why**: A full audit found all 5 native checkboxes under 24px (`h-4`, `h-3.5`, `size-3.5` x2, one with no size class at all), and neither gate caught it because `control-adoption-ratchet` only counts `button`/`Link`/`a`, and `touch-target-contract.spec.ts`'s four selectors were all `button, a[href]`. One checkbox (`AgentProposalCard`'s change selector) also had no label.
**Prior**: 2026-08-02 settings-sheet decision on label versus control size hierarchy.
**Decision**: The wrapping `<label>` around a native checkbox gets `min-h-6` (24px, AA) plus `atlas-touch-floor` (44px coarse); the checkbox's own visual size is unified to one value, `size-4` (16px). The unlabeled checkbox was wrapped in a label using the file name as its accessible name.
**Dissent**: Rejected alternative: grow the checkbox itself to 24px. Rejected because the clickable square would then outsize the 11px label text, recreating the hierarchy problem the 2026-08-02 settings-sheet decision fixed in the opposite direction.
**Falsifier**: If, after the label gets its 24/44px floor, users still report the checkbox not responding to clicks, the "label is the target" premise has broken there; check whether the label is blocked by `pointer-events` or an overlapping element.
**Owner**: design-system (System seat), applier; owner sign-off pending.

## 2026-08-05 — Bring forms inside the gate's field of view (ratchet's fifth move, plus a touch-audit selector)

**Why**: Fixing 5 WCAG-failing checkboxes the same day exposed the real cause: two gates meant to stop hand-written controls from growing (`control-adoption-ratchet`, `touch-target-contract.spec.ts`) both counted only `button`/`Link`/`a` tags, leaving forms invisible and free to grow unchecked.
**Prior**: the same-day checkbox-fix record (2026-08-05).
**Decision**: Add a fifth count, "form debt 63," to `control-adoption-ratchet`, and add `input`, `select`, `textarea` to `touch-target-contract.spec.ts`'s selectors. Checkboxes/radios count via their wrapping `<label>` as one target. The registry of fields the layer cannot express stays empty, since claiming that now would be circular before a field shape exists.
**Dissent**: none
**Falsifier**: If form debt (63) has not fallen after six months, the count is decoration, not a ratchet; convene "the System" seat to build an actual `field` shape rather than keep tracking the count.
**Owner**: design-system (System seat), applier; owner sign-off pending.

## 2026-08-06 — A form field is **the second cva, not a ninth shape** (`fieldClass`)

**Why**: This item had been postponed four times in a row (the four 2026-08-05 records), prompting a `/design-council` with the System and Hierarchy seats to settle it.
**Prior**: the four 2026-08-05 records.
**Decision**: Create a second cva, `fieldClass`, in `src/shared/ui/control-class.ts`, with axes `frame`(boxed,bare), `size`(xs,sm,md,lg), `multiline`(false,true); zero new tokens; migrate 6 call sites first. `frame` splits "record" forms from "lookup" forms (result outranks input). The 23px workshop card-name input is registered outside this spec.
**Dissent**: Rejected alternative: a ninth `shape` in the existing eight-shape system. Rejected because the eight shapes were counted from a `<button>` population of 419, fields are a different population (form debt 63) with different axes, and a ninth shape would add 320 cases versus 16 for a separate cva.
**Falsifier**: If the `frame` axis does not actually separate usage (`bare` consumers do not grow, getting absorbed into `boxed`), the axis was wrongly made; remove `bare` and return lookup inputs to the parent container.
**Owner**: design-guardian (applier), System and Hierarchy seats (recommendation); owner sign-off pending.

## 2026-08-06 (2) — Migrate every form to `fieldClass`, types fixed by looking at the screen

**Why**: The owner directed migrating everything first and fixing by looking at the screen rather than pre-judging edge cases; the prior round had left about 20 items pending judgment with nothing yet to compare against.
**Prior**: 2026-08-06 `fieldClass` creation record; the prior round's list of deferred items.
**Decision**: Migrate all text fields to `fieldClass` (form debt 57 to 29). A first rule (one base `text-body` 12.5px for every size) was reversed after screen comparison, since values then matched the app's 11px labels too closely. Final rule: wide fields (md,lg) use `text-body-lg`(14px); narrow fields and `bare` use `text-body`(12.5px). Addendum added `fieldLabel()` (form debt 29 to 20).
**Dissent**: none
**Falsifier**: If `bare` consumers do not grow (absorbed into `boxed`), the `frame` axis was wrong. If, after reverting md/lg to 14px, users still report form text as small, a field-only type step is needed, not a size-type pairing.
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (3) — A `stacked` axis on `row`: **layout decides** the radius

**Why**: Migrating hand controls to `row` produced fragmented, individually-rounded hover backgrounds where rows were stacked vertically inside an `overflow-hidden rounded-chip` container (`DesktopVaultWelcome`'s action list), since the container already owned the corners.
**Prior**: none
**Decision**: Remove `rounded-chip` from `controlClass`'s `row` shape and add axis `stacked` (false, true): `false` (default) keeps rounding, `true` removes corner radius. `TopologyIndexTreeRow`'s chevron was left unmigrated since it is `aria-hidden` + `tabIndex={-1}`, a mouse affordance, not a control.
**Dissent**: A ninth shape was considered instead of an axis; rejected because it would duplicate `row`'s inset/alignment/touch-floor, while an axis only doubles the population instead of adding hundreds of cases.
**Falsifier**: If `stacked: true` consumers do not grow past the current 9, the axis was unnecessary and a plain `className: 'rounded-none'` at those 9 spots would have sufficed.
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (4) — Hand-styled controls 124 → 57: build a **converter that points precisely**, and fix the gate set again

**Why**: With remaining hand-written controls scattered at 2-or-fewer per file, manual migration became intractable, prompting a converter that locates the exact opening tag and edits only that span.
**Prior**: none
**Decision**: Migrate remaining hand controls with a converter (buttons 65 to 32, anchors 59 to 25, registry 30 to 26), rewritten twice: string replacement changed unrelated spans, fixed via brace-depth scoping to the opening tag; leaving shape-emitted classes in place defeated the point, fixed by stripping them per shape. Uncertain spots return null and stay hand-written.
**Dissent**: none
**Falsifier**: If a large share of the remaining 57 controls turn out to be spots the value layer fundamentally cannot express, the registry should grow, signaling the eight shapes do not cover the real population.
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (5) — Hand-styled controls 57 → 50: **the character of what remains has changed**

**Why**: After migrating more controls (buttons 32 to 29, anchors 25 to 21), sorting the remaining 50 by form showed their character had changed from simply "not yet migrated."
**Prior**: 2026-08-06 (4).
**Decision**: Classify remaining spots into five kinds needing separate judgment: canonical primitives themselves (`button.tsx`, `chrome-chip.tsx`, `select.tsx`), chrome-token controls (tokens re-declared under coarse pointer), full click-surface scrims (no spec exists), prose links (covered by `prose-link.contract`), and layouts the shapes cannot cover (`BottomTabBar`'s vertically stacked tabs).
**Dissent**: none
**Falsifier**: If judging the remaining 50 finds more than half need a new axis or shape, the eight shapes do not cover the real population and the full count must be retaken.
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (6) — **Do not build** vertical stacked tabs: hand-styled controls 50 → 39

**Why**: The prior record left vertically stacked tabs as a pending judgment. A full count found only 4 such spots, one (`AppNavRail`) already registered as `chrome-token`, leaving 3 real spots, below the repo's own bar that a shape/axis needs at least two real consumers (the `stacked` axis was justified by 9).
**Prior**: 2026-08-06 (3) and 2026-08-06 (5).
**Decision**: Do not create a new axis or shape for vertically stacked tabs; leave the 3 spots as debt. Also corrected the prior record's count: "primitive," "prose," and "scrim" categories were already registered, so recounting without double-subtracting the registry showed the true remaining count was mostly plain not-yet-migrated controls (buttons 29 to 24, anchors 21 to 15).
**Dissent**: none
**Falsifier**: If vertically stacked hand controls exceed 6 (double the current count), recount and reconsider an `orientation` axis on `row`.
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (7) — Hand-styled controls 39 → 30: **the contract had been nailing down the source string**

**Why**: Migrating settings-sheet radio chips/segments (buttons 24 to 18, anchors 15 to 12) broke `settings-sheet-type-dialect`, which matched a literal source string instead of the underlying rule; a rewritten "no off-ramp heights" regex also mismatched `min-h-11` (the touch floor) against a sibling assertion.
**Prior**: none
**Decision**: Rewrite `settings-sheet-type-dialect` to check whether the height (`h-8`) and type step (`text-body`) actually apply, regardless of syntax, instead of matching a source string; add a negative lookbehind (`(?<!min-)`) so the height regex stops colliding with the touch-floor assertion.
**Dissent**: none
**Falsifier**: not recorded
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (8) — Hand-styled controls 30 → 27: **the negative control group was hanging on a real defect**

**Why**: Migrating `DocsVaultTabStrip` tabs, `DemoStage`'s playback overlay, and `CopyAgentTextButton` (buttons 18 to 15) broke a probe requiring `DemoStage`'s full-bleed overlay to "stay alive as debt" as its negative control; fixing the overlay made the probe's premise vanish, the fourth such case in this file.
**Prior**: none
**Decision**: Rewrite the click-surface judgment function (`isClickSurface`) to be tested with a synthetic tag instead of a real (now-fixed) overlay as negative control; the overlay's original shape is kept only as a fixture string.
**Dissent**: none
**Falsifier**: not recorded
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (9) — **Subtract already-adjudicated spots from the debt count**

**Why**: The owner objected that items already judged "will not be systematized" kept inflating the debt count, making the owner feel forced to keep ordering fixes on already-settled items.
**Prior**: this ledger's own header stating debt must be able to reach zero as a progress gauge.
**Decision**: Move 8 registry entries out of the debt count after verifying grounds individually: `HomePage`(3) and `BottomTabBar`/`TopologyIndexTab`/`HubRail` as `chrome-token` or new claim `shape-gap` (layout the vocabulary lacks), `TopologyIndexTreeRow` as `no-spec`. `shape-gap` entries must carry a `conditional` reopen clause. Button debt 15 to 9, anchor debt 12 to 10.
**Dissent**: none
**Falsifier**: not recorded
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (8) — Lint warning ceiling: **a ratchet, not eliminating them all**

**Why**: The design-system-audit skill doc already warned that a warning-only rule without `--max-warnings` "fails nothing, so it is not a gate," and `package.json`'s `"lint": "eslint"` had no such cap: 91 warnings (0 errors) passed CI, and a 92nd would still pass.
**Prior**: `.claude/skills/design-system-audit/SKILL.md`'s "level blind spot" section.
**Decision**: Set `"lint": "eslint --max-warnings 91"` as a ceiling that cannot rise, and add a contract test requiring the cap to fall whenever the measured count does, reading the cap from the lint script. The 91 warnings (`react-hooks/refs` 41, `no-unused-vars` 25, `set-state-in-effect` 12, `exhaustive-deps` 8, others 5) stay unfixed since most require changing render timing, not a lint PR.
**Dissent**: none
**Falsifier**: If the cap keeps falling across PRs with nobody raising it, the ratchet gave no incentive to fix values; promote remaining rules to `error`, starting with ones that can reach zero. If the cap ever rises in a merged PR, the ratchet has broken; record why.
**Owner**: the operator (applier); owner sign-off pending.

## 2026-08-06 (8) — Disabled-state blur is one value: the lookup-palette input does not outrank the result

**Why**: A worktree-wide count of `disabled:opacity-*` found 14 spots split across four values (55x5, 60x5, 50x3, 45x1) with no genuine exception; separately, the search-palette lineup's inputs measured three different sizes (`GlobalSearch` 14, `SearchPalette` 16 via a `className` override, `DocsVaultUnifiedPalette` 12.5 per spec).
**Prior**: 2026-08-03 value-layer decision setting disabled opacity to 55; 2026-08-06 (6)'s ruling that `bare` uses `text-body` and does not vary by size.
**Decision**: (1) Unify `disabled:opacity-*` to 55, exported as a named role `CONTROL_DISABLED_CLASS` covering opacity, cursor, shadow, and hover together, with lint plus a contract keeping lint's allowed value in sync with the value layer. (2) Delete `SearchPalette`'s `text-title`(16px) override so its input falls back to `fieldClass bare`, matching `DocsVaultUnifiedPalette`.
**Dissent**: For (1): rejected 60 (then-majority) since that was copy-paste lineage, not a decision; rejected banning the class outside value-layer files since this ESLint config has broken exemption arrays three times before. For (2): rejected a new `bare x lg`(14px) slot, since a council had decided the day before `bare` does not vary by size.
**Falsifier**: For (1): if disabled controls become unreadable over dark overlapping surfaces, 60 was right; if 3+ legitimate exceptions accumulate, revisit the file-ban. For (2): if the owner judges the palette input visually buried under results, `bare x lg`(14px) was right; a separate design-guardian check measured `SearchPalette` and found this not observed.
**Owner**: design-system (System seat, applier); owner sign-off pending.

## 2026-08-06 (10) — Fix two screen defects that "hierarchy" caused: a dead-end CTA and a title tie

**Why**: The Hierarchy seat's earlier observations named two screen defects, reconfirmed by direct measurement: `/project/new`'s amber banner was the screen's single most visually prominent element yet said only "you must open a folder to save" with zero folder-opening controls on screen; the preview panel's "0%" statistic matched the page title at the same 30px (`text-hero`).
**Prior**: 2026-08-06 `fieldClass` record's Hierarchy-seat observations; the docs-vault surface's existing demoted-banner pattern; `.claude/rules/surfaces.md`'s demotion grammar.
**Decision**: Add an "Open my folder" action (routing to `/`) plus a one-line hint to the amber banner, following the docs-vault precedent. Demote the "0%" statistic from `text-hero`(30) to `text-display`(23), leaving the title at 30. Add `tests/e2e/screen-hierarchy.spec.ts` asserting no rendered text equals or exceeds the h1, and every dead-end banner has a real, clickable destination.
**Dissent**: none
**Falsifier**: If a screen is later found where text intentionally must exceed the title size (e.g., a metric-led dashboard), this check is wrong for that route; re-ask the Hierarchy seat what that screen's attention-winner is, rather than adding a per-route exception.
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (11) — Hand-styled controls 19 → 10: **two more contracts were nailing down source strings**

**Why**: Migrating settings-menu LNB items (buttons 9 to 4, anchors 10 to 6) broke `settings-sheet-type-dialect`'s LNB assertion, which matched one whole literal string; migration split the string because part of it is now emitted by the shape itself.
**Prior**: 2026-08-06 (7)'s same-file fix of settings-sheet radio chips/segments.
**Decision**: Rewrite the assertion to check the underlying rule (matching inset and one type step above the right-pane row) instead of a literal string, scoped to the LNB item's exact opening tag rather than the whole file, and fix the tag-boundary scanner to count brace depth so it stops at the first depth-0 `>`.
**Dissent**: none
**Falsifier**: not recorded
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (10) — Lint warnings 91 → 62: **the line between reduced and untouched is "does behavior change"**

**Why**: The prior day's ratchet record stated that code where behavior could change is a rendering task, not a lint PR; this round split the 91 capped warnings into what could be removed without changing any execution path and what could not.
**Prior**: 2026-08-06 (8) lint-warning-ratchet record.
**Decision**: Remove 29 of 91 warnings (unused vars/imports 25, incl. 6 never-rendered props; 3 stale `eslint-disable` directives kept as comments; 1 unused-expression rewrite) and lower the cap to 62; leave 61 `react-hooks/*` warnings, since fixing them changes render timing. Configure ESLint's `^_` ignore patterns for already-marked intentional unused variables.
**Dissent**: Rejected fixing all 61 remaining warnings now, since the 41 `refs` warnings reduce to four judgment spots each justified by a comment, and blind fixes risk a one-frame-late render regression. Rejected fixing the three `_`-prefixed spots in code instead, since all three already show author intent via naming.
**Falsifier**: If any of the 6 `exhaustive-deps` stale-closure candidates is confirmed by a real user report, it should have been fixed immediately as a bug, not deferred. If unmarked-intent `_`-prefixed unused variables start appearing, the `^_` exemption lost direction and should be reverted.
**Owner**: not recorded.

## 2026-08-06 (12) — Fix the **real data defect** that `exhaustive-deps` surfaced

**Why**: The owner directed that lint warnings be reduced only to genuinely valid ones, including fixing the real defects behind them, and that self-fixed items be verified by a full rebuild.
**Prior**: 2026-08-06 (10) lint-warning record, which left `exhaustive-deps`'s 6 stale-closure candidates as this round's input.
**Decision**: Fix `exhaustive-deps` from 8 to 3 cases, all touching user data. `DocsVaultEditor`'s 4 hooks were missing `vaultScope`, so switching vaults with the editor open could touch another vault's draft via the old scope key. `DocsVaultPage`'s prompt-copy callback was missing `localVault.handle`, copying the old vault path after switching folders. 3 cases remain pending intent confirmation.
**Dissent**: none
**Falsifier**: not recorded
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (13) — **Hand-styled buttons reach zero**, and the wording is made plainer

**Why**: The owner asked what "button debt 0" even means and asked for plain language instead of jargon ("debt"/"registry") in the ledger and reports going forward.
**Prior**: none
**Decision**: Adopt a plain-language glossary: "debt"=hand-written styles bypassing the design system; "registry"=spots the system cannot yet produce, reasoned and not permanent; "no grounds"=nothing to build there; "ratchet"=a test pinning today's better number as a ceiling. This round finishes migration: buttons 74 to 0, links 67 to 2, form elements 63 to 20, plus 2 registry entries.
**Dissent**: none
**Falsifier**: not recorded beyond the probe already run (reaching 0 buttons broke a probe requiring `CommitDetail` to "stay alive as debt," fixed by switching to a synthetic fixture instead of a real defect as negative control).
**Owner**: design-guardian (applier); owner sign-off pending.

## 2026-08-06 (14) — ✅ **Declared done: hand-styled spots are at 0**

**Why**: Owner asked what "judgment finished" means if debt was left standing, and pressed for an explicit closure so the same items would not be searched again. Full audit of remaining hand-styled controls: buttons 74 to 0, links 67 to 0, form elements 63 to 0.
**Prior**: none
**Decision**: Declared hand-styled debt closed at 0. Migrated one link in `AtlasGitPanel`. Registered every spot that cannot be migrated in principle (checkboxes, layout-only labels, the one slider, the full-screen editor, composer mirror, workshop stage inputs), each carrying its own reopen condition. Rewrote the assertion to check that debt plus registered plus no-evidence sums to the total, instead of assuming debt is nonzero. Fixed a CI-caught contrast regression where `text-primary` dropped to 2.43:1.
**Dissent**: none
**Falsifier**: The ratchet turns red again only when a newly hand-written control appears; each registered row carries a `conditional` axis and is removed once the value layer gains that axis.
**Owner**: design-guardian (applied); owner signature pending

## 2026-08-07 — Put an actual opening path where it says "open a folder...": **the precedent's destination was a dead end on web**

**Why**: Following the prior amber-banner fix, clicking through its destination `<Link href="/">` showed it was itself a dead end on the web: `/ko/project/new/` to "open my folder" landed on `/ko/` with 0 folder-opening controls. Audited 17 routes (no vault, static export, 1512x900) for boxes claiming "open a folder to see X."
**Prior**: 2026-08-06 (10) diagnosis upheld ("amber banner was a dead-end CTA"); its prescription (destination) is overturned here. Also cites 2026-07-30 "root is decided by who asks."
**Decision**: Built `OpenVaultCta` (`features/docs-vault-local`), used at three sites, opening the folder picker in place instead of navigating. Fixed size to `md` (11px/32px) after `sm` measured 9.5px/24px, smaller than its own label. Branches by capability (FSA support opens in place, else goes to `/download/`), never by runtime. Gateway (`/`) intentionally left out of this slice. New `tests/e2e/open-vault-cta.spec.ts` covers all audited routes except registered exceptions and checks the picker is actually invoked, not just that the URL changed.
**Dissent**: none
**Falsifier**: If putting a folder-opening path in the gateway was right, the hierarchy seat's verdict on the gateway's attention winner will say so; then the two exception lines are removed. If this sweep's regex cannot separate instruction sentences from description sentences, exceptions will grow past three, signaling a switch from regex to markup (`data-*`).
**Owner**: owner signature pending

## 2026-08-07 (2) — A path to reach the reading material on narrow screens: **neither of the two alternatives promised by comments existed**

**Why**: Measured at 1512/768/390 (static export, no vault): guide/changelog links visible from `/ko/` fell to 0 at 390; guide chapters visible under `/ko/guide/*` fell from 13 (1512) to 1 (768) to 0 (390); gateway footer links were 0 at every width. Two code comments promised a fallback and both were false: `GatewayNav` claimed the links reunite in the footer (footer has 0 links); `GatewayDocPage` claimed a collapsed "Guide" chip substitutes (that chip also collapses under `sm`, and `/guide` renders one chapter, not an index).
**Prior**: none
**Decision**: Built `GatewayReadingLinks` (`widgets/gateway-chrome`), shown with `sm:hidden` in the gateway/download footer and at the end of guide/changelog bodies. Built `GuideChapterPicker` with `lg:hidden` expand, closed state reads "Guide, current chapter, 9/13," sharing one `GuideChapterList` with the sidebar. New `tests/e2e/gateway-reading-reach.spec.ts` measures reachability (open the expander, click through) rather than visibility, after a first probe wrongly passed by counting any link containing "/guide" instead of distinct reachable chapters. Also fixed a 23px scroll-end gap hidden by the tab bar by giving `--topology-mobile-bottom-tab-reserve` and `--page-bottom-breath` unconditional defaults with an `lg:` override.
**Dissent**: none
**Falsifier**: If nobody opens the expander at narrow widths (chapter navigation stays near 0), the list belongs at the end of the body instead. If chapters exceed twenty, a single closed line will not suffice and grouping is needed.
**Owner**: owner signature pending

## 2026-08-07 (3) — One screen does not count the same thing two ways: a rejection reaches the person who clicked

**Why**: Sample-vault measurement found "Todo 7" directly under a group header reading "8"; the gap was one duplicate pair, produced because `buildInsightsVerdict` and `sumQueueGroupCounts` each kept a separate hand-managed section list. Separately, the edit screen's save-rejection toast rendered off-screen at 390x844 (top 802, bottom 872, clipped by the tab bar) while fine at 1512x900 (628-676).
**Prior**: none
**Decision**: Verdict now takes a `Record<QueueSectionKey, number>` instead of separate fields, so adding a section fails type-checking until severity is set (`SECTION_SEVERITY` mirrors the same Record); the screen computes one `queueSectionTotals` shared by verdict and badge, with `tests/e2e/insights-badge-agreement.spec.ts` added. For save rejection: the edit form now locks its save button pre-emptively using the existing `canEdit` flag (previously used only by `/project/new`), and a global error moves focus to the banner rather than relying on scroll position.
**Dissent**: none
**Falsifier**: If section count grows without a type-check failure, `Record` was loosened to `Partial` somewhere. If focus reaches the banner on rejection but people still miss it, the fault is the choice to communicate via banner, not the banner's position; then look at a form placed next to the pressed button.
**Owner**: owner signature pending

## 2026-08-08 (5) — Docs-pane chrome: **one fact, said in one place** (owner flagged "complexity" and "confusion")

**Why**: Owner directly flagged two spots as complex and confusing: the left icon row and the right-side control group. Measured (1440x900, edit mode): 33 controls within the top 200px, 21 unlabeled icons, 5 distinct control heights, and two magnifier icons (sidebar narrowing plus header cmd-K).
**Prior**: none
**Decision**: Consolidated vault-source display and switching (sample vs local) into a single vault chip menu, removing the "Sample | Local" radio and the "docs vault check" tile. The six left icons now let the active filter name itself, filters grouped by a border. Sidebar magnifier changed to a funnel matching its narrowing function. Owner chose option 2 (consolidate into one chip) among three drafted alternatives. Fixed `check-desktop-readiness.mjs` to require a pair (locking rationale plus wired reason text) instead of pinning the id string `docs-vault-local-unsupported-hint`.
**Dissent**: Moving sample/local switching to the header originally fixed it being "buried and unfindable"; reverting risks bringing that problem back.
**Falsifier**: If new users get stuck moving from sample to their own folder, or "how do I open my folder" questions resurface, this decision is wrong. It currently rests on the read-only sample banner already carrying an "open my folder" affordance at the moment of need.
**Owner**: not recorded

## 2026-08-08 — **Do not add** a folder-opening path to the gateway; instead, don't claim otherwise, and let the gate own that judgment

**Why**: Design council (3 seats: hierarchy, system, diagram), round 2, decided by design-guardian. Trigger: the gateway (`/` and `/download`) claims "open your folder in the app" with 0 folder-opening controls.
**Prior**: Upholds 2026-07-30 "root-first-open" reversal, falsifier triggered here as predicted. Concludes 2026-08-07 "gateway exception pending hierarchy verdict": verdict went against adding a path, keeping the two exception lines, now re-justified with a new gate contract.
**Decision**: The gateway keeps judging "should I install this" plus downloading; one filled indigo control appears once at both widths (1512: 250x44; 390: 180x44). `/topology`'s first-run panel stays the real first-run surface, ruling out a duplicate; `OpenVaultCta`'s unsupported branch points to `/download/`, a dead link, ruling out reuse. Fixed wording overstating capability in `download.portraitScope` and `searchWidgets.shortcuts.rows.localVault` (ko/en); deleted unused `docsVault.vaultStatus.desktopOnlyTooltip`; fixed `TopologyEmptyState`'s `showPickerPath` to `vault.status !== 'unsupported'`. Kept the exception lines in `tests/e2e/open-vault-cta.spec.ts` plus a new contract on the panel's web CTA.
**Dissent**: The gateway should also have a folder-opening path; someone convinced here must cross a screen to start. Half right: one hop exists, and at 390 it is tab bar chrome, not the panel.
**Falsifier**: If people land on the first-run panel and leave without clicking, the landing point is the problem. If gateway-to-map click rate is near zero, reopen the control option. If the map is called sparse, the caption-70-vs-8 gap reopens.
**Owner**: owner signature pending

## 2026-08-08 (2) — With owner delegation, **actually measured collapsing and label order**: neither gets applied

**Why**: Owner delegated execution ("go ahead as you see fit, judge by measurement not feeling") with stop conditions: (a) the 8-9 marks with ink ratio 3:1 or higher stay unchanged; (b) stop and report if any disappear or move significantly; (c) do not apply unless `8 + sum(+N) = 70` closes.
**Prior**: executes the preceding 2026-08-08 gateway decision's deferred items.
**Decision**: Measured render: 8 marks at or above 3:1 at 1512x900, 9 at 390x844, matching `model/tier-visibility.ts`'s intended design (level 0 shows project, domain, hub only). Tested lowering `DENSITY_GATE_THRESHOLD` from 5 to 4 to collapse all six domains: result was 7 marks, the hub capability `mcp-server` disappeared (amber ring lost), clusters became 6, and the equation closed (7+63=70), but condition (b) was violated because the hub vanished, so it was not applied. Also found domain hexagons already inscribe their own counts (5,12,11,9,11,16) and the project hexagon inscribes 63, making a `+N` chip redundant. Separately, the 390 missing-label symptom is real, but the prescribed fix (label priority) was found already correct in `render/label-layout.ts#resolveLabelPriority` (project/hub at priority 2); the actual cause, priority-2 labels dropping out before reaching the greedy placer, was not confirmed (viewport culling, label alpha, or radius gate), so no fix was applied.
**Dissent**: none
**Falsifier**: If lowering the threshold while exempting only the hub collapses domains without losing the hub, condition (b) is satisfied and this reopens, subject to `/topology`'s main map taking priority. If the 390 label-drop mechanism is confirmed, item 2 closes in one line; if fixed and the project name still fails to appear, the fault is using the map as background at that width, not the label.
**Owner**: owner signature pending

## 2026-08-08 (2) — One gate was **forcing** "write it as forbidden" for something that actually works

**Why**: After council removed "installed app" wording from `searchWidgets.shortcuts.rows.localVault` (that shortcut works via web FSA too), CI's `check-desktop-readiness` failed, printing that local vault picker/shortcut copy must route users toward the installed desktop app instead of preserving FSA wording.
**Prior**: traces to the 2026-08-03 "vault" wording gate fix that first collapsed distinct facts into one check.
**Decision**: Split the requirement by string nature: two demotion-notice strings (`docsVault.vaultStatus.unsupportedTooltip`, `featuresMisc.localVaultPicker.unsupported`) must still point to the installed app; the shortcut-description string (`searchWidgets.shortcuts.rows.localVault`) must name the destination (the folder), not the runtime; FSA is never advertised as a capability, across all six checked strings. Rewrote `check-desktop-readiness.test.mjs` to check markers ("demotion notice" plus "FSA") instead of pinning the full pass sentence. Registered `messages/*.json` to `pnpm test:desktop:check` in the checks-changed advisor, which had recommended only `test:i18n:messages` for this change.
**Dissent**: none
**Falsifier**: If a shortcut description satisfies the requirement merely by including the word "folder" while pointing at an app-only feature, the check is too loose and must read the capability branch directly. If advisor rules grow by three or more for the same reason, replace hand-registered paths with a gate that declares its own input paths.
**Owner**: owner signature pending

## 2026-08-08 (3) — Extend the hierarchy gate to every route: the cause of the missing label is closed

**Why**: Executing the next step of an owner-approved verdict: a single-route hierarchy gate stays silent on every screen built afterward, a named allowlist-failure pattern in this repo.
**Prior**: executes the owner-approved fable verdict; closes the falsifier left open by 2026-08-08 (2) regarding the 390 label mechanism.
**Decision**: Extended `screen-hierarchy` from one route to the full audited set with two criteria: (a) no text outside h1 is as large as the largest rendered h1; (b) at most one filled accent-color control per screen (24x44 floor filters 8px data marks from a 36x85 CTA). Fixed the h1 criterion to "largest rendered h1" after finding map and docs vault use an `sr-only` (1x1) h1, so an invisible 16px h1 previously passed by accident. Kept route-level exceptions with measured values and self-monitoring (map/docs vault: no rendered title; studio: 14px title tied with entry label; edit: twin save CTAs with the same label). Confirmed the root cause of the missing priority-2 label: `topology-frame-draw.ts:1721-1726`'s safe-area anchor cull protects only center/neighbor/hover/trail, not hub or project, so a mid-session vault swap that reuses the previous camera loses the outermost node's (radius 395 hub capability) name. Confirmed on real hardware (1512x982, 14-node journey vault): anchor y=60 under 148 loses the name; "fit whole map" moves it to y=143+offset and the name returns.
**Dissent**: none
**Falsifier**: If adding hub/project to the safe-area cull protection still leaves observed unnamed amber rings, more culling paths exist and this diagnosis was incomplete.
**Owner**: owner signature pending

## 2026-08-08 (4) — Enforce the four delegated rulings, and a rail-border regression

**Why**: Owner delegated four pending verdicts ("look at each one and decide") and separately spotted a rail-tile border artifact.
**Prior**: builds on the 2026-08-01 vault-scoped URL clearing fix (item 1), the 2026-08-08 hub-label/refit diagnosis (item 2), and the #961 migration (item 5).
**Decision**: (1) Docs vault deep link: baseline changed from "first run" to "settled first scope" (`selectionReady`), so only post-settlement scope changes count as a real vault switch, preventing cold-load hydration from wiping a fresh `?slug=`; `tests/e2e/docs-deeplink.spec.ts` added. (2) Hub label/refit treated as a bug fix: add hub/project to safe-area cull protection, refit only on data-source-identity change, hub tie-break selection left untouched. (3) Analyzer README domain: applied bootstrap's zero-automatic-meaning-writing principle instead of expanding the manual banned-word list; only code-evidenced or code-derived-parent domains auto-plant, README-only domains become listed candidates (old behavior behind `--apply-readme-domains`); attunegraph went from 14 nodes (11 fake) to 3 honest nodes plus 11 candidates. (4) Studio dialog h1 set to 14px matching other measured dialog titles; edit form keeps only the sticky top save as the sole filled primary CTA, bottom demoted to secondary. (5) Rail tile border (`1px solid rgba(255,255,255,.06)`) traced to #961 adding `shape:"card"` for focus-ring geometry, which brought a card hairline not present before migration; applied `border-0` to both consumers and added a zero-border check to `desktop-shell-rail.spec.ts`.
**Dissent**: none
**Falsifier**: not recorded
**Owner**: owner delegated; executed, signature pending

## 2026-08-14 (5) — U1.1 Projects taxonomy starts with a compatibility slice

**Why**: `category` and `status` should be different axes, but default category IDs `in-progress`/`planned` read as lifecycle states, and when a vault lacks category/status, `projectToInput` can inject `uncategorized`/`active`, letting an unrelated-field edit or bulk update fabricate frontmatter facts.
**Prior**: none
**Decision**: This slice is not a meaning migration. Existing category/status IDs, URL filters, and unknown values round-trip unchanged. Category's structural placement and status's lifecycle signal stay separate code contracts. No new default IDs, legacy alias resolution, migration, MCP/CLI commands, or UI copy this round. `projectToInput` and bulk update preserve omitted category/status instead of injecting values, tested for present/omitted/unknown round-trip and deep-link regressions.
**Dissent**: The evidence seat judged "Investigate first" while the guardian seat judged "Shape a slice."
**Falsifier**: If unrelated-field edits or bulk updates on an existing vault produce missing values, or `?c=in-progress` points to a different grouping, or create/edit reads the two fields as the same lifecycle question, revert to "Investigate first" and open a separate taxonomy decision.
**Owner**: owner approval pending

## 2026-08-14 (6) — U1.2 spotlight only moves during transition and stops at idle

**Why**: Spotlight's ring dash phase is computed as `now * spotlightRingSpeed`, so it can keep changing after a transition completes as long as other canvas activity continues, failing to prove bounded motion.
**Prior**: none
**Decision**: No new colors, easing, tokens, or effects; reuse the existing `focusDimTau` ramp. Update ring-speed phase only during on/off transitions; once the ramp reaches its target, freeze phase at the last value. Reduced-motion keeps phase 0 and settles immediately. Idle gate keeps skipping paint after grace following transition end.
**Dissent**: none
**Falsifier**: If ring phase changes after a transition ends, or changes under reduced-motion, or spotlight alone keeps the idle gate active past grace, discard this decision.
**Owner**: owner approval pending

## 2026-08-14 (7) — The compact import response does not hide stale edges, it requires a full follow-up

**Why**: `infer_imports`'s compact/`reviewMode:"next"` response preserves import-backed candidates one at a time, but `inVaultNotInCode` marks existing `depends_on` edges not observed in code as stale; truncating that edge's detail (`from`, `to`, `ref`, `via`) makes omission indistinguishable from complete absence.
**Prior**: none
**Decision**: Compact responses always include `staleEdgeFollowUp`: `{status:"not_present", count:0, nextCall:null}` when none exist, or `status:"full_follow_up_required"` with `count` and an exact `nextCall` to `infer_imports({rootPath, reviewMode:"full", allowLargeResponse:true})` otherwise. Compact responses are never read as providing stale-edge detail; CLI validator and MCP outputSchema enforce this fail-closed. Also fixed `list_concepts` pagination: default `limit` 100, 125 a valid mid page size, 500 the allowed maximum, 501 rejected; each page returns `returned`, `limited`, `pagination.nextOffset`, and `hasMore: true` must use the next offset.
**Dissent**: none
**Falsifier**: If a compact response omits the stale count, or a stale edge is marked reviewed without a full follow-up, or duplicate/missing/wrong nextOffset appears at the 100/125/500 boundaries, discard this decision and design a bounded stale-edge cursor separately.
**Owner**: owner approval pending

## 2026-08-14 (8) — The desktop performance gate blocks only static assets

**Why**: `desktop:perf` combined the whole `out/` and whole macOS `.app` byte limits into one failure condition, but total bundle size is influenced by build metadata, signing, and bundled runtime, conflating cause and user-facing performance.
**Prior**: none
**Decision**: Only `out/_next/static` total and the largest JS/CSS chunk remain hard static-performance gates; the two totals are now informational size metrics only. `.app` existence (`--require-app`) and static build output existence still fail the build. `desktop:perf` makes no claim about runtime startup; `desktop:verify-app`'s Tauri/WebView startup evidence and `cli:mcp-verify`'s MCP startup evidence are documented as separate boundaries.
**Dissent**: none
**Falsifier**: If static asset limits are exceeded but `desktop:perf` is not red, or it passes with zero JS/CSS output, or release preflight skips app/MCP startup verification, discard this separation and re-split the causes.
**Owner**: jinan

## 2026-08-15 — Modality is owned by the primitive: new Dialog, two width tiers, adoption ratchet

**Why**: A component-completeness audit flagged modals as the largest gap; measurement found `role="dialog"` in 26 places/23 files with 5 scrim-token variants, 2 scrimless aria-modal cases (`ProjectDrawer` a live modal-without-modality case), 8 hardcoded widths (360-576), hardcoded z-index (z-50 in 12 places, z-40 in 3), and aria-modal declared with an actual focus trap in only 8 of 20 places.
**Prior**: none cited as overturned; builds on existing `use-dialog-focus-trap`, `use-body-scroll-lock`, and `transientSurface("sheet")`.
**Decision**: Created `Dialog` at `src/shared/ui/dialog.tsx` with tokens: scrim `--overlay-scrim`, z `--z-dialog`, surface `--color-panel`, border `--color-divider`, radius `rounded-panel`, shadow `--shadow-elevation-3`, widths `--dialog-w-sm` (420, new) and `-md` (560, existing). No `modal={false}` option; non-modal use belongs to Surface. v1 ships the center variant only; sheet/edge/palette register when their first consumer migrates. First three consumers migrated: `NewDocKindDialog`, `StudioMaterializeDialog`, `StudioPracticeCleanup` (zero visual scrim change). Gate: `dialog-adoption-ratchet.contract.test.ts` (2 files registered with rationale, 17 files debt, new files must be 0) plus `dialog.test.tsx` modality contract. Deleted ghost `--dialog-w-lg: 720` from docs.
**Dissent**: (a) no merge without responsive-sweep measurement per variant's first consumer, satisfied here at 390/768/1280; (b) scrim value convergence (0.6 to 0.85, 7 files) needs a separate round with hierarchy-seat sign-off; (c) motion syntax unification is deferred to a motion-seat co-signed round, v1 keeps the current framer majority.
**Falsifier**: If new modals bypass the ratchet and grow without the primitive, widen the scanner's reach. If a second legitimate width need appears uncovered by 420/560, register a new size. If an `initialFocus="none"` consumer gives focus to nothing, remove `none` for a ref-based `initialFocus`.
**Owner**: jinan

## 2026-08-15 (2) — Form behavior layer: Input/Textarea, Checkbox approved, Switch, Slider rejected

**Why**: Component-completeness roadmap stage 2/3. A census correction found the briefed "3 files bypass fieldClass" premise wrong (they were an sr-only proxy, a checkbox, and a range); bypass is actually 0, so the form-debt ratchet had already closed and this round's axis is behavior, not adoption.
**Prior**: builds on the 2026-08-06 (14) form-debt closure.
**Decision**: `Input`/`Textarea` (`src/shared/ui/input.tsx`): zero new axes, tokens, or pixel change; wires accessible-name type enforcement and `error`/`hint` to `aria-invalid` plus `aria-describedby` (error first) plus `role="alert"` automatically. Style asserted byte-identical to fieldClass output. Existing direct fieldClass callers are not debt; only new files are blocked by `field-adoption-ratchet` (ceiling 38 places/25 files). `Checkbox` (`src/shared/ui/checkbox.tsx`): 6 places/5 files converged from 3 drift variants (brand 4, accent 1, UA default 1, all lacking focus-visible) to brand accent, size-4, value-layer focus ring, embedded label; `accent-[` lint activated with zero exempt files. Form debt baseline moved -1 to -6. Switch rejected (the only `role="switch"` instance is already a correctly-patterned chip toggle). Slider promotion rejected (one range instance, both consumers inside settings sheets).
**Dissent**: reopen Switch if a second single on/off row need appears outside segmented-control syntax; reopen Slider if a second range consumer appears outside settings, resolving the `w-28` label coupling. Registered in `field-adoption-ratchet`'s SPECIAL_REGISTERED.
**Falsifier**: If Input's error wiring is bypassed by a hand-rolled `role="alert"` in a new file, extend the ratchet to alert markup. If name enforcement is bypassed via empty `aria-label=""`, add a runtime assertion.
**Owner**: jinan

## 2026-08-15 (3) — SegmentedControl: the canonical form for exclusive single-select, even a two-option choice is a radiogroup

**Why**: Five hand-reimplemented "bordered single-select" spots showed drift: 3 ARIA variants (aria-pressed 2, radiogroup 3, roving implementation 0), 3 container inset variants, 3 background variants, 2 selection-representation languages (one hand bg-panel combo had ink contrast 1.17:1).
**Prior**: follow-up to 2026-08-15 (2)'s roadmap stage 3.
**Decision**: `SegmentedControl` (`src/shared/ui/segmented-control.tsx`): even a 2-option on/off is a radiogroup; aria-pressed cannot carry exclusivity and is unrepresentable in the primitive. Keyboard contract owned by the primitive: roving tabindex, arrow-cycle plus selection-follows-focus, Space, no Home/End (guarded by a regression test), Escape left to the host. Canonical container `p-px gap-px overlay-1 border-soft rounded-chip`, inset decided by height-ladder arithmetic; background is parent-plus-2% alpha. Added `atlas-touch-floor` to segment base, default size lg, removed `touch-hit-expand` from `LocaleSwitch` in the same commit. Migrated 4 consumers: settings SegmentSwitch, LocaleSwitch, AgentConnectSheet, FootprintSettings. `BlockImportModule` is not a consumer (a wrapping radio grid, not a single-row strip).
**Dissent**: Choice's chip-radiogroup promotion and two exclusive-selection-but-toggle-syntax spots (DocsSidebarBody, FirstRunStarterModule) deferred to the next round; pixel movement (AgentConnect 24 to 32, background alpha, font 11 to 12.5) requires hierarchy-seat sign-off plus 390/768/1280 measurement as a merge condition.
**Falsifier**: If arrow navigation triggers a heavy side effect in some consumer, re-judge selection-follows-focus there. If a segmented control grows to 5+ options, that is Select's territory and an option-count ceiling should be added.
**Owner**: jinan

## 2026-08-15 (4) — For static badges, the value layer owns **geometry only**: color is not an axis, since there is no majority pattern

**Why**: Two portability tests both flagged that value choices are strict while placement is silent. Full census: 67 static badges/36 files, 30 geometry variants but 60 color variants (max cluster 2), 44 status dots, 10 list rows/9 variants, 53 section cards/28 variants; the spec table's badge prescription had zero exact-match production usages.
**Prior**: none
**Decision**: Created `badgeClass` (`src/shared/ui/badge-class.ts`) as a value layer, not a component, since static badges have zero behavior. Single axis `shape`: `micro`, `tag`, `pill`, each the mode of its radius family, zero new tokens or values. Did not create a tone/caps axis since any choice would have 2 or fewer consumers. Migrated 17 spots byte-identically; adoption ratchet ledger 52 entries/31 files. No padding enforcement mandated, distinguished from the 2026-07-26 decision, which covered inter-element gaps, not component insets. Rejected list rows (10/9 variants, below consumer density); deferred section cards (53/28) pending a full 5-axis census. `SettingsRow` widget stays put (2 consumers, both in settings sheets).
**Dissent**: Without a tone axis, color drift (60 variants) remains, a half-convergence.
**Falsifier**: If a future round shows colors actually converge to 3-4 families, deferring tone was a mistake; reopen the tone axis and fix `badge-class.contract`'s assertion that the value layer does not own color.
**Owner**: jinan

## 2026-08-15 (5) — Section card: value layer **rejected**, instead pay down 12 unadopted spots of an existing token

**Why**: Full census of the section-card 5-axis combination deferred by 2026-08-15 (4): 71 hand-written box insets/36 files, 51 distinct combinations, top-3 combos cover only 18%, 41 singletons, radius split panel 43/card 28, padding 26 variants.
**Prior**: executes the deferral from 2026-08-15 (4).
**Decision**: Did not create a `cardClass` value layer this round, since fixing any padding axis would force pixel movement on 58+ instances. Instead found `--card-pad` (16px) has 16 consumers while 13 more spots hand-rewrote the same 16px; migrated 12 of those 13 (excluded `DownloadPage:537`, whose ladder is documented arithmetic, not taste). Fixed the spec table, which listed `card = rounded-card + --card-pad` with zero real usage, to distinguish "section box (panel)" from "item box (card)," both using `--card-pad`. Deferred renaming `--card-pad` to avoid conflating this PR's judgment with a 28-site rename; documented the mismatch in `app/globals.css` comments. Created `tests/contract/static-card-adoption-ratchet.contract.test.ts`, ledger 62 entries/36 files, sharing the scanner with the badge ratchet.
**Dissent**: 51 variants may be the result of neglect rather than genuine diversity.
**Falsifier**: Reopen `cardClass` when the `panel x --card-pad x border-soft x (panel|overlay-1)` combination reaches 20 or more usages and a second family reaches 10 or more (currently 13 and none). Revisit the dissent if judging the ratchet's 62 entries site-by-site shows fewer than half actually needed a design judgment, once the ledger drops below 31 entries.
**Owner**: jinan

## 2026-08-15 (6) — The same contrast defect appeared for the **third** time: this time, lock it instead of fixing it

**Why**: Re-counting badge colors by role found 4 spots with text on a full indigo fill, 3 using `--color-text-primary` at 4.42:1 on a 9.5px uppercase label, below AA (4.5). This is the third occurrence of the same defect; the first two (2026-08-03, 2026-08-05) were fixed but never locked. Four blind spots overlapped: `accent-ink-contrast.contract` only judges tint, not opaque fills; `quaternary-ink-surface.contract` only covers achromatic layering; lint sees two legitimate tokens with a wrong pairing; runtime ratchets only measure what renders, and hub badges never render in the dogfood vault's audited routes.
**Prior**: cites 2026-08-03 and 2026-08-05 as the first two unlocked occurrences.
**Decision**: Changed the 3 spots to `--color-text-on-accent` (4.42 to 4.70), zero new tokens. Created `tests/contract/brand-fill-ink-license.contract.test.ts`, a computed check that reads token values from `globals.css` and passes at 4.5 or above. Judged per string literal, not per opening tag, after a tag-based parser produced false positives from a misread comparison operator and mismatched backtick pairing. Counted and capped the contract's one blind spot (fill and ink in different literals) at 24 ink-free fill literals, all confirmed legitimate.
**Dissent**: The third recurrence's cause is a sparse dogfood vault lacking a hub node, not a missing gate; the source-layer contract treats the symptom.
**Falsifier**: If this contract's first real catch is a spot the runtime ratchet could also have caught, the dissent is correct and the fix is fixture reinforcement. If it is again a conditionally-rendered spot, the source-layer contract is the right layer.
**Owner**: jinan

## 2026-08-15 (7) — Badge tone axis **rejected on reconsideration**: there are four roles, but "classifiable" is not "convergeable"

**Why**: A role-based recount of badges (neutral 32, accent/indigo 24, amber 5, map-only 4, signal+amber 3, amber+indigo 1, 69 total) reopened 2026-08-15 (4)'s tone-axis rejection, which had counted only 60 color-string combinations.
**Prior**: 2026-08-15 (4) (upholds); thresholds cited from 2026-08-15 (5) and (6).
**Decision**: Reject reopening the tone axis; (4) stands. Max byte-identical cluster is 4/69 (5.8%), below the shape-axis threshold (10/7/5) and the cardClass threshold (18%). Produced 2026-08-15 (6)'s brand-fill license gate instead of an axis; migration 0.
**Dissent**: "systems" seat: the four role families are real and the tone axis should open now; the license gate only locks which ink is dangerous, not which combo to use.
**Falsifier**: If any exact color combo reaches 10+ byte-identical uses and a second reaches 5+ (today's max is 4/4), reopen the tone axis.
**Owner**: jinan

## 2026-08-15 (8) — radiogroup: **behavior is one hook, the container belongs to the spot**. The value axis was declared done, but the behavior axis was 100% defective

**Why**: A full census of role="radiogroup" and aria-pressed exclusive-selection spots outside primitives found 18 groups, and 0 of them (100%) implemented roving tabindex or onKeyDown, despite control-adoption-ratchet's 2026-08-06 "zero hand-styled" green.
**Prior**: 2026-08-15 (3), which built SegmentedControl after fixing 5 hand-reimplemented spots.
**Decision**: Split into useRovingRadioGroup (shared/lib, single behavior implementation) and two canonical containers: well (existing) and chips (from a measured 10-of-12-group majority). Migrated Choice (7 call sites, pixel 0); 2 list-row spots excluded, using aria-current. Gate: tests/contract/radiogroup-behavior-ratchet.contract.test.ts requires actual hook calls.
**Dissent**: "systems" seat: hook-direct registration is a second-order hand-implementation paradise; tiles and panel chips should be forced into variants and per-option className opened instead.
**Falsifier**: If registered spots exceed primitive-consumer spots, reopen the variant axis; if excluded list-selection spots reach 4+, that's a listbox primitive's job.
**Owner**: jinan

## 2026-08-15 (9) — Behavior layer complete, 18/18. **What was blocking the container migration was not the container, but one missing axis**

**Why**: Executing (8)'s migration, all 5 target sites hand-wrote hover ink on inactive items that the value layer has no equivalent for; a broader count found 312 controlClass calls with hand-written hover, inconsistent across sites for the same role.
**Prior**: 2026-08-15 (8) (its per-site container disposition is corrected; layer separation, gate, Choice disposition stay valid).
**Decision**: Behavior layer fully migrated: all 18 groups adopted useRovingRadioGroup directly; containers stayed in place with per-site comments. Container convergence deferred to a hover-axis round (312 cases). 2 list rows use aria-current. Ratchet floor switched from file count to hook-call site count after AppearancePickers hid a broken wiring at file granularity.
**Dissent**: Knowing hover was missing, sending five sites to registration instead of opening the hover axis in this round was avoidance.
**Falsifier**: If the hover-axis census (312 cases) shows any value with 30+ consumers, dissent was right; if no convergent majority exists, splitting was correct.
**Owner**: jinan

## 2026-08-15 (10) — Full hover audit: the denominator was 60%, four defects surfaced, the axis ruling comes next round

**Why**: Deferred hover-axis census found the true population is 752 declarations / 511 sites / 129 files, not 312 (only 60%, missing overrides, native controls, hoisted constants, group-hover); the full count flipped hover:bg's #1/#2 ranking (overlay-2 47 vs overlay-1 45).
**Prior**: 2026-08-15 (9).
**Decision**: Axis not opened yet. Fixed 4 measured defects: 2 AA contrast failures on hover fills/inks; 2 sites where hover border covers the active/selection indicator; 2 sites riding the 180ms move-ramp instead of a 120ms hover budget; 5 touch-invisible "pin document" affordances moved to [@media(hover:hover)]:opacity-0. New gate: tests/contract/hover-tint-ink-license.contract.test.ts.
**Dissent**: Interaction seat: adding indicators to 51 link sites would break the app's intentional quiet restraint.
**Falsifier**: If applying the link fix pushes any screen's indigo-ink element count above 3, dissent is right; if the /docs touch-profile pin count matches list length post-fix, the fix is right.
**Owner**: jinan

## 2026-08-15 (11) — The hover axis is **three, not one**: per-spot measurement settled it

**Why**: Co-occurrence measurement of 309 hover-bearing calls (ink-only 117, bg-only 90, ink+border 61, ink+bg 31, border-only 6, all three 4) showed 96 sites need two properties together, which a single "hover" enum can't express.
**Prior**: 2026-08-15 (10).
**Decision**: Three independent opt-in axes: hoverInk (none/strong/secondary, top 4 of 331 = 95.2%), hoverSurface (none/lift, neutral lift 57%), hoverBorder (none/strong, 13 indigo tiers indistinguishable per 2026-07-26). Folded filled-button hover-darkening into onAccent tone (4.70 to 5.38). Migrated 37 sites/25 files by codemod; ratchet caps hand-written hover in controlClass at 387.
**Dissent**: Ink seat: segment (89%) and icon (76%) hover should be shape defaults, not opt-in, since forgetting to enable it reproduces a "doesn't look pressable" regression no selector can catch.
**Falsifier**: If 80%+ of new segment/icon calls turn hover on, opt-in was right; if 6 or fewer of the first 10 do, dissent is right and the default flips to shape-based.
**Owner**: jinan

## 2026-08-16 — The aperture of the hover instrument: two were widened, and one, on remeasurement, turned out to be something that should not be turned on

**Why**: Five hover-gate blind spots were left by 2026-08-15 (10) (one closed already by (12)); this record measures the remaining four.
**Prior**: 2026-08-15 (10); references (12).
**Decision**: Added a per-route floor of 3 comparisons to hover-contrast.spec.ts. Removed the first-viewport-only constraint (count rose 191 to 216, no new failures). Added pointer-parking as a defensive measure though re-measurement showed zero actual loss. Rejected enforcing non-text contrast (1.4.11): 57 of 60 sites fail (1.12-2.92), pure noise; documented as a known blind spot instead.
**Dissent**: none.
**Falsifier**: not recorded.
**Owner**: jinan

## 2026-08-15 (9) — A nonstandard implementation route can still serve as evidence for a meaning candidate, but it is not automatically promoted to a feature

**Why**: Held-out measurement found the analyzer fails to read internal/<role>/ implementation roots coexisting with lib/, due to first-source-root selection; one large repository returned 4 elements and 0 business candidates before remeasurement.
**Prior**: existing decisions that semantic analysis only proposes candidates cross-checked between business narrative and implementation evidence, never confirming capabilities from folder structure alone.
**Decision**: Collect internal/'s direct subdirectories as bounded implementation-element evidence (up to 48), alongside any chosen source root, without recursive depth scan. Only propose capabilities/build-tooling (proposal-only) when a trustworthy product statement names a bundler AND element paths show bundler/builder/compiler/linker witness. canWrite: false unchanged.
**Dissent**: none.
**Falsifier**: If build-tooling is proposed, or internal/<role> returned as a capability, in a repo lacking both narrative and path evidence, even once, this decision fails; if a 48-item-exceeding root shows no limit indicator, the bounded-scan boundary fails.
**Owner**: not recorded

## 2026-08-24 — Tauri runtime hardening: keep only what is used, and make what could not explain itself explain itself

**Why**: tauri sat at 2.11.2, three patches behind; nothing prevented a second instance against one vault; every println! among 16,562 lines of Rust sits inside #[cfg(test)], so a packaged .app leaves no diagnostic evidence; the CSP was byte-identical to Tauri's own example; core:default granted core:image/resources/menu/tray to a webview that never called them.
**Prior**: the 2026-07-27 surface contract (app is the vault's home, Tauri carries one static build); not moved, only permissions/diagnostics changed.
**Decision**: Bump to tauri 2.11.5 / tauri-build 2.6.3. Register tauri-plugin-single-instance first. Add tauri-plugin-log: one rotating 5 MiB file, Info level, logging only what the app did, never vault content. Delete inert customprotocol:, asset:, http://asset.localhost CSP entries. Narrow core:default's nine sets to five: core:event, core:app, plus path/window/webview pending proof.
**Dissent**: none.
**Falsifier**: (1) any vault body line, filename, prompt text, or key appearing in the log file. (2) the narrowed capability silently breaking a webview ability, restore core:default. (3) single-instance blocking a legitimate concurrent vault-opening launch, reopen at vault granularity.
**Owner**: not recorded

## 2026-08-24 — The `1512×982` window default was never a window. It was the whole display

**Why**: 1512x982 in tauri.conf.json is the 14-inch MacBook Pro's entire logical display; 982 plus a 28pt title bar exceeded the 945pt visible frame, so AppKit silently constrained it every launch; the ledger's own measurements always read 1512x949 outer, never 982, while measurement scripts always swept 1512x900.
**Prior**: the 2026-07-27 record giving the workbench seat the 14-inch first viewport, window lifecycle, wide-screen density.
**Decision**: Default height changed from 982 to 900 (928 fits the 945pt frame); width stays 1512. Adopted tauri-plugin-window-state with SIZE | POSITION | MAXIMIZED only. Added sanitize_window_geometry on every launch, clamping and recentring below the notched 37pt. Fixed skip_initial_state so the app reads and sanitizes the saved file before applying, since restore clamp was a no-op.
**Dissent**: none.
**Falsifier**: (1) the window opening somewhere the user did not leave it, or a --min-window-size failure tracing to the state file, means the sanitizer is wrong; retreat is dropping POSITION, not the clamp. (2) if the default reads as maximized, move width to 1440.
**Owner**: not recorded

## 2026-08-24 — PO Council: reject the `ontology-atlas://` OS URL scheme (0/24)

**Why**: Zero third-party issues, about 6 measured downloads, and 35 of 35 observed visitors arriving via web mean the population an OS URL scheme would serve is effectively empty; the motivating ledger record was resolved the same day in-band with typed executors in the same channel.
**Prior**: mcp/README.md:466 and spec paragraph 4 already prohibit uid in a URL; is_openable_url in src-tauri/src/lib.rs already records the outbound threat-model judgment allowing only http/https.
**Decision**: Reject building the ontology-atlas:// scheme. IN nothing; OUT scheme registration, uid addresses, write-capable or action-executing URLs, any second address vocabulary; appetite 0. Instead, separately: fix mcp/src/ontology-engine.mjs:1522's retired href to the canonical /topology/ focus address and add a contract test banning retired namespaces in MCP-emitted hrefs.
**Dissent**: slugs are mutable and uid is the immutable identity, so a rename-durable address is a real gap; Steward conceded this and named a follow-up: teach the ?p= resolver to accept uid and merged_uids and canonicalize to kind:slug.
**Falsifier**: Within one dogfood week, or the first installed cohort, 3+ occasions of hand-searching the map because the app was closed or on another vault, or a third-party issue requesting a clickable app link, reopens the question.
**Owner**: not recorded

## 2026-08-24 — PO pass: hold `tauri-plugin-notification` for ACP completion and blocked signals (10/24)

**Why**: acp.rs and lib.rs emit acp://message|stderr|notice|exit to the webview only, no OS-level signal exists; but no recorded instance exists of anyone missing a completion or an allow_once prompt, and a blocked session is indistinguishable from a finished one under the standing five-minute-quiet inbox rule.
**Prior**: the 2026-07-27 update-notification pair (6/24 do-not-build, standing); the 2026-08-01 quiet-threshold/inbox decision; (23) 2026-08-17; (92) 2026-08-21.
**Decision**: Investigate first, no code. Record three real dogfood ACP sessions for whether a write waited at allow_once while the app was not frontmost, how long until noticed, and whether the inbox showed it as quiet or done. Pre-committed no-gos if ever built: no vault-derived text in notification bodies, opt-in, focuses the app and executes nothing, never a second store of session truth.
**Dissent**: an app with no interrupt path makes the person the polling loop, and the blocked-agent case is heavier since the agent's own work stalls too; building only after observation is one beat late.
**Falsifier**: A single dogfood session where an allow_once request waited past the five-minute threshold because nobody was looking disproves this hold.
**Owner**: not recorded

## 2026-08-24 — MCP handed agents a retired address; one repair, and a gate so it cannot return

**Why**: mcp/src/ontology-engine.mjs:1522 emitted a retired /ontology/studio/?node= href from builder_context that only worked because a client-side redirect caught it; three council seats found it independently, and a sweep confirmed it's the only navigable address either mcp/ or cli/ emits.
**Prior**: the 2026-08-24 council rejecting ontology-atlas:// named exactly this repair as the alternative; standing decision (92) owns what /ontology/studio?node=... translates to.
**Decision**: Emit /topology/?p=<focusParam>&workbench=edit, byte-for-byte what the redirect already resolves to under (92).5; focusParam stays untouched. The address stays app-relative and locale-less. New gate: tests/contract/mcp-emitted-href.contract.test.ts scans mcp/src and cli/src for retired routes and asserts a /topology/ href is still emitted.
**Dissent**: none.
**Falsifier**: Within one dogfood week, an agent-relayed builder.href that fails to open the meaning editor on the focused node (deeplink-miss, wrong node, or no editor) disproves the address choice.
**Owner**: not recorded

## 2026-08-24 — The rejected URL scheme gets a gate, not a decision-record trigger

**Why**: scripts/check-decision-record.mjs fires only on added/deleted app/ routes and two CONTRACT_FILES, so registering a scheme in src-tauri/tauri.conf.json would pass decisions:check green with no council trigger.
**Prior**: the 2026-08-24 PO Council rejecting ontology-atlas://, which left this as a /gate-probe candidate.
**Decision**: Do not add Tauri config to the decision-record trigger list (would demand a record for every window size/icon tweak). Instead, tests/contract/url-scheme-rejected.contract.test.ts checks the deep-link plugin config, CFBundleURLTypes, and any minted ontology-atlas:// address. The scheme may return only by overturning the council record first.
**Dissent**: none.
**Falsifier**: If this gate ever fires on a change that is not registering a URL scheme, its shape is wrong and it should be narrowed.
**Owner**: not recorded

## 2026-08-24 — PO pass: hold the ACP events-to-Channel move until one session is measured (6/24)

**Why**: spawn_acp_line_pump emits one Tauri event per line of child-process stdout/stderr with a 16 MiB MAX_LINE_BYTES ceiling; Tauri's own documentation says events are "not designed for low latency or high throughput" and names Channel instead; no ledger entry or observation exists of output arriving slowly, out of order, or dropped.
**Prior**: (25) 2026-08-17 "an exit event closes only the session it was born in", standing; its dissent already reasoned about this same transport.
**Decision**: Investigate first, no code. During the next real dogfood ACP session, record lines emitted, rate, and p50/p99 line size against the 16 MiB bound; close as measured-and-not-a-problem if p99 is kilobytes, reopen if it approaches megabytes. No-gos if built: do not move acp://exit or acp://notice, keep MAX_LINE_BYTES bounded.
**Dissent**: the documentation names child-process output as the canonical Channel case, and waiting for a user to notice means shipping a known mismatch until it hurts someone.
**Falsifier**: One observed session where output visibly lags, or one dropped-line: notice traced to payload size, proves the hold wrong.
**Owner**: not recorded

## 2026-08-24 — `opt-level = "s"` measured and rejected: it halves the hashing this product does

**Why**: A standalone benchmark hashing 512 MiB in 1 MiB chunks with sha2 0.10.9 measured opt-level=3 (shipped) at 582 MiB/s versus opt-level="s" (candidate) at 277 MiB/s, a 52% throughput cost.
**Prior**: the 2026-08-24 release-profile change, which adopted lto/codegen-units=1/strip and left opt-level="s" open pending measurement.
**Decision**: Do not adopt opt-level="s". It buys 1.5 MB (1.7% of an 89 MB bundle whose largest component is a 61 MB sidecar) at the cost of doubling hashing time on the product's hot path; per-scan difference is roughly 55ms vs 115ms, but the ratio worsens as the vault grows.
**Dissent**: none.
**Falsifier**: If a future profile makes the Rust half of the binary the bundle's dominant component, re-measure rather than cite this record.
**Owner**: not recorded

## 2026-08-24 — The capability keeps two core sets, and this time it was measured

**Why**: Static evidence showed nothing in src/ or app/ imports @tauri-apps/api/path, /window, /webview, /menu, /tray, or /image; a packaged build with core:path/window/webview removed launched, loaded the vault, rendered content, and logged zero permission denials.
**Prior**: the 2026-08-24 Tauri runtime-hardening decision, which retained those three sets "pending installed-app proof, not a guess".
**Decision**: The main window's capability becomes core:event:default, core:app:default, updater:default, process:allow-restart, four permissions each with a named caller. Safe because capabilities gate JS-to-Rust IPC only; this app sizes/positions its window from Rust, which no capability governs.
**Dissent**: none.
**Falsifier**: Any permission denial in the app log, or a webview feature silently failing, means the narrowing was wrong; retreat is granting the specific set named, not restoring core:default.
**Owner**: not recorded

## 2026-08-24 — ACP output measured: events are the right transport, and the question is closed

**Why**: A harness spawning the same ACP adapter (npx @agentclientprotocol/claude-agent-acp@0.70.0) against the dogfood vault measured 6 lines over 24.4s (0.2-0.3 lines/second), p50 988 B, p99/largest 47,274 B, 0.28% of the 16 MiB ceiling; a first attempt used a wrong hardcoded session id and measured only a handshake.
**Prior**: the 2026-08-24 PO pass holding the events-to-Channel move at 6/24, "investigate first", naming this exact measurement.
**Decision**: Keep the events; do not adopt Channel. The documentation's concern is low latency/high throughput and this stream is three orders of magnitude away from either; acp://exit and acp://notice must stay events per decision (25).
**Dissent**: none.
**Falsifier**: An observed session where output visibly lags, or one dropped-line: notice traced to payload size, reopens this with a fresh pass.
**Owner**: not recorded

## 2026-08-24 — The install progress this repo built to cure "quiet waiting" had never once been delivered

**Why**: A #[tauri::command] without (async) executes inline on the macOS main thread, and Tauri events are delivered by that same thread's event loop, so while acp_install_node blocked downloading 52 MB, its own progress events queued undelivered and the window became unresponsive until the command returned and replayed the whole history at once.
**Prior**: none.
**Decision**: Move thirteen commands to #[tauri::command(async)]: two installers, four ACP doctor commands, runtime detection, project-source inspection, two LLM commands, three git commands, MCP verification. pick_vault_directory stays synchronous (needs the main thread). Also repaired: open_external_url now reaps its spawned Child instead of leaking a zombie process.
**Dissent**: none.
**Falsifier**: If a user reports the window freezing during an install, chat, or git pull after this change, the next step is to measure which thread the body runs on, not add more attributes.
**Owner**: not recorded

## 2026-08-24 — Codex returns to in-app chat, because the checkpoint moved to the server

**Why**: On an installed build with a disposable 10-file vault, reject returned "Error: The change was not approved (decline). No change was made" unchanged, and allow returned {"ok":true,"slug":"wire-probe","changed":true} with the file appearing; the gate initially refused "yes" because codex-acp maps "allow once" to action: 'accept' with no confirm field.
**Prior**: decision (111), whose restore condition was an app-owned proxy or server capability token reliably pausing every Codex Atlas write, proved reject/allow on a disposable vault; now satisfied, not overturned; (113) built the checkpoint.
**Decision**: codex-acp joins CHAT_ELIGIBLE. ISOLATION and CHAT_ELIGIBLE stay separate lists: controlling a config directory is not the same claim as the resulting configuration holding a write.
**Dissent**: one green acceptance is a smaller sample than the two red measurements that removed Codex, and the gate depends on a third party continuing to forward mcpServer/elicitation/request; countered that the checkpoint now lives in the server and fails closed, degrading to refusal rather than a silent write.
**Falsifier**: One Atlas write from an app-opened Codex session that changes the vault without a card, or one approval that does not reach the server, returns Codex to the state (111) left it in.
**Owner**: owner

## 2026-08-24 — The first-run card gets a door for people who already have code

**Why**: Measured on the shipped first-run card, none of its four actions (open my folder, create a new folder, look around here, two-minute tour) makes an ontology from a repository that already exists; the only real path was a folded CLI-bridge row that explicitly excludes app users.
**Prior**: the 2026-08-02 first-run-card record stands except its no-go on affordance count, overturned for this one addition on the owner's own instruction.
**Decision**: Add a door: pick the folder (existing picker), open the agent conversation, and put the bootstrap instruction in as the person's own first turn; the agent runs analyze_repo_structure and every write asks through the checkpoint decisions (113)/(114) built and proved. The app never calls MCP tools itself; on the web, the door is absent rather than present-and-disabled.
**Dissent**: the instruction is sent on the person's behalf by a button press rather than a composer they send themselves; countered that the button's label states exactly what will be asked and every write still stops for an answer.
**Falsifier**: Someone presses the door, watches the agent propose, and refuses the writes, or presses it and cannot tell what was about to happen, either means the handoff explains itself less well than the CLI row it replaced.
**Owner**: owner

## 2026-08-24 — The map moves inside the project, into a folder named `atlas`

**Why**: the product gave two contradictory answers to where a map lives: the installed app's "just start" created `~/Documents/Ontology Atlas/` outside any project, while the CLI's `init` and this repository's own vault sit inside the repository. The owner asked whether a project's folder should be created at that project's root.
**Prior**: none
**Decision**: when a project is targeted, the vault is created at `<project>/atlas/`. The name `atlas` was chosen over `docs/ontology`. An existing `atlas` folder is continued, not overwritten, and the screen states which happened.
**Dissent**: a product name at a repository root is close to a one-way door; if Atlas is ever renamed, that folder already sits in other people's repositories and no later decision can reach them.
**Falsifier**: someone deletes or gitignores the `atlas` folder as vendor litter, or a team refuses the folder at their repository root.
**Owner**: not recorded

## 2026-08-24 — The door follows "hasn't built one yet", not "has never opened a folder"

**Why**: the "make a map from my code" door was gated on `recentVaults.length === 0`. The owner rejected that audience, asking whether it should instead reach the person who has opened folders many times and still hasn't made one.
**Prior**: none
**Decision**: the first-run card keeps its existing rule. The door gets its own rule: it appears wherever a vault is open and nothing in it points at real code, however many times that person has opened folders, and disappears once a map with connected code exists.
**Dissent**: a second home for one action risks two things claiming to be the same door and drifting apart; countered because both render one component with one label and flow, and the variant only changes size.
**Falsifier**: the row is measured as ignored by people with an unbuilt map, or reported as clutter by someone who deliberately chose not to connect code.
**Owner**: not recorded

## 2026-08-24 — Picking a project opens the map inside it, and says so

**Why**: the owner asked whether, wherever an `atlas` folder exists inside or outside a project, Atlas reads it and draws the ontology. `PROJECT_VAULT_DIR` was read only by the door's own flow; "open a folder" did no subfolder detection and treated whatever was picked as the vault, so picking a project root read the whole source tree as a vault.
**Prior**: opened by 2026-08-24, "The map moves inside the project, into a folder named `atlas`".
**Decision**: when the picked folder holds a child directory named `atlas` containing Markdown, Atlas opens that child instead, and the INDEX panel states plainly that it did.
**Dissent**: an explicit prompt asking consent would be more literal than a notice after the fact; countered because this is a read, not a write, and a confirmation on every open is a toll charged forever.
**Falsifier**: somebody reports being surprised by which folder opened, or deliberately wants the project root read as a vault and cannot get it.
**Owner**: not recorded

## 2026-08-25 — `init` may only wire the project it was actually run inside

**Why**: running `node cli/src/index.mjs init <somewhere-else>` from this repository rewrote this repository's own `.mcp.json` and `.codex/config.toml` to point at the scratch vault, unasked and unwarned. The cwd write was guarded by `cwdPath !== canonicalTarget`, true of every unrelated directory on disk.
**Prior**: none
**Decision**: `init` writes agent config into the current directory only when the vault is created inside it. When the vault lands outside, cwd is left untouched and the command says so and why. The vault's own config is always written.
**Dissent**: someone running `init ../other-project/vault` may genuinely want their current project bound to a vault kept beside it; countered because that intent cannot be distinguished from the accidental case, and the recoverable failure is the right one to choose.
**Falsifier**: a report of keeping the vault deliberately outside the codebase and finding the extra step onerous, which would call for an explicit flag.
**Owner**: not recorded

## 2026-08-25 — "Just start" leaves the folders macOS protects

**Why**: "just start" created `~/Documents/Ontology Atlas/`, and Documents is a directory macOS guards with TCC, so the zero-friction path made a system permission dialog the first thing a new person saw, before any map existed to justify it.
**Prior**: left unresolved by 2026-08-24, "The map moves inside the project, into a folder named `atlas`".
**Decision**: the container moves to `~/Ontology Atlas/`, since `$HOME` itself carries no TCC gate. This is the no-project path only; pointing Atlas at a codebase still creates `<project>/atlas`.
**Dissent**: a folder at the home root is clutter and Documents is where a person expects documents to live; countered because that cost is paid once quietly, while the permission dialog was paid loudly at the worst possible moment.
**Falsifier**: someone reports the home-root folder as clutter, or asks where their vault went, which would mean the location should be configurable rather than moved again.
**Owner**: not recorded

## 2026-08-25 — A folder the OS is protecting gets its own error, not an errno

**Why**: declining the macOS access prompt made the read fail with `Operation not permitted (os error 1)`, shown raw on screen under the generic `access-failed` code, naming an errno rather than a folder or remedy.
**Prior**: the hang on this same condition was fixed on 2026-08-24, which made this remaining silence the visible problem.
**Decision**: a refusal by the operating system is classified as its own `permission-denied` code from the OS message, and the screen names the folder and where to allow it. All four paths that can meet a protected folder classify the same way.
**Dissent**: matching on English errno text is brittle; countered because the fallback is the previous behavior, and inferring from paths instead would be wrong in ways the person cannot correct.
**Falsifier**: a refusal that still shows the raw errno, meaning the signature list missed a form.
**Owner**: not recorded

## 2026-08-25 — Two flow defects found by walking the door, not by reading it

**Why**: the owner asked that the flow feel smooth rather than merely correct. Walking it end to end found two places where each piece worked but the sequence did not: the door was a dead end without an agent (`if (!target) return;`), and the "opened the map inside" notice never went away once set.
**Prior**: none
**Decision**: the door is not drawn when there is no ACP runtime to hand work to, so that person meets the separate "connect an AI agent" path instead. The substitution notice can be closed once read, not auto-dismissed on a timer.
**Dissent**: none
**Falsifier**: someone with no agent reports that the missing door left them without a way to build a map, meaning the connect path is not carrying the assumed weight.
**Owner**: not recorded

## 2026-08-25 — Pressing the door in the installed app found five defects, one fatal

**Why**: the owner asked for the door to be pressed on a real project rather than reasoned about, and the flow stopped after the chat opened.
**Prior**: built on 2026-08-24's move of maps inside projects.
**Decision**: pass `OATLAS_REPO_ROOT` only when the vault has the shape `<project>/atlas`. The folder picker now asks for the project folder, not "open ontology vault". The permission card distinguishes the person's own project from elsewhere. The "connect an AI agent 1/3" row yields while the agent panel is open. A concept ceiling keeps the door from firing on an already-built vault.
**Dissent**: the concept ceiling in (5) is a number, and numbers about "enough work" age badly; countered because judging map quality is not something a threshold can do honestly, and a wrong door on a large vault costs more than a missing one.
**Falsifier**: somebody with a genuinely unfinished map larger than the ceiling looks for the door and cannot find it.
**Owner**: not recorded

## 2026-08-25 — An empty vault is the strongest case for the door, and it was the one case that hid it

**Why**: on the installed app, a vault with zero concepts did not draw the "make a map from my code" door at all, the exact person it exists for. The rule keyed on `unboundProjectNodeId`, which is null both when every project already has code bound and when there is no project at all.
**Prior**: caused by the concept ceiling added in 2026-08-25, "Pressing the door in the installed app found five defects, one fatal".
**Decision**: the caller now also passes `noProjectsYet` from the readiness state that already distinguishes the two cases; nothing to bind is treated as evidence no map has been built, not that one has.
**Dissent**: none
**Falsifier**: the door appearing on a vault that is empty only because it is still loading, which would make it flicker on every open.
**Owner**: not recorded

## 2026-08-25 — `atlas` becomes reachable, without a registry

**Why**: the owner asked whether the product ships a CLI usable for "every feature... from the CLI alone" with "no npm yet". The investigation found 56 CLI commands against 35 MCP tools, but `relate` could create a relation and nothing could remove one, and the only way to run any command was `node <checkout>/cli/src/index.mjs`, printing all 56 rows.
**Prior**: none
**Decision**: add `remove-relation` as the mirror of `relate`, removing the edge's `relation_notes` entry too. Add `install-shim`, writing a one-line `exec` launcher into `~/.local/bin/atlas` with no registry or `sudo`, never replacing a file it did not write. The bare command stops listing all 56 rows and reads the working directory to suggest relevant commands; `--help` keeps the full list. No npm publish; nothing distributed.
**Dissent**: a shim is a worse install than a package manager, since it does not update and breaks if the checkout moves; countered because the alternative on offer was no install at all.
**Falsifier**: observed the same hour and closed: moving or deleting the checkout produced a confusing Node stack trace, so the shim now checks its target before `exec` and exits 127 naming the missing path.
**Owner**: not recorded

## 2026-08-25 — One word per thing, and it may be the accurate one

**Why**: a measured inventory of the Korean catalogue found the person's own folder called by four different names across 41 strings, and the owner could not read an empty-map screen because it used the private word for "project" as a node-count noun.
**Prior**: overturns the standing rule in `.claude/rules/design.md`: "Use 'ontology' only in the brand and in sentences that define it. Elsewhere use map, concept, or workspace."
**Decision**: one word per thing, and the word is the domain's own: the folder is the ontology folder, the graph is the ontology, the map is the view of it, a node is a concept, a kind keeps its real name. Canonical spellings live in `tests/contract/user-facing-vocabulary.contract.test.ts`. `vault` was considered and rejected as the user-facing term, but stays as an identifier in code, CLI, MCP and docs. `topology-plain-language.contract.test.ts`, which pinned exact Korean prose, was removed.
**Dissent**: the ontology term is longer and more technical than "map" and may lose a first-time visitor; countered because they meet it in the product's own name, in every file's frontmatter and every agent tool.
**Falsifier**: someone reads a screen and cannot tell the ontology from the map, or reports the folder term as jargon.
**Owner**: not recorded

## 2026-08-25 — The empty map stops offering a round trip to itself

**Why**: the empty topology map offered a `ctaTree` row pointing at `/ontology/`, which redirects to `/topology/` with INDEX expanded, the same screen the panel is drawn on; at zero concepts, pressing it returned to the same empty screen.
**Prior**: overturns, for this one removal only, the "adding or removing an affordance" no-go in the 2026-08-02 first-run-card record, on the owner's explicit instruction.
**Decision**: `ctaTree` renders only when the panel is not in its no-concepts state, matching the already-hidden `crossViewHint` line. Where concepts exist, the row stays.
**Dissent**: a removed row is a removed path for someone who wants INDEX expanded on an empty map; countered because INDEX is reachable from the map chrome itself.
**Falsifier**: someone on an empty map looks for a way to open the concept list and cannot find one, or the two remaining actions are reported as too few to choose from.
**Owner**: not recorded

## 2026-08-31 — Atlas value is a paired lifecycle question, not a self-repository lookup

**Why**: the owner asked which benefit Atlas provides in both greenfield and brownfield work compared with not using Atlas, to guide the long-term goal and README.
**Prior**: `docs/benchmark/FINDINGS-2026-08-25.md` concluded this repository is too self-documented for a causal control and directed the next run to an isolated unfamiliar repository.
**Decision**: build only the benchmark and evidence loop: a prepared, validated Atlas vault plus read-only MCP as the treatment arm versus a control physically without the vault, MCP, and answer key, on matched fixtures. Pilot `2026-08-31-gb-pilot-r2` completed all 8 cells with zero integrity failures; required-evidence coverage rose from `0.25` to `1.0` (greenfield) and `0.2833` to `0.6167` (brownfield), off to on.
**Dissent**: a two-subject, three-repeat matrix can still measure task selection or authoring cost rather than a durable Atlas effect; countered because a matched Atlas-absent arm is the cheapest missing counterfactual and is bounded as pilot evidence.
**Falsifier**: after clean control-integrity checks and repeated runs, Atlas does not improve meaning correctness, boundary/impact fidelity, citation accuracy, or handoff usefulness, or it increases unsupported claims or harms the negative control.
**Owner**: jinan

## 2026-08-31 — Three-repeat lifecycle pilot favors boundary and handoff, not speed

**Why**: the runner was repaired forward after its first feasibility attempt, and the same fixed tasks were repeated three times per arm on each of two fixture subjects.
**Prior**: follows 2026-08-31, "Atlas value is a paired lifecycle question, not a self-repository lookup".
**Decision**: keep the long-term goal bounded to a local, reviewed, business-to-code handoff whose value compounds across changes. Treat this pilot as feasibility evidence only; before public claims, add human semantic/citation grading, real unfamiliar snapshots, construction/maintenance cost, and a stale-vault arm.
**Dissent**: none
**Falsifier**: a null or harmful result in the listed follow-up measurements reopens the README claim under the falsifier of the record above (no improvement in meaning correctness, boundary/impact fidelity, citations, or handoff usefulness).
**Owner**: not recorded

## 2026-08-31 — Measure Atlas through one bounded change-flow slice

**Why**: the owner clarified that Atlas value must be judged across an actual code-change handoff, not as a search benchmark.
**Prior**: follows the paired lifecycle pilot in 2026-08-31, "Three-repeat lifecycle pilot favors boundary and handoff, not speed".
**Decision**: five product-owner seats unanimously kept "Shape a slice": one fixed change on a greenfield-shaped and a brownfield-shaped subject, Atlas physically absent versus a prepared read-only vault, fresh temporary repositories, fixed tests, a local bare remote, a conventional commit, and local push. The slice also covers one clean merge and one deterministic conflict/recovery, post-merge tests, and, on the Atlas arm, ontology validation plus a reviewed post-change update attempt.
**Dissent**: none
**Falsifier**: equal human-graded change quality, no improvement in boundary, provenance, or handoff decisions, or an apparent advantage explained by generic source/Git competence, authored fixture context, or maintenance cost.
**Owner**: jinan

## 2026-08-31 — First change-flow repeat shows workflow parity, not product lift

**Why**: the fixture baseline, Atlas local-sidecar ignore contract, feature-commit capture, and failure diagnostics were repaired, and `2026-08-31-change-r7` then completed all four matched cells (greenfield/brownfield off/on).
**Prior**: follows 2026-08-31, "Measure Atlas through one bounded change-flow slice".
**Decision**: keep the README claim at feasibility level: a reviewed meaning record can travel with a bounded code change through tests, commit, local push, merge, and cleanup. Do not claim Atlas owns Git integration or improves code outcomes until human semantic grading, unfamiliar repositories, stale-vault behavior, and construction/maintenance cost are measured.
**Dissent**: none
**Falsifier**: not recorded
**Owner**: not recorded

## 2026-09-01 — Human comprehension after agent work becomes the campaign lens, not a performance claim

**Why**: the owner described the observable failure as human cognitive absence after an agent produces code faster than the owner can understand what was built, and asked to align public surfaces to that.
**Prior**: the 2026-08-25 codebase-ontology category and master promise, the 2026-08-28 landing headline, and the 2026-08-31 benchmark limits all still stand.
**Decision**: keep the master promise and landing headline; use "human comprehension after agent work, before acceptance" as the campaign lens, contrasting Git's exact changed lines, the producing agent's own claim, and Atlas's durable human-reviewable meaning. Align the landing lead, README, positioning guide, and HN/Reddit drafts. Do not relabel the current 44-second video as post-agent review evidence. Do not claim `100x`, token savings, faster answers, better code, or automatic semantic truth. Do not claim the campaign works until at least four of five source-hidden evaluators can identify what changed and when it matters from the Atlas artifact alone.
**Dissent**: the problem currently has one observed owner, not a market.
**Falsifier**: revert the lens if fewer than four of five evaluators can recover the changed capability and review moment, if a PR summary proves sufficient, if accepted corrections are not retrieved in later work, or if keeping meaning current costs more than the avoided misunderstanding.
**Owner**: jinan

## 2026-09-01 — Design proof follows the changed failure mode; rendered work is observed while it is built

**Why**: the owner questioned whether the design council, audit, responsive sweep, and motion procedure improved work or stacked ceremony, and required UI/UX be built through repeated Computer Use screenshots and state inspection, with motion approved only from a real screen recording.
**Prior**: retains the standing decision that instruments and the accountable guardian matter, not that every instrument or seat fires for every change; its falsifier (unmeasured visual or temporal regressions) still stands.
**Decision**: add `pnpm design:route` with 16 Atlas change classes deriving directions, council seats, proof instruments, and scope. Every rendered class, including copy, gets the `computer-use-loop`: baseline, one coherent slice, fresh actual-window screenshot and accessibility tree, correction, final capture. `motion` gets `/motion-verify` against a real macOS recording, uniform 30fps frames, phase strip, frame-diff statistics, and reduced-motion proof. Most local change classes skip council by default; council is kept only for a new surface, IA, primary interaction/attention model, or a canonical design contract. Five consecutive no-delta councils force an owner review. The design OS shrank from 1,245 lines/150 mandatory terms to 311 lines/22 terms.
**Dissent**: change classes are still supplied by an agent, and a mistaken caller can omit `responsive`, `motion`, or `desktop-shell`; countered because the inspectable route and required evidence packet are a narrower control than assuming automatic semantic classification.
**Falsifier**: reopen if a rendered change merges without baseline/checkpoint/final Computer Use evidence, a motion change is approved without a real recording, or a route omits an instrument.
**Owner**: jinan

## 2026-09-02 — Every decision record is six fields on one screen, and the ledger is condensed to match

**Why**: 478 records in 38 days at a median of 51 lines and nine labels each made a 1.98 MB ledger nobody could read before convening, which is the ledger's own first contract; the 2026-09-01 format had grown to fifteen fields.
**Prior**: the "record format" template of 2026-07 and the fifteen-field active format of 2026-09-01 are both overturned; the append-only convention is kept for content, so this condensation is recorded here rather than done silently.
**Decision**: a record is exactly Why, Prior, Decision, Dissent, Falsifier, Owner, within 24 lines and 2,000 bytes, enforced by `pnpm decisions:check` on every record; route, evidence state, review turns, delta, and outcome live only in `docs/PO-PILOT.md`; all 478 earlier records were rewritten into the template and translated to English by model, with dates and numbers preserved and every output validated by parser, and originals remain in Git history.
**Dissent**: condensing history loses nuance that a future dispute might need (the reviewer's position); it lost because Git keeps every original byte and a ledger that is not read loses everything.
**Falsifier**: a dispute in which the condensed record misstates what was decided and the reader has to recover it from Git history; two such cases reopen how much a record may carry.
**Owner**: stark

## 2026-09-03 — Architecture is a comparison workbench, not a demo canvas

**Why**: installed-app walkthroughs showed a dotted full-screen map, three-card evidence popup, long amber status capsule, one-second import replay, guided “walk”, and Change/Verify prose panels competing with the architecture itself; the owner found them cramped, AI-styled, unclear, or useless.
**Prior**: overturns the visible Understand-Plan-Verify workflow from 2026-08-26 and the replay interaction; keeps the reviewed architecture contract, dated observation receipt, canvas-with-docks boundary, direct role boxes, and fail-closed unknown state.
**Decision**: four paths remain: compare evidence, select a role, open roles/rules, or hand the task to an available agent. Remove tabs, replay, guided walking, and raw prompt panels. The canvas is solid; when 1008px fits, each of seven rows pairs a 280px reviewed card, 72px delta gutter, and 240px observation card, with honest combined cards below that width. Role and evidence docks reserve 380px and 360px respectively and are mutually exclusive. Evidence is one continuous ruled ledger, not three cards. The toolbar is one 44px control row; the short agent action is outline. Current scope is static; clean roles say only “no recorded violations.” Selection animates into persistent paired state and dock width over existing motion tokens; nothing loops or performs for decoration.
**Dissent**: workflow stages could teach the intended process, replay could emphasize direction, and borderless rows could reduce card weight; they lost because the live screen made those features harder to understand than direct selection and made the evidence less distinct.
**Falsifier**: reopen if five observed Architecture tasks require a removed stage/replay/walk path, if readers cannot distinguish reviewed intent from observed imports and delta, if a selected dependency cannot be recovered from canvas plus dock, or if 1512px hides a role, mismatches toolbar heights, or lets a dock cover the diagram.
**Owner**: jinan
