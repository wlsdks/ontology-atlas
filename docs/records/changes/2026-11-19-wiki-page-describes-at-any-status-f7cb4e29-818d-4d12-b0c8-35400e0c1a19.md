---
id: f7cb4e29-818d-4d12-b0c8-35400e0c1a19
date: 2026-11-19
category: Changed
---
A wiki page may now name the concepts it is about in `describes:` at any status, with a one-sentence reason per concept in `relation_notes`, and an agent may write them without approval. `validate_wiki`, `ontology-atlas wiki-validate` and the app's page-write check report `describes-target-missing` when a name matches no concept in the folder (a missing or ambiguous name, another wiki page, or the vault README), instead of `describes-needs-approval` on every draft that named one. A Library round still may not add or change these links, but now keeps a page's existing ones.
