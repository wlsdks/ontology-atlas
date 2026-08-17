# This folder is an Ontology Atlas vault

The frontmatter in each `.md` file *is* the graph — its nodes and edges.
Before you scan files, **call the `ontology-atlas` MCP server first.** It is
already registered for this folder (`.mcp.json`, `.codex/config.toml`) and
answers with parsing, validation, and relation resolution already done.

| What you want | First call |
|---|---|
| How many of what | `list_kinds` |
| The whole node table | `list_concepts` |
| One concept and its neighbours | `get_concept({ slug })` |
| Who depends on this | `find_backlinks(slug)` |
| Are these two connected | `find_path(from, to)` |
| Is this vault healthy | `validate_vault({})` |

Do not read frontmatter with `grep` or `sed`. You get the same answer more
slowly, without relation resolution or schema validation.

**Name it the way this vault already does.** `title` is the one canonical name
search matches on; put other languages in `display_ko` / `display_en`. Every
node here keeps an English `title`, so a node whose `title` repeats its
`display_ko` leaves the vault with two languages of canonical name and splits
search.

**Write through the same server** — `add_concept` · `add_relation` ·
`patch_concept` (pass `expected_mtime`) · `rename_concept` · `merge_concepts`.
A file written by hand has no `uid:`, and one missing `uid:` fails the whole
graph compile.
