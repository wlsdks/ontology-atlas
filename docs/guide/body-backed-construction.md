---
title: Body Backed Construction
doc_type: guide
status: current
area: agents
gateway: false
---

# Body Backed Construction

For people and agents building a first codebase map. The aim is to preserve what
the code does, under which conditions, and what a caller can change, so another
reader can answer without reopening the repository.

## Steps

1. Survey once and select core capabilities by observable outcome. A filename,
   declaration or test name selects the next read; it is not behavior evidence.
2. Read the entry point's body, its constructor/factory setup and relevant
   callees. Use `analyze_repo_structure` with `sourceOnly:true` and `sourceReads`
   for subsequent exact ranges. Preserve the returned range/hash citation and
   follow its continuation when incomplete. An outline supplies no citation.
3. Explain an actor/input, condition and outcome. Include priority/defaults,
   failure or refusal, extension points, and how callback errors propagate when
   supported. Put those rules in the proposed body, not just the conversation.
4. Try a counterexample before a dependency: can the capability succeed while
   the target is skipped, disabled or replaced? Preserve the required branch
   in the rationale. A caller's wrapper is not a prerequisite of its callee.
5. Separate component responsibility from global product absence. Project
   exclusions need documented purpose/boundaries or an owner decision. A
   missing feature in selected code belongs under uncertainty.
6. Review the exact proposal, then use the existing approved batch writes,
   validation, source binding and finalization. Ask a fresh reader the sealed
   questions using full node bodies; check its atomic claims against source.
   Existing paths and a receipt do not establish semantic qualification.

## When it does not work

- A missing, refused or truncated body leaves an explicit gap. Do not infer its
  implementation from the outline or cite lines that were not returned.
- Source-only packets cannot accompany proposal or qualification fields. Use
  full mode for their unchanged lifecycle; raw source never grants write or
  acceptance authority.
- A local conversation with vault-only tools cannot inspect repository code.
  This transport extension is usable by an MCP-capable host; it does not add
  a native source bridge to the internal app conversation.
- No explicit raise in a branch does not mean no exception escapes it. Inspect
  callbacks, callee errors and short circuits before using "always" or "never".

See [MCP source continuations](https://github.com/wlsdks/ontology-atlas/blob/main/mcp/README.md#exact-source-continuations-sourceonly)
and [construction measurements](https://github.com/wlsdks/ontology-atlas/blob/main/docs/benchmark/CONSTRUCTION.md).
