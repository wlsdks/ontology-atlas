---
name: ontology-bootstrap
description: Build an initial Atlas ontology or explicitly rebuild one from repository evidence. Use for ontology construction in an empty or starter vault; route mature-vault updates to ontology-sync. General code review or repository analysis alone does not require this workflow.
---

# Bootstrap a trustworthy ontology

Create a shared meaning model, not a labeled file tree. Treat repository
structure as implementation evidence. Never promote a folder, package, README
heading, or model-generated phrase into a business concept without a definition
and source-backed justification.

Use only ontology-atlas MCP tools for the core workflow. Do not depend on
CodeGraph, another skill, shell search, or an AST index. Those may exist, but a
plain agent connected only to Atlas must still succeed at the meaning model.
The optional, bounded task-navigation enrichment below is the sole exception:
after meaning selects a stable element, a source-aware builder may use an
available local source reader to verify exact coordinates that Atlas then
checks again. Navigation may remain unknown without blocking the core model.

## Meaning contract

The normative five-kind discriminator, relation support matrix, direct
`is_a` test, and inference/standards boundary live only in the
[Atlas meta-model specification](../../../docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind).
This skill owns the bootstrap sequence and evidence/approval states; it does
not redefine the model. If the linked file is unavailable, use the compact
meta-model boundary supplied by the connected Atlas MCP instructions.

Keep these epistemic states separate:

- `observed`: directly present in a returned source excerpt, path, package, or
  import.
- `proposed`: an interpretation supported by observed evidence but not yet
  accepted by the user.
- `shared`: a user-approved concept persisted in the vault.

Before extracting concepts, read
[guides/meaning-extraction.md](guides/meaning-extraction.md). Apply its
definition, boundary, evidence, naming, relation, and self-audit rules.

## Workflow

### 1. Confirm cold-start scope

Call:

```text
connection_info({})
list_kinds({})
```

Compare both roots returned by `connection_info` with the intended absolute
vault and repository before calling `list_kinds` or reading project evidence.
On any mismatch, stop that process immediately; do not send a harmless-looking
read to learn whether the wrong server might still work. A source checkout that
already exposes its own dogfood MCP is especially easy to mistake for the new
vault.

For an in-session scratch run that cannot restart in the target folder, prepare
`scripts/rooted-mcp-read.mjs` before the first measured call. Resolve the script
relative to the directory containing this `SKILL.md`, never relative to the
repository root. Run its `schema` discovery once, author the input from the
emitted JSON Schema and example. The bootstrap invocation is the resolved script
with the single positional argument `schema`; do not add `--schema`, `--output`,
or use an empty invocation. Then make one `--input` / `--output` call for
each deliberately authored read packet; do not retry a packet to probe CLI forms
or inspect implementation source. The input names the
absolute source-checkout JavaScript `serverPath`, absolute `vaultRoot` /
`repoRoot`, and an ordered read request list. The runner itself invokes and
verifies `connection_info` first, exposes only read/analysis operations, and
writes one transcript only after every read succeeds. It is not a write path;
accepted plans still use the normal MCP writer tools after the human gate.

Continue when the vault is empty, contains only starter/example nodes, or the
user explicitly requests a rebuild. If it has 20+ curated nodes, use
`ontology-sync` unless the user explicitly asks for re-bootstrap. This only
chooses the safer workflow; Atlas has no whole-vault or per-project node cap.

### Continue by phase

Open only the reference for the current phase. Complete every phase in order;
this routing changes when detail is read, not the required evidence or approval.

| Current work | Required reference | Completion boundary |
|---|---|---|
| Collect evidence and construct the non-writing review plan | [Construction](guides/construction.md) | Evidence ledger, definitions, relations, competency answers, meaning audit, and full review plan |
| Qualify that exact plan and prepare its human decision | [Qualification](guides/qualification.md) | Independent source-hidden and citation evidence; exact-plan acceptance and released writer rows |
| Persist a released plan | [Persistence](guides/persistence.md) | Authorized writes, full readback, validation, compilation, and honest meaning assessment |

Do not enter persistence because source analysis, structural validation, or code
approval passed. The qualification reference owns the exact acceptance boundary.
When returning to an earlier phase, invalidate the dependent receipts as that
reference requires. Report unfinished phases and the exact missing evidence.

## Stop conditions

Stop without writes when:

- evidence cannot establish the project outcome;
- proposed domains are only folders, teams, technologies, or README sections;
- a capability cannot be defined without naming its implementation;
- important sources contradict one another and the user has not resolved them;
- an independent evaluator or complete source-hidden task is unavailable;
- the user has not approved the proposed meaning;
- the plan/source digest changed after approval or any required gap was not
  explicitly accepted;
- the MCP reports a mismatched vault and the target write location is unclear.

Unknown is a valid result. An invented ontology is not.
