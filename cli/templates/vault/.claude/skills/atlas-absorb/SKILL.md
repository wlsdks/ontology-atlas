---
name: atlas-absorb
description: Pull concepts out of prose (meeting notes, specs, PR descriptions), checking for duplicates first. Writes nothing until a person picks. Use for "extract from this" · "fold this document in".
---

# /atlas-absorb — prose into the graph

## The value here is in what it does *not* create

The most common failure when extracting concepts from prose is **recreating
something that already exists under a different name**. So the order is not
"extract, then check for duplicates" but **"check for duplicates, then extract"**.

1. **What are you reading**

- **A file in the vault** (or one the user pointed at) → `absorb_document({ filePath })`.
  Call it **without `confirm` first** — that returns proposals and writes nothing.
- **Prose pasted into the conversation** → read it directly and draw candidates.

2. **Check each candidate for duplicates first**

For every candidate name, make two calls.

- `query_concepts({ filter: '<name>' })` — does a near-name already exist
- `find_evidence({ title: '<name>' })` — is it already here under another name

If it exists, **do not create a new node.** Do one of two things: fill the
existing node with `patch_concept` (pass `expected_mtime`), or add only the
missing relation.

3. **Do not create what the text does not claim**

Prose is written loosely. "It would be nice if…" and "this might…" are wishes,
not facts. Only raise candidates the text **actually asserts**. When it is
borderline, raise it but mark it "weak support in the text" so the person decides.

4. **Write only what was approved — then verify**

- For a file: `absorb_document({ filePath, confirm: true })`
- For pasted prose: `add_concepts` → (after all succeed) `add_relations`
- Then `validate_vault({})` → `query_ontology({ operation: 'health' })`

## Name things the way this vault already does

`title` is the single canonical name search matches on, so **one language must
win across the vault**. Mixing them splits search. Other-language names go in
`display_ko` / `display_en`. Check which way this vault leans with
`list_concepts` before writing.

## How this skill fails

- Invents a plausible concept the text never claimed
- Recreates an existing concept under a new name
- Calls `confirm: true` first, writing before anyone has looked
- Uses a `title` language the vault does not use, splitting search
