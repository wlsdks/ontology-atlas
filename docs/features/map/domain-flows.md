---
title: Domain flows
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Domain flows

At the overview, Galaxy draws one strand between each pair of domains that depend on each other. A strand counts the capability-level `depends_on` relations (a capability's `dependencies`) whose two capabilities sit in different domains. It is the same roll-up the Hex board's canals use, so the two views never disagree about a count.

A strand is `min(2.4, 0.5 + 0.35·log2(1 + count))` px wide at the dependent domain. A one-way strand tapers toward the depended-on domain and ends in one head there; a two-way strand keeps its width and carries a head at both ends. Each strand bends round other galaxies and the core, and its tone is opaque: the domain ink mixed into the near canvas background.

Strands belong to the overview. They fade out as the camera zooms in, from full at zoom ratio 1.4 to gone at 2.2, and an opened lens dims them with everything else outside it.

At rest, the five strongest strands show their count. Hovering a galaxy, or selecting a concept inside one, lights that galaxy's strands and shows exactly their counts; while a galaxy is hovered, every other strand recedes to a quieter tone. No strand names the capabilities behind its count.

The canvas shows a count as a bare number. The screen-reader list after the domains reads every strand in words, such as "Orders depends on Catalog: 3 dependencies", or "depend on each other" for a two-way strand.

Decision: [Galaxy counts how domains depend on each other](../../records/decisions/2026-10-03-galaxy-domain-flows-4de4259c-7ff0-4489-a5ee-8e248936f826.md).
