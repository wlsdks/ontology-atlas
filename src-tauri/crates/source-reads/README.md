# source-reads

Exact reads of a repository's source for the survey's `sourceReads`: an outline of a file, a symbol
with the code around it, or a line range, each cut to byte limits and cited by path and lines.

| Module | Holds |
|---|---|
| `selector` | The selectors of a call, checked, with the sentence that says what to repair |
| `path_policy` | Which paths a read refuses before it touches the disk |
| `refusal_reason` | The reasons a read has no row, as the answer words them |
| `opened_file` | A file opened once under the policy and the stable-read checks, decoded, split and outlined |
| `source_lines` | The text as the lines a read quotes, each with its terminator |
| `file_outline` | The declarations of a file, from tree-sitter and the scanners for other languages |
| `declaration_span` | Where a declaration ends and which one a symbol names |
| `read_one` | One selector's read and its byte limits |
| `source_evidence` | The rows of a call, held to the text one call may carry |
| `source_row` | The row types |
| `source_reads_text` | The rows as the text an agent reads, and fitting them to the answer bound |
| `session_reads` | The line ranges this server process has served, for the depth check |
| `product_index` | The product files and their declarations, walked once for a symbol read |
| `surroundings` | The callees and surrounding code that decide what a symbol does |

Files are opened through `confined-files`; nothing here follows a link, opens a hidden or credential
file, or runs repository code.
