---
id: afd11e09-c68a-465a-83fa-d8abd8cabdfc
date: 2026-11-19
---
## 2026-11-19 — A wiki page names the concepts it is about at any status, and the wiki schema checks it

**Why**: `describes:` was allowed only on a `reviewed` page and no screen raises one, so nothing linked a source to a concept (`docs/specs/2026-11-19-wiki-ontology-link.md`).
**Prior**: Overturns the "only on a reviewed page" clause and `describes-needs-approval` (#1452, `cf6361a7b`, under 2026-09-05). Narrows `5e2f4838`: a round may carry existing `describes:`/`relation_notes` unchanged but not add or change them. Applies `0f78a22b-d1bc-45db-932a-74616f5f0667`. Keeps 2026-09-05 (a page is never a node), the person-owned `status`, and the Propose record (`docs/DECISIONS.md:716`).
**Decision**: `describes:` and `relation_notes` are allowed at any `status` and written by the page's writer, an agent included, without approval. The MCP wiki schema checks them: blocking `describes-target-missing` replaces `describes-needs-approval` when an entry, after NFC and resolved as `find_backlinks` does, names no `kind:` node (a wiki page and the README are not targets). `validate_wiki`, `wiki-validate` and the write judge pass a node list. Vectors only rank candidates. `docs/ONTOLOGY-ATLAS-SPEC.md` §11 steps to v2.1-rc.
**Dissent**: 2026-09-05: a draft naming nodes is an unapproved claim about the graph; a loose agent puts wrong links in Git before anyone looks.
**Falsifier**: more than 10% of agent-written links in the owner's walk are wrong; a link to a missing concept survives a rename or merge made through Atlas; or a person cannot see on the page which concepts it claims.
**Owner**: Stark
