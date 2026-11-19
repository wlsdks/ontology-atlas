---
title: "Editing concepts and relations"
doc_type: guide
status: current
area: product
---

# Editing concepts and relations

You can change the ontology in several ways: edit a relation or a concept's text on the map, create a concept, or let a coding agent such as Claude Code or Codex propose changes for you to review. This chapter covers each, and what happens when the file on disk changed first. Every way ends in the same place: the Markdown files in your ontology folder. You can also always edit those files directly in your own editor.

There is no separate editor screen. The old Studio addresses (`/ontology/studio` and `/ontology/edit`) only redirect to the map with the same concept selected.

## Edit a relation on the map

1. Select a concept on the map.
2. In the concept panel, press **Edit relations**. On a domain, open **Edit** and choose **Edit relations**.
3. The panel becomes the relation editor, in the same place. Choose a **Relation type**: **Is a kind of**, **Depends on**, **Contains** or **Related to**.
4. Choose the **Connected concept**. You can pick only concepts that already have a file in the folder, so the relation always points at something real.
5. Fill in **Why this relation exists**. It is required for **Depends on** and recommended for the others.
6. Check the dashed preview line that the map draws between the two concepts. It shows the direction before anything is written.
7. Press **Review change**. You see only what will change in the frontmatter, including the reason.
8. Press **Confirm and write** to write the file, or **Keep editing** to go back.

To delete a relation, open it in the editor and choose **Remove this relation**. The deletion goes through the same review. If you change the target of an existing relation, the old target and its reason are replaced in one write.

The editor handles one relation at a time, so the map stays visible beside it. [Relations between concepts](/guide/relations) explains what each type means and which frontmatter key it writes.

## Edit a concept's text

Press **Details** in the concept panel to open the full view, then press **Edit body**. Write the definition, what the concept includes and excludes, and what is uncertain, then press **Save**. To change names in other languages (`display_<locale>`) or other frontmatter fields, edit the file itself.

## Create a concept

Open **Add concept** in one of three ways: right-click an empty part of the map, press **Create concept** on an empty map, or open **Edit** on a domain and choose **Create linked concept**.

Enter the name in your screen's language (a second language is optional), choose the **Kind**, and optionally a **Domain**. **Create** does not write anything yet. It shows a review of the slug, the `uid`, the names, the domain and the author that will be written. **Confirm and save** creates the `.md` file. **Keep editing** returns to the form with your entries kept. [Choosing concepts](/guide/what-becomes-a-node) helps you decide the kind.

## Let an agent propose changes

### In the desktop app

**Ask** in the concept panel opens the agent chat beside the map, with a question about that concept ready to send. The agent works through the Atlas MCP server.

- Reading the ontology (`list_concepts`, `get_concept`, `find_path` and the other read tools) does not interrupt the chat.
- Every write (`add_concept`, `add_relation`, `patch_concept` and the other write tools) pauses the chat on a card titled **Review the proposed change**. The card shows what will be created or changed and, for a relation, the reason.
- **Allow once** runs that one write. **Deny** writes nothing. **Deny and edit** denies the write and drafts a correction request for you to send.
- A batch of writes is shown item by item, and your answer applies to the whole batch.
- A write tool never offers **Allow this tool for the rest of this chat**.

If you set the chat's **Mode** to **Auto-approve**, file edits in this folder and new or changed concepts and relations go ahead without asking. Deletions, commits, shell commands and anything outside the folder still ask first. Auto-approve stays on for this folder until you turn it off. The **Allow list** in the privacy settings shows it as **Chat auto-approve**, with a **Revoke** button.

### From a terminal agent

When Claude Code, Codex or Cursor uses the Atlas MCP server directly, the agent's own permission prompts decide what runs. Tools that rename, merge, delete or remove a relation preview by default and write only with `confirm: true`. Either way, the result is ordinary file changes. The map picks them up within seconds, a concept the agent created has `created_by: "agent:<name>"`, and the change is in `git diff` for you to review or revert.

Writing a file is not the same as accepting its meaning. An agent can mark a concept `review_state: human_decides` when only a person should settle it. In the document view, **Mark as decided** clears that mark, and **Mark as checked** records that a person read the concept and the meaning is right. If the file changes after that, the concept panel says so.

## When the file changed first

Before the map writes a file, Atlas checks that the file has not changed since you opened it. If another editor, a teammate or an agent changed the same file in the meantime, nothing is overwritten:

- The relation editor says "Could not write. Check whether the file changed, then try again."
- A body edit keeps your text and tells you that the file was changed elsewhere first. Saving again replaces that version with your text.
- MCP write tools accept `expected_mtime`. If it does not match, the write fails instead of overwriting.

No hidden drafts or review queue sit behind these screens. A proposal exists only on screen until you confirm it. Once it is written, the Markdown file is the only version.

Next: [Keep the map current as code changes](/guide/growing-vault).
