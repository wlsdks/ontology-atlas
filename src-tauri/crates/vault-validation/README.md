# vault-validation

What `validate_vault` answers, built from the parts below. It reads files through `confined-files`
and runs `git` through `hardened-git`; it opens and spawns nothing itself.

| Part | What it decides |
|---|---|
| `issue_collection` | every finding about a vault, by file: each file alone, the whole vault, meaning findings, raw sources that claim a kind |
| `slug_collision` | two files whose names are one slug once composed (NFC), reported instead of one hiding the other |
| `raw_source_kind` | a raw source file that claims a `kind:` and so would read as a node |
| `problem_list` | the rows (files with an error first, then by slug) and the per-code tally, which counts files |
| `node_revisions`, `summary_freshness` | whether a domain or project body was last written before its membership last changed |
| `evidence_verdict`, `evidence_drift` | whether the code a concept cites moved after the concept was last written |
| `path_drift` | a cited `path:` or element that is no longer in the repository, with a likely move |
| `kept_history` | what the history said, kept for the next call: the dating of cited code and documents and the revisions of summary nodes under the commit and the files that shape history, and whether a moved file changed only cosmetically under the file's stamp |
| `validation_page` | the page of rows, cut by count or size, a code's repeated guidance said once as its `remedy`, and each code listing only the files the page does not show |

The depth findings (`rule-without-read-lines`, `dependency-both-ways`) are in `build-depth`.
Meaning findings (`folder-only-evidence`, `dependency-unwitnessed`, `starter-example`) are in
`meaning-findings`.
