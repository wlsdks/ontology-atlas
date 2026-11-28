# wiki-pages

The machine half of the wiki page contract (`docs/ONTOLOGY-ATLAS-SPEC.md` §11): what a page under
`wiki/` must carry (frontmatter, five sections, a citation on every fact) and what only the whole
folder shows (a link to a page that is not there, a page nobody links, two pages written from one
source that do not link each other). Pure: the caller lists the pages and the raw sources and reads
the files.

| File | Owns |
|---|---|
| `src/wiki_template.rs` | The fields, the five sections, the citation syntax and the furniture names |
| `src/problem.rs` | A finding: its code, its sentence, its line and the pieces a screen retells it from |
| `src/concept_index.rs` | Which concept a `describes:` entry names, resolved as `find_backlinks` resolves a name |
| `src/page_check.rs` | One page against its contract |
| `src/page_links.rs` | The page links of a body, fenced code skipped |
| `src/folder_judgement.rs` | The three findings that need every page present |

Advisory codes (`orphan-page`, `shared-source-unlinked`) are true of a young wiki rather than of a
page: they are reported and counted, and never decide whether a page fits its template.
