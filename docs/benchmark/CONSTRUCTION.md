# Construction measurements

Measure the artifact an unfamiliar-repository build produces, as well as the
cost of producing it. Candidate-discovery accuracy from `eval:meaning-extraction`
does not measure independent model construction: its definition, citation and
competency minimums are zero. A valid graph, existing paths, and a recorded
finalizer receipt are separate from source-backed meaning.

Run `pnpm benchmark:construction /absolute/path/to/runs.json --json` for a
read-only report. Without `--json`, it prints a comparison table. It neither
writes the vault nor accepts meaning, and supplies no aggregate quality grade.

The input is a nonempty array. Explicit `outcome` status and reason preserve
failed model requests and turn caps even when tool calls themselves succeeded. A run manifest has this shape:

```json
{
  "id": "configuration-full",
  "model": "exact model and effort",
  "transport": "acp",
  "profile": "full",
  "sourceRevision": "frozen repository commit",
  "promptDigest": "digest of the frozen prompts with the target root normalized",
  "wallMs": 100000,
  "outcome": { "status": "failed", "reason": "model request timed out" },
  "repoRoot": "/absolute/path/to/source",
  "vaultRoot": "/absolute/path/to/vault",
  "events": "/absolute/path/to/acp-events.jsonl",
  "toolInputBytes": 127270,
  "costUsd": null,
  "tokens": null,
  "quality": {
    "isolation": "vault-only tool allowlist, no source files",
    "questions": [{ "id": "q1", "verdict": "partial", "reason": "Caller is unnamed" }],
    "claims": [{ "id": "c1", "statement": "One exact claim", "verdict": "verified", "sourceRef": "module:80-101" }]
  }
}
```

Values above illustrate the contract; they are not a saved result. `events` is
optional: another host may provide `toolCalls` with `id`, `name`, `args`,
`status`, and optional `output`. ACP records have a capture timestamp in `at`.
Calls are joined by ID, including later arguments/status/output updates. Both
`mcp__server__tool` and `mcp.server.tool` names normalize to the same tool name.
The reporter measures repeated identical read arguments without calling them
waste: a read after a write may be necessary. Unknown byte, billing and token
measurements remain null. Local inference cost includes unmeasured electricity
and hardware; it is not recorded as zero dollars.

Questions accept `answered`, `partial`, `unknown`, or `incorrect`; claims accept
`verified`, `failed`, or `unknown`. A verified claim needs a source reference.
These are supplied audit verdicts, not a qualification receipt or an automatic
semantic judge. Preserve the original reader answer before adding the audit.
Zero questions, zero claims, or zero declared paths earn no perfect score.
The path metric checks frontmatter paths through the canonical drift detector;
it does not audit body citations, line ranges, or whether a file supports a
claim. Those require the separate source audit.

For every comparison:

1. Freeze an unfamiliar permissively licensed source revision and six questions
   before any vault exists. Keep source, traces, exact prompts, outputs, and
   failed attempts outside the checkout. Describe the subject by shape in public
   reports. Record source identity, model/effort, host/version, hardware, context
   size, tool surface, setup failures and gross wall time.
2. Check `connection_info` roots before the build. Record time from first tool
   call to last write separately when the trace supplies it; gross wall time
   includes session setup and final synthesis. Reconstruct the app prompts with
   `scripts/lib/construction-prompts.mjs`, which reads current TypeScript
   declarations and shared language helpers, rather than copying prose.
3. Use fresh vaults and the same model, prompt, source and approval conditions for
   full/profile comparisons. Report complete tool-list wire bytes separately
   from input-only definitions; output schemas are not assumed to enter a model
   prompt. SDK cache/token counters are usage evidence, not a price estimate.
4. Validate and compile every resulting vault. A finalizer call is not completion:
   the report recognizes a successful `projectMeaningReceipt:v1` payload and
   records the categorical meaning status observed at that moment. It does not
   revalidate receipt currentness after later writes.
5. Let a fresh reader answer only from full vault bodies with source and writes
   unavailable. Record its exact tools and full-body reads. Ask about purpose,
   typed behavior, priority/conditions, failure paths, customization and impact,
   plus each node's uncertainty. An honest unknown is useful evidence of a gap.
6. Check each atomic answer and citation against the source. Check dependency
   necessity/direction separately from declared graph membership. Do not turn an
   optional converter, alternative loader, or wrapper call into an unconditional
   semantic dependency. Preserve qualifiers in negative and exhaustive claims.

Use the [field-trial workflow](../../.agents/skills/ontology-field-trial/SKILL.md).
If a headless harness replaces the person's approval with an allowlist, disclose
that it does not prove the app's permission checkpoint. A loop driven through a
Node HTTP shim proves that loop, not the native transport, installed bundle or
rendered map. A model given different source tools is a different workflow;
unsupported source access is not a failed semantic quality score. Repeat on more
repositories and reverse run order before claiming a general speed improvement.

## 2026-10-03 bounded trial

Subject: an MIT Python configuration library with a compact implementation,
frozen commit `0573e6f96637f08fb4cb85e0552f0622d36827d4`. Six questions were
sealed before cloning/building. Host: macOS, Apple M2 Max, 64 GiB memory.
Claude adapter 0.85.0 and Codex adapter 2.1.1 were exercised over actual ACP
JSON-RPC, with current app first-turn and handoff prompts. Permissions were
automatically selected for scratch MCP operations; this was not an installed-app
approval test. The source-aware auditor was the coordinator, so grading bias and
n = 1 remain limits.

The opt-in construction inventory reduced input-only definitions from 127,270
to 96,784 bytes (24.0%) and full tool-list wire data from 712,536 to 349,059 bytes
(51.0%). These are measured transport reductions, not measured context-token
savings in every host.

| Claude Sonnet 5.5, low effort | Full | Construction |
|---|---:|---:|
| Gross wall time | 107.632 s | 100.412 s |
| Authorable nodes | 8 | 7 |
| Source-hidden questions answered / partial / unknown | 3 / 3 / 0 | 2 / 3 / 1 |
| Source-audited reader claims verified | 17/18 | 18/21 |
| Meaning status at finalization | review_required | review_required |

Both graphs validated and their declared source paths existed. The full reader
had one incorrect line citation. The construction reader lost environment/file/
default precedence, misstated the missing-value condition with a supplied
default, cited wrong lines, and repeated a repository/environment responsibility
boundary that the source contradicts. Both maps need review of the declared
dependency from reading a setting to discovery: a default shortcut's wrapper
call does not establish a requirement for the named lower-level retrieval entry.
The profile is therefore an experimental cost option, not a promoted quality or
speed default. The 6.7% timing difference is one unreversed pair with possible
cache/order effects and worse handoff coverage.

The shipped local loop with `atlas-qwen3.8:27b` (16,384 context) has no repository
analysis tools. Its empty-vault baseline made four model requests and two reads,
then failed while insisting on nonexistent concept reads: 189.140 s. After the
strict successful-empty-census repair it made two requests and one census,
reported the source-access limit, and ended normally: 151.614 s. It wrote zero
nodes in both runs. This improves refusal cost; it does not implement local
code-to-ontology construction. A source-MCP experiment first hit a 180 s request
timeout; a second phase-bounded attempt inspected tools and proposed prose but
failed transport before writes. No local persisted-map quality score is earned.

Codex Luna low built three nodes in 250.187 s in the initial diagnostic run,
with four failed calls among 33 calls; its source-hidden reader fully answered
1/6 questions, gave four partial answers and one unknown, and the source audit
verified 13/13 atomic claims. Native memory/source reads were also present. The matched Luna xhigh full arm reached the 900 s hang detector after
four nodes and no finalizer receipt; the construction-profile arm also timed out
at 900 s with two nodes and no finalizer receipt. Keep those attempts separate from the
Sonnet pair and from the local loop; no model ranking follows.

The current dogfood vault also illustrates the distinction: its validator found
zero document problems and 93/93 existing frontmatter source paths, while 89
concepts had cited code newer than their document and three domain summaries had
membership changes newer than their bodies. These drift signals ask for source
review; they do not prove that every stale claim is false or that meaning is
current. These were baseline signals before the two-node documentation sync. The project
finalizer remained blocked by `source_receipt_unavailable`; this task does not
relabel the full dogfood vault as qualified.

## Body-evidence improvement trial

The now-known configuration library is a calibration case. The first-turn
instruction now traces the entry point's setup/body/callees, preserves branch
conditions and dependency counterexamples, copies returned range/hash citations,
and treats undocumented project exclusions as uncertainty. Source-only reads
are an opt-in continuation, not a candidate release. Actual ACP sessions used
Sonnet 5.5 low and construction discovery with fresh vaults. Both source-hidden
readers used only full vault bodies; source-aware audits ran separately with
Luna xhigh. Formal candidate qualification, human CQ acceptance, and native app
execution were not measured.

| Measurement | Prior calibration | Final body-guided calibration | Fresh retry-library case |
|---|---:|---:|---:|
| Gross wall time | 100.412 s | 137.517 s | 113.235 s |
| Authorable nodes | 7 | 7 | 8 |
| Questions answered / partial / unknown | 2 / 3 / 1 | 4 / 2 / 0 | 4 / 2 / 0 |
| Audited claims verified / failed / unknown | 18 / 3 / 0 | 19 / 1 / 0 | 16 / 4 / 1 |

The calibration now preserves precedence, missing-default failure conditions,
and explicit source/converter replacement. The reader still marks broad failure
and impact questions partial. One truth-value-parser claim omitted non-string
input errors. The fresh MIT Python retry-decorator library preserved useful
retry/give-up/customization rules, but its claims still widened exception and
give-up conditions and omitted callback failures. Those failures prevent a
general semantic-quality claim. Prior calibration audit was coordinated by the
builder of the evaluation harness; the new audits used a separate source-aware
model, so accuracy percentages are descriptive rather than a matched judge A/B.
This is one unreversed run per final case, not a model ranking or speed win.

Earlier body-guidance drafts are retained outside the checkout: calibration
2/6 answered, 16 verified / 1 failed / 2 unknown out of 19 claims; retry case
4/6 answered, 14 verified / 4 failed / 1 unknown out of 19. They exposed universal
repository-access, exception and default-handler claims, motivating the branch
counterexample and exact-citation guidance. They were not overwritten by the
final runs.

A frozen 28-line calibration read returned 11,105 serialized payload bytes in
full mode and 2,042 in source-only mode: **81.6% smaller**, with byte-identical
`sourceEvidence`. A synthetic integration fixture measured 8,466 versus 1,027
bytes. Payload reduction does not measure total host tokens or build latency.
Existing source-read guards, full-mode parity and the advertised output-schema
union were verified, including rejection of mixed full/source-only payloads.

The local MCP-client experiment exposed a separate host mismatch: its narrowed
tool window did not accept mandatory first-turn discovery calls and allowed
repeated full analysis instead of source-only continuations. Input grew from
21,545 to 93,856 bytes across eight captured requests before any writes. This
is a failed workflow/setup experiment, not evidence that local model quality
improved or worsened. The internal local app remains source-unavailable; a
compatible discovery/continuation host and native source access are separate
follow-on work.

The practical procedure is in [body-backed construction](../guide/body-backed-construction.md).


## Continued analysis and reuse trial

A fresh MIT TypeScript expression-language library at revision
`81886f9e55410e3b3f2d9baa95db83110c4892b0` supplied six questions sealed before
construction. Claude ACP with Sonnet low built a nine-node map with 16 resolved
relation references. A selected recorded execution-limit gap then used the exact
current `buildGrayAreaInvestigation` prompt, generated from a root-verified
headless evidence packet. A source-reviewed MCP body-only update followed;
there were no new nodes, frontmatter changes or relation changes.

| Measure | Before enrichment | After reviewed test application |
|---|---:|---:|
| Sealed questions answered / partial / unknown | 0 / 5 / 1 | 1 / 4 / 1 |
| Independent vault-only reader wall time | 42.6 s | 51.1 s |
| Reader-reported cost | $0.259 | $0.214 |
| Nodes / resolved relation references | 9 / 16 | 9 / 16 |

The initial build took 79.9 s and returned 148,067 MCP text bytes. The additional
investigation took 22.8 s with an 8,763-byte prompt and one direct source `Read`
of 6,198 bytes; MCP `read_source` calls were zero. Builder and investigation
costs were unavailable. The follow-up used a fresh session of the same
provider/model because the controller had closed its original stdin.

The execution-limit question improved from partial to answered; the other five
verdicts did not change. Both strict readers used Sonnet low, 14 vault-only MCP
tools, a redacted source root, and disabled shell/file/web tools. The first Codex
ACP read-only attempt exposed the source root and is excluded: read-only did
not enforce source-hidden evaluation. All nine full bodies were read once for
the six questions and again for a fixed uncertainty question in each valid lane.

A separate source audit matched 21/21 hash-anchored body citations to the clone
and resolved 5/5 frontmatter paths. These are citation/path checks, not a matched
before/after atomic-accuracy score. Reader errors included incorrect line
references, overbroad measurement/currentness statements, and an after-reader
citation missing invocation lines. Seven builder relation notes asserted
“You approved …” without a human receipt; they remain unsupported. The domain
retained its old unread-range note beside the enriched capability. One
unselected growth-plan row produced the nonexistent `README/package.json`.

Post-write validation and source-path drift checks passed, but competency
answers remained unfinalized. No human meaning acceptance or project finalizer
receipt exists. Source tests were inspected rather than run. This single
unreversed case does not establish general quality, cost savings, native local
construction or model ranking. Headless packet generation is separate from
native proof: the isolated review app verified source recovery, explicit ACP
send, dated result reopening, a separate unsent improvement draft, write
rejection, one allowed body write, and stale-result gating. Its generic ACP
conversation archive reopened an empty session during the fresh walkthrough;
the scoped map inspector did reopen the persisted dated answer.

## Native local source construction — 2026-10-04

This run used an unfamiliar MIT JavaScript byte-framing library, focusing on its
encoding responsibility. It is a different task from the earlier ACP Python
trial, so the timings do not rank models. All artifacts stayed outside the
checkout. The builder was `atlas-qwen3.8:27b`, using production Rust selected-root
and source-range functions, audited loopback-only curl, and the shared turn,
proposal builder and applier. The harness substituted the chooser gesture and
scratch storage port. No installed window, native writer IPC or default app
replacement was exercised. Source writes and human meaning acceptance were absent.

| Attempt | Native sends / wall time | Persisted result |
|---|---|---|
| Initial 60-second request bound | 3 / 120.4 s | Timed out; zero nodes |
| Reasoning disabled, broad draft | 4 / 102.8 s | Timed out; zero nodes |
| Focused encoding, same bound | 3 / 109.9 s | Timed out; zero nodes |
| Construction-only 180-second bound | 4 / 207.2 s | Three nodes; source audit found reversed domain membership; needs review |
| Kind/direction and citation guard follow-up | 8 / 650.5 s | Three nodes, three rendered graph edges; 5,956 source bytes; two malformed citation batches refused; incomplete at request cap |

The final run's ninth closing attempt was refused before native transfer; the
harness attempt counter is nine while the actual native-send count is eight.
All three saved files equal the reviewed proposal's final bytes. Node count is
not a quality score. Exact source receipts and current hashes matched; four
unique cited paths existed, and both implementation-path entries resolved.
The independent source audit verified **13/14 atomic draft claims**. The failed
claim promoted framing intent into an encoding-alone delivery guarantee. A
redundant generic and specific containment declaration remains; the renderer
normalizes it to one edge. The draft is unqualified and validation retains an
`epistemic-exclusion` warning.

The six fixed questions were sealed before construction. The first reader
harness omitted the node's agent address, delivered empty bodies and lost
176.9 s: a setup failure, excluded from semantic grading. A repaired fresh reader
received the actual three full bodies after individual follow-ups, but its
six-question answer timed out at 208.5 s. Those failures are retained.

A new source-hidden session answered **only sealed Q5**, the relation/path and
remaining-unknown question, in 86.3 s using three individual full reads and three
native sends. It followed the persisted domain/capability/element chain to
`encode.js` and preserved destroyed-stream and buffer-safety unknowns. Its three
atomic claims matched the vault and source (**3/3**); qualifier omissions were
zero. The other five questions were ungraded in this narrower run. This is a
bounded handoff proof, not six-question coverage or general semantic quality.

The existing shipped local empty-vault loop had no source construction tools and
persisted zero nodes. This slice establishes a bounded native source-to-draft
path; it does not establish a speed improvement. The repeated citation repair
and long output remain efficiency defects. No formal candidate lifecycle or
human competency acceptance was claimed; current dogfood meaning finalization
remains blocked by `source_receipt_unavailable`.

A harmless proxy positive control received one marker. With the same inherited
proxy environment, the production construction path delivered two direct
markers, zero proxy markers and zero redirect-target markers; remote HTTPS was
refused. Background browser bridge fixtures opened the source disclosure at
1512 and 390 widths, kept Run reachable, and passed a nonempty WCAG axe scan.
These are source/transport and mocked-window receipts, not installed-app proof.
