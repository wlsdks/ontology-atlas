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

The format has no ontology `kind` and is not a second current ontology. No
storage namespace, scanner behavior, telemetry, write authority or retention
policy is established by this module. Storage, recoverable artifact retention,
trusted controller binding and task/history links require their own integration
and evidence before V4.1 is complete.
