---
slug: src/views/docs-vault/ui/DocsVaultPage.tsx
kind: element
title: Source Vault Page
domain: vault-local-first
---

# Source Vault Page

`src/views/docs-vault/ui/DocsVaultPage.tsx` renders the `/docs` Source Vault surface.

This surface is the human-facing document view over the same local markdown vault that MCP agents read and write. It keeps the current source, selected record, editor state, command palette, graph handoff copy, and local vault persistence in one page-level workflow.

The worktree drawer follows a low-complexity rule: the source tree is the primary navigation object, while pinned records, recent records, and tag filters are secondary saved views behind one `Filter & saved` disclosure. Folder branches start closed unless they contain the selected source record, so a large vault presents top-level structure before detail. A local search field narrows the tree to matching source records and auto-expands only the matching path, giving large vaults a fast way to reduce visual noise.

The drawer uses quiet native-sidebar density: minimal header chrome, readable folder labels, low-contrast saved-view rows, and soft tag chips only after the refinement disclosure opens, so the worktree does not compete with the document reading canvas.

The document inspector is also opt-in. Outline, share/print, file management, and backlinks are available from a small header button, but the right rail stays closed by default so the reader starts with one source record instead of three competing panels.

The document meta bar now starts with a compact source-record proof strip. It
shows the backing markdown path and explains whether the record is general graph
evidence or a frontmatter-backed ontology object, so even the README sample
reads as part of the shared graph evidence layer before the reader reaches the
prose body.

Section copy anchors from `src/widgets/docs-vault/ui/DocsVaultViewer.tsx` stay inside the mobile reading column as 32px hit targets, then move back to the subtle left-side hover affordance on wider viewports. That keeps source-record deep links copyable on phones without clipping controls against the viewport edge.

Source-record links inside rendered markdown tables also get a 32px minimum target. Tables such as `Current Canon` act like navigation indexes, so their document links should be reliable jump targets rather than tiny inline text.

The page resolves docs-vault query slug aliases across packaged and local vault shapes. Packaged docs use slugs like `ontology/documents/agent-practice-research`, while the same file inside an opened `docs/ontology` local vault is `documents/agent-practice-research`; `/docs` normalizes either form against the active manifest before falling back to pinned or recent records.

When a URL query slug is still being normalized from packaged to local form, the default document fallback is deferred. That prevents deep links from briefly selecting the README or a recent record before the intended local ontology note is applied.

The installed desktop welcome exposes a direct dogfood action for this repository's `docs/ontology` vault even on the generic local-vault welcome. The action resolves the preferred renamed checkout path (`/Users/jinan/side-project/ontology-atlas/docs/ontology`) first, then falls back to the current old checkout path (`/Users/jinan/side-project/oh-my-ontology/docs/ontology`) while the local folder rename is pending. That makes the app able to open Atlas's own ontology without asking the user to browse for the repo manually, and gives agent-driven verification a concrete way to prove the workbench improves codebase understanding on itself.

The mobile header keeps the topology shortcut as an accessible icon-sized control instead of the full text button used on wider screens. That preserves the route from a source record to the graph while keeping the Source Vault header inside the 360px viewport with no horizontal body scroll.

The mobile header also exposes a labeled `Vault checks` control instead of keeping the source contract desktop-only. Opening it shows the Files / Graph / Agent cards, Browse / Query links, and the `Copy graph gate` action, so Source Vault reads as the source of the ontology graph and AI-agent runtime gate rather than only as a document viewer.

Hosted browser sessions keep writable local vault work disabled and place the macOS app download action beside the disabled Local source control. That keeps the reason and next step in the same header flow: sample source records stay readable in the browser, while disk-backed ontology editing starts in the installed Ontology Atlas app.

The source switch and command palette trigger keep 32px minimum hit targets on mobile. Source Vault is an ontology source surface, so switching between sample records, a local vault, and palette search must feel like a primary workbench control instead of a tiny toolbar label.

This supports the product contract that humans should understand one source record at a time, while graph evidence and agent workflows remain reachable without crowding the reading canvas.
