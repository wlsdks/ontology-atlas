---
title: "Choosing concepts: domain, capability, element"
doc_type: guide
status: current
area: product
---

# Choosing concepts: domain, capability, element

Building a codebase ontology means deciding what becomes a concept and which kind it gets. This chapter gives the tests Atlas uses for each kind, explains why one source file is not one concept, and gives the one-sentence test for a parent with many children. Your coding agent (Claude Code, Codex, Cursor) reads the same rules through the MCP server before it writes, so concepts made by people and by agents follow one shape.

## Choose a kind by its job

Choose a kind by what the concept does in the model, not by its size, folder or owner.

| Kind | Ask | Example | Not this |
|---|---|---|---|
| `project` | Does it finish the sentence "this system exists so that..." and set the scope for everything else? | "A local workbench that keeps a product's meaning shared between people and agents." | "A TypeScript monorepo." |
| `domain` | Is it a lasting responsibility or problem boundary that groups capabilities and would survive a rewrite of the code? | "Identity owns sign-in and account-access policy." | "The `src/auth` folder" or "the auth team." |
| `capability` | Does it state something the system can do, observable from outside, without naming the module that does it? | "Issue a revocable session token after sign-in." | "Token controller" or "login workflow." |
| `element` | Does it name a distinct implementation role that carries a capability, with evidence someone can open? | "JWT signer" with `path: src/auth/jwt-signer.ts`. | `src/auth/jwt-signer.ts` as the name. |
| `document` | Is the thing itself a text whose value is explaining or deciding something about another concept? | "ADR: local-first persistence." | A service filed as a document because it has a README. |

Read the table top to bottom: what is delivered, where responsibilities split, what the system can do, and how it does it.

A folder, package, team, route, class name or README heading is a clue, not a concept. It becomes a domain or capability only when you can write a definition that is not circular and say what it includes and excludes. A verb in a name does not make a capability, and a noun does not make an element.

The full tests, with what each kind includes and excludes, are in the [Atlas specification](https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind).

## One file is not one concept

The most common mistake is to open a directory and make one element per file. The result looks like an ontology but is a directory listing copied into the graph. This repository once had a capability with 92 elements that matched an `ls` of one folder.

A path is evidence of a concept, not the concept.

- Name an element after its role: `jwt-signer`, `session-store`.
- Put the location in `path:`.
- If a title looks like `src/lib/auth/jwt.ts` or ends in a source extension, it is evidence. The MCP server warns when it sees one.
- Keep slugs flat under the kind folder: `elements/jwt-signer`, not `elements/src/lib/auth/jwt`. A path-shaped slug is refused when a concept is written, because two files with the same name would quietly become one concept.

Several files can share one role. If you cannot say in a sentence how two files differ in role, they are one element, or no element at all and just the `path` of a capability.

## Many children is not a defect

There is no limit on how many children a concept may have. A wide parent whose children each earn their place is correct, and a cap is easy to satisfy without understanding: split the pile into "Group A" and "Group B" and the number looks fine while nothing is clearer.

A count is only a reason to ask a question. While the folder is young, the starting points are about 8 capabilities under a domain and about 6 elements under a capability. Once the folder has ten or more parents of a kind, Atlas compares against your folder's own distribution instead.

### The one-sentence test

When a parent crosses that point, ask one question for each child:

> Can you write one sentence, not circular, that says why this child cannot be swapped with its siblings?

- If you can, leave it as it is, even with thirty siblings.
- If you cannot, do not add a new concept. Improve the body of the existing sibling instead.

Shared name prefixes are a hint of where to look, not the test.

### When three or more children fail

If three or more children fail the test, a level is missing. Add one concept between the parent and those children, but only when all of these hold:

1. It is named after a behavior the children share. "Other" or "Part 2" is not a name.
2. You can state that behavior in one sentence.
3. It passes the one-sentence test against its own siblings.
4. You actually move the children under it. An empty grouping concept is reported for removal.

If any of these fails, create nothing.

## Give every capability evidence

When you create a capability, give it something to open in the same step: one implementation entry point in `path:`, or at least one element in `elements:`. A capability with neither is a claim nobody can check. It is still written, but it stays in the cleanup queue (`maintenance_plan`, or `node cli/src/index.mjs maintenance`) as `capability_without_evidence` until it points at something.

```markdown
---
uid: 9f6805c6-7f22-4ca8-8252-c0c2d06f3fad
kind: capability
slug: capabilities/token-issue
title: Token issuance
domain: domains/auth
path: src/auth/issue-token.ts
elements: [elements/jwt-signer]
---
```

`elements:` holds only slugs of real element concepts, never file paths.

## The rules report, they do not block

These checks do not refuse a write. A concept that skips them is saved, and the response carries a warning or a row in the cleanup queue. Blocking would teach agents to work around the tool. The one exception is the path-shaped slug: it breaks identity, not meaning, and it is cheapest to fix when the concept is created.

Next: [Relations](/guide/relations) connects the concepts you have chosen.
