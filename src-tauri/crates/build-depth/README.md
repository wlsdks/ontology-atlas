# build-depth

What a first map still lacks against the code it describes, as findings a person or agent can act
on. Pure over documents and a source tree seen through `confined-files`; it writes nothing and
runs no program.

| Question | File |
|---|---|
| Does a capability state a rule but cite no lines that hold its condition? | `src/rule_without_read_lines.rs` |
| Do two nodes each depend on the other? | `src/dependency_both_ways.rs` |
| Is a relation's note about nodes nobody read, does a `path:` land on a file without code, do many nodes share one path, is the project's `Not mapped yet` line the measured one? | `src/survey_findings.rs` (the last in `src/not_mapped_lines.rs`) |
| Does a source file hold code, or only comments, imports and re-exports? | `src/code_in_text.rs` |
| Which survey abilities does the map place (own node, named, excluded), and by which words? | `src/ability_placement.rs`, `src/name_matching.rs` |
| Which areas of the survey are not mapped yet, and which files to map next? | `src/area_coverage.rs` |
| What does the answer's `coverage` hold, and how does it page? | `src/coverage.rs` |
| What does an agent do about each code, stated once per answer? | `src/remedies.rs` |
| What cites does a body make, which symbol does it name after a path, and what text do they name? | `src/line_cites.rs` |
| What are a node's kind, `path:` and references, and how does a reference name a node? | `src/node_fields.rs` |
| Which capabilities does no read this session served back, and which rules cite no served line? | `src/read_depth.rs`, `src/session_cites.rs` |
| Which implementation roles do two or more capabilities' reads pass through with no element to hold them? | `src/role_placement.rs` |
| What would `finalize_project_meaning` refuse an `answered` row for, in its own sentences, and what does `validate_vault` report of it as `finalizeGate`? | `src/finalize_depth.rs` |

`measure_against_survey` is the one entry the server calls: the vault's documents, a survey, this
session's reads and the source tree in, a `Coverage` and the findings out. A finding names its node
and its files; its repair is a `remedy` of its code.
