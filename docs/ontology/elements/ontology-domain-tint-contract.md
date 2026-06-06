---
slug: elements/ontology-domain-tint-contract
kind: element
title: Ontology Domain Tint Contract
domain: views
---

# Ontology Domain Tint Contract

`src/shared/lib/domain-color.ts` is the shared visual contract for domain ownership tint across Builder and Insights surfaces.

The contract separates two categorical channels: ontology kind color explains the role of a node (`project`, `domain`, `capability`, `element`, `unknown`), while domain tint explains which vocabulary or ownership boundary the node belongs to. Atlas dogfood domains use named qualitative hues so `ai-agent-partner`, `mode-aware-adapters`, `onboarding-ux`, `ontology-core`, `vault-local-first`, and `views` no longer collapse into the same indigo-like family.

`src/shared/lib/domain-color.test.ts` guards determinism, neutral fallback, named dogfood hues, and minimum circular hue separation. This keeps future palette changes from making the self-ontology graph look like a field of similar marks again.