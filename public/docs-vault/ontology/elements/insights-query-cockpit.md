---
slug: elements/insights-query-cockpit
kind: element
title: Insights Query Cockpit
domain: views
---

`src/views/ontology-insights/ui/OntologyInsightsPage.tsx` renders the first-viewport query cockpit for `/ontology/insights`.

It exposes readiness, graph DB pack size, MCP call count, CLI fallback count, live graph facts, health blockers, traversal density, run order, scan/path contracts, and the self-check + health gate before the deeper charts.

The graph DB pack appears only in this first-viewport cockpit. The lower agent recipes panel now stays focused on handoff, result contracts, traversal strategies, and first-run order, so `/ontology/insights` has one obvious place to copy and run graph DB-style scans instead of repeating the same pack twice.

Design contract: the insights query surface follows `docs/DESIGN-SYSTEM.md` no-glow rules. Row hover states use border/background transitions only, not shadow-based glow, so query evidence reads as a compact workbench rather than a decorative dashboard.
