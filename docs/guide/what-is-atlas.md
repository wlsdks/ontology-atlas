# What is this?

**Keep understanding your system as agents change its code.** Before accepting a
change, you need to know which capability it serves, what rules matter, and what
still needs inspection. Source code, documents, and people can supply different
parts of that evidence; the producing agent's summary is a claim to review.

Ontology Atlas captures that **layer of meaning** in a single folder of Markdown files. The file frontmatter serves as nodes and relationships. No separate database, login, or server required.

A useful analogy is an **IDE for codebase meaning**. Atlas brings construction, inspection, validation, review, and maintenance of the codebase ontology into one workbench; it does not edit, build, run, or debug source code.

## Two types of readers

- **Humans**: Inspect recorded meaning, its evidence, and unknowns through the map, documents, and change review. Correct or reject a proposed meaning; acceptance is separate from code review, merge, or deployment.
- **AI Agents**: Read and write the same files via MCP. Task-aware context can provide starting points, domain context, implementation evidence, declared impact boundaries, and verification paths for source inspection.

Atlas is **one meaning layer maintained by both**. You need not open the app for
every task; an agent can consume the context over MCP, and you can open the
workbench when you need to inspect or correct it. A connection does not guarantee
that every host uses the context or applies the same review permissions.

## When to use it

- When the codebase grows so large that "why is this like this?" becomes an archaeological dig every time
- When you're pasting the same background context into AI agent sessions repeatedly
- When planners and developers use the same words to mean different things
- When you need to inspect declared dependencies, evidence, and unknown impact before fixing something

## When not to use it

- Projects with just a few files: everything fits in your head
- Cases needing only ordinary note storage: the ontology workflow may add no value; Atlas Library can also hold source documents without ontology nodes
- Questions where you only need to know code structure: grep and language servers are faster

Atlas complements source search, CodeGraph, and language tools. It preserves
reviewable meaning linked to implementation evidence. Reliable reconstruction
across unfamiliar legacy repositories and a complete task-bound Meaning Diff
remain development work; a graph cannot guarantee a safe code change.
