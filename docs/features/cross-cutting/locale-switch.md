---
title: LocaleSwitch
doc_type: feature
status: current
area: design-system
routes: []
---

# LocaleSwitch

### `LocaleSwitch`
- Two-button toggle EN / KO
- Replaces only the locale prefix while preserving the raw query and hash,
  including duplicate-key order and existing encoding. Uses
  `router.replace(..., {scroll: false})`, so changing the language does not add
  browser history or reset URL-addressed task state such as the selected
  Insights tab.
- localStorage `ontology-atlas:locale`
