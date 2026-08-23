# Correcting Concepts and Relations on the Map

Relations are written as a single line in the frontmatter at the top of `.md` files, but you don't need to input YAML directly. You can now edit them right next to the selected concept on the map without moving to a separate studio.

The old `/ontology/studio` URL still works. It reads `node`, `mode`, and `edit` values from existing bookmarks and maps them to the corresponding concept and editing state in `/topology`. However, it is not an independent destination for the left rail.

## Editing a Single Relation

1. Select a concept on the map.
2. Click "Edit Relations" in the small info panel on the right.
3. Choose the relation type and the target concept, then specify why they are connected.
4. Verify the direction and endpoints using the dashed arrow that appears on the map.
5. Check the resulting frontmatter array and reason in "View Changes".
6. Click "Confirm and Write" to actually update the file.

If you open an existing relation, "Disconnect this Relation" also goes through the same change preview screen. If you change the target, it replaces the old target and reason with the new ones in one step, leaving no trace of the previous values.

Only one relation is handled at a time. Putting all features from the old studio into the small info panel would obscure the map and make it complex again. To edit other relations, finish the current one before opening the next.

### Four Relations

| Screen Name | Graph Relation | Stored Key |
|---|---|---|
| Broader Concept | `is_a` | `broader:` |
| Container | `contains` | `contains:` |
| Dependency | `depends_on` | `dependencies:` |
| Related | `related_to` | `relates:` |

We do not use color alone to indicate type or direction. In the editor, relation names appear as text, and the map preview shows dashed lines with arrows. Once confirmed, these converge into solid lines. Collapsed targets briefly show only their node and name at their actual coordinates. Surrounding nodes and layout remain unchanged. During editing, the left INDEX collapses to free up map space; closing it restores the original expanded state. With motion reduction enabled, only the state changes without position movement or additional delay.

## Creating New Concepts

The map's "Add Concept" receives the name, type, and domain but does not immediately create a file. Instead, it displays the proposed slug, UID, display name, domain, and author. You must click "Confirm and Write" to generate the new `.md` file. Clicking "Edit Again" preserves the entered values.

## When Delegating to Agents

In the app's ACP conversation, read-only tools like `list_concepts` and `get_concept` do not halt the conversation. Write tools such as `add_concept`, `add_relation`, and `patch_concept` are different. The agent converts the arguments it sent into proposals, displays them within the same conversation, and waits.

- "Allow This Once": Execute this single call and continue the same conversation.
- "Decline": Reject this call without modifying any files.
- There is no "Always Allow" option for write operations.

Read/write determination is not guessed by the screen. It aligns with the read indicators and auto-contracts provided by the MCP server's current `tools/list`. If the screen does not yet recognize a new tool, it defaults to write mode, prompting the user first.

## Conflicts and Canonical State

Proposals are transient states not stored in a separate database or review file. The moment the frontmatter is written after confirmation, that markdown becomes the canonical version. If you open the editor and another person or agent modifies the same file first, an `expectedMtime` check prevents the second write. It does not silently overwrite new values.

## Summary

- The map and ACP are the primary workspaces.
- Manual editing involves adding relations one by one around selected concepts.
- Creation, relation editing, and ACP writes all display proposals before file writing.
- `/ontology/studio` and `/ontology/edit` now only redirect to the map workspace.
