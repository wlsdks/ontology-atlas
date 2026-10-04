---
id: 606866f0-8a80-49c4-bf0e-a71105d57542
date: 2026-10-04
kind: tool-efficiency
status: reported
harness_area: construction-proof
---
**Observed**: A targeted `cargo fmt --manifest-path src-tauri/Cargo.toml -- src/gray_area_scope.rs` invocation formatted unrelated modules before rejecting the relative filename. The unrelated diff was archived and reversed; only owned edits were reapplied. Two field-trial harness calls also failed because the caller guessed the runTurn argument order instead of reading its declaration.
**Cost**: Two failed scratch runs and one formatting recovery; elapsed time unknown. No source/model transfer in those failed setup attempts.
**Suspected cause**: Tool names were treated as sufficient contracts; Cargo formatting scope and the current TypeScript signature were not checked first.
**Proposed change**: none. For this task, use rustfmt on exact owned files and read the called declaration before preparing a scratch harness. Preserve setup failures separately from valid model measurement time.
