---
title: "Relations between concepts"
doc_type: guide
status: current
area: product
---

# Relations between concepts

Relations are the typed edges of the ontology's knowledge graph: "this capability depends on that one", "this element belongs to that capability". In Atlas, each relation is one entry in a concept's frontmatter. Below are the relation types, how to write them, and how the map and your coding agent's MCP tools (such as `find_path` and `find_backlinks`) read them.

## Structure and meaning

Relations come in two groups.

- **Structure** says what contains what: a project holds domains, a domain holds capabilities, a capability holds elements. Structure alone makes a tree.
- **Meaning** says how concepts depend on or relate to each other, across any level. A capability in one domain can depend on a capability in another, and two domains can relate directly. A single relation like this turns the tree into a graph.

## The relation types

| Meaning | Frontmatter key | From → to | On the map |
|---|---|---|---|
| Project domains | `domains: [...]` | project → domain | domains around the project |
| Contained capabilities | `capabilities: [...]` | project or domain → capability | discs around the domain |
| Contained elements | `elements: [...]` | project, domain or capability → element | dots around the capability |
| Domain membership | `domain: <slug>` | capability or element → domain | places it in that domain |
| Generic containment | `contains: [...]` | any concept → any concept, when no key above fits | |
| Depends on | `dependencies: [...]` | any concept → a concept it needs | a taper toward what is needed |
| Related | `relates: [...]` | any concept ↔ any concept | a dotted hairline |
| Broader concept | `broader: [...]` | domain → domain, capability → capability, element → element | a double hairline, shown as `is_a` |
| Describes | `describes: [...]` | document → the concept it explains | listed in the document's panel |

Atlas also reads `depends_on:` as another spelling of `dependencies:`, but always writes `dependencies:`. The full table, with direction and inference rules, is in [section 5 of the Atlas specification](https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#5-relation-types-and-their-semantics).

Use `broader` only for a real "is a kind of" claim between two concepts of the same kind: everything that fits the narrower definition must also fit the broader one. Being in the same domain, having similar names or sitting in nested folders is not enough.

## Writing a relation

A relation is written once, on the source concept. The target does not need to mention it.

```markdown
---
uid: 94cf0cde-1e74-497d-ac41-00cdf3a42f0b
slug: capabilities/vault-live-updates
kind: capability
title: Vault live updates
domain: domains/local-vault
dependencies: [capabilities/map-render]
relates: [capabilities/conflict-guard]
relation_notes: { capabilities/map-render: "A detected file change has to redraw the map to be seen." }
---
```

`relation_notes` holds one sentence per relation saying why it holds, keyed by the target's slug. A new `depends_on` written through the MCP server or the map's relation editor must include that sentence. Other relations should have one whenever you know the reason. The concept panel marks relations without one as **No reason**.

Values are slugs, so a person can read the graph in the file. A unique short form also works, such as `map-render` for `capabilities/map-render`. Renaming a concept through Atlas rewrites every relation that points to it.

When Atlas writes a relation list, it trims, deduplicates and sorts it, so the order has no meaning. Atlas never adds inverse or transitive relations on its own. `relates` written on one side is not copied to the other. If A depends on B and B depends on C, Atlas does not write "A depends on C". A missing relation means "not recorded", not "no relation".

## How the map uses relations

- At rest, faint arcs between domains count the `depends_on` relations between their concepts, in each direction.
- When you point at or select a concept, the map draws only that concept's direct relations, one line per connected concept: tapers for **Depends on** and **Used by**, dotted lines for **Related**, double lines for **Broader concept**.
- The concept panel lists **Depends on** and **Used by** from `depends_on` alone. Related and broader links are counted under **Other relations**.

See [Reading the map](/guide/reading-the-map) for the full line key.

## How agents use relations

The MCP server answers graph questions from the same frontmatter, so your agent does not have to read every file.

- `find_backlinks` lists every concept that points to a slug, through any relation key or a link in a body. Call it before a rename or a delete.
- `find_path` returns the shortest path between two concepts. Each hop names the key that links it (`via`) and, when one is recorded, the reason (`rationale`).
- `find_neighbors` returns one hop around a concept, filtered by direction and type.
- `query_ontology` with `impact` or `blast_radius` answers "what is affected if this changes?" It follows declared `depends_on` relations only; structure is not impact.
- `query_ontology` with `domain_matrix` counts the relations between domains. Limited to `depends_on`, it gives the same numbers as the map's arcs.

To write, `add_relation` takes `from`, `to`, a `type` (`depends_on`, `relates`, `contains`, `describes`, `domains`, `capabilities`, `elements` or `domain`) and a `why`. `remove_relation` and `replace_relation` preview by default and write only with `confirm: true`. `broader` is not one of the `add_relation` types yet. To change it, an agent calls `patch_concept` with the full new list and the file's `mtime`, then runs `validate_vault`.

[The CLI](/guide/cli) offers the same reads in a terminal. Run from a checkout of the Atlas source, these commands read the Atlas repository's own ontology:

```bash
node cli/src/index.mjs backlinks capabilities/mcp-tool-server --vault docs/ontology
node cli/src/index.mjs path capabilities/cli-commands domains/human-workbench --vault docs/ontology
node cli/src/index.mjs blast-radius capabilities/mcp-tool-server --direction incoming --vault docs/ontology
node cli/src/index.mjs domain-matrix docs/ontology --types depends_on
```

`relate` and `remove-relation` write one relation, with the same checks as the MCP tools. On the map, **Edit relations** does the same, one relation at a time; see [Editing concepts and relations](/guide/studio).

## The files stay the truth

Adding a relation changes one line in one file, and the change shows up in `git diff` like any other. A relation an agent writes looks the same as one you write, so one review covers both.
