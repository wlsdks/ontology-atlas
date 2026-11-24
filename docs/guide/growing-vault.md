---
title: "Keep the map current as code changes"
doc_type: guide
status: current
area: product
---

# Keep the map current as code changes

You and your coding agents keep changing the code, so the codebase ontology
needs to keep up. This chapter covers syncing the map after a change, finding
concepts whose evidence went stale, avoiding duplicate concepts, renaming
safely, and reviewing and committing what changed.

## Sync after a code change

After a change, ask the agent that made it to update the map in the same
session. The rule:

- **Sync** when the change adds, removes or renames a domain, a capability, an
  element or a relation between them.
- **Skip** typos, comments, one-line style changes, lint settings and test
  fixtures that change no meaning.

The agent reads the affected concepts with `get_concepts`, changes them with
`patch_concept`, `add_concepts` or `add_relations`, and runs `validate_vault`.
Renaming code does not mean the concept must be renamed. Decide whether the
meaning changed or only the file did. If only the file moved, update the
concept's `path`.

An ontology folder that Atlas creates carries three starter skills for Claude
Code and Codex. `atlas-review` reports what is broken or disconnected, `atlas-grow` proposes
what to add next, and `atlas-absorb` pulls concepts out of notes or specs. None
of them writes anything until you choose what to keep.

## See what went stale

In the desktop app, the map marks concepts whose evidence may be out of date.
A concept is **stale** when a file it cites was committed after the concept's
own document last changed. Each map view marks stale concepts in amber or gold,
and its legend names the mark. This needs the folder's Git history, so the
browser version and a folder without Git show no stale marks.

An agent's `validate_vault` checks the Markdown and its references, and its
`pathDrift` list names the source paths that concepts cite but that no longer
exist. Fix each one with `patch_concept`.

The **Changes** screen in the app reads the Git history of a code repository
you choose. It summarizes what was merged in a time period, and each change
lists the **Affected concepts** whose code paths it touched. Look there after a
busy week.

## Avoid duplicates

The most common way a map decays is the same concept written twice under two
names. Before the agent adds one, it can ask `query_ontology` with
`similar_nodes` for concepts that overlap the proposed title. When one matches,
it updates the existing concept instead. `add_concepts` also returns a warning
when a concept with a similar title already exists. If the same concept already
exists twice, `merge_concepts` merges the two and moves every reference to the
surviving concept.

## Rename without breaking references

Renaming a concept by hand misses references. The agent first lists them with
`find_backlinks`, then `rename_concept` moves the file and rewrites every
concept that points at it, relation notes included.

The slug changes, but the concept's `uid` stays the same, so agents and
exports still recognize it. `rename_concept`, `merge_concepts` and
`delete_concept` preview first and apply the change only when confirmed.
`delete_concept` refuses while other concepts still point at the concept you
want to delete.

## Review findings on the map

In the app, select a concept and open **Ontology review** (under **More
actions**). **Ask AI to review** asks the agent to check the map, and the
answers appear under **Review results**, one row per finding. The map marks the
concepts the findings point at. For each finding, choose **Have it fixed**,
**Keep for later** or **Dismiss**. Findings are the agent's guesses. A review
never edits the map on its own.

## Edits at the same time

You, a teammate and an agent may all edit the same file. Atlas never
overwrites a change silently:

- When an agent passes the `expected_mtime` it read, the MCP write tools
  refuse to overwrite a file that changed since. The agent has to read it again
  and retry. Without it, the write goes through.
- When the app applies a proposed change to a document that just changed, it
  writes nothing and says so.

## Commit what changed

The ontology folder is ordinary files in Git, so you review concept changes in
the same pull request as the code. In the app, the **Git** screen lists the
uncommitted changes by document, with the changed lines marked. The **Commit**
button shows how many changes there are and commits them. You can also restore
a single document to an earlier version there. An agent's `git_snapshot`
commits only the ontology folder, and by default only previews what it would
commit.

How concepts and relations are shaped is covered in
[Relations between concepts](/guide/relations).
