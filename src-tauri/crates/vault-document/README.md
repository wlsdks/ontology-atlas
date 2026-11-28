# vault-document

A vault's Markdown files as documents, and the plain reads over them. It reaches the disk only
through `confined-files` (the crate's `clippy.toml` refuses `std::fs`).

## Where things live

Every module of `src/` is named here once.

| Question | File |
|---|---|
| How is a file split into bytes I can change one line of? | `document.rs` (`Document`, `RawShape`, `parts`, `entry_range`) |
| How is a frontmatter block read? | `frontmatter/`: `block.rs` walks entries; `entry_line`, `inline`, `block_scalar`, `quoting`, `javascript_number` read one shape each; `line.rs` is one line; `value.rs` is what a key holds; `key.rs` is a key's name (a name the format defines is stored once for the program); `diagnostic.rs` is a fault on a line; `key_order.rs` writes keys in the order a script object lists them |
| What kinds, fields and review states exist? | `schema.rs` (`KNOWN_KINDS`, `GRAPH_ARRAY_KEYS`), `starter_body.rs` |
| What is wrong with one document? | `validation.rs`, `body_findings.rs`, `evidence_limit.rs`, `meaning_wording.rs` |
| What is wrong only across the vault? | `vault_issues.rs` (dangling references, duplicate slugs and uids: `find` for every document, `about` for the few a call names) |
| What does a name mean? | `reference_index.rs` (relation references), `slug_resolution.rs` (a slug or uid an agent typed), `slug_list.rs` (`SlugList`: the slugs one name means, held without a list when it means one) |
| Which nodes does one node point at? | `relations.rs` |
| What did one file come to? | `loaded_document.rs` (frontmatter, faults, link targets, a digest; the text is not kept) |
| Which link targets does a body hold? | `body_links.rs` (listed once per file; a name it cannot answer from the list reads the body) |
| What is kept between calls? | `document_cache.rs` |
| Every file read for one call | `loaded_vault.rs` |
| How are many files read? | `reader_threads.rs` (`read_on_reader_threads`: three threads read, `READER_THREADS` says why three, and the pool parses what was read) |
| Which documents mention a title? | `evidence_search.rs` (`search_evidence`: substring in the title, the references or the body, scored; bodies read on a few threads and searched on every core), `search_text.rs` (lower case and one Unicode form), `search_needle.rs` (the folded text with its runs hashed once and the number each document's memo of its last answer is kept under), `body_signature.rs` (a bit fingerprint a first read leaves, so a search for text a body lacks opens no file), `near_titles.rs` (titles a typo or a shared word away, `strsim`) |
| The six plain reads | `kind_census.rs`, `backlinks.rs`, `orphans.rs`, `query_filter.rs`, `review.rs`, `body_delivery.rs`, `read_hints.rs` |

## What it promises

- **Bytes stay.** `Document::parts` joined are the file. A write replaces the bytes of one
  `entry_range` and no others, so CRLF, a byte-order mark, comments, blank lines, order and quoting
  survive. `tests/round_trip.rs` rewrites every key of the repository's own ontology, of planted
  files and of generated text, reads the file again, and holds that the key has its new value and
  every other key and fault is as it was.
- **A repeat call pays for what changed.** `DocumentCache` keeps what was read of each file and
  looks at each file's stamp (device, inode, size, modification and change time) on the next call.
  A file whose stamp differs is read again; so is one that was written within two seconds of being
  read, because a second write inside the clock's grain can leave no trace in the stamp.
- **A file that cannot be read fails the call.** Only a file that is not there any more (or is not
  a regular file) is left out. `get_concepts` and the link-checking reads would otherwise report a
  rename safe because they could not see a file that links to the name.
- **Filters are bounded.** A filter nested deeper than 32 levels or holding more than 256 clauses is
  refused before it is evaluated (`query_filter.rs`; declared change 14 in the specification).

## The dialect

The reader is the vault's frontmatter dialect, shared with the app's reader
(`src/shared/lib/vault-document/parse-frontmatter.ts`) and the JavaScript server, not YAML 1.2. The
shared cases are `tests/fixtures/frontmatter-cases.json`, run by the TypeScript contract test and
by `tests/frontmatter_cases.rs`.

It differs from YAML 1.2 in these places, on purpose, because files written by people and by the
writers rely on them:

- `''` inside single quotes stays two characters; YAML makes it one quote. This is a defect in the
  dialect, not a feature, and is listed under Later in the specification for a fix in all three
  readers at once.
- A literal block (`|`) loses its final line break; YAML keeps it.
- A blank line in a folded block (`>`) stays a blank line; YAML folds it to one line break.
- A plain value keeps a trailing ` # note` as text; YAML drops it as a comment. A whole line that
  starts with `#` is a comment.
- `~` and `null` are the text `~` and `null`; YAML reads null. `yes` and `no` are text, as in YAML
  1.2.

`tests/frontmatter_oracle.rs` checks the reader against `saphyr`, a YAML 1.2 reader, and its limits
are these: it generates only plain, quoted, inline-list, block-list and literal-block values; it
does not generate maps, folded blocks, multi-line plain values, anchors, tags, comments or
duplicate keys; and where `saphyr` refuses the block the case is skipped. What the oracle does not
generate rests on the shared cases above.
