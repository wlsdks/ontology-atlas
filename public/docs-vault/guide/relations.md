# How Relations Are Created

When you first open the map, domains radiate outward from the central hub. Just looking at this shape might raise these questions.

> Can't domains have any relations with each other? Is this structure just for querying pre-designed data? Are relations stored in the DB or in md files?

We answer these three questions in order.

The authoritative source for storage keys, screen names, MCP query/write support scope, direction, endpoint kind, inverse, and inference boundaries is the [Atlas Metamodel Specification](https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#5-relation-types-and-their-semantics). This chapter does not replicate that table but explains only how humans read relations from the map and Markdown.

## 1. Domains Do Have Relations

What appears radial is only the **structural (containment) relation**. On top of that, **semantic relations** are layered separately, freely crossing hierarchy levels.

This repository holds itself as a vault (`docs/ontology/`), so you can actually count them.

```bash
node cli/src/index.mjs overview --vault docs/ontology
```

The relation type distribution looks like this. **We do not copy the numbers here.** Vaults grow as nodes are added, becoming outdated from the moment they are written in documents. Run it yourself to see the counts in your own vault.

Relation keys are divided into two types.

| Relation Key | What It Is |
|---|---|
| `elements` · `capabilities` · `domains` · `domain` | **Structure**: what contains what |
| `relates` · `dependencies` | **Semantics**: similar things, dependencies |
| `describes` | The target a document points to |

With only structure, it's a tree. The moment **even one semantic relation** is attached, it becomes a graph. This is because both can cross hierarchy levels.

To view only relations between domains:

```bash
node cli/src/index.mjs domain-matrix --vault docs/ontology
```

A table shows which domain pairs are connected.

### How a Domain Directly Points to Another Domain

Simply write the target domain's slug in the frontmatter of the domain document.

```markdown
---
uid: 31890f3e-7b5d-4c0a-8f14-123456789abc
slug: domains/onboarding-and-shell
kind: domain
title: "Onboarding, Distribution & App Shell"
relates: [domains/topology-navigation]
---
```

You can also see it from the other side. `relates` is undirected, so writing it on one side creates the same single line; writing it on both sides still folds the map into a single bidirectional line.

```markdown
---
uid: 41890f3e-7b5d-4c0a-8f14-123456789abc
slug: domains/topology-navigation
kind: domain
relates:
  - domains/onboarding-and-shell    # domain → domain
---
```

This is the shortest answer to the question. **A domain can simply reference another domain by name.** There is no need to traverse up the hierarchy or create anything in between.

## 2. Graphs Superimposed on a Tree

Structure and meaning exist on the same map, but they are **different layers**.

```
         project
            │
   ┌────────┴────────┐
   │                 │
domain A ┄┄┄┄┄┄┄ domain B    ← relates
   │                 │
capability ┄┄┄┄> capability   ← depends_on
   │                 │
element           element

│  Solid line = structure (containment)
┄  Dashed line = meaning (relation)
```

Solid lines indicate "who contains whom," while dashed lines indicate "who depends on whom / what should be read together." Dashed lines can cross layers or traverse domains.

## 3. Storage is Markdown, Not a Database

There is no separate database, sync button, or server. **Relations are a single line in the frontmatter at the top of `.md` files**, and adding relations requires no DB migration. However, explicit file migration from UID-less v1 documents to v2 follows the [folder structure](/guide/vault-structure).

### Declaring Relations

For example, a capability document looks like this:

```markdown
---
uid: 51890f3e-7b5d-4c0a-8f14-123456789abc
slug: capabilities/vault-live-updates
kind: capability
title: Vault live updates
domain: domains/local-vault-management
dependencies:
  - capabilities/topology-canvas-render   # depends on (directional)
relates:
  - capabilities/mcp-conflict-guard       # read together (symmetric)
---

When the folder changes, the map updates accordingly.
```

### Receiving Relations

`capabilities/topology-canvas-render.md` inside the vault **contains nothing**.

```markdown
---
uid: 61890f3e-7b5d-4c0a-8f14-123456789abc
slug: capabilities/topology-canvas-render
kind: capability
title: Topology canvas render
domain: views
---

Renders the map on a 2D canvas.
```

Relations only need to be written on **one side**. The receiving side automatically knows via backlinks. You can write them on both sides (as with the two domains above), but the map folds the round-trip into a single line.

> Therefore, there are two counting standards. The number mentioned in `overview` is the count of *written references*, while the lines drawn by the map are fewer because they fold round-trips. It's just counting the same graph differently; neither is wrong.

### Relation Key Table

The exact correspondence is maintained in the single table in §5 of the specification above. What to remember here is that the three layers do not share the same set of names.

- Markdown stores `dependencies:` and the MCP writer receives `depends_on`.
- Markdown's `broader:` appears as `is_a` on screen, but neither is currently present in the public MCP relation query/write enum. When modifying existing nodes, use `patch_concept` with the `mtime` from `get_concept` and the full post-change `broader` array, followed by `validate_vault`.
- `relates` implies symmetry but does not automatically write reciprocal frontmatter.
- Backlinks and path traversal are read-derived, not inference creating new inverse/transitive relations. Missing relations are `unknown`/visible gaps, not falsehoods.

### Line Syntax in the Map

The type of relation is represented by line style.

| Line | Meaning |
|---|---|
| Solid line | Structure: containment |
| Dashed line + tapering thickness (thick start, thin end) | Directional screen relation (`depends_on` · derived `is_a` from frontmatter `broader`) |
| Dashed line + uniform thickness | Symmetric relation (`relates`) |

The **absence** of tapering itself conveys the information that "both ends of this relation are equal." We do not draw arrows on `relates` because doing so would imply causation where none exists.

### The Source of Truth is Files, Visible via `git diff`

Adding one more relation is just a matter of editing a single line in the file.

```diff
  dependencies:
    - capabilities/topology-canvas-render
+   - capabilities/vault-validator
```

Even if an AI agent adds relations, they remain in this same format. There's only one commit to review, and you can revert it if you don't like it. There is no silent state change inside the database.

## 4. It’s not about querying pre-designed data

Expanding a node doesn't mean pulling out a prepared answer from somewhere. The process is as follows.

```
 .md files on disk
        │
        │  Parse frontmatter
        ▼
   Node list + Reference list
        │
        │  Resolve names (slug/alias → node)
        ▼
   Edge list ← "Relations" are created here for the first time
        │
        │  Traverse containment chain and stamp projectIds
        ▼
      Map · INDEX · Analysis
```

Derivation is handled by `src/entities/docs-vault/lib/derive-ontology-from-vault.ts`.
Therefore:

- If you edit a relation file, the graph changes **immediately in the next derivation**. There are no per-relation migrations.
- Specifying only `domain:` automatically determines its project membership via the containment chain. You never need to manually enter the `project:` key.
- If you reference a non-existent name, that reference remains as "a concept mentioned by name only." The validator (`validate`) reports this.

## 5. Why there were no lines between domains in the demo map

If you open the map with the performance test address (`?synth=3000`), there are no lines between domains.
This isn't a product limitation; it's because **the synthetic vault only creates structural relations**.
The synthesizer (`src/views/home/lib/synth-vault.ts`) produces only one type of relation: `contains`.

If you open the real vault (`docs/ontology/`), you'll see lines crossing between domains. When judging the map's shape, **first check which vault you opened.**

## 6. How the map draws thousands of nodes

As relations increase, drawing becomes the problem. Four mechanisms work together.

### Concentric ring layout

Children are placed in sectors around the parent, with radii determined by depth.

```
        ·  ·  ·  ·  ·      element    (radius 90)
      ·  ┌──────┐  ·
    ·    │ capa │      ·   capability (radius 145)
   ·   ┌─┴──────┴─┐   ·
  ·    │  domain  │    ·   domain     (radius 250)
       └────┬─────┘
         project              Origin
```

### Switch to spiral if sectors overflow

If there are too many children, the sector radius grows proportionally to the count (e.g., radius 2250 for 100 children). So, once a threshold is exceeded, we switch to a **golden angle spiral (phyllotaxis)** disk. It's the same method as sunflower seed placement. With an interval of 26, the disk radius for 108 children stays around 414. The overflow becomes bounded.

### Density gate

Parents with **more than 12** children collapse the rest into a single `+N` chip. In the 3,000-node vault, **95%** of elements are behind this chip. You must click it to expand.

### Semantic zoom

From afar, only the skeleton is visible; as you approach, flesh appears.

| Zoom level | Visible |
|---|---|
| < 1.5x | project · domain · hubs (skeleton) |
| ≥ 1.5x | capability appears |
| ≥ 2.3x | element appears |

### Overlap reduction applies only to visible nodes

Seed placement is cheap, but overlap reduction is expensive. For 3,000 nodes, seed placement takes 4.3ms, while total reduction takes 2,253ms: **99.8% of the total cost** is reduction. Therefore, we only reduce overlaps for **nodes that are drawn**. The collapsed 95% hasn't yet competed for space.

On slow devices (CPU throttled 6x), for 3,000 nodes: **13,457ms → 563ms**.

## Summary

- Relations cross hierarchy levels. Domains connect directly to each other.
- The store is not a database but a single line of `.md` frontmatter.
- Graphs are not pre-built; they are **derived every time** from files.
- Directed and symmetric relations are distinguished by line style on the map.
- Large-scale operations are handled via four mechanisms: batching, folding, zooming, and easing.

If you want to count relations directly, see `overview`, `domain-matrix`, and `path` in the [CLI](/guide/cli) section. The remaining frontmatter rules are defined in [Vault Structure](/guide/vault-structure).
