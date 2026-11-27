//! The public module skeleton the family design assigns to this crate stays reachable.

#[allow(
    unused_imports,
    reason = "the import is the check: it stops compiling if a module goes missing or private"
)]
use {
    ontology_graph::agent_brief as _, ontology_graph::compiler as _, ontology_graph::engine as _,
    ontology_graph::queries as _,
};

#[test]
fn every_assigned_module_is_public() {}
