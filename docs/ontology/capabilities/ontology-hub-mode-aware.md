---
slug: capabilities/ontology-hub-mode-aware
kind: capability
title: Ontology Hub — Mode-Aware (Q1=(a))
display_ko: 샘플과 내 폴더 오가기
display_en: Switch Between Sample and My Folder
domain: mode-aware-adapters
dependencies: [capabilities/frontmatter-to-ontology, capabilities/mode-aware-adapter]
elements: [elements/app-nav-rail, src/features/vault-ontology/model/use-ontology-insight.ts, src/views/home/ui/HomePage.tsx]
relates: [domains/views]
---

# Ontology Hub — Mode-Aware

The root and `/topology` use `useOntologyInsight()` to derive one
`KnowledgeProjectInsight` shape from either the selected local vault or the
build-time dogfood sample. Switching source changes the graph without changing
the Topology task model.

The current hub is Topology + INDEX: map overview, source-concept search,
selection, path/focus, datasheet evidence, and agent handoff over the same
frontmatter graph. `/ontology` is a compatibility redirect to
`/topology?index=expanded`; the removed tree/ego page, Browse/Write/Query cards,
Builder CTA, and query cockpit are not current surfaces.

Unsupported hosted folder-open actions route to the installed-app guide. The
installed app uses the native local-vault bridge and keeps focus/source context
when handing a selected concept to Docs or Workshop.
