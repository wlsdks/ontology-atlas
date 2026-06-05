---
slug: elements/topology-kind-color-research-basis
kind: element
title: Topology Kind Color Research Basis
domain: views
---

The topology kind-color contract is grounded in public visualization and accessibility references:

- W3C WCAG 2.2 Understanding SC 1.4.11 says graphical objects that are required for understanding should have sufficient contrast, and complex diagrams should identify the graphical objects users must perceive.
- Cynthia Brewer's color-use guidance and ColorBrewer lineage distinguish qualitative schemes from sequential/diverging schemes; ontology kind is categorical identity, so it should use separated qualitative hues rather than one hue family.
- The Sigma map does not rely on color alone: kind colors are paired with size hierarchy, labels, hover details, and the visible legend. This preserves the semantic distinction even when a user cannot rely fully on hue.

Implementation consequence: `project`, `domain`, `capability`, `element`, and `unknown` are visible topology categories with separate tones. General ontology stats can still exclude `project`, but the map must show it because project is a rendered kind in the topology surface.