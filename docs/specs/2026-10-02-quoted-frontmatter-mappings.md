---
title: Quoted Frontmatter Mappings
doc_type: spec
status: draft
area: agents
date: 2026-10-02
decisions: []
---

# Quoted Frontmatter Mappings

## Person and moment

An agent reading a relation needs the recorded reason so its user can judge why
that connection exists. In a read-only fixture probe, the host received no
rationale for `relation_notes: {"elements/b": "a uses b"}`; writing the same
claim as a block map with a plain key restored it. This is an observed synthetic
data-loss case, not a reported user incident or a model-quality result.

The outcome is **judge**: readers receive the rationale already in the file,
with its correct target and scalar type, and an unrelated authorized edit keeps
that information. Recovering the stored sentence does not accept its meaning.

## Today

Source baseline: `ff15d19ec`. The external six-case
`quoted-mapping-matrix.json` captures renderer, MCP, build-script and CLI results.
All four retain surrounding quotes in mapping keys; a colon inside a quoted key
is mistaken for its delimiter; nested quoted `001` and `false` become a number
and boolean. The quoted unsafe-key case currently retains quote characters as
part of the property name. That observation alone is not prototype mutation.

The independently inspected source explains these results:

- Top-level keys use the first colon and are not decoded
  (`src/shared/lib/parse-frontmatter.ts:105`, `mcp/src/parser.mjs:65`,
  `scripts/lib/parse-frontmatter.mjs:80`). Block and inline maps repeat this
  assumption (`parse-frontmatter.ts:159`, `:291`; `parser.mjs:117`, `:149`).
- Nested values are unquoted before coercion, whereas top-level quoted scalars
  remain strings (`src/shared/lib/parse-frontmatter.ts:301`, `:317`). Existing
  plain boolean/number and historical quote behavior have explicit cases in
  `tests/fixtures/frontmatter-cases.mjs:74`, `:466` and `:489`.
- The compiler looks up a rationale by the actual reference or resolved target
  (`mcp/src/ontology-compiler.mjs:153`). The public contract defines target-keyed
  string rationale in `docs/ONTOLOGY-ATLAS-SPEC.md:423`.
- The writer emits raw mapping keys (`mcp/src/parser.mjs:335`, `:348`) and quotes
  values that otherwise change type (`:370`). Decoding a colon-bearing key on
  read therefore also requires safe key serialization on the next write.
- The renderer patches retained lines in place, but matches a top-level key
  using its first colon and emits raw replacement/map keys
  (`src/entities/docs-vault/lib/frontmatter-updates.ts:45`, `:59`, `:91`).
  Updating a decoded quoted key must replace the intended field, not append a
  second field while leaving the old quoted one in place.
- CLI delegates to MCP (`cli/src/lib/parse-frontmatter.mjs:1`): four delivery
  paths, three physical reader implementations. The existing parser and writer
  contract tests exercise the public entrypoints.

The standing [2026-08-14 (6) decision](../DECISIONS.md#2026-08-14-6--fail-an-indented-frontmatter-declaration-losslessly-too)
requires malformed nonempty declarations to remain diagnostics through parsers,
validation, compiler and health. Its falsifier is a normal block/comment gaining
an error, or a malformed declaration disappearing before health. Keep it; this
slice must exercise both sides. No later matching record returned by
`pnpm decisions:find malformed` overturns it.

The ontology's `elements/frontmatter-parser` assigns parsing and reconstruction
here, while validation owns acceptance. The current product thesis separates
readable evidence, semantic acceptance and deployment; this repair claims only
faithful representation and safe subsequent editing.

## Problem and alternatives

The cause is parsing a quoted representation as literal key bytes, then coercing
quoted map values. Adding missing rationale by inference would mask the loss and
could replace the author's reason with an invented one.

Priority: (1) preserve existing mapping information across reads and edits;
(2) verify diagnostic and writer boundaries, because a correct first read is not
enough; (3) consider more YAML grammar only when a distinct real file warrants it.

| Option | Value and usability | Cost, feasibility and local-first fit | Decision |
|---|---|---|---|
| Keep current parser; ask authors to rewrite keys | Workaround for informed authors only | Cheap, but all clients silently misread existing Git truth | Reject |
| Replace the subset with a full YAML engine | Broad syntax support | Changes historical scalar semantics, dependency and writer contracts far beyond observed loss | Defer |
| Repair quoted keys and scalar types in existing map shapes | Existing files become usable without manual rewriting | Bounded cross-delivery read/write proof; preserves local-first files and approval | Select |

The supported first slice is deliberately exact:

- Decode single-line, nonempty quoted string keys in top-level mappings and the
  existing one-level block/inline maps. Accept single or double wrapping quotes;
  colons and commas inside a quoted key are data, including compact
  `{"key":"value"}` spelling. Plain forms retain their current behavior.
- Keys use the existing Atlas quoted-string escape repertoire, including writer
  escaped quotes/backslashes. Do not reinterpret historical value escapes or
  adopt YAML's broader escape/type rules in this slice. Embedded raw matching
  quotes or doubled-single-quote key syntax beyond that repertoire are diagnosed
  rather than guessed; this does not tighten existing value leniency.
- Quoted scalar values remain strings at every supported mapping level, including
  empty text, `001` and `false`; unquoted booleans/numbers retain their types.
- Check decoded keys against `__proto__`, `constructor` and `prototype` before
  assignment. Quoting must not bypass the existing refusal. Decoded graph-field
  names retain existing relation-array validation.
- Unclosed quoted keys, trailing junk before the separator, and malformed
  nonempty map entries receive line diagnostics. Never turn an affected malformed
  declaration into a silently valid partial map that is then saved over it.
- A normal authorized edit preserves supported keys, scalar types, rationale and
  body content across renderer and MCP/CLI writers. Keep existing safe-key output;
  quote keys only when necessary to retain their decoded contents. Existing canonical formatting may change; byte-identical source
  formatting is not promised. Refused edits keep the input file bytes unchanged.

Quoted scalar and mapping forms are grounded in
[YAML 1.2.2 sections 7.3, 7.4.2 and 8.2.2](https://yaml.org/spec/1.2.2/).
That reference permits quoted keys and distinguishes quoted strings from plain
scalar resolution. It does not make Atlas a conforming full YAML processor;
Atlas's retained escape behavior is an explicit compatibility constraint.

## Flow

1. When a person or agent reads a file with a supported quoted mapping, Atlas
   exposes decoded keys and intended value types across all delivery paths.
2. When the reader asks why a declared relation exists, Atlas returns its stored
   rationale for that exact target. An absent note remains absent; Atlas supplies
   no inferred reason and makes no new semantic acceptance claim.
3. When an agent's interpretation is wrong or a declaration is malformed, the
   person can inspect the original file and the existing diagnostic evidence.
   A valid parsed sentence is still evidence to judge, not approval to write.
4. When the person authorizes an unrelated edit, Atlas keeps the quoted-map
   information through write/read. If doing so would discard an affected malformed
   declaration, refuse that rewrite and retain the original bytes for correction.
5. When another reader opens the edited file, it sees the same target, rationale
   and scalar types. No migration, background repair or additional approval path
   is introduced.

## States

| State | Web | macOS app |
|---|---|---|
| Empty file or map | Out of scope — no new rendered state; existing empty reading remains | Out of scope — same; open or edit the original through existing controls |
| Valid quoted mapping | Out of scope — parser data correction only; inspect existing node/relation evidence | Out of scope — same data contract; inspect existing evidence |
| Missing rationale | Out of scope — existing missing-evidence presentation; investigate the original | Out of scope — same; no fabricated sentence |
| Malformed mapping | Out of scope — existing diagnostic presentation receives parser codes; correct original | Out of scope — same; original bytes remain available |
| Authorized unrelated edit | Out of scope — existing write controls and checks; no new action or message | Out of scope — same; existing approval applies |
| Largest measured input | Out of scope — six tiny fixture cases only, no scale claim | Out of scope — same; field trial records its own counts |

## Copy

None — no new or changed user-facing message catalogue entries. Existing
`malformed-frontmatter-line` and `malformed-quoted-scalar` diagnostics keep their
roles. Runtime diagnostic details identify the affected line/key and correction;
the repair does not add a new screen, toast or label.

## Edge cases

- Empty mappings stay empty. Empty quoted values stay strings. The first probe
  has one relation and one note; the six-case matrix is not a large-vault measure.
- First run needs no migration. Hangul and other Unicode keys/values retain their
  information; avoid authoring localized prose in this spec or test titles.
- Colons, commas, escaped quotes and backslashes are not mapping boundaries
  inside supported quoted keys. Repeat write/read cycles to detect accumulation.
- Decoded aliases of graph-field names use the same validation as plain names.
  Existing duplicate-key precedence is unchanged; no new merge behavior is added.
- Moved/renamed/unreadable folders and concurrent edits retain existing I/O,
  expected-version and permission checks; parsing grants no disk authority.
- Offline reads and edits keep the same local behavior; no network, model or
  remote parser dependency is introduced.
- A malformed member beside a valid one must remain diagnosable. Blank lines,
  comments, existing lists and block scalars must not become errors as a side
  effect of quote-aware map handling.

## Out of scope

- Full YAML, recursive mappings, arrays of objects, tags, anchors/aliases,
  multiline or complex keys, and a new scalar escape language: no observed need
  in this slice, and each can change existing file interpretation.
- Semantic repair, relation inference, automatic migration or normalization of
  existing files: source bytes and explicit authorized edits remain the truth.
- Changing UID/slug rules, approvals, proposal gates or writer permissions:
  faithfully decoding information grants none of these authorities.
- UI redesign and universal local-model quality claims: this is shared parser
  correctness, independent of whether an agent uses ACP or a local model.

## Acceptance criteria

1. **Given** the six observed before-state cases, **when** each public reader
   consumes the corrected fixtures, **then** expected decoded keys and quoted
   scalar types agree across renderer, MCP, scripts and CLI. Prove RED/GREEN in
   `tests/contract/parse-frontmatter.contract.test.ts`, using shared cases.
2. **Given** supported top-level, inline and block keys containing colons, commas,
   Unicode and supported escapes, **when** read and then written three times,
   **then** keys, string/boolean/number types and body content remain stable.
   Extend `frontmatter-writer.contract.test.ts`, renderer
   `frontmatter-updates.test.ts` and cross-reader round trips; updating an existing
   quoted key replaces it without duplication. Preserve established safe-key
   output, plain values and historical value cases.
3. **Given** a declared fixture relation and a quoted target-keyed note, **when**
   read through the actual compiler/MCP path and after an unrelated authorized
   edit, **then** the same edge carries the same rationale. Absent rationale stays
   unknown. Check compiler integration and MCP/CLI file readback, not just parsing.
4. **Given** quoted meta-keys or a quoted graph-array key with a scalar value,
   **when** read through all four paths, **then** meta-keys are refused without
   inherited fields/prototype mutation and graph-array validation still reports
   the malformed relation. Check shared security fixtures and validator contracts.
5. **Given** malformed quoted keys, nonempty malformed map members, ordinary
   blocks and comments, **when** parsing, validating, compiling and checking
   health, **then** malformed declarations remain errors with the right line and
   normal forms stay clean. An affected unsafe rewrite is refused with unchanged
   file bytes. Check existing malformed-line/health contracts and writer preflight.
6. **Given** an unfamiliar permissively licensed external repository, **when**
   the host runs all four ontology-field-trial phases, **then** separately record
   build cost, cited-path accuracy, sealed-question source-hidden handoff and
   source audit. Keep all external project identity/artifacts outside this repo.
   Fail any fabricated rationale or approval bypass; report uncertainty and do
   not use structural green as semantic acceptance.
7. **Given** the final bounded implementation, **when**
   `pnpm checks:changed -- --run` and all recommendations finish, **then** preserve
   source/write parity, existing ownership boundaries and diagnostic propagation.
   Record actual counts and limits; no GUI or performance improvement is claimed
   by this source-only correctness proof.

## Risks

1. Correct parsing followed by corrupt serialization. Require the ordinary edit
   readback and repeated round trips for decoded keys and quoted numeric text.
2. Decoding exposes unsafe names or erases diagnostics. Exercise quoted meta-keys,
   graph-field aliases and malformed-neighbor preservation across every reader.
3. A YAML cleanup changes existing values beyond this repair. Keep historical
   fixtures unchanged and isolate new key syntax from existing scalar semantics.

## Later

1. Further grammar gaps only after a concrete outside file demonstrates loss;
   capture expected behavior and compatibility cost before extending the subset.
2. Module consolidation only if delivery/bundle evidence permits it; shared
   fixtures currently cover three implementations and four paths.
3. Model-quality evaluation after distinct task evidence; parser fidelity alone
   does not establish that an agent understands the stored meaning.

## Owner question

None — repair the evidenced existing-map contract and preserve legacy values.
The routed review can narrow an unsupported spelling before implementation;
no data migration or new write authority is needed.
