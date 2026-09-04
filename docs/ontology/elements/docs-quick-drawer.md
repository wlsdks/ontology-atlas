---
uid: e79cc4aa-c895-4788-b62c-2ce85a35185a
slug: elements/docs-quick-drawer
kind: element
title: Docs Quick Drawer
display_ko: 문서함 빠른 서랍
domain: domains/onboarding-and-shell
path: src/widgets/docs-quick-drawer
created_by: "agent:unknown"
---

Document quick access drawer widget.

## Evidence

- Primary implementation: `src/widgets/docs-quick-drawer/ui/DocsQuickDrawer.tsx#DocsQuickDrawer`
- Supporting implementation: `src/widgets/docs-quick-drawer/lib/tree-utils.ts#flattenDocs`
- Focused test: `src/widgets/docs-quick-drawer/lib/tree-utils.test.ts#pre-order: dirs descended in definition order, docs included`
- Focused test: `src/widgets/docs-quick-drawer/lib/tree-utils.test.ts#empty dir returns empty array`
