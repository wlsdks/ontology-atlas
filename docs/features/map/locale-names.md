---
title: Locale-specific node names
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Locale-specific node names

#### Locale-specific Node Names (`display_<locale>`, 2026-07-24)
- A feature to assign different names per language to a single node. The map labels, INDEX, and popovers draw names from `display_ko` / `display_en` in frontmatter according to the screen language. If no name for that language exists, it searches down the order: `display_<screen language>` → `display` → `title`. Search and name comparison always use the full `title` — attaching a label does not narrow the search scope.
- There are three ways to enter names: MCP `add_concept`/`add_concepts`'s `labels: { ko, en }` · writing keys directly via `patch_concept` · language-specific name fields in the map's node composer.
- Prevents filling only one language — MCP returns a warning if only one language arrives (does not block saving itself), and the human form **makes the current screen language's field required**, blocking save if only other languages are filled and writing the reason there (no modal).
