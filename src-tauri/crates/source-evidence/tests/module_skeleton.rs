//! The public module skeleton the family design assigns to this crate stays reachable.

#[allow(
    unused_imports,
    reason = "the import is the check: it stops compiling if a module goes missing or private"
)]
use {
    source_evidence::construction as _, source_evidence::evidence_search as _,
    source_evidence::imports as _, source_evidence::meaning as _,
    source_evidence::project_source as _, source_evidence::staleness as _,
    source_evidence::survey as _,
};

#[test]
fn every_assigned_module_is_public() {}
