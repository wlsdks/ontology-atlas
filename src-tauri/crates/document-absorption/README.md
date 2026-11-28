# document-absorption

What `absorb_document` decides before it touches a file: how a Markdown document splits into
sections, which sections are rules (written as `document` nodes with `role: policy`), which are
architecture (only suggested), which look like instruction hijacks (never written), and the slim
pointer that replaces the source. Nothing here reads or writes a file: the caller says which slugs are
taken and does the writing.

| File | Owns |
|---|---|
| `src/sections.rs` | Splitting at `##` headings, with fenced code never a heading |
| `src/section_class.rs` | Rule, architecture or neither, with a confidence |
| `src/injection_scan.rs` | The named instruction-hijack and destructive-command phrasings |
| `src/slug_choice.rs` | The slug an absorbed section gets, and the next free one |
| `src/absorption_plan.rs` | The plan: every section's class, scan and action, and the counts |
| `src/slim_pointer.rs` | The text that replaces the source after a write |

Letter case and word boundaries are ASCII and white space is JavaScript's, because the patterns are
the script server's and a saved document was judged by them.
