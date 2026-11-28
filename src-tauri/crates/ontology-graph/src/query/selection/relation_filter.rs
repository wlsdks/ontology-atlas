//! Whether an edge passes the relation filter of a call.

use crate::compiled_graph::{Edge, Target};
use crate::query::relation_set::{allowed, RelationSet};

/// Whether a call's filters let `edge` through: its relation is in the set, and an edge to code
/// or to a missing name is kept only when the call asked for those.
pub fn edge_passes(
    set: Option<&RelationSet>,
    include_external: bool,
    include_unresolved: bool,
    edge: &Edge,
) -> bool {
    allowed(set, edge.via)
        && match edge.target {
            Target::Node(_) => true,
            Target::External => include_external,
            Target::Unresolved => include_unresolved,
        }
}
