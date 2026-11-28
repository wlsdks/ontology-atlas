# vault-edit

The exact new text of the vault files a write changes. A write tool names what it means to change
(a key, a body, a new node, a reference moved by a rename); this crate returns whole file texts that
differ from the old ones in those lines and nowhere else. It reads documents `vault-document` already
read and writes nothing: applying a plan is `confined-files`' job, and the checkpoint in `mcp-server`
decides whether a write may happen at all.

| Question | File |
|---|---|
| What can a key be set to? | `src/setting.rs` |
| How is one entry spelled in the file? | `src/serialized_frontmatter.rs` |
| How are lines changed, a body replaced, a new file made? | `src/document_edit.rs` |
| What are a node's keys while a patch is judged? | `src/node_fields.rs` |
| What does a new node start with? | `src/new_node.rs` |
| Who is a node: mint, check, merge? | `src/identity.rs` |
| Which key holds a relation, and when does a stored reference name a node? | `src/relation_keys.rs` |
| What moves when a node is renamed, merged or changes kind? | `src/backlink_rewrite.rs` |
| Is a file reserved for a person? | `src/reservation.rs` |
| A file read for editing | `src/source_document.rs` |

Rules this crate keeps:

- A line a change does not name is kept byte for byte: comments, quoting, key order, a byte order
  mark, carriage returns and number text.
- A file that is not UTF-8 is refused, never rewritten with replacement characters.
- It reads only the files it is given a path to (the node written and, for a rename or a merge, the
  files that refer to it), and it names no tool.
