---
uid: 0c5386c8-d36f-4ce7-88fb-9179c6234dc2
slug: elements/git
kind: element
title: Git
display_ko: git 연동
domain: domains/local-vault-management
path: src/views/git
created_by: "agent:unknown"
---

Git status/history page.

## Evidence

- Primary implementation: `src/views/git/ui/GitPage.tsx#GitPage`

## Includes

- The `/git` destination page: composing elements/atlas-git-panel as the route body under the shared shell height contract.
- Being reachable as a first-class rail destination for every audience, not gated to a "development" role.

## Excludes

- The actual git status/history rendering and diff formatting, owned by elements/atlas-git-panel.
- The rail badge and `G G` shortcut entry, owned by elements/app-nav-rail.
- Any write action on vault content; this destination is read-only history.
