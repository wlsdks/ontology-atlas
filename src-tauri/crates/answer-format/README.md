# answer-format

Text as agents read it from the JavaScript server, written once for every crate that answers them.
Each file is one rule and is named for what it exports; start at the one you need.

| File | What it gives |
|---|---|
| `src/utf16.rs` | Length in UTF-16 units, order by units, and cuts that never fall inside a character |
| `src/whitespace.rs` | What counts as whitespace and as a line end, as ECMAScript decides |
| `src/number.rs` | A number as `Number.prototype.toString` writes it |
| `src/iso_time.rs` | A time as `Date.prototype.toISOString` writes it, and `Date.parse` of that form, for the audit lines and the dates an agent sends back |
| `src/key_order.rs` | The order a JavaScript object lists its keys in: whole-number keys first, ascending |
| `src/json.rs` | `JSON.stringify` for typed answers: `to_string`, `to_writer`, `to_string_indented`, `to_raw`, `quote` |

A rule joins this crate when two crates would otherwise write it twice: JavaScript's whole-number-first
key order joined (`key_order`) when the frontmatter reader and the analysis archive both needed it.
The `'en'` sort order is `collation`.
