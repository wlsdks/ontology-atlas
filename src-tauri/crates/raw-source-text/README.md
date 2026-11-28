# raw-source-text

The text of a raw vault source (a file below `sources/`) cut into the units a wiki citation anchor
names: `[[src:sources/plan.docx#h:scope]]`, `#s1r4`, `#r3`, `#l7`. It is given bytes, never a path:
the disk is `confined-files`' (`VaultRoot::read_raw_source`), and this crate names neither
`std::fs` nor `std::process`. Start at `read_units`.

| File | Owns |
|---|---|
| `src/read_units.rs` | `read_units`: bytes and an extension in, a window of units out, and the notes an agent reads (a PDF, a file no reader knows, a binary file, a quote that never closes, headings that repeat) |
| `src/source_format.rs` | `SourceFormat`: which reader an extension asks for |
| `src/unit_window.rs` | `UnitWindow` and the collector that counts every unit and keeps the window, so a hundred-megabyte log costs a pass and not a list |
| `src/citable_unit.rs` | `Unit`: the anchor, where the unit sits (heading, sheet) and its text |
| `src/plain_units.rs` | Text by line, CSV and TSV by record, HTML by the lines a browser shows |
| `src/docx_units.rs` | A DOCX by paragraph, headings numbering their own anchors |
| `src/xlsx_units.rs` | An XLSX by row, shared strings and cached formula values resolved |
| `src/zip_archive.rs` | A ZIP's entries, unpacked on request under a budget; nothing it declares is believed |
| `src/markup_scan.rs` | The forward scans for a tag, a cell, a row and a reference that the three XML shapes need; no pattern backs up |
| `src/heading_slug.rs` | A heading's title as an anchor spells it |
| `src/units_error.rs` | `UnitsError`: a DOCX or XLSX that is not one |

## What it promises

- A hostile file costs its size and no more: every scan moves forward, a ZIP entry inflates at most
  to what it declares and to the 64 MiB one read may unpack, two entries over the same bytes are
  refused, and units outside the window are counted and never built.
- A reference that names no character (`&#99999999;`) stays as written; one bad reference no longer
  fails the read.
- A text format whose first 8,000 bytes hold a NUL (Git's own test) is reported as `binary` with
  nothing read, so garbage is never cited as text.
- Anchors are what the JavaScript server wrote, so a wiki page written before keeps pointing at
  the same unit (the differential corpus cases `read-source-office-and-tables` and
  `read-source-hostile-files` replay both servers and compare the anchors byte for byte).
