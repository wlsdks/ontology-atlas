# What is this?

**Code remains, but context disappears.** Why was it built this way? If you touch this part, what else will break? That knowledge usually lives in people's heads and past conversations. grep finds code, but not *why*.

Ontology Atlas captures that **layer of meaning** in a single folder of Markdown files. The file frontmatter serves as nodes and relationships. No separate database, login, or server required.

## Two types of readers

- **Humans**: Read the map to make decisions. Planners, marketers, decision-makers, and developers all see the same picture.
- **AI Agents**: Read and write the same files via MCP. They draw their starting points, domain context, implementation evidence, impact scope, and verification paths from here.

Documents read by only one side rot away. Wikis age because only humans read them, while agent-only memory becomes untrustworthy because humans can't judge it. Atlas is **a single layer cultivated by both**.

## When to use it

- When the codebase grows so large that "why is this like this?" becomes an archaeological dig every time
- When you're pasting the same background context into AI agent sessions repeatedly
- When planners and developers use the same words to mean different things
- When you want to know what else will break before fixing something

## When not to use it

- Projects with just a few files: everything fits in your head
- Cases where the documentation itself is the deliverable: that's what wikis are for
- Questions where you only need to know code structure: grep and language servers are faster

Atlas does not replace CodeGraph, grep, or AST indexes. Those tools answer **structure**; Atlas answers the **meaning** above it.
