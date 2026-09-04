---
uid: 64869f2e-f67f-45f3-8b39-7e70c0345a7a
slug: elements/public-quick-actions
kind: element
title: Public Quick Actions
display_ko: 공개 빠른 동작
domain: domains/onboarding-and-shell
path: src/widgets/public-quick-actions
created_by: "agent:unknown"
---

Quick action widget for unauthenticated visitors.

## Evidence

- Primary implementation: `src/widgets/public-quick-actions/ui/PublicQuickActions.tsx#PublicQuickActions`

## Includes

- The quick-action row (new project, edit project) shown to unauthenticated/public visitors, preserving the current route as `returnTo`.
- Building the target project-edit href only when a `projectSlug` is present, so the edit action is absent rather than broken with no project in context.

## Excludes

- The full project editor form these actions link to, owned by elements/project-editor.
- Any write action itself: this widget only builds hrefs, it performs no mutation.
- Authenticated-only actions; there is no login gate in Layer 1, so this widget has no "private" counterpart to exclude beyond itself.
