# vault-document

A vault's Markdown files as documents, and the plain reads over them. It reaches the disk only
through `confined-files` (the crate's `clippy.toml` refuses `std::fs`).

## Where things live

| Question | File |
|---|---|
| How is a file split into bytes I can change one line of? | `document.rs` (`Document`, `RawShape`, `parts`, `entry_range`) |
| How is a frontmatter block read? | `frontmatter/` (`block.rs` walks entries; `entry_line`, `inline`, `block_scalar`, `quoting`, `javascript_number` read one shape each; `key_order.rs` writes keys in the order a script object lists them) |
| What kinds, fields and review states exist? | `schema.rs`, `starter_body.rs` |
| What is wrong with one document? | `validation.rs`, `body_findings.rs`, `evidence_limit.rs`, `meaning_wording.rs` |
| What is wrong only across the vault? | `vault_issues.rs` (dangling references, duplicate slugs and uids) |
| What does a name mean? | `reference_index.rs` (relation references), `slug_resolution.rs` (a slug or uid an agent typed) |
| Every file read for one call | `loaded_vault.rs` |
| The six plain reads | `kind_census.rs`, `backlinks.rs`, `orphans.rs`, `query_filter.rs`, `review.rs`, `body_delivery.rs`, `read_hints.rs` |

## What it promises

- **Bytes stay.** `Document::parts` joined are the file. A write replaces the bytes of one
  `entry_range` and no others, so CRLF, a byte-order mark, comments, blank lines, order and quoting
  survive (`tests/round_trip.rs`).
- **The reader is the vault's dialect, not YAML 1.2.** `tests/frontmatter_oracle.rs` holds that where
  `saphyr` and this reader both accept a block they agree, and names the three places they differ on
  purpose (`''` in single quotes, the final line break of a literal block, a blank line in a folded
  block). The app's reader (`src/shared/lib/vault-document/parse-frontmatter.ts`) and the JavaScript
  server read those three the same way.
- **Nothing is kept between calls.** `LoadedVault::load` reads the files again each time.
