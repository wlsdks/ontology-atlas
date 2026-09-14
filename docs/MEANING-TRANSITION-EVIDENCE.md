# Meaning transition evidence candidate

`src/shared/lib/meaning-transition.ts` prepares an immutable in-memory evidence
candidate and roundtrips it through Markdown. It does not store records, read
canonical Markdown, authenticate a person, verify Git blobs, or grant permission
to write. The workbench/controller and durable transition work remain tracked by
[V4.1](MEANING-WORKFLOW-PLAN.md#v41--record-the-codemeaning-transition-without-confusing-authorities).

The candidate retains a bounded task label and digest, exact originating
vault/session/user-event/permission/tool-call identity, a recoverable proposal
artifact reference, and ordered row operations, targets, guard digests and
expected persisted digests. Numeric and string JSON-RPC request IDs remain
distinct. The supplied explicit human decision seals the proposal, task and row
manifest; ACP execution permission or completion cannot substitute for it.

Historical task-start evidence is separate from the decision's acceptance basis
and the current acceptance observation. A complete outcome requires a known
source basis for every target, an exact matching sealed row manifest, and
completed execution plus matching full-byte readback for every row. Empty,
unknown or changed acceptance evidence stays unverified. Incomplete writes stay
partial; rejected, deferred and unknown decisions retain their own states.
These outcomes describe consistency of supplied facts, not independent proof
that those facts occurred. Production integration must supply trusted reads and
actual decision/writer receipts before presenting them as observed history.

Source and vault repository identities remain separate. Code checks, merge and
deployment have distinct status/reference fields; successful states require
supporting references. A reference's presence is not verification of the
referenced artifact. The candidate cannot infer a task's ownership from a whole
working-tree diff, stage unrelated changes, or call a Git writer.

No semantic delta, a meaning-preserving refactor or an unrelated task returns
`not_created`. The codec preserves multiline questions, accepted gaps, rationale
and immutable document references. The default asynchronous reader validates
shape, row-manifest consistency and the full record digest before returning a
frozen candidate. Altering guards, expected bytes or the operation under an old
decision cannot produce an accepted-complete outcome.

The format has no ontology `kind` and is not a second current ontology. In the
installed app, the typed transition store may retain a validated record and its
exact content-addressed artifacts under the hidden
`.ontology-atlas/meaning-transitions/` namespace. Native publication on Unix is
bounded, no-follow, exclusive and bound to stable vault identity. Windows
currently refuses this capability instead of treating a canonical path as
directory identity. Every artifact is published and read back before the
record is published last. History reports malformed members and missing or
mutated artifacts as problems. Browser builds have no write fallback.

Successful archival proves byte integrity only. It does not authenticate the
supplied human action, verify referenced checks, grant ontology or Git authority,
or make the immutable archive canonical current meaning. Trusted controller
binding, actual decision and writer receipts, task-owned diffs, task/history
navigation and fresh-successor evidence remain required before V4.1 is complete.

## Live snapshot format

`atlas-meaning-transition/v2` is an additive live-integration format; V1 remains
readable and writable. V2 stores the explicit meaning action separately from the
snapshot creation time and from ACP execution permission. An accepted meaning
decision therefore remains accepted when a later write is rejected or does not
run. Without an explicit meaning action, no V2 transition is created.

The action time and snapshot creation time are distinct facts and may honestly
share the same observed millisecond; no artificial offset is introduced. The
first snapshot is an immediate `accepted_unverified`, rejected, or deferred
decision record. Later terminal/readback snapshots are new immutable records
linked by the previous event id, creation time, and record digest. The link must
retain the exact decision id, task identity, proposal, meaning action, and
structured ACP correlation basis. Source and vault Git observations belong to
each snapshot and may honestly change after a write; they are immutable within
that snapshot but are not rewritten into the earlier decision. The chain, rather than wall
clock ordering, establishes succession; an identical snapshot retry keeps its
generated identity and bytes.

The initial live writer scope is one exact row. Its three distinct retained
artifacts are role-bound: the retained-before digest equals the raw guard, the
preview digest equals the expected persisted digest, and the canonical decision
artifact digest binds the task, proposal, exact row manifest, decision id,
explicit action, and retained review evidence. Review evidence is required and
fail-closed: it either records why the exact basis is unavailable or retains the
canonical proposal binding (identity, task request, source and meaning basis,
raw input including its numeric guards, current content digest and binding
digest) together with the observed source root, kind, id, revision, fingerprint,
dirty state and source-basis id. The codec recomputes the proposal-binding digest;
an unavailable or malformed basis cannot produce `accepted_complete`.
Observed Git repositories carry real repository id/revision/dirty facts;
unavailable observations carry a reason and never substitute a folder path.
ACP correlation is observed only for the exact structured MCP approval
session/request/tool chain. Synthetic elicitation ids remain unavailable.

An all-row completed and byte-matched terminal snapshot may say
`accepted_complete`; this means the bounded meaning writer/readback completed.
It requires the exact observed structured MCP correlation and allowed execution;
synthetic or unavailable correlation can be at most `accepted_partial` even when
the supplied row bytes match.
Code checks, merge, deployment and authentication remain separate explicit
unknowns in this slice, and task-owned source diff remains outside this format's
current live integration.
