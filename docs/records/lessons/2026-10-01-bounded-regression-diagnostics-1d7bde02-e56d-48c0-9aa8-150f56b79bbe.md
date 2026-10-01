---
id: 1d7bde02-e56d-48c0-9aa8-150f56b79bbe
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: bounded-output
---
**Observed**: A first overflow regression used `unwrap_err()` on `Result<Output, _>`. When the deliberately unbounded baseline returned success, the panic printed the multi-megabyte response. The corrected test uses `matches!` and reports only the classification. A first mutation probe also failed to match the formatter's source shape and therefore changed no behavior; exact replacement assertions detected that invalid probe.
**Cost**: Approximately 13 MB of diagnostic output; elapsed time unknown.
**Suspected cause**: Debug output included the resource under test, and the mutation script did not require its intended replacement to occur.
**Proposed change**: none. For bounded-resource regressions, assert classification and sizes without formatting the full captured value. Require exactly one intended replacement before interpreting a mutation's result.
