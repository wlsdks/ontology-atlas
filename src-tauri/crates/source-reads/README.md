# source-reads

Exact reads of a repository's source for the survey's `sourceReads`: an outline of a file, a symbol
with the code around it, or a line range, each cut to byte limits and cited by path and lines.

| Module | Holds |
|---|---|
| `selector` | The selectors of a call, checked, with the sentence that says what to repair |
| `path_policy` | Which paths a read refuses before it touches the disk |
| `refusal_reason` | The reasons a read has no row, as the answer words them |
| `opened_file` | A file opened once under the policy and the confined read, decoded, split and outlined |
| `source_lines` | The text as the lines a read quotes, each with its terminator |
| `file_outline` | The declarations of a file: the syntax tree for eight languages (`source-scan`), headings for Markdown, line scanners for Ruby and C# |
| `declaration_span` | Where a declaration ends and which one a symbol names |
| `read_one` | One selector's read and its byte limits |
| `read_environment` | What the selectors of one call share: the root, the opened files, the product index |
| `source_evidence` | The rows of a call, held to the text one call may carry, and the check for a cancelled call between selectors |
| `source_row` | The row types, and the version of a file a range was served from |
| `source_reads_text` | The rows as the text an agent reads, and fitting them to the answer bound |
| `session_reads` | The line ranges this server process has served, judged later by the lines that were served |
| `product_index` | The product files and their declarations, from the survey's one read of each file |
| `kept_files` | Texts and line-scanned declarations kept between calls by the file's stamp |
| `declaration_survey` | Where each declared name and module lives, for resolving an import |
| `import_bindings` | What a file imports, read from its import lines |
| `symbol_context` | The callers, owner, constructors, constants and callee code that decide what a symbol does |
| `callees` | The functions a body calls that the repository declares |
| `call_sites` | The lines of product code that call a name |
| `deciding_lines` | Which lines of a body decide something (a guard, a throw, a constant) |
| `name_scans` | A name looked for in one line as text, never as a pattern |
| `posix_path` | `/`-separated path arithmetic as Node's `path.posix` does it |

A file a read serves is opened through `confined_files::SourceRoot::read_repository_file`: no link
on the path, no hidden or credential name (as typed or as the disk spells it), no device name, one
stable version. The product index and the texts kept for call sites come from the survey's walk
(`DiskSource`), which skips hidden and credential names and does not follow a link out of the root.
Nothing here runs repository code.
