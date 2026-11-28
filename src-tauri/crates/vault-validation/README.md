# vault-validation

What `validate_vault` answers, built from the parts below. It reads files through `confined-files`
and runs `git` through `hardened-git`; it opens and spawns nothing itself.

| Part | What it decides |
|---|---|
| `issue_collection` | every finding about a vault, by file: each file alone, the whole vault, meaning findings, raw sources that claim a kind |
| `problem_list` | the rows (files with an error first, then by slug) and the per-code tally, which counts files |
| `node_revisions`, `summary_freshness` | whether a domain or project body was last written before its membership last changed |
| `evidence_verdict`, `evidence_drift` | whether the code a concept cites moved after the concept was last written |
| `path_drift` | a cited `path:` or element that is no longer in the repository, with a likely move |
| `validation_page` | the page of rows, cut by count or size, with repeated guidance folded |

Meaning findings (`folder-only-evidence`, `dependency-unwitnessed`, `starter-example`) are in
`meaning-findings`; the shared packet schema is `meaning_findings::packet_schema`.
