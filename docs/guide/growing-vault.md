---
title: "Keep the map current as code changes"
doc_type: guide
status: current
area: product
---

# Keep the map current as code changes

This chapter covers keeping your codebase ontology true while you and your
coding agents keep changing the code: syncing the map after a change, renaming
safely, avoiding duplicate concepts, finding concepts whose evidence went
stale, and reviewing and committing what changed.

## Sync after a code change

After a change, ask the agent that made it to update the map in the same
session. Use this rule:

- **Sync** when the change adds, removes or renames a domain, a capability, an
  element or a relation between them.
- **Skip** typos, comments, one-line style changes, lint settings and test
  fixtures that change no meaning.

The agent reads the affected concepts with `get_concept`, then changes them
with `patch_concept`, `add_concepts` or `add_relations`, and runs
`validate_vault`. A code rename does not have to rename the concept. Decide
whether the meaning changed or only the file did; if only the file moved,
update the concept's `path`.

`init` installs three starter skills for Claude Code and Codex.
`atlas-review` reports what is broken or disconnected, `atlas-grow` proposes
what to add next, and `atlas-absorb` pulls concepts out of notes or specs. None
of them writes until you pick.

## See what went stale

In the desktop app, the map marks concepts whose evidence may be out of date.
A concept is **stale** when a file it cites was committed after the concept's
own document last changed. Each map view marks stale concepts in amber or gold,
and its legend names the mark. This needs the folder's Git history, so the
website and a folder without Git show no stale marks.

From a terminal, `health` runs the full set of checks, including whether the
source paths that concepts cite still exist:

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs health ./atlas
```

`validate` checks only the Markdown and its references, not the code. A
refactor that deletes a cited file can pass `validate` and still fail `health`.

The **Changes** screen in the app reads the Git history of a code repository
you choose. It summarizes what was merged in a period, and each change lists
the **Affected concepts** whose code paths it touched. That is where to look
after a busy week.

Before you commit, `preflight --staged` matches your staged files to the
concepts that cite them and prints what they affect. It never blocks a
commit, and it prints nothing when no concept matches.

## Avoid duplicates

The most common way a map decays is the same concept written twice under two
names. Check before you add:

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs similar "order acceptance" ./atlas
```

When the score is high, update the existing concept instead. Agents get the
same protection: `add_concept` returns a warning when a concept with a similar
title already exists. If two concepts already split, merge them. The merge
moves every reference to the surviving concept:

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs merge capabilities/checkout capabilities/order-acceptance --vault ./atlas
```

## Rename without breaking references

Renaming a concept by hand misses references. `rename` moves the file and
rewrites every concept that points at it, including relation notes:

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs backlinks capabilities/checkout --vault ./atlas
node ~/tools/ontology-atlas/cli/src/index.mjs rename capabilities/checkout capabilities/order-acceptance --vault ./atlas
```

The slug changes, but the concept's `uid` stays the same, so agents and
exports still recognize it. `rename`, `merge` and `delete` only preview by
default. Add `--confirm` to apply. `delete` refuses while other concepts still
point at the one you delete. Agents use the matching MCP tools,
`rename_concept`, `merge_concepts` and `delete_concept`, which preview first in
the same way.

## Review findings on the map

In the app, select a concept and open **Ontology review**. **Ask AI to review**
asks the agent to check the map, and the answers appear under **Review
results**, one row per finding. The map marks the concepts the findings point
at. For each finding you choose **Have it fixed**, **Keep for later** or
**Dismiss**. Findings are the agent's guesses. A review never edits the map on
its own.

## Edits at the same time

You, a teammate and an agent may edit the same file. Atlas writes never
overwrite silently:

- The MCP write tools read the file from disk before writing and refuse to
  overwrite a file that changed since the agent read it. The agent has to read
  again and retry.
- When the app applies a proposed change to a document that just changed, it
  writes nothing and says so.

## Commit what changed

The ontology folder is ordinary files in Git, so you review concept changes in
the same pull request as the code. In the app, the **Git** screen lists the
uncommitted changes by document, with the changed lines marked, and the
**Commit** button, which shows the number of changes, records them. You can also restore one document to an earlier
version from there. From a terminal, `snapshot` commits only the ontology
folder with a summary of what changed:

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs snapshot ./atlas --dry-run
```

Every command used here is listed in [the CLI chapter](/guide/cli). How
concepts and relations are shaped is covered in
[relations between concepts](/guide/relations).
